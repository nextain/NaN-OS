#!/usr/bin/env bash
# Naia OS E2E Installation Test (VNC Graphics Mode)
# Boot ISO in QEMU VM with VNC → GNOME desktop → liveinst → boot verification
#
# Usage: ./os/tests/e2e-install.sh --iso <path> [OPTIONS]
#
# Prerequisites: qemu-system-x86_64, qemu-img, qemu-nbd, xorriso, OVMF (edk2-ovmf), sshpass, socat

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

ISO_PATH=""
SKIP_VERIFY=false
SKIP_GUI_TEST=false
KEEP_WORKDIR=false
WORKDIR="/var/tmp/naia-e2e"
INSTALL_TIMEOUT=2400    # 40 min (graphical boot takes longer)
BOOT_TIMEOUT=300
SSH_TIMEOUT=300
VERBOSE=false
QEMU_SMP=4
QEMU_MEM="8G"
DISK_SIZE="60G"
SSH_PORT=2222
VNC_DISPLAY=1

OVMF_CODE="/usr/share/edk2/ovmf/OVMF_CODE.fd"
OVMF_VARS="/usr/share/edk2/ovmf/OVMF_VARS.fd"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KS_FILE="$SCRIPT_DIR/e2e-install.ks"

# ── Colors ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
ok()   { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
bold() { echo -e "${BOLD}$*${NC}"; }

usage() {
    cat <<'EOF'
Usage: ./os/tests/e2e-install.sh [OPTIONS]

Required:
  --iso <path>       Path to Naia OS ISO

Options:
  --skip-gui-test    Skip live session GUI branding test
  --skip-verify      Skip post-install boot verification
  --keep             Keep workdir after test (for debugging)
  --workdir <path>   Working directory (default: /tmp/naia-e2e)
  --timeout <sec>    Installation timeout in seconds (default: 2400)
  --verbose          Show serial console output in real-time
  --help             Show this help
EOF
    exit 0
}

cleanup() {
    local exit_code=$?
    # Kill any lingering QEMU processes
    if [[ -n "${QEMU_PID:-}" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
        log "Killing QEMU process $QEMU_PID"
        kill "$QEMU_PID" 2>/dev/null || true
        wait "$QEMU_PID" 2>/dev/null || true
    fi
    # Kill socat
    if [[ -n "${SOCAT_PID:-}" ]] && kill -0 "$SOCAT_PID" 2>/dev/null; then
        kill "$SOCAT_PID" 2>/dev/null || true
    fi
    # Kill verbose tail
    if [[ -n "${TAIL_PID:-}" ]] && kill -0 "$TAIL_PID" 2>/dev/null; then
        kill "$TAIL_PID" 2>/dev/null || true
    fi
    # Kill VNC viewer
    if [[ -n "${VNC_PID:-}" ]] && kill -0 "$VNC_PID" 2>/dev/null; then
        kill "$VNC_PID" 2>/dev/null || true
    fi

    if [[ "$KEEP_WORKDIR" == false && -d "$WORKDIR" ]]; then
        log "Cleaning up $WORKDIR"
        rm -rf "$WORKDIR"
    elif [[ -d "$WORKDIR" ]]; then
        log "Workdir preserved: $WORKDIR"
    fi

    exit "$exit_code"
}

send_serial_cmd() {
    local cmd_file="$1" text="$2"
    # echo adds \n which both: (1) flushes tail -f pipe buffer, and
    # (2) acts as Enter key for the serial shell
    echo "$text" >> "$cmd_file"
}

wait_serial_pattern() {
    local log_file="$1" pattern="$2" timeout="${3:-300}"
    local start
    start=$(date +%s)
    while true; do
        if grep -q "$pattern" "$log_file" 2>/dev/null; then return 0; fi
        if (( $(date +%s) - start >= timeout )); then return 1; fi
        sleep 3
    done
}

find_free_port() {
    local port="$1"
    while ss -tln | grep -q ":${port} "; do
        port=$(( port + 1 ))
    done
    echo "$port"
}

ssh_cmd() {
    local cmd="$1"
    sshpass -p "naia-e2e-test" ssh \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=5 \
        -o LogLevel=ERROR \
        -p "$SSH_PORT" liveuser@localhost "$cmd"
}

ssh_cmd_t() {
    # With PTY allocation (for interactive commands)
    local cmd="$1"
    sshpass -p "naia-e2e-test" ssh -t \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 \
        -o LogLevel=ERROR \
        -p "$SSH_PORT" liveuser@localhost "$cmd"
}

scp_to_vm() {
    local src="$1" dst="$2"
    sshpass -p "naia-e2e-test" scp \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o LogLevel=ERROR \
        -P "$SSH_PORT" "$src" "liveuser@localhost:$dst"
}

# ── Argument Parsing ──────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --iso)        ISO_PATH="$2"; shift 2 ;;
            --skip-gui-test) SKIP_GUI_TEST=true; shift ;;
            --skip-verify) SKIP_VERIFY=true; shift ;;
            --keep)       KEEP_WORKDIR=true; shift ;;
            --workdir)    WORKDIR="$2"; shift 2 ;;
            --timeout)    INSTALL_TIMEOUT="$2"; shift 2 ;;
            --verbose)    VERBOSE=true; shift ;;
            --help|-h)    usage ;;
            *)            err "Unknown option: $1"; usage ;;
        esac
    done

    if [[ -z "$ISO_PATH" ]]; then
        err "--iso <path> is required"
        usage
    fi
    if [[ ! -f "$ISO_PATH" ]]; then
        err "ISO not found: $ISO_PATH"
        exit 1
    fi
    ISO_PATH="$(realpath "$ISO_PATH")"
}

# ── Phase 0: Prerequisites ───────────────────────────────────────────────────

check_prerequisites() {
    bold "=== Phase 0: Prerequisites ==="
    local missing=()

    for cmd in qemu-system-x86_64 qemu-img xorriso sshpass socat; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ! -f "$OVMF_CODE" ]]; then missing+=("OVMF_CODE ($OVMF_CODE)"); fi
    if [[ ! -f "$OVMF_VARS" ]]; then missing+=("OVMF_VARS ($OVMF_VARS)"); fi
    if [[ ! -f "$KS_FILE" ]]; then missing+=("Kickstart ($KS_FILE)"); fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        err "Missing prerequisites:"
        for m in "${missing[@]}"; do err "  - $m"; done
        exit 1
    fi

    if [[ ! -r /dev/kvm ]]; then
        warn "/dev/kvm not readable — VM will be much slower"
    fi

    # Find free ports
    SSH_PORT=$(find_free_port "$SSH_PORT")
    VNC_DISPLAY=$(find_free_port $(( 5900 + VNC_DISPLAY )))
    VNC_DISPLAY=$(( VNC_DISPLAY - 5900 ))

    ok "All prerequisites satisfied"
    log "SSH port: $SSH_PORT, VNC display: :$VNC_DISPLAY (port $((5900 + VNC_DISPLAY)))"
}

