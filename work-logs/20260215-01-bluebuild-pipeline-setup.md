# Phase 0: BlueBuild 배포 파이프라인 + 브랜드 설정

**날짜**: 2026-02-15 ~ 2026-02-16
**상태**: 완료 (USB 부팅 테스트 대기)

## 목표

"배포 먼저" 전략에 따라 GitHub push → BlueBuild → ghcr.io → ISO 파이프라인을 구축하고,
naia.com에서 가져온 브랜드 에셋을 커밋한다.

**완료 조건**: USB 부팅 → Bazzite + Node.js 22 설치된 상태 (아직 커스텀 앱 없음)

## 작업 내역

### 1. 브랜드 에셋 (shell/public/brand/)

이미 복사되어 있던 에셋을 Git에 추가:
- `logo.webp` - 메인 로고
- `alpha-icon.webp` - 낸 아이콘
- `og-cover.webp` - OG 이미지
- `cafe_lua_logo_cleaned.png` - PNG 로고
- `theme.json` - 브랜드 테마 (색상, 폰트, 스페이싱)

### 2. BlueBuild 표준 디렉토리 구조

BlueBuild 규격에 맞춰 구성 (2/16 수정):

| 파일 | 설명 |
|------|------|
| `recipes/recipe.yml` | BlueBuild 레시피 (Bazzite 베이스, Node.js, Tauri deps, pnpm) |
| `config/scripts/install-pnpm.sh` | npm을 통한 pnpm 글로벌 설치 |
| `config/scripts/branding.sh` | OS 브랜딩 (Naia OS) |
| `config/files/usr/share/applications/naia-shell.desktop` | 데스크탑 엔트리 (Phase 1 placeholder) |
| `os/tests/smoke.sh` | VM 부팅 후 스모크 테스트 (Node 22+, pnpm, podman) |

### 3. CI 워크플로우 (.github/workflows/)

| 파일 | 트리거 | 설명 |
|------|--------|------|
| `build.yml` | push to main (recipes/**, config/** 변경 시) | BlueBuild 이미지 빌드 → ghcr.io push |
| `iso.yml` | workflow_dispatch (수동) | ISO 생성 → GitHub Releases 업로드 |

### 4. OS 브랜딩 (branding.sh)

`/usr/lib/os-release`를 덮어써서 부팅 후 "Naia OS"로 표시되도록 변경:
- `NAME="Naia OS"`
- `PRETTY_NAME="Naia OS (Bazzite)"`

## 빌드 트러블슈팅 (2/16)

| 문제 | 원인 | 해결 |
|------|------|------|
| recipe.yml not found | BlueBuild는 `recipes/` 디렉토리 기대 | `os/` → `recipes/` + `config/` 이동 |
| corepack not found | Fedora nodejs에 corepack 미포함 | `npm install -g pnpm`으로 변경 |
| files module 실패 | `source: files`가 `config/files/files` 탐색 | `source: usr`, `destination: /usr`로 수정 |
| dracut 실패 (F39 커널) | ISO 생성기 기본 version=39 | `version: "43"` 명시, v1.4.0 고정 |
| skopeo unauthorized | ghcr.io 패키지가 private | 패키지를 public으로 변경 |

## 참고

- BlueBuild 레시피 타입: `rpm-ostree` (dnf가 아님)
- Cosign 서명: `SIGNING_SECRET` GitHub Secret 필요
- ISO 생성: `jasonn3/build-container-installer@v1.4.0` (Fedora 43)
- Bazzite `latest` 태그 사용 (현재 Fedora 43 기반)
- ghcr.io 패키지는 public 설정 필수

## 완료 체크리스트

- [x] git push 후 GitHub Actions 빌드 성공 확인
- [x] ghcr.io에 `Naia-OS:latest` 이미지 확인
- [x] `SIGNING_SECRET` GitHub Secret 설정 (cosign)
- [x] ISO 수동 생성 성공 (6.5GB)
- [ ] USB 부팅 테스트
