# rsync exit code 23 하드디스크 설치 실패 수정

**날짜:** 2026-03-02
**상태:** 수정 완료
**영향:** 라이브 USB → 하드디스크 설치 시 100% 실패

---

## 증상

라이브 USB에서 "Install to Hard Drive"로 하드디스크 설치를 시도하면,
소프트웨어 설치 60% 진행 후 다음 에러로 실패:

```
org.fedoraproject.Anaconda.PayloadInstallationError:
Failed to install image: process '['rsync', '-pogAXtlHrDx', ...]'
exited with status 23
```

rsync exit code 23 = "some files/attrs were not transferred (see previous errors)"

---

## 근본 원인

### ostree 심볼릭 링크 vs BTRFS subvolume 충돌

Naia OS는 Bazzite(Fedora ostree 기반)를 베이스로 사용한다.
ostree 이미지에서는 루트 레벨의 여러 디렉토리가 심볼릭 링크로 되어 있다:

```
/home   -> var/home     (심볼릭 링크)
/root   -> var/roothome (심볼릭 링크)
/mnt    -> var/mnt      (심볼릭 링크)
/opt    -> /var/opt     (심볼릭 링크)
/srv    -> var/srv      (심볼릭 링크)
/media  -> run/media    (심볼릭 링크)
```

그런데 Anaconda 설치기는 BTRFS 파티셔닝 시 `root`과 `home` 두 개의
subvolume을 자동 생성하고, `/home`을 별도 마운트 포인트로 마운트한다:

```
/dev/sda3 → /mnt/sysroot       (subvol=/root)
/dev/sda3 → /mnt/sysroot/home  (subvol=/home)  ← 실제 디렉토리로 마운트됨
```

rsync가 소스 이미지의 `/home` (심볼릭 링크)을 타겟으로 복사하려면,
기존의 `/mnt/sysroot/home` 디렉토리를 삭제하고 심볼릭 링크를 생성해야 한다.
하지만 `/home`이 BTRFS subvolume으로 **마운트된 상태**이므로:

```
rsync: [generator] delete_file: rmdir(home) failed: Device or resource busy (16)
could not make way for new symlink: home
```

→ rsync exit code 23 발생

### 이전 수정(프로세스 정리)이 효과 없었던 이유

기존 `naia-liveinst-wrapper.sh`에서 Naia Shell, OpenClaw Gateway, fcitx5 등
런타임 프로세스를 종료하는 것은 transient 파일 문제를 해결하기 위한 것이었다.
하지만 실제 원인은 프로세스가 아닌 **파일시스템 마운트 구조 충돌**이었으므로,
프로세스를 아무리 정리해도 해결되지 않았다.

---

## 해결 방법

`installer/hook-post-rootfs.sh`에서 Anaconda의 `installation.py`를
런타임에 패치하여 `_fixup_ostree_symlinks()` 메서드를 추가한다.

### 동작 방식

1. rsync가 정상적으로 실행됨 (마운트된 `/home` 등은 복사 실패)
2. rsync 완료 직후, `_fixup_ostree_symlinks()` 가 호출됨
3. 소스 이미지의 루트 레벨 심볼릭 링크를 순회
4. 타겟에서 해당 경로가 디렉토리(마운트포인트)인 경우:
   - `umount -l` 로 언마운트
   - `rmdir` 또는 `shutil.rmtree` 로 디렉토리 삭제
   - `os.symlink()` 으로 올바른 심볼릭 링크 생성
5. 설치가 정상 완료됨

### 변경 파일

- `installer/hook-post-rootfs.sh` — 섹션 3b 추가

### 패치 대상

- `pyanaconda/modules/payloads/payload/live_image/installation.py`
  - `InstallFromImageTask` 클래스에 `_fixup_ostree_symlinks()` 메서드 추가
  - `run()` 메서드에서 rsync 완료 후 해당 메서드 호출

---

## 검증

1. 패치 스크립트가 현재 Anaconda의 installation.py에 정상 적용됨 확인
2. 패치된 Python 파일의 문법 검증 통과 (`py_compile`)
3. 실제 rsync 실행으로 에러 메시지 재현 확인:
   ```
   rsync: [generator] delete_file: rmdir(home) failed: Device or resource busy (16)
   could not make way for new symlink: home
   ```

---

## 향후 고려사항

- Anaconda upstream에 ostree 기반 이미지용 심볼릭 링크 처리 패치를
  제출하는 것을 고려할 수 있음
- BTRFS subvolume 자동 생성 시 `/home` subvolume을 생성하지 않도록
  Anaconda 프로필에서 제어할 수 있는지 조사 필요