# ── Phase 1: ISO Patching ────────────────────────────────────────────────────

patch_iso_with_kickstart() {
    bold "=== Phase 1: ISO Patching ==="

    mkdir -p "$WORKDIR"
    local patched_iso="$WORKDIR/naia-e2e.iso"

    # Find grub.cfg in ISO (use -find with -name for reliable matching)
    log "Searching for GRUB config..."
    local grub_path=""
    grub_path=$(xorriso -indev "$ISO_PATH" -find / -name "grub.cfg" -exec echo 2>/dev/null \
        | grep -v '^$' | head -1 | tr -d "'") || true

    if [[ -z "$grub_path" ]]; then
        err "Could not find grub.cfg in ISO"
        xorriso -indev "$ISO_PATH" -ls / 2>/dev/null || true
        exit 1
    fi
    log "Found GRUB config: $grub_path"

    # Extract and patch grub.cfg
    local grub_dir="$WORKDIR/grub-extract"
    mkdir -p "$grub_dir"
    xorriso -osirrox on -indev "$ISO_PATH" -extract "$grub_path" "$grub_dir/grub.cfg" 2>/dev/null

    cp "$grub_dir/grub.cfg" "$grub_dir/grub.cfg.orig"

    # Patch: add serial console for logging + debug shell for SSH bootstrap
    # VNC provides the graphical display, serial is for logging/setup only
    sed -i \
        '/^\s*\(linux\|linuxefi\)\s.*vmlinuz/ {
            s| quiet||g
            s| rhgb||g
            /console=ttyS0/! s|$| console=ttyS0,115200 systemd.debug_shell=ttyS0 systemd.mask=serial-getty@ttyS0.service|
        }' \
        "$grub_dir/grub.cfg"

    # Ensure GRUB auto-boots (some ISOs have timeout=-1 which waits forever)
    if grep -q 'set timeout=' "$grub_dir/grub.cfg"; then
        sed -i 's/set timeout=.*/set timeout=3/' "$grub_dir/grub.cfg"
    else
        sed -i '1i set timeout=3' "$grub_dir/grub.cfg"
    fi

    if $VERBOSE; then
        log "GRUB config diff:"
        diff "$grub_dir/grub.cfg.orig" "$grub_dir/grub.cfg" || true
    fi

    # Build patched ISO
    log "Building patched ISO..."
    local vol_id
    vol_id=$(xorriso -indev "$ISO_PATH" -pvd_info 2>/dev/null \
        | grep "Volume Id" | sed 's/.*: //' | tr -d '[:space:]') || vol_id="NAIA-E2E"

    xorriso -indev "$ISO_PATH" \
        -outdev "$patched_iso" \
        -boot_image any replay \
        -volid "$vol_id" \
        -map "$KS_FILE" /ks.cfg \
        -map "$grub_dir/grub.cfg" "$grub_path" \
        -end 2>&1 | {
            if $VERBOSE; then cat; else grep -i "error\|warning" || true; fi
        }

    if [[ ! -f "$patched_iso" ]]; then
        err "Failed to create patched ISO"
        exit 1
    fi

    ok "Patched ISO: $patched_iso ($(du -h "$patched_iso" | cut -f1))"
}

# ── Phase 1.5: Live Session GUI Test ─────────────────────────────────────────

generate_qmp_helper() {
    cat > "$WORKDIR/qmp-helper.py" << 'PYEOF'
#!/usr/bin/env python3
"""QMP (QEMU Machine Protocol) helper for screendump and VM control."""
import json, socket, sys, time

class QMP:
    def __init__(self, sock_path):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(sock_path)
        self.sock.settimeout(10)
        # Read greeting
        self._recv()
        # Negotiate capabilities
        self._send({"execute": "qmp_capabilities"})
        self._recv()

    def _send(self, cmd):
        self.sock.sendall(json.dumps(cmd).encode() + b"\n")

    def _recv(self):
        buf = b""
        while True:
            chunk = self.sock.recv(4096)
            buf += chunk
            if b"\n" in buf:
                break
        return json.loads(buf.decode().strip())

    def screendump(self, filename, fmt="ppm"):
        args = {"filename": filename}
        if fmt == "png":
            args["format"] = "png"
        self._send({"execute": "screendump", "arguments": args})
        resp = self._recv()
        # Skip async events, wait for return
        retries = 0
        while "return" not in resp and "error" not in resp and retries < 10:
            resp = self._recv()
            retries += 1
        return resp

    def quit(self):
        self._send({"execute": "quit"})

    def close(self):
        self.sock.close()

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("sock", help="QMP socket path")
    p.add_argument("action", choices=["screendump", "quit"])
    p.add_argument("--output", "-o", help="Screenshot output path")
    p.add_argument("--format", "-f", default="ppm", choices=["ppm", "png"])
    args = p.parse_args()

    try:
        q = QMP(args.sock)
        if args.action == "screendump":
            if not args.output:
                print("ERROR: --output required for screendump", file=sys.stderr)
                sys.exit(1)
            resp = q.screendump(args.output, args.format)
            if "error" in resp:
                print(f"ERROR: {resp['error']}", file=sys.stderr)
                # Fallback to PPM if PNG not supported
                if args.format == "png":
                    ppm_path = args.output.rsplit(".", 1)[0] + ".ppm"
                    resp = q.screendump(ppm_path, "ppm")
                    if "error" not in resp:
                        print(f"FALLBACK_PPM:{ppm_path}")
                    else:
                        sys.exit(1)
                else:
                    sys.exit(1)
            else:
                print(f"OK:{args.output}")
        elif args.action == "quit":
            q.quit()
            print("OK:quit")
        q.close()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
PYEOF
    chmod +x "$WORKDIR/qmp-helper.py"
}

qmp_screendump() {
    local sock="$1" output="$2"
    local fmt="png"
    local result
    result=$(python3 "$WORKDIR/qmp-helper.py" "$sock" screendump -o "$output" -f "$fmt" 2>&1) || true
    if [[ "$result" == OK:* ]]; then
        echo "$output"
        return 0
    elif [[ "$result" == FALLBACK_PPM:* ]]; then
        local ppm_path="${result#FALLBACK_PPM:}"
        # Convert PPM to PNG if possible
        if command -v convert &>/dev/null; then
            convert "$ppm_path" "$output" 2>/dev/null && rm -f "$ppm_path" && echo "$output" && return 0
        elif command -v magick &>/dev/null; then
            magick "$ppm_path" "$output" 2>/dev/null && rm -f "$ppm_path" && echo "$output" && return 0
        fi
        echo "$ppm_path"
        return 0
    fi
    warn "screendump failed: $result"
    return 1
}

qmp_quit() {
    local sock="$1"
    python3 "$WORKDIR/qmp-helper.py" "$sock" quit 2>/dev/null || true
}

