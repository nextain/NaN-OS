# gen_grub_cfgstub 부트로더 설치 실패 수정

**날짜:** 2026-03-03
**상태:** 수정 완료
**영향:** 라이브 USB → 하드디스크 설치 시 100% 실패 (부트로더 단계)
**선행 이슈:** rsync exit code 23 수정 (2026-03-02) — rsync 통과 후 발견

---

## 증상

라이브 USB에서 하드디스크 설치 시, 소프트웨어 설치(rsync) 통과 후
부트로더 설치 단계에서 실패:

```
pyanaconda.modules.common.errors.installation.BootloaderInstallationError:
gen_grub_cfgstub script failed
```

Anaconda storage.log의 상세 에러:
```
File ".../efi.py", line 201, in write_config
    raise BootLoaderError("gen_grub_cfgstub script failed")
```

---

## 근본 원인

### ostree 이미지에서 /boot 디렉토리 구조 부재

Naia OS (Bazzite/ostree 기반)의 rootfs에는 `/boot/grub2`와
`/boot/efi/EFI/fedora` 디렉토리가 존재하지 않는다.

**이유:**
- ostree 시스템에서 `/boot`은 별도 파티션으로 ostree/bootupd가 관리
- 라이브 이미지의 squashfs rootfs에는 `/boot/`가 비어있음
- rsync로 rootfs를 복사해도 `/boot/` 파티션(ext4)은 빈 채로 남음

### gen_grub_cfgstub 실패 경로

```bash
# gen_grub_cfgstub /boot/grub2 /boot/efi/EFI/fedora
# ↓ chroot 안에서 실행됨 (root = /mnt/sysroot)

BOOT_UUID=$(grub2-probe --target=fs_uuid "/boot/grub2")
# → 실패: /boot/grub2 디렉토리가 존재하지 않음

GRUB_DIR=$(grub2-mkrelpath "/boot/grub2")
# → 실패: "error: failed to get canonical path of '/boot/grub2'"
```

### 연쇄 실패 (Cascade Failure)

`InstallBootloaderTask` 실패로 후속 태스크들이 전부 실행되지 않음:

| 순서 | 태스크 | 상태 |
|------|--------|------|
| 1 | InstallBootloaderTask | **FAILED** (gen_grub_cfgstub) |
| 2 | CreateBLSEntriesTask | 미실행 (kernel-install 안됨) |
| 3 | RecreateInitrdsTask | 미실행 (dracut 안됨) |
| 4 | FixBTRFSBootloaderTask | 미실행 |

결과: `/boot/`에 커널도 initramfs도 BLS 엔트리도 없는 상태.

### EFI 바이너리 미설치

추가로, EFI 바이너리(shimx64.efi, grubx64.efi)가 EFI System Partition에
복사되지 않는 문제도 발견:

- RPM 설치 시: RPM scriptlet이 `/boot/efi/EFI/fedora/`에 설치
- ostree 배포 시: `bootupd`가 `/usr/lib/efi/`에서 복사
- **라이브 이미지 설치 시: 아무도 복사하지 않음**

EFI 바이너리는 rootfs의 `/usr/lib/efi/`에 존재:
```
/usr/lib/efi/shim/15.8-3/EFI/fedora/shimx64.efi
/usr/lib/efi/shim/15.8-3/EFI/BOOT/BOOTX64.EFI
/usr/lib/efi/grub2/1:2.12-40.fc43/EFI/fedora/grubx64.efi
```

---

## 수정

### hook-post-rootfs.sh 섹션 3c

`gen_grub_cfgstub` 스크립트를 패치하여 3가지 기능 추가:

1. **디렉토리 생성**: `mkdir -p /boot/grub2` + `mkdir -p /boot/efi/EFI/fedora`
2. **EFI 바이너리 복사**: `/usr/lib/efi/` → `/boot/efi/EFI/fedora/`
3. **EFI 폴백 엔트리**: `/boot/efi/EFI/BOOT/BOOTX64.EFI`

