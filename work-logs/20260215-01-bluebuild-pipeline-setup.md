# Phase 0: BlueBuild 배포 파이프라인 + 브랜드 설정

**날짜**: 2026-02-15
**상태**: 진행중

## 목표

"배포 먼저" 전략에 따라 GitHub push → BlueBuild → ghcr.io → ISO 파이프라인을 구축하고,
cafelua.com에서 가져온 브랜드 에셋을 커밋한다.

**완료 조건**: USB 부팅 → Bazzite + Node.js 22 설치된 상태 (아직 커스텀 앱 없음)

## 작업 내역

### 1. 브랜드 에셋 (shell/public/brand/)

이미 복사되어 있던 에셋을 Git에 추가:
- `logo.webp` - 메인 로고
- `alpha-icon.webp` - 알파 아이콘
- `og-cover.webp` - OG 이미지
- `cafe_lua_logo_cleaned.png` - PNG 로고
- `theme.json` - 브랜드 테마 (색상, 폰트, 스페이싱)

### 2. OS 디렉토리 (os/)

BlueBuild 기반 커스텀 Bazzite 이미지 구성:

| 파일 | 설명 |
|------|------|
| `os/recipe.yml` | BlueBuild 레시피 (Bazzite 베이스, Node.js, Tauri deps, pnpm) |
| `os/scripts/install-pnpm.sh` | corepack을 통한 pnpm 글로벌 설치 |
| `os/files/usr/share/applications/cafelua-shell.desktop` | 데스크탑 엔트리 (Phase 1 placeholder) |
| `os/tests/smoke.sh` | VM 부팅 후 스모크 테스트 (Node 22+, pnpm, podman) |

### 3. CI 워크플로우 (.github/workflows/)

| 파일 | 트리거 | 설명 |
|------|--------|------|
| `build.yml` | push to main (os/** 변경 시) | BlueBuild 이미지 빌드 → ghcr.io push |
| `iso.yml` | workflow_dispatch (수동) | ISO 생성 → GitHub Releases 업로드 |

## 참고

- BlueBuild 레시피 타입: `rpm-ostree` (dnf가 아님)
- Cosign 서명: `SIGNING_SECRET` GitHub Secret 필요
- ISO 생성: `jasonn3/build-container-installer` 사용
- Bazzite `latest` 태그 사용 (Fedora 버전 자동 추적)

## 다음 단계

- [ ] git push 후 GitHub Actions 빌드 성공 확인
- [ ] ghcr.io에 `cafelua-os:latest` 이미지 확인
- [ ] `SIGNING_SECRET` GitHub Secret 설정 (cosign)
- [ ] ISO 수동 생성 → USB 부팅 테스트