run_gui_test() {
    bold "=== Phase 1.5: Live Session GUI Test ==="

    if $SKIP_GUI_TEST; then
        warn "Skipped (--skip-gui-test)"
        GUI_RESULT="SKIP"; GUI_PASSED=0; GUI_TOTAL=0; GUI_DURATION=0
        return
    fi

    local gui_start
    gui_start=$(date +%s)
    local gui_passed=0 gui_total=0

    local gui_disk="$WORKDIR/gui-scratch.qcow2"
    local gui_efivars="$WORKDIR/gui-efivars.fd"
    local gui_serial_log="$WORKDIR/gui-serial.log"
    local gui_serial_sock="$WORKDIR/gui-serial.sock"
    local gui_serial_cmd="$WORKDIR/gui-serial-cmd"
    local qmp_sock="$WORKDIR/qmp.sock"
    local screenshot_dir="$WORKDIR/screenshots"
    mkdir -p "$screenshot_dir"

    # Create scratch disk (small, not used for install) + OVMF vars
    qemu-img create -f qcow2 "$gui_disk" "10G" >/dev/null
    cp "$OVMF_VARS" "$gui_efivars"

    # Generate QMP helper
    generate_qmp_helper

    local kvm_flag=""
    if [[ -r /dev/kvm ]]; then kvm_flag="-enable-kvm"; fi

    # Launch VNC viewer if available
    local VNC_PID=""
    log "Starting GUI test VM (VNC :$VNC_DISPLAY)..."
    qemu-system-x86_64 \
        $kvm_flag \
        -machine q35 \
        -cpu host \
        -smp "$QEMU_SMP" \
        -m "$QEMU_MEM" \
        -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" \
        -drive "if=pflash,format=raw,file=$gui_efivars" \
        -drive "file=$gui_disk,format=qcow2,if=virtio" \
        -cdrom "$WORKDIR/naia-e2e.iso" \
        -boot d \
        -display none \
        -vnc ":$VNC_DISPLAY" \
        -vga virtio \
        -netdev "user,id=net0" \
        -device virtio-net-pci,netdev=net0 \
        -chardev "socket,id=ser0,path=$gui_serial_sock,server=on,wait=off" \
        -serial chardev:ser0 \
        -chardev "socket,id=qmp0,path=$qmp_sock,server=on,wait=off" \
        -mon chardev=qmp0,mode=control \
        -no-reboot &

    QEMU_PID=$!
    log "GUI test QEMU PID: $QEMU_PID"

    # Set up serial communication
    sleep 2
    > "$gui_serial_log"
    > "$gui_serial_cmd"
    tail -f "$gui_serial_cmd" | socat - UNIX-CONNECT:"$gui_serial_sock" >> "$gui_serial_log" 2>/dev/null &
    SOCAT_PID=$!

    if $VERBOSE; then
        tail -f "$gui_serial_log" &
        TAIL_PID=$!
    fi

    # Launch VNC viewer for observation
    if command -v vncviewer &>/dev/null; then
        log "Opening VNC viewer (localhost:$((5900 + VNC_DISPLAY)))..."
        vncviewer "localhost:$((5900 + VNC_DISPLAY))" &>/dev/null &
        VNC_PID=$!
    elif flatpak info org.tigervnc.vncviewer &>/dev/null 2>&1; then
        log "Opening TigerVNC Flatpak (localhost:$((5900 + VNC_DISPLAY)))..."
        flatpak run org.tigervnc.vncviewer "localhost:$((5900 + VNC_DISPLAY))" &>/dev/null &
        VNC_PID=$!
    else
        log "No VNC viewer found — connect manually: vncviewer localhost:$((5900 + VNC_DISPLAY))"
    fi

    # ── Wait for debug shell ──
    log "Waiting for debug shell..."
    if ! wait_serial_pattern "$gui_serial_log" "sh-[0-9]" 300; then
        err "Debug shell not detected within 300s"
        kill "$QEMU_PID" 2>/dev/null || true; wait "$QEMU_PID" 2>/dev/null || true; QEMU_PID=""
        kill "$SOCAT_PID" 2>/dev/null || true; SOCAT_PID=""
        GUI_RESULT="FAIL"; GUI_PASSED=0; GUI_TOTAL=0
        GUI_DURATION=$(( $(date +%s) - gui_start ))
        return
    fi
    ok "Debug shell ready"

    # ── Expand /run (debug shell = root namespace) ──
    log "Expanding /run for GUI test VM..."
    send_serial_cmd "$gui_serial_cmd" "mount -o remount,size=6G /run && echo RUN_OK || echo RUN_FAIL"
    wait_serial_pattern "$gui_serial_log" "RUN_OK" 15 || warn "/run expansion failed"

    # ── Wait for KDE desktop (poll via debug shell) ──
    log "Waiting for KDE desktop (up to 180s)..."
    local desktop_ready=false
    local dw=0
    while (( dw < 180 )); do
        send_serial_cmd "$gui_serial_cmd" "systemctl is-active sddm 2>/dev/null | grep -q active && echo DESKTOP_READY || echo DESKTOP_WAIT"
        if wait_serial_pattern "$gui_serial_log" "DESKTOP_READY" 8; then
            desktop_ready=true
            break
        fi
        sleep 5
        dw=$((dw + 5))
    done

    if ! $desktop_ready; then
        warn "SDDM not detected after 180s, continuing anyway..."
    else
        ok "Desktop ready (SDDM active, ${dw}s)"
    fi
    # Settle time for KDE to fully render after SDDM
    sleep 20

    # ── Desktop screenshot ──
    log "Taking desktop screenshot..."
    qmp_screendump "$qmp_sock" "$screenshot_dir/01-desktop.png" && \
        ok "Desktop screenshot: $screenshot_dir/01-desktop.png" || \
        warn "Desktop screenshot failed"

    # ── File-based branding checks (via serial debug shell) ──
    log "Running branding checks..."

    run_gui_check() {
        local name="$1" cmd="$2" expect="$3"
        gui_total=$((gui_total + 1))
        local marker="GUI_CHECK_${gui_total}_DONE"

        send_serial_cmd "$gui_serial_cmd" "${cmd}; echo ${marker}"
        sleep 3

        if wait_serial_pattern "$gui_serial_log" "$marker" 30; then
            if [[ -z "$expect" ]] || grep -q "$expect" "$gui_serial_log" 2>/dev/null; then
                ok "  [$gui_total] $name"
                gui_passed=$((gui_passed + 1))
            else
                fail "  [$gui_total] $name (pattern '$expect' not found)"
            fi
        else
            fail "  [$gui_total] $name (timeout)"
        fi
    }

    run_gui_check "os-release contains Naia" \
        "grep -i naia /usr/lib/os-release 2>/dev/null || grep -i naia /etc/os-release 2>/dev/null || echo NO_NAIA" \
        "Naia\|naia"

    run_gui_check "Installer sidebar logo" \
        "stat /usr/share/anaconda/pixmaps/sidebar-logo.png 2>/dev/null && echo SIDEBAR_OK || echo SIDEBAR_MISSING" \
        "SIDEBAR_OK"

    run_gui_check "Icon cache exists" \
        "stat /usr/share/icons/hicolor/icon-theme.cache 2>/dev/null && echo CACHE_OK || echo CACHE_MISSING" \
        "CACHE_OK"

    run_gui_check "Desktop entry uses wrapper" \
        "grep -l naia-liveinst-wrapper /usr/share/applications/*.desktop 2>/dev/null && echo WRAPPER_OK || echo WRAPPER_MISSING" \
        "WRAPPER_OK"

    run_gui_check "/run/anaconda tmpfiles.d" \
        "cat /etc/tmpfiles.d/anaconda-run.conf 2>/dev/null || echo TMPFILES_MISSING" \
        "/run/anaconda"

    run_gui_check "naia-expand-run.service enabled" \
        "systemctl is-enabled naia-expand-run.service 2>/dev/null || echo SVC_DISABLED" \
        "enabled"

    # ── Launch liveinst (test Install to Hard Drive) ──
    log "Testing Install to Hard Drive launch..."
    send_serial_cmd "$gui_serial_cmd" "export DISPLAY=:0 WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000"
    sleep 2
    send_serial_cmd "$gui_serial_cmd" "mkdir -p /run/anaconda"
    sleep 2
    send_serial_cmd "$gui_serial_cmd" "/usr/bin/liveinst &"
    sleep 25

    # Check if anaconda process is running
    gui_total=$((gui_total + 1))
    local marker="GUI_CHECK_${gui_total}_DONE"
    send_serial_cmd "$gui_serial_cmd" "pgrep -f anaconda > /dev/null 2>&1 && echo ANACONDA_RUNNING || echo ANACONDA_FAILED; echo ${marker}"
    sleep 5

    if wait_serial_pattern "$gui_serial_log" "$marker" 30; then
        if grep -q "ANACONDA_RUNNING" "$gui_serial_log" 2>/dev/null; then
            ok "  [$gui_total] Anaconda launched successfully"
            gui_passed=$((gui_passed + 1))
        else
            fail "  [$gui_total] Anaconda failed to launch"
        fi
    else
        fail "  [$gui_total] Anaconda launch check timed out"
    fi

    # ── Installer screenshot ──
    log "Taking installer screenshot..."
    qmp_screendump "$qmp_sock" "$screenshot_dir/02-installer.png" && \
        ok "Installer screenshot: $screenshot_dir/02-installer.png" || \
        warn "Installer screenshot failed"

    # ── Cleanup GUI test VM ──
    log "Shutting down GUI test VM..."
    qmp_quit "$qmp_sock"
    sleep 3
    if kill -0 "$QEMU_PID" 2>/dev/null; then
        kill "$QEMU_PID" 2>/dev/null || true
    fi
    wait "$QEMU_PID" 2>/dev/null || true
    QEMU_PID=""
    kill "$SOCAT_PID" 2>/dev/null || true; SOCAT_PID=""
    if [[ -n "${TAIL_PID:-}" ]]; then kill "$TAIL_PID" 2>/dev/null || true; TAIL_PID=""; fi
    if [[ -n "$VNC_PID" ]] && kill -0 "$VNC_PID" 2>/dev/null; then kill "$VNC_PID" 2>/dev/null || true; fi

    # Clean up scratch disk
    rm -f "$gui_disk" "$gui_efivars"

    local gui_duration=$(( $(date +%s) - gui_start ))
    GUI_PASSED="$gui_passed"; GUI_TOTAL="$gui_total"
    GUI_DURATION="$gui_duration"
    [[ $gui_passed -eq $gui_total ]] && GUI_RESULT="PASS" || GUI_RESULT="FAIL"

    local gc; [[ "$GUI_RESULT" == "PASS" ]] && gc="$GREEN" || gc="$RED"
    echo -e "  GUI Test: ${gc}${GUI_RESULT}${NC} (${gui_passed}/${gui_total}, ${gui_duration}s)"

    if [[ -d "$screenshot_dir" ]]; then
        log "Screenshots saved to: $screenshot_dir/"
        ls -la "$screenshot_dir/" 2>/dev/null || true
    fi
}