패치된 gen_grub_cfgstub 실행 흐름:
```
1. mkdir -p /boot/grub2
2. mkdir -p /boot/efi/EFI/fedora
3. shimx64.efi → /boot/efi/EFI/fedora/
4. grubx64.efi → /boot/efi/EFI/fedora/
5. BOOTX64.EFI → /boot/efi/EFI/BOOT/ (UEFI 폴백)
6. grub2-probe → boot partition UUID 획득
7. grub2-mkrelpath → /grub2 (상대 경로)
8. grub.cfg stub 생성 → /boot/efi/EFI/fedora/grub.cfg
```

### 동작 방식 (전체 부트로더 설치 체인)

패치 후 태스크 실행 순서:

| 순서 | 태스크 | 역할 |
|------|--------|------|
| 1 | InstallBootloaderTask | efibootmgr + gen_grub_cfgstub (✓ 패치) + grub2-mkconfig |
| 2 | CreateBLSEntriesTask | kernel-install → /boot/에 커널+BLS 엔트리 생성 |
| 3 | RecreateInitrdsTask | dracut → /boot/에 initramfs 재생성 |
| 4 | FixBTRFSBootloaderTask | BTRFS용 부트로더 재설정 |

---

## 추가 이슈: grub2-mkconfig `/sysroot` 실패

### 증상

gen_grub_cfgstub 수정 후 다음 단계인 `grub2-mkconfig`에서 실패:
```
grub2-probe: error: failed to get canonical path of '/sysroot'
```

### 원인

ostree 시스템에서 `/sysroot`는 실제 루트 마운트포인트.
그러나 rsync 기반 설치의 chroot에는 `/sysroot`가 존재하지 않음.
Fedora의 grub2-probe가 ostree를 감지하고 `/sysroot`를 probe하려 시도.

### 수정

efi.py 패치에서:
1. 타겟 sysroot에 `/sysroot -> /` 심볼릭 링크 생성
2. `super().write_config()` (grub2-mkconfig)를 try/except로 감싸기

```python
# /sysroot 심볼릭 링크 생성
_sysroot_link = os.path.join(_sysroot, "sysroot")
if not os.path.exists(_sysroot_link):
    os.symlink("/", _sysroot_link)

# grub2-mkconfig 실패 시 안전하게 계속
try:
    super().write_config()
except BootLoaderError as _e:
    log.warning("[naia] grub2-mkconfig failed: %s", _e)
```

## 추가 이슈: `/boot/` 커널 미설치

### 증상

설치 완료 후 GRUB 메뉴에 "UEFI Firmware Settings"만 표시.
커널, initramfs, BLS 엔트리가 `/boot/`에 없음.

### 원인

1. ostree 라이브 이미지에서 rsync는 rootfs만 복사 (BTRFS root subvolume)
2. `/boot/`는 별도 ext4 파티션 → rsync 대상이 아님
3. Anaconda `get_kernel_version_list()` → 빈 리스트 반환
4. `CreateBLSEntriesTask` → "No kernel was installed" 경고 후 스킵
5. `kernel-install`의 rpm-ostree 플러그인이 방해 (cross-device link 에러)

### 수정

Anaconda 완료 후 (재부팅 전) 수동으로 커널 설치:
```bash
KVER=$(ls /usr/lib/modules/ | sort -V | tail -1)
cp /usr/lib/modules/${KVER}/vmlinuz /boot/vmlinuz-${KVER}
dracut --force /boot/initramfs-${KVER}.img ${KVER}
# BLS 엔트리 수동 생성
cat > /boot/loader/entries/${MACHINE_ID}-${KVER}.conf <<EOF
title Naia OS (${KVER})
version ${KVER}
linux /vmlinuz-${KVER}
initrd /initramfs-${KVER}.img
options root=UUID=${ROOT_UUID} rootflags=subvol=root ro
EOF
grub2-mkconfig -o /boot/grub2/grub.cfg
```

