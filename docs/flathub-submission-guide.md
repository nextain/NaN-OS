# Flathub 등록 가이드

Naia (io.nextain.naia) Flatpak 앱을 Flathub에 등록하는 절차.

## 사전 조건

- GitHub Release에 `Naia-Shell-x86_64.flatpak` 아티팩트 포함
- `flatpak/io.nextain.naia.metainfo.xml` — appstreamcli 검증 통과
- `flatpak/io.nextain.naia.desktop` — 유효한 desktop entry

## 1단계: Flathub 전용 매니페스트 준비

Flathub은 **빌드 중 네트워크 접근 불가**. 현재 CI 매니페스트(`flatpak/io.nextain.naia.yml`)는 `--share=network`으로 빌드 중 의존성을 받으므로, Flathub용 별도 매니페스트가 필요.

### 1a: 오프라인 소스 생성

```bash
# flatpak-builder-tools 설치
pip install flatpak-builder-tools

# Cargo 의존성 (Rust)
cd shell/src-tauri
python3 -m flatpak_builder_tools.cargo \
  Cargo.lock \
  -o ../../flatpak/flathub/cargo-sources.json

# Node 의존성 — Agent
cd agent
flatpak-node-generator pnpm pnpm-lock.yaml \
  -o ../flatpak/flathub/node-sources-agent.json

# Node 의존성 — Shell
cd shell
flatpak-node-generator pnpm pnpm-lock.yaml \
  -o ../flatpak/flathub/node-sources-shell.json
```

### 1b: 매니페스트 업데이트

`flatpak/flathub/io.nextain.naia.yml` 초안은 이미 생성됨. 오프라인 소스 생성 후:

1. `tag: v0.1.0` 옆에 `commit: <실제 SHA>` 추가
2. cargo-sources.json, node-sources-*.json 파일이 존재하는지 확인
3. 로컬 빌드 테스트:
   ```bash
   flatpak-builder --force-clean --disable-rofiles-fuse \
     --repo=test-repo build-dir flatpak/flathub/io.nextain.naia.yml
   flatpak build-bundle test-repo test.flatpak io.nextain.naia
   ```

## 2단계: Flathub PR 제출

### Fork & 브랜치

```bash
# flathub/flathub 레포 fork (GitHub 웹에서)
gh repo fork flathub/flathub --clone

# 브랜치 생성 (반드시 new-pr base)
cd flathub
git checkout new-pr
git checkout -b io.nextain.naia
```

### 파일 구조

```
io.nextain.naia/
├── io.nextain.naia.yml          # Flathub 매니페스트
├── cargo-sources.json           # Rust 오프라인 소스
├── node-sources-agent.json      # Agent Node 오프라인 소스
├── node-sources-shell.json      # Shell Node 오프라인 소스
└── flathub.json                 # {"only-arches": ["x86_64"]}
```

### PR 오픈

```bash
git add io.nextain.naia/
git commit -m "Add io.nextain.naia (Naia)"
git push origin io.nextain.naia

gh pr create \
  --repo flathub/flathub \
  --base new-pr \
  --title "Add io.nextain.naia" \
  --body "## New App: Naia

Personal AI avatar desktop shell built with Tauri 2.

- **Homepage**: https://naia.nextain.io
- **Source**: https://github.com/nextain/naia-os
- **License**: Apache-2.0
- **Architecture**: x86_64 only

### Features
- 3D VRM avatar with lip-sync
- Multi-LLM support (Gemini, Grok, Claude)
- Built-in tools: web search, file manager, Discord
- Always-on agent daemon with skill system"
```

## 3단계: 리뷰어 피드백 대응

### 예상되는 피드백

| 이슈 | 현재 상태 | 대응 |
|------|----------|------|
| `--filesystem=home` 과도 | 매니페스트에 포함 | `xdg-config/naia:create` + `xdg-data/naia:create`로 좁힘 |
| `--talk-name=org.freedesktop.Flatpak` | sandbox escape | 제거하고 대안 검토 (portal 사용) |
| screenshots 없음 | metainfo에 미포함 | 스크린샷 촬영 후 추가 |
| Node.js 런타임 번들링 | SDK extension 사용 | Flathub 정책 확인 필요 |

### Sandbox 권한 축소 방법

```yaml
# 현재 (과도)
- --filesystem=home
- --talk-name=org.freedesktop.Flatpak

# 개선
- --filesystem=xdg-config/naia:create
- --filesystem=xdg-data/naia:create
- --filesystem=xdg-documents:ro    # 파일 읽기용 (필요시)
# org.freedesktop.Flatpak 제거 — host command 실행 불필요
```

## 4단계: 스크린샷 추가

Flathub 권장: 최소 3장, 16:9 비율, 1920x1080.

```xml
<!-- metainfo.xml에 추가 -->
<screenshots>
  <screenshot type="default">
    <image>https://naia.nextain.io/screenshots/chat.png</image>
    <caption>Chat with Naia AI avatar</caption>
  </screenshot>
  <screenshot>
    <image>https://naia.nextain.io/screenshots/settings.png</image>
    <caption>Settings and customization</caption>
  </screenshot>
  <screenshot>
    <image>https://naia.nextain.io/screenshots/tools.png</image>
    <caption>Built-in tools and skills</caption>
  </screenshot>
</screenshots>
```

## 5단계: 검증

```bash
# metainfo 검증
appstreamcli validate flatpak/io.nextain.naia.metainfo.xml

# desktop file 검증
desktop-file-validate flatpak/io.nextain.naia.desktop

# Flathub lint
flatpak run --command=flatpak-builder-lint \
  org.flatpak.Builder manifest io.nextain.naia.yml
flatpak run --command=flatpak-builder-lint \
  org.flatpak.Builder repo test-repo
```

## 참고 링크

- [Flathub 앱 제출 가이드](https://docs.flathub.org/docs/for-app-authors/submission/)
- [AppStream MetaInfo 가이드](https://www.freedesktop.org/software/appstream/docs/)
- [Flatpak Builder 문서](https://docs.flatpak.org/en/latest/flatpak-builder.html)
- [flatpak-builder-tools](https://github.com/nickvdp/nickvdp-flatpak-builder-tools)