# ── Phase 2: GUI Installation ────────────────────────────────────────────────

run_installation() {
    bold "=== Phase 2: GUI Installation ==="

    local disk="$WORKDIR/disk.qcow2"
    local efivars="$WORKDIR/efivars.fd"
    local serial_log="$WORKDIR/install-serial.log"
    local serial_sock="$WORKDIR/serial.sock"
    local serial_cmd="$WORKDIR/serial-cmd"
    local qmp_sock="$WORKDIR/install-qmp.sock"
    local screenshot_dir="$WORKDIR/screenshots"
    mkdir -p "$screenshot_dir"

    # Create virtual disk + OVMF vars copy
    log "Creating ${DISK_SIZE} virtual disk..."
    qemu-img create -f qcow2 "$disk" "$DISK_SIZE" >/dev/null
    cp "$OVMF_VARS" "$efivars"

    # Generate QMP helper (reuse from Phase 1.5 if not already generated)
    generate_qmp_helper

    local kvm_flag=""
    if [[ -r /dev/kvm ]]; then kvm_flag="-enable-kvm"; fi

    log "Starting QEMU (VNC :$VNC_DISPLAY)..."
    qemu-system-x86_64 \
        $kvm_flag \
        -machine q35 \
        -cpu host \
        -smp "$QEMU_SMP" \
        -m "$QEMU_MEM" \
        -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" \
        -drive "if=pflash,format=raw,file=$efivars" \
        -drive "file=$disk,format=qcow2,if=virtio" \
        -cdrom "$WORKDIR/naia-e2e.iso" \
        -boot d \
        -display none \
        -vnc ":$VNC_DISPLAY" \
        -vga virtio \
        -netdev "user,id=net0,hostfwd=tcp::${SSH_PORT}-:22" \
        -device virtio-net-pci,netdev=net0 \
        -chardev "socket,id=ser0,path=$serial_sock,server=on,wait=off" \
        -serial chardev:ser0 \
        -chardev "socket,id=qmp0,path=$qmp_sock,server=on,wait=off" \
        -mon chardev=qmp0,mode=control \
        -no-reboot &

    QEMU_PID=$!
    log "QEMU PID: $QEMU_PID (VNC :$VNC_DISPLAY = port $((5900 + VNC_DISPLAY)))"

    local install_start
    install_start=$(date +%s)

    # Set up serial communication
    sleep 2
    > "$serial_log"
    > "$serial_cmd"
    tail -f "$serial_cmd" | socat - UNIX-CONNECT:"$serial_sock" >> "$serial_log" 2>/dev/null &
    SOCAT_PID=$!

    if $VERBOSE; then
        tail -f "$serial_log" &
        TAIL_PID=$!
    fi

    # ── Phase 2a: Wait for debug shell ──
    log "Waiting for debug shell on serial..."
    if ! wait_serial_pattern "$serial_log" "sh-[0-9]" 300; then
        err "Debug shell not detected within 300s"
        dump_failure_logs
        exit 1
    fi
    ok "Debug shell ready"

    # ── Phase 2b: Expand /run + prepare environment ──
    log "Expanding /run..."
    send_serial_cmd "$serial_cmd" "mount -o remount,size=6G /run && echo RUN_OK || echo RUN_FAIL"
    if wait_serial_pattern "$serial_log" "RUN_OK" 15; then
        ok "/run expanded to 6G"
    else
        warn "/run expansion failed"
    fi

    # Create /run/anaconda directory
    send_serial_cmd "$serial_cmd" "mkdir -p /run/anaconda"
    sleep 2

    # ── Phase 2b2: Enable SSH for Anaconda launch ──
    log "Enabling SSH access..."
    send_serial_cmd "$serial_cmd" "echo liveuser:naia-e2e-test | chpasswd; echo PASSWD_OK"
    wait_serial_pattern "$serial_log" "PASSWD_OK" 15 || true
    send_serial_cmd "$serial_cmd" "passwd -u liveuser 2>/dev/null; echo UNLOCK_OK"
    wait_serial_pattern "$serial_log" "UNLOCK_OK" 10 || true
    send_serial_cmd "$serial_cmd" "echo 'liveuser ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/liveuser; echo SUDO_OK"
    wait_serial_pattern "$serial_log" "SUDO_OK" 10 || true
    send_serial_cmd "$serial_cmd" "sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config; echo SSHD_CONF_OK"
    wait_serial_pattern "$serial_log" "SSHD_CONF_OK" 10 || true
    send_serial_cmd "$serial_cmd" "systemctl start sshd; echo SSHD_OK"
    if wait_serial_pattern "$serial_log" "SSHD_OK" 15; then
        ok "SSH enabled"
    else
        warn "SSH setup may have failed"
    fi

    # Wait for SSH to be reachable
    log "Waiting for SSH connectivity..."
    local sw=0
    while (( sw < 60 )); do
        if ssh_cmd "echo SSH_OK" 2>/dev/null | grep -q SSH_OK; then
            ok "SSH connected"
            break
        fi
        sleep 3
        sw=$((sw + 3))
    done
    if (( sw >= 60 )); then
        warn "SSH not reachable, will try serial fallback for Anaconda"
    fi

    # ── Phase 2c: Wait for KDE desktop (poll via debug shell) ──
    log "Waiting for KDE desktop (up to 180s)..."
    local dw=0
    while (( dw < 180 )); do
        send_serial_cmd "$serial_cmd" "systemctl is-active sddm 2>/dev/null | grep -q active && echo DESKTOP_READY || echo DESKTOP_WAIT"
        if wait_serial_pattern "$serial_log" "DESKTOP_READY" 8; then
            ok "Desktop ready (SDDM active, ${dw}s)"
            break
        fi
        sleep 5
        dw=$((dw + 5))
    done
    if (( dw >= 180 )); then
        warn "SDDM not detected after 180s, continuing anyway..."
    fi
    # Settle time for KDE to fully render
    sleep 20

    # Disable KDE screen lock and power saving (prevents display going dark)
    log "Disabling screen lock and power saving..."
    ssh_cmd 'kwriteconfig6 --file kscreenlockerrc --group Daemon --key Autolock false; kwriteconfig6 --file kscreenlockerrc --group Daemon --key LockOnResume false; kwriteconfig6 --file powermanagementprofilesrc --group AC --group DPMSControl --key idleTime 0' 2>/dev/null || true

    # Kill Steam if running (it auto-starts on Bazzite and blocks the view)
    ssh_cmd 'pkill -9 steam; pkill -9 -f steamwebhelper' 2>/dev/null || true
    sleep 2

    # Add polkit rule for liveuser auto-approval (needed for pkexec in liveinst)
    send_serial_cmd "$serial_cmd" "mkdir -p /etc/polkit-1/rules.d && cat > /etc/polkit-1/rules.d/99-liveinst.rules << 'POLKIT'
polkit.addRule(function(action, subject) {
    if (subject.user == \"liveuser\") {
        return polkit.Result.YES;
    }
});
POLKIT"
    sleep 2
    send_serial_cmd "$serial_cmd" "systemctl restart polkit 2>/dev/null; echo POLKIT_READY"
    wait_serial_pattern "$serial_log" "POLKIT_READY" 10 || true

    # Screenshot: Live desktop
    log "Screenshot: Live desktop"
    qmp_screendump "$qmp_sock" "$screenshot_dir/03-live-desktop.png" || true

    # ── Phase 2d: Patch Anaconda efi.py for ostree bootloader ──
    log "Patching Anaconda efi.py for ostree bootloader compatibility..."
    ssh_cmd "sudo python3 -c \"
import glob
efi_files = glob.glob('/usr/lib*/python*/site-packages/pyanaconda/modules/storage/bootloader/efi.py')
for f in efi_files:
    print(f'Patching: {f}')
    with open(f) as fh: content = fh.read()
    patched = content.replace(
        'self.stage2_device.format.uuid',
        'getattr(getattr(self.stage2_device, \\\"format\\\", None), \\\"uuid\\\", \\\"\\\") or \\\"\\\"'
    )
    if patched != content:
        with open(f, 'w') as fh: fh.write(patched)
        print('  Patched successfully')
    else:
        print('  Already patched or pattern not found')
\"" 2>&1 || true
    ok "Anaconda efi.py patched"

    # ── Phase 2d2: Launch Anaconda GUI via SSH ──
    # liveinst must run as liveuser (not sudo) — it uses pkexec internally for root elevation
    # polkit rule added above auto-approves for liveuser
    log "Launching Anaconda installer via SSH (liveuser + pkexec)..."
    ssh_cmd "export DISPLAY=:0 WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; nohup /usr/bin/liveinst </dev/null >/tmp/liveinst.log 2>&1 &" || true
    sleep 15

    # Wait for Anaconda + Cockpit + Firefox to be running
    log "Waiting for Anaconda WebUI to start (up to 120s)..."
    local aw=0
    while (( aw < 120 )); do
        if ssh_cmd "pgrep -f 'anaconda.*--liveinst'" 2>/dev/null | grep -q "[0-9]"; then
            ok "Anaconda is running"
            break
        fi
        sleep 5
        aw=$((aw + 5))
    done
    if (( aw >= 120 )); then
        err "Anaconda failed to start"
        ssh_cmd "cat /tmp/liveinst.log" 2>/dev/null || true
        qmp_screendump "$qmp_sock" "$screenshot_dir/03-anaconda-fail.png" || true
        dump_failure_logs
        exit 1
    fi

    # Verify Firefox opened (liveinst's webui-desktop starts it automatically)
    sleep 10
    if ssh_cmd "pgrep -f firefox" 2>/dev/null | grep -q "[0-9]"; then
        ok "Firefox opened with Anaconda WebUI"
    else
        warn "Firefox not running — install may need manual browser launch via VNC"
    fi

    # Wait for Anaconda GUI to fully render
    sleep 30
    log "Screenshot: Anaconda installer"
    qmp_screendump "$qmp_sock" "$screenshot_dir/04-anaconda-gui.png" || true

    # ── Phase 2e: Monitor installation progress ──
    log "Monitoring installation progress..."
    log "  (VNC :$VNC_DISPLAY available for manual observation)"
    log "  (VM will shut down on completion → QEMU exits due to -no-reboot)"

    # Launch VNC viewer if available (for user observation)
    local VNC_PID=""
    if command -v vncviewer &>/dev/null; then
        log "Opening VNC viewer (localhost:$((5900 + VNC_DISPLAY)))..."
        vncviewer "localhost:$((5900 + VNC_DISPLAY))" &>/dev/null &
        VNC_PID=$!
    elif flatpak info org.tigervnc.vncviewer &>/dev/null 2>&1; then
        log "Opening TigerVNC Flatpak (localhost:$((5900 + VNC_DISPLAY)))..."
        flatpak run org.tigervnc.vncviewer "localhost:$((5900 + VNC_DISPLAY))" &>/dev/null &
        VNC_PID=$!
    else
        log "No VNC viewer found — connect manually: vncviewer localhost:$((5900 + VNC_DISPLAY))"
    fi

    local screenshot_counter=5
    local last_screenshot_time
    last_screenshot_time=$(date +%s)
    local install_done=false

    while kill -0 "$QEMU_PID" 2>/dev/null; do
        local elapsed=$(( $(date +%s) - install_start ))
        if [[ $elapsed -ge $INSTALL_TIMEOUT ]]; then
            err "Installation timed out after ${INSTALL_TIMEOUT}s"
            qmp_screendump "$qmp_sock" "$screenshot_dir/99-timeout.png" || true
            dump_failure_logs
            exit 1
        fi

        if (( elapsed % 60 == 0 )); then
            log "  ${elapsed}s elapsed..."
        fi

        # Take periodic screenshots (every 120s)
        local now
        now=$(date +%s)
        if (( now - last_screenshot_time >= 120 )); then
            local ss_name
            ss_name=$(printf "%02d-progress-%ds.png" "$screenshot_counter" "$elapsed")
            qmp_screendump "$qmp_sock" "$screenshot_dir/$ss_name" 2>/dev/null || true
            screenshot_counter=$((screenshot_counter + 1))
            last_screenshot_time=$now
        fi

        # Check serial for completion signals
        if grep -q "reboot: Restarting system\|reboot: Power down\|reboot: machine restart" "$serial_log" 2>/dev/null; then
            ok "VM rebooting — installation completed (${elapsed}s)"
            install_done=true
            break
        fi

        sleep 10
    done

    wait "$QEMU_PID" 2>/dev/null || true
    local qemu_exit=$?
    QEMU_PID=""

    # Cleanup background processes
    kill "$SOCAT_PID" 2>/dev/null || true; SOCAT_PID=""
    if [[ -n "${TAIL_PID:-}" ]]; then kill "$TAIL_PID" 2>/dev/null || true; TAIL_PID=""; fi
    if [[ -n "$VNC_PID" ]] && kill -0 "$VNC_PID" 2>/dev/null; then kill "$VNC_PID" 2>/dev/null || true; fi

    local install_duration=$(( $(date +%s) - install_start ))

    if $install_done; then
        ok "Installation completed in ${install_duration}s"
        INSTALL_RESULT="PASS"
        INSTALL_DURATION="$install_duration"
    elif [[ $qemu_exit -eq 0 ]]; then
        ok "Installation completed (QEMU exited cleanly) in ${install_duration}s"
        INSTALL_RESULT="PASS"
        INSTALL_DURATION="$install_duration"
    else
        fail "Installation failed (QEMU exit code: $qemu_exit, ${install_duration}s)"
        INSTALL_RESULT="FAIL"
        INSTALL_DURATION="$install_duration"
        dump_failure_logs
        exit 1
    fi
}

