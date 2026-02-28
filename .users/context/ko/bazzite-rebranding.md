# Bazzite OS 리브랜딩 가이드

Bazzite (Fedora Atomic + KDE Plasma) 기반 커스텀 OS를 만들 때, 교체해야 하는 모든 브랜딩 리소스를 정리한 문서입니다.

## 교체 대상 레이어

### 1. GRUB 부트로더
- **시점**: 전원 켜짐 → GRUB 메뉴
- **파일**: `/usr/share/backgrounds/naia-os/grub-background.jpg`
- **설정**: `/usr/etc/default/grub` → `GRUB_BACKGROUND`
- **스크립트**: `config/scripts/branding.sh`

### 2. Plymouth 부트 스플래시 ⚠️ 중요
- **시점**: GRUB 이후 ~ 로그인 화면 전
- **파일**:
  - `naia.plymouth` — 테마 메타데이터
  - `naia.script` — 애니메이션 스크립트
  - `naia-splash.png` — 로고 (300×300 RGBA)
- **경로**: `/usr/share/plymouth/themes/naia/`
- **⚠️ 핵심**: 테마 설정 후 **반드시 `dracut -f --regenerate-all` 실행**
  - ostree 기반 시스템은 Plymouth를 initramfs에 포함시킴
  - initrd를 재빌드하지 않으면 Bazzite "B" 로고가 그대로 남음

### 3. SDDM 로그인 화면
- **시점**: 로그인 프롬프트
- **파일**: `/usr/share/backgrounds/naia-os/login-background.jpg`
- **설정**: SDDM 테마 디렉토리의 `theme.conf.user`
- **참고**: Bazzite는 breeze 또는 01-breeze-fedora 테마 사용

### 4. KDE 시작 메뉴 (Kickoff) ⚠️ 중요
- **시점**: 데스크톱 하단 왼쪽 버튼
- **Bazzite 기본값**: `icon=bazzite` (Bazzite look-and-feel에서 설정)
- **교체 방법**: Plasma 업데이트 스크립트 (JS)
  ```javascript
  // naia-kickoff.js
  if (widget.type === "org.kde.plasma.kickoff") {
      widget.writeConfig("icon", "start-here");
  }
  ```
- **경로**: `/usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/`
- **⚠️ 핵심**: `start-here.png`만 넣으면 안 됨. Bazzite가 Kickoff 아이콘을 명시적으로 `bazzite`로 설정하므로 Plasma 스크립트로 덮어써야 함

### 5. 앱 런처 아이콘 (start-here)
- **시점**: 데스크톱, 파일 관리자, 시스템 정보
- **파일**: `start-here.png` (16~256px) + `start-here.svg`
- **경로**: `/usr/share/icons/hicolor/{size}/places/`
- **배포**: BlueBuild `files` 모듈 (`config/files/`)

### 6. 시스템 Pixmaps ⚠️ 중요
- **시점**: About 대화상자, 시스템 정보, Anaconda 설치 프로그램
- **파일**:
  - `naia-os-logo.png` (256×256)
  - `naia-os-logo-small.png` (48×48)
- **심볼릭 링크** (branding.sh에서 생성):
  - `fedora-logo.png` → `naia-os-logo.png`
  - `fedora-logo-sprite.png` → `naia-os-logo.png`
  - `system-logo-white.png` → `naia-os-logo.png`
  - `fedora-logo-small.png` → `naia-os-logo-small.png`
  - **`bazzite.png` → `naia-os-logo.png`** ← 반드시 교체

### 7. Bazzite 아이콘 파일 (hicolor)
- **문제**: KDE가 `/apps/bazzite.png`를 `/places/start-here.png`보다 먼저 탐색
- **해결**: 각 크기별로 `bazzite.png` → `start-here.png` 심링크
  ```bash
  for size in 16x16 22x22 24x24 32x32 48x48 64x64 128x128 256x256; do
      ln -sf "/usr/share/icons/hicolor/${size}/places/start-here.png" \
             "/usr/share/icons/hicolor/${size}/apps/bazzite.png"
  done
  ```

### 8. Anaconda 설치 프로그램
- **시점**: "Install to Hard Drive" UI
- **파일**:
  - `sidebar-logo.png`, `sidebar-bg.png`, `topbar-bg.png`
  - `anaconda_header.png`, `fedora.css`
  - `AnacondaInstaller.svg` + PNG 크기별 렌더링
- **⚠️ 주의**: SVG만 교체하면 안 됨. KDE는 PNG를 우선 사용. `rsvg-convert`로 PNG 생성 필요

### 9. os-release
- **시점**: 시스템 정보, neofetch 등
- **파일**: `/usr/lib/os-release`
- **변경 필드**: NAME, PRETTY_NAME, ID, VARIANT, HOME_URL 등

### 10. 바탕화면
- **파일**: 1920×1080, 2560×1440, 3840×2160 해상도별 이미지
- **경로**: `/usr/share/wallpapers/NaiaOS/`
- **필수**: `metadata.json` 포함

## 교체 불가 항목

| 항목 | 이유 |
|------|------|
| UEFI/BIOS 제조사 로고 | 하드웨어 펌웨어에 저장 (Samsung, Dell 등) |
| Secure Boot Shim 로고 | Fedora/Red Hat 서명 필요 |

## 파일 구조

```
assets/
  installer/     ← 설치 프로그램용 원본 에셋 (hook-post-rootfs.sh가 사용)
  logos/          ← 디자인 소스 파일 (배포되지 않음)
  wallpaper/      ← 바탕화면 소스 파일

config/
  files/          ← BlueBuild "files" 모듈 → / 에 복사
  scripts/
    branding.sh   ← 이미지 빌드 시 실행 (심링크, 설정)

installer/
  hook-post-rootfs.sh  ← ISO 생성 시 실행 (Titanoboa post-rootfs)
```

## 체크리스트

- [ ] os-release 업데이트 (NAME, ID, VARIANT)
- [ ] 시스템 pixmaps + bazzite.png 심링크
- [ ] start-here 아이콘 (모든 크기) 제공
- [ ] hicolor/apps/ 에 bazzite.png → start-here 심링크
- [ ] Kickoff 아이콘 Plasma 업데이트 스크립트로 교체
- [ ] Plymouth 테마 + dracut 재빌드
- [ ] SDDM 배경 교체
- [ ] GRUB 배경 설정
- [ ] Anaconda 에셋 (sidebar, topbar, CSS, SVG+PNG 아이콘)
- [ ] 바탕화면 + metadata.json
- [ ] gtk-update-icon-cache 실행
- [ ] sidebar-logo.png 동기화 (config/files/ ↔ assets/installer/)
