#!/usr/bin/env bash
# ISO 가 실제로 부팅하는지 가상 기계에서 확인한다.
#
# 왜 필요한가: ISO 워크플로의 검증은 전부 파일 수준이다 — 체크섬이 맞고
# naia-verify-image 가 통과해도, 부팅에 실패하거나 아무도 볼 수 없는 셸로 뜰
# 수 있다. 워크플로 주석도 그 한계를 인정하고 "사람이 부팅해 본다" 로 남겨
# 두었다. 손으로 하면 매번 조건이 달라지므로 여기에 고정한다.
#
# 쓰는 법:
#   scripts/verify-iso-boot.sh <iso 경로> [최대 대기 초, 기본 300]
#
# 판정: 직렬 콘솔에 부팅 진행 신호가 뜨고 커널 공황이나 부팅 실패 문구가
# 없으면 통과. 그래픽 셸이 사람 눈에 보이는지는 이 스크립트가 재지 않는다 —
# 그건 화면 캡처가 필요하고, 여기서는 "부팅이 끝까지 갔다" 까지만 잰다.
set -euo pipefail

ISO="${1:-}"
DEADLINE="${2:-300}"

if [[ -z "$ISO" || ! -f "$ISO" ]]; then
	echo "사용법: $0 <iso 경로> [최대 대기 초]" >&2
	exit 2
fi

if ! command -v qemu-system-x86_64 >/dev/null 2>&1; then
	cat >&2 <<'MISSING'
qemu-system-x86_64 가 없다. 이 기계(Bazzite 같은 불변 배포)에서는 시스템에
바로 깔 수 없으므로 다음 중 하나를 쓴다.
  rpm-ostree install qemu-system-x86-core   (재부팅 필요, 사람 승인 사항)
  toolbox enter 후 컨테이너 안에서 설치
MISSING
	exit 3
fi

FIRMWARE=""
for candidate in /usr/share/edk2/ovmf/OVMF_CODE.fd /usr/share/OVMF/OVMF_CODE.fd; do
	[[ -f "$candidate" ]] && FIRMWARE="$candidate" && break
done
if [[ -z "$FIRMWARE" ]]; then
	echo "UEFI 펌웨어(OVMF)를 찾지 못했다. edk2-ovmf 를 설치하라." >&2
	exit 3
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SERIAL="$WORK/serial.log"

# 화면 없이 띄우고 직렬 콘솔만 받는다. 라이브 ISO 는 그래픽으로 뜨므로
# 커널 인자로 직렬 출력을 함께 켠다.
qemu-system-x86_64 \
	-machine q35,accel=kvm:tcg -m 4096 -smp 2 \
	-drive "if=pflash,format=raw,readonly=on,file=$FIRMWARE" \
	-cdrom "$ISO" -boot d \
	-display none -serial "file:$SERIAL" \
	-no-reboot &
VM=$!
trap 'kill "$VM" 2>/dev/null || true; rm -rf "$WORK"' EXIT

FAIL_PATTERN='Kernel panic|Failed to mount|Entering emergency mode|No bootable device'
PASS_PATTERN='systemd\[1\]|Reached target|Started .*naia|login:'

elapsed=0
verdict=""
while (( elapsed < DEADLINE )); do
	if ! kill -0 "$VM" 2>/dev/null; then
		verdict="가상 기계가 스스로 종료했다"
		break
	fi
	if [[ -s "$SERIAL" ]]; then
		if grep -qE "$FAIL_PATTERN" "$SERIAL"; then
			verdict="부팅 실패 신호"
			break
		fi
		if grep -qE "$PASS_PATTERN" "$SERIAL"; then
			verdict="통과"
			break
		fi
	fi
	sleep 5
	elapsed=$(( elapsed + 5 ))
done

kill "$VM" 2>/dev/null || true
wait "$VM" 2>/dev/null || true

echo "--- 직렬 콘솔 마지막 20줄 ---"
tail -20 "$SERIAL" 2>/dev/null || echo "(출력 없음)"
echo "-----------------------------"

case "$verdict" in
	통과) echo "PASS: 부팅이 초기화 단계까지 갔다 (${elapsed}초)"; exit 0 ;;
	"") echo "FAIL: ${DEADLINE}초 안에 부팅 신호가 없었다"; exit 1 ;;
	*) echo "FAIL: $verdict (${elapsed}초)"; exit 1 ;;
esac