# ── Phase 2.5: Fix Boot (kernel-install for ostree) ──────────────────────────

fix_boot_kernel() {
    bold "=== Phase 2.5: Boot Fix (kernel-install) ==="

    if [[ "$INSTALL_RESULT" != "PASS" ]]; then
        warn "Skipped (installation did not pass)"
        return
    fi

    local disk="$WORKDIR/disk.qcow2"
    local mnt="$WORKDIR/mnt"

    # Connect qcow2 via NBD
    local nbd_dev="/dev/nbd0"
    log "Connecting disk image via NBD..."
    sudo modprobe nbd max_part=8 2>/dev/null || true
    sudo qemu-nbd -c "$nbd_dev" "$disk" || {
        warn "qemu-nbd failed, skipping boot fix"
        return
    }
    sleep 1
    sudo partprobe "$nbd_dev" 2>/dev/null || true
    sleep 1

    # Detect partitions: p1=EFI, p2=boot(ext4), p3=root(btrfs)
    local efi_part="${nbd_dev}p1"
    local boot_part="${nbd_dev}p2"
    local root_part="${nbd_dev}p3"

    if [[ ! -b "$root_part" ]]; then
        warn "Partition $root_part not found, skipping"
        sudo qemu-nbd -d "$nbd_dev" 2>/dev/null || true
        return
    fi

    log "Mounting installed system..."
    mkdir -p "$mnt"
    sudo mount -o subvol=root "$root_part" "$mnt" 2>/dev/null || \
        sudo mount "$root_part" "$mnt" || {
        warn "Failed to mount root, skipping"
        sudo qemu-nbd -d "$nbd_dev" 2>/dev/null || true
        return
    }
    sudo mount "$boot_part" "$mnt/boot" 2>/dev/null || true
    sudo mount "$efi_part" "$mnt/boot/efi" 2>/dev/null || true

    # Bind-mount virtual filesystems for chroot
    sudo mount --bind /dev "$mnt/dev" 2>/dev/null || true
    sudo mount --bind /proc "$mnt/proc" 2>/dev/null || true
    sudo mount --bind /sys "$mnt/sys" 2>/dev/null || true

    # Check current boot state
    log "Current /boot contents:"
    ls -la "$mnt/boot/vmlinuz-"* 2>/dev/null || echo "  (no vmlinuz files)"
    ls -la "$mnt/boot/loader/entries/"* 2>/dev/null || echo "  (no BLS entries)"

    # Find kernel version in installed system
    local kver=""
    for k in $(ls "$mnt/usr/lib/modules/" 2>/dev/null | sort -rV); do
        if [[ -f "$mnt/usr/lib/modules/$k/vmlinuz" ]]; then
            kver="$k"
            break
        fi
    done

    if [[ -z "$kver" ]]; then
        warn "No kernel found in installed system's /usr/lib/modules/"
        _cleanup_mnt
        return
    fi

    log "Installing kernel $kver into /boot..."

    # Try kernel-install first
    if sudo chroot "$mnt" kernel-install add "$kver" "/usr/lib/modules/${kver}/vmlinuz" 2>&1; then
        ok "kernel-install succeeded"
    else
        log "kernel-install failed, falling back to manual copy..."

        sudo cp "$mnt/usr/lib/modules/${kver}/vmlinuz" "$mnt/boot/vmlinuz-${kver}"
        sudo chroot "$mnt" dracut --force "/boot/initramfs-${kver}.img" "$kver" 2>&1 || {
            warn "dracut failed, trying without chroot..."
            # Generate minimal initramfs
            sudo dracut --force --sysroot "$mnt" "$mnt/boot/initramfs-${kver}.img" "$kver" 2>&1 || true
        }

        # Create BLS entry
        sudo mkdir -p "$mnt/boot/loader/entries"
        local machine_id
        machine_id=$(cat "$mnt/etc/machine-id" 2>/dev/null || echo "naia")
        local root_uuid
        root_uuid=$(sudo blkid -s UUID -o value "$root_part")

        sudo tee "$mnt/boot/loader/entries/${machine_id}-${kver}.conf" > /dev/null <<BLSEOF
title Naia OS (${kver})
version ${kver}
linux /vmlinuz-${kver}
initrd /initramfs-${kver}.img
options root=UUID=${root_uuid} rootflags=subvol=root ro
BLSEOF
        ok "Manual kernel + BLS entry created"
    fi

    # Regenerate grub config
    sudo chroot "$mnt" grub2-mkconfig -o /boot/grub2/grub.cfg 2>&1 || {
        warn "grub2-mkconfig failed, creating minimal config..."
        sudo mkdir -p "$mnt/boot/grub2"
        sudo tee "$mnt/boot/grub2/grub.cfg" > /dev/null <<'GRUBCFG'
set timeout=5
set default=0
insmod all_video
insmod gzio
insmod part_gpt
insmod btrfs
insmod ext2

# Load BLS entries
blscfg
GRUBCFG
        ok "Minimal grub.cfg created"
    }

    # Verify EFI setup
    log "Verifying EFI bootloader..."
    if [[ -f "$mnt/boot/efi/EFI/fedora/shimx64.efi" ]] || [[ -f "$mnt/boot/efi/EFI/BOOT/BOOTX64.EFI" ]]; then
        ok "EFI bootloader found"
    else
        warn "EFI bootloader missing, attempting to install..."
        # Copy shim and grub from system
        sudo mkdir -p "$mnt/boot/efi/EFI/fedora" "$mnt/boot/efi/EFI/BOOT"
        local shim_src grub_src
        shim_src=$(find "$mnt/usr/lib/efi" "$mnt/usr/lib64/efi" -name "shimx64.efi" 2>/dev/null | head -1)
        grub_src=$(find "$mnt/usr/lib/efi" "$mnt/usr/lib64/efi" -name "grubx64.efi" 2>/dev/null | head -1)
        [[ -n "$shim_src" ]] && sudo cp "$shim_src" "$mnt/boot/efi/EFI/fedora/shimx64.efi" && sudo cp "$shim_src" "$mnt/boot/efi/EFI/BOOT/BOOTX64.EFI"
        [[ -n "$grub_src" ]] && sudo cp "$grub_src" "$mnt/boot/efi/EFI/fedora/grubx64.efi"

        # Register EFI boot entry
        sudo chroot "$mnt" efibootmgr -c -d "$nbd_dev" -p 1 -L "Naia OS" -l '\EFI\fedora\shimx64.efi' 2>&1 || true
    fi

    log "Final /boot contents:"
    ls -la "$mnt/boot/vmlinuz-"* 2>/dev/null || echo "  (no vmlinuz files)"
    ls -la "$mnt/boot/initramfs-"* 2>/dev/null || echo "  (no initramfs files)"
    ls -la "$mnt/boot/loader/entries/"* 2>/dev/null || echo "  (no BLS entries)"
    ls -la "$mnt/boot/efi/EFI/"*/*.efi 2>/dev/null || echo "  (no EFI files)"

    # Cleanup mounts
    _cleanup_mnt

    ok "Boot fix complete"
}

_cleanup_mnt() {
    local mnt="$WORKDIR/mnt"
    local nbd_dev="/dev/nbd0"
    sudo umount "$mnt/sys" 2>/dev/null || true
    sudo umount "$mnt/proc" 2>/dev/null || true
    sudo umount "$mnt/dev" 2>/dev/null || true
    sudo umount "$mnt/boot/efi" 2>/dev/null || true
    sudo umount "$mnt/boot" 2>/dev/null || true
    sudo umount "$mnt" 2>/dev/null || true
    sudo qemu-nbd -d "$nbd_dev" 2>/dev/null || true
}

# ── Phase 3: Boot Verification ───────────────────────────────────────────────

run_boot_verification() {
    bold "=== Phase 3: Boot Verification ==="

    if $SKIP_VERIFY; then
        warn "Skipped (--skip-verify)"
        BOOT_RESULT="SKIP"; BOOT_DURATION="0"
        SMOKE_RESULT="SKIP"; SMOKE_TOTAL="0"; SMOKE_PASSED="0"
        return
    fi

    local disk="$WORKDIR/disk.qcow2"
    local efivars="$WORKDIR/efivars.fd"
    local serial_log="$WORKDIR/boot-serial.log"

    # Find free SSH port for boot phase
    local boot_ssh_port
    boot_ssh_port=$(find_free_port "$SSH_PORT")

    local kvm_flag=""
    if [[ -r /dev/kvm ]]; then kvm_flag="-enable-kvm"; fi

    log "Booting installed system (SSH port $boot_ssh_port)..."
    local boot_start
    boot_start=$(date +%s)

    qemu-system-x86_64 \
        $kvm_flag \
        -machine q35 \
        -cpu host \
        -smp "$QEMU_SMP" \
        -m "$QEMU_MEM" \
        -drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" \
        -drive "if=pflash,format=raw,file=$efivars" \
        -drive "file=$disk,format=qcow2,if=virtio" \
        -boot c \
        -netdev "user,id=net0,hostfwd=tcp::${boot_ssh_port}-:22" \
        -device virtio-net-pci,netdev=net0 \
        -display none \
        -serial "file:$serial_log" \
        -no-reboot &

    QEMU_PID=$!

    # Wait for SSH with testuser (created by kickstart)
    log "Waiting for SSH (testuser)..."
    local ssh_ready=false
    local ssh_opts="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o LogLevel=ERROR"

    while (( $(date +%s) - boot_start < SSH_TIMEOUT )); do
        if sshpass -p "naia-e2e-test" ssh $ssh_opts -p "$boot_ssh_port" testuser@localhost "echo ok" 2>/dev/null; then
            ssh_ready=true
            break
        fi
        sleep 5
    done

    local boot_duration=$(( $(date +%s) - boot_start ))

    if ! $ssh_ready; then
        fail "SSH not available after ${SSH_TIMEOUT}s"
        BOOT_RESULT="FAIL"; BOOT_DURATION="$boot_duration"
        SMOKE_RESULT="FAIL"; SMOKE_TOTAL="0"; SMOKE_PASSED="0"
        kill "$QEMU_PID" 2>/dev/null || true; wait "$QEMU_PID" 2>/dev/null || true; QEMU_PID=""
        dump_failure_logs
        return
    fi

    ok "VM booted, SSH ready (${boot_duration}s)"
    BOOT_RESULT="PASS"; BOOT_DURATION="$boot_duration"

    # Run smoke tests
    run_smoke_tests "$boot_ssh_port"

    # Shutdown
    sshpass -p "naia-e2e-test" ssh $ssh_opts -p "$boot_ssh_port" testuser@localhost "sudo poweroff" 2>/dev/null || true
    local wait_ct=0
    while kill -0 "$QEMU_PID" 2>/dev/null && (( wait_ct < 30 )); do sleep 2; wait_ct=$((wait_ct+2)); done
    kill "$QEMU_PID" 2>/dev/null || true; wait "$QEMU_PID" 2>/dev/null || true; QEMU_PID=""
}

run_smoke_tests() {
    local port="$1"
    local ssh_opts="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o LogLevel=ERROR"
    local passed=0 total=0

    log "Running smoke tests..."

    run_test() {
        local name="$1" cmd="$2"
        total=$(( total + 1 ))
        local output
        if output=$(sshpass -p "naia-e2e-test" ssh $ssh_opts -p "$port" testuser@localhost "$cmd" 2>&1); then
            ok "  [$total] $name"
            passed=$(( passed + 1 ))
            $VERBOSE && [[ -n "$output" ]] && echo "      $output"
        else
            fail "  [$total] $name"
            [[ -n "$output" ]] && echo "      $output"
        fi
    }

    run_test "E2E install marker"    "cat /var/log/naia-e2e-marker"
    run_test "OS release"            "cat /etc/os-release | head -5"
    run_test "BTRFS root"            "findmnt -t btrfs / -n"
    run_test "UEFI bootloader"       "test -d /sys/firmware/efi && efibootmgr 2>/dev/null | head -5 || (test -d /boot/efi/EFI && ls /boot/efi/EFI/)"
    run_test "Network (DNS)"         "getent hosts fedoraproject.org"
    run_test "Systemd operational"   "state=\$(systemctl is-system-running 2>/dev/null); echo \"\$state\"; [ \"\$state\" = running ] || [ \"\$state\" = degraded ]"

    SMOKE_PASSED="$passed"; SMOKE_TOTAL="$total"
    [[ $passed -eq $total ]] && SMOKE_RESULT="PASS" || SMOKE_RESULT="FAIL"
}

# ── Phase 4: Results ─────────────────────────────────────────────────────────

print_results() {
    echo ""
    bold "=== Naia OS E2E Installation Test ==="
    echo ""

    local c
    case "${GUI_RESULT:-SKIP}" in
        PASS) c="$GREEN" ;; SKIP) c="$YELLOW" ;; *) c="$RED" ;;
    esac
    printf "  GUI Test:      ${c}%s${NC} (%s/%s, %ss)\n" "${GUI_RESULT:-SKIP}" "${GUI_PASSED:-0}" "${GUI_TOTAL:-0}" "${GUI_DURATION:-0}"

    [[ "${INSTALL_RESULT:-FAIL}" == "PASS" ]] && c="$GREEN" || c="$RED"
    printf "  Installation:  ${c}%s${NC} (%ss)\n" "${INSTALL_RESULT:-FAIL}" "${INSTALL_DURATION:-?}"

    case "${BOOT_RESULT:-FAIL}" in
        PASS) c="$GREEN" ;; SKIP) c="$YELLOW" ;; *) c="$RED" ;;
    esac
    printf "  Boot:          ${c}%s${NC} (%ss)\n" "${BOOT_RESULT:-FAIL}" "${BOOT_DURATION:-?}"

    case "${SMOKE_RESULT:-FAIL}" in
        PASS) c="$GREEN" ;; SKIP) c="$YELLOW" ;; *) c="$RED" ;;
    esac
    printf "  Smoke Tests:   ${c}%s${NC} (%s/%s)\n" "${SMOKE_RESULT:-FAIL}" "${SMOKE_PASSED:-0}" "${SMOKE_TOTAL:-0}"

    echo ""
    log "Logs: $WORKDIR"
    echo ""

    if [[ "${GUI_RESULT:-SKIP}" != "FAIL" ]] && \
       [[ "${INSTALL_RESULT:-FAIL}" == "PASS" ]] && \
       [[ "${BOOT_RESULT:-FAIL}" != "FAIL" ]] && \
       [[ "${SMOKE_RESULT:-FAIL}" != "FAIL" ]]; then
        ok "Overall: PASS"
        return 0
    else
        fail "Overall: FAIL"
        return 1
    fi
}

# ── Failure Diagnostics ──────────────────────────────────────────────────────

dump_failure_logs() {
    echo ""
    bold "=== Failure Diagnostics ==="

    for logfile in "$WORKDIR/install-serial.log" "$WORKDIR/boot-serial.log"; do
        if [[ -f "$logfile" ]]; then
            echo ""
            log "Last 50 lines of $(basename "$logfile"):"
            echo "---"
            tail -50 "$logfile"
            echo "---"
        fi
    done

    # Try to fetch anaconda log from VM (if still running)
    if [[ -n "${QEMU_PID:-}" ]] && kill -0 "$QEMU_PID" 2>/dev/null; then
        local anaconda_log
        anaconda_log=$(ssh_cmd "cat /tmp/anaconda-e2e.log 2>/dev/null" 2>/dev/null) || true
        if [[ -n "$anaconda_log" ]]; then
            echo ""
            log "Anaconda E2E log (last 30 lines):"
            echo "---"
            echo "$anaconda_log" | tail -30
            echo "---"
        fi
    fi

    echo ""
    log "Workdir preserved: $WORKDIR"
    KEEP_WORKDIR=true
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    parse_args "$@"
    trap cleanup EXIT

    echo ""
    bold "Naia OS E2E Installation Test (VNC Graphics Mode)"
    log "ISO: $ISO_PATH"
    log "Workdir: $WORKDIR"
    echo ""

    check_prerequisites
    echo ""

    patch_iso_with_kickstart
    echo ""

    run_gui_test
    echo ""

    run_installation
    echo ""

    fix_boot_kernel
    echo ""

    run_boot_verification
    echo ""

    print_results
}

main "$@"