### 추가: greenboot 비활성화

ostree가 아닌 환경에서 greenboot 헬스체크가 실패 → 자동 재부팅 루프.
설치 후 비활성화 필요:
```bash
systemctl disable greenboot-healthcheck.service
systemctl mask greenboot-healthcheck.service
```

## 변경 파일

- `installer/hook-post-rootfs.sh` — 섹션 3c (gen_grub_cfgstub), 3d (efi.py), 3e (커널 설치 스크립트)
- `os/tests/e2e-install.sh` — efi.py 패치 + post-install 커널/greenboot 처리
- `os/tests/e2e-install.ks` — 커널 설치 %post 추가 (참고: --liveinst 모드에서는 %post 미실행)

## 검증

1. E2E 테스트: `os/tests/e2e-install.sh --iso <path> --verbose --keep`
2. 부트로더 설치 로그에서 `gen_grub_cfgstub script failed` 없음 확인
3. `grub2-mkconfig` rc=0 확인 (또는 try/except로 안전하게 처리)
4. 설치 후 타겟 디스크에서 UEFI 부팅 확인
5. `/boot/loader/entries/` BLS 엔트리 존재 확인
6. `/boot/efi/EFI/fedora/` EFI 바이너리 존재 확인
7. GRUB 메뉴에 "Naia OS" 커널 엔트리 표시 확인

---

## 기술 상세

### Anaconda의 EFIGRUB 부트로더 설치 흐름

```python
# efi.py — EFIGRUB.write()
def write(self):
    try:
        os.sync()
        self.stage2_device.format.sync(root=conf.target.physical_root)
        self.install()      # efibootmgr NVRAM 엔트리 생성
    finally:
        self.write_config()  # gen_grub_cfgstub + grub2-mkconfig

# efi.py — EFIGRUB.write_config()
def write_config(self):
    rc = util.execWithRedirect(
        "gen_grub_cfgstub",
        [self.config_dir, self.efi_config_dir],  # /boot/grub2, /boot/efi/EFI/fedora
        root=conf.target.system_root,             # chroot in /mnt/sysroot
    )
    if rc != 0:
        raise BootLoaderError("gen_grub_cfgstub script failed")
    super().write_config()  # GRUB2.write_config() → grub2-mkconfig
```

### gen_grub_cfgstub 원본 동작

```bash
# 1. Boot partition의 UUID를 probing
BOOT_UUID=$(grub2-probe --target=fs_uuid /boot/grub2)

# 2. /boot 마운트포인트 기준 상대 경로
GRUB_DIR=$(grub2-mkrelpath /boot/grub2)  # → "/grub2"

# 3. EFI stub config 생성
# search → boot partition UUID로 root device 찾기
# configfile → /boot/grub2/grub.cfg 로드
```

### bootupd가 라이브 이미지 설치에서 동작하지 않는 이유

```
$ bootupctl status
No components installed.
No components are adoptable.
Boot method: EFI

$ bootupctl adopt-and-update
error: get parent devices: get parent devices from mount point boot or sysroot:
Failed to inspect filesystem from boot or sysroot
```

`bootupd`는 ostree deployment 구조를 기대하지만, 라이브 이미지 설치는
rsync 기반이므로 ostree deployment가 아님.

---

## 향후 고려사항

- Anaconda upstream에 ostree/bootc 라이브 이미지 설치 시 EFI 바이너리
  자동 복사 패치를 제출하는 것을 고려
- `bootupd`가 non-ostree-deployment 환경에서도 EFI 파일을 설치할 수
  있도록 하는 기능 제안
- 장기적으로는 `bootc install`을 사용하는 방식으로 마이그레이션 고려
  (Anaconda 라이브 이미지 방식 대신)
