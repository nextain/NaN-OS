# OS 업데이트 파이프라인

## 업데이트 원리

Naia OS는 [Bazzite](https://github.com/ublue-os/bazzite) (Fedora Atomic) 기반입니다. 기존 패키지 업그레이드가 아닌 **원자적 컨테이너 이미지 배포** 방식으로 업데이트됩니다.

### 업데이트 흐름

```
Bazzite 베이스 이미지 업데이트
  ↓ (매주 수요일 자동 리빌드)
Naia 컨테이너 리빌드 (BlueBuild — Bazzite 위에 우리 커스텀 적용)
  ↓
컨테이너 smoke test (패키지, 브랜딩, Naia Shell 검증)
  ↓ 통과
GHCR에 push (ghcr.io/nextain/naia-os:latest)
  ↓                              ↓
ISO 리빌드 + R2 업로드           설치된 시스템: bootc update
```

### 우리 커스텀 범위 (오버레이)

| 분류 | 내용 | 부팅 위험 |
|------|------|----------|
| 패키지 | fcitx5 (한글 입력), 폰트, jq, sqlite, podman | 없음 — 표준 Fedora 패키지 |
| Naia Shell | Flatpak 앱 (샌드박스, 독립 업데이트) | 없음 — Flatpak 샌드박스 실행 |
| 브랜딩 | os-release, 배경화면, 로그인 화면, Plymouth 테마 | 없음 — 시각적 변경만 |
| KDE 설정 | 작업표시줄 핀, 시작 아이콘, 배경화면 설정 | 없음 — 사용자 세션 범위 |
| 자동시작 | Naia Shell XDG autostart 항목 | 없음 — 앱 실행만 |

**절대 건드리지 않는 것:** 커널, initrd, 부트로더, systemd 핵심, SELinux 정책, ostree/bootc 내부.

## 안전 보장

### 원자적 업데이트
새 이미지는 기존 이미지와 나란히 배포됩니다. 재부팅 시 전환되며, 배포 실패 시 기존 이미지는 그대로 유지됩니다.

### 자동 롤백
모든 업데이트는 이전 배포를 유지합니다. 새 이미지가 부팅에 실패하면:
1. 머신을 재부팅
2. GRUB 메뉴에서 이전 항목 선택
3. 마지막으로 정상 동작한 이미지로 부팅

### 컨테이너 Smoke Test
매 빌드마다 자동으로 검증합니다:
- 필수 패키지 설치 (fcitx5, 폰트)
- 브랜딩 적용 (os-release에 "Naia" 표시)
- Naia Shell 번들 존재
- KDE Plasma 스크립트 배치
- 자동시작 항목 존재

하나라도 실패하면 빌드가 실패로 표시되고 ISO가 생성되지 않습니다.

### ISO 롤백
새 ISO를 다운로드 서버(R2)에 업로드하기 전에 이전 버전을 `previous/`에 백업합니다. 잘못된 ISO가 배포되면 즉시 롤백할 수 있습니다.

## 테스트 단계

| 단계 | 내용 | 자동화 | 시점 |
|------|------|--------|------|
| 1. Container Smoke | 패키지/브랜딩/파일 검증 | 자동 (CI) | 매 빌드 |
| 2. ISO Boot | QEMU 부팅 테스트 | 반자동 | 주요 변경 시 |
| 3. Manual Verify | VNC 설치 + 기능 확인 | 수동 | Fedora 버전 업 시 |
| 4. Update Path | bootc upgrade + 재부팅 (실 VM) | 수동 | 자동 업데이트 활성화 전 |

## 알려진 위험

### Bazzite 깨진 업데이트 (중간)
Bazzite가 깨진 베이스 이미지를 push하면 우리 주간 리빌드가 이를 반영합니다. Smoke test가 패키지/설정 문제를 잡지만, 미묘한 런타임 문제는 통과할 수 있습니다. ostree 롤백으로 복구 가능합니다.

### .origin 파일 형식 변경 (높음, ISO만 해당)
ISO 설치 시 `sed`로 ostree `.origin` 파일의 컨테이너 이미지 참조를 설정합니다. bootc가 형식을 변경하면 설치가 실패할 수 있습니다. 이미 설치된 시스템의 업데이트에는 영향 없습니다.

### KDE 설정 충돌 (낮음)
Bazzite가 KDE 기본값을 변경하면 우리 Plasma 스크립트와 충돌 가능합니다. `naia-*` 접두사로 실행 순서를 보장하고, 사용자 세션 범위라 충돌 위험은 낮습니다.

### Plymouth 테마 원복 (낮음)
업데이트 후 Plymouth 부팅 테마가 Bazzite로 돌아갈 수 있습니다 (initrd 재생성 필요). 시각적 문제만 — 부팅 자체에는 영향 없습니다.

## 사용자 가이드

### 업데이트 방법
설치된 Naia OS 시스템에서:
```bash
# 업데이트 확인
sudo bootc upgrade --check

# 업데이트 적용 (다음 재부팅 시 적용)
sudo bootc upgrade
```

### 롤백 방법
업데이트 후 문제 발생 시:
1. 머신을 재부팅
2. GRUB 부팅 메뉴에서 이전 배포 선택
3. 이전 정상 버전으로 부팅됩니다

### 현재 버전 확인
```bash
# OS 버전 확인
cat /etc/os-release | grep PRETTY_NAME

# 컨테이너 이미지 정보
cat /usr/share/ublue-os/image-info.json
```
