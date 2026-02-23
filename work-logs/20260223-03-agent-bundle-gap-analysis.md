# Agent 번들링 누락 분석

## 날짜
2026-02-23

## 증상
AppImage 실행 시 agent-core 로드 실패:
```
Error: Cannot find module '/tmp/.mount_naia-sXXXXXX/agent/dist/index.js'
```

## 현재 상태

### AppImage 내부 구조 (실제 확인)
```
squashfs-root/
├── AppRun
├── apprun-hooks/linuxdeploy-plugin-gtk.sh   # GDK_BACKEND=x11 강제
├── usr/bin/naia-shell                        # Tauri 바이너리 (84MB)
├── usr/lib/...                               # GTK/WebKit 공유 라이브러리
└── (agent/ 없음, node 없음)                   # ← 문제
```

### 배포 포맷별 agent 포함 여부

| 포맷 | Agent 빌드 | Agent 번들 | Node.js | 상태 |
|------|-----------|-----------|---------|------|
| **AppImage** | 안 함 | 없음 | 없음 | 완전히 깨짐 |
| **DEB/RPM** | 안 함 | 없음 | 시스템 node | 깨짐 |
| **Flatpak** | `npx tsc` | `cp -rL agent/dist` | SDK node22 | 동작 |

## 근본 원인 (3계층)

### 1. CI 파이프라인: agent 빌드 단계 누락

**`.github/workflows/release-app.yml`**:
```yaml
# 현재 — agent 빌드 없음
- name: Install frontend dependencies
  working-directory: shell
  run: pnpm install --frozen-lockfile
- name: Build Tauri app
  working-directory: shell
  run: pnpm run tauri build
```

**필요한 추가**:
```yaml
- name: Build agent
  working-directory: agent
  run: pnpm install --frozen-lockfile && pnpm run build
```

### 2. Tauri 번들 설정: resources 미설정

**`shell/src-tauri/tauri.conf.json`**:
```json
{
  "bundle": {
    "targets": ["deb", "rpm", "appimage"]
    // ← resources 설정 없음
  }
}
```

**필요한 추가** (Tauri 2 `resources` 문법):
```json
{
  "bundle": {
    "resources": {
      "../agent/dist": "agent/dist",
      "../agent/package.json": "agent/package.json",
      "../agent/node_modules": "agent/node_modules"
    }
  }
}
```

주의: `node_modules`도 필요함 (agent의 런타임 dependencies: ws 등)

### 3. Rust 경로 로직: 상대경로 하드코딩

**`shell/src-tauri/src/lib.rs` (584~611행)**:
```rust
fn spawn_agent_core(...) {
    let agent_script = std::env::var("NAIA_AGENT_SCRIPT")
        .unwrap_or_else(|_| {
            // 개발: 소스에서 직접 실행
            let candidates = [
                "../../agent/src/index.ts",  // from src-tauri/
                "../agent/src/index.ts",     // from shell/
            ];
            for rel in &candidates { ... }

            // 프로덕션 폴백 — 문제의 경로
            "../agent/dist/index.js".to_string()
        });
}
```

**문제**: `../agent/dist/index.js`는 현재 작업 디렉토리 기준 상대경로.
- 개발: `shell/src-tauri/`에서 실행 → `../../agent/dist/index.js` → OK
- AppImage: `/tmp/.mount_XXX/usr/bin/`에서 실행 → `../agent/dist/index.js` → `/tmp/.mount_XXX/agent/dist/` → 없음

**필요한 수정**: Tauri Resource API로 번들된 리소스 경로를 동적으로 해석:
```rust
// Tauri 2: app_handle.path().resource_dir()로 번들 리소스 경로 취득
let resource_dir = app_handle.path().resource_dir()
    .map_err(|e| format!("resource_dir: {}", e))?;
let agent_script = resource_dir.join("agent/dist/index.js");
```

### 참조: Flatpak에서는 어떻게 해결하고 있나

**`flatpak/io.nextain.naia.yml`**:
```yaml
build-commands:
  # Agent 빌드
  - cd agent && npx pnpm install --no-frozen-lockfile
  - cd agent && npx tsc

  # Agent를 /app/lib/ 에 설치
  - mkdir -p /app/lib/naia-os/agent
  - cp -rL agent/dist /app/lib/naia-os/agent/dist
  - cp -rL agent/node_modules /app/lib/naia-os/agent/node_modules
  - cp agent/package.json /app/lib/naia-os/agent/

  # Node.js도 번들
  - install -Dm755 /usr/lib/sdk/node22/bin/node /app/bin/node
```

Flatpak은 절대경로(`/app/lib/naia-os/agent/dist/index.js`)를 사용하므로 동작함.

## 수정 계획

### 필수 수정 파일
1. **`.github/workflows/release-app.yml`** — agent 빌드 단계 추가
2. **`shell/src-tauri/tauri.conf.json`** — `bundle.resources`에 agent 추가
3. **`shell/src-tauri/src/lib.rs`** — `spawn_agent_core()` 경로를 Tauri Resource API로 변경

### Node.js 번들링 문제
AppImage에는 Node.js 런타임도 포함되어 있지 않음.
- Flatpak: SDK에서 `/app/bin/node` 복사
- AppImage: `node`를 시스템에서 사용 (Naia OS에는 `nodejs` rpm이 설치됨)
- DEB/RPM: 마찬가지로 시스템 node 의존

→ Naia OS 전용이라면 시스템 node 사용으로 충분. 범용 배포 시 node 번들링 필요.

### OpenClaw 번들링
현재 OpenClaw은 `~/.naia/openclaw/`에 npm으로 설치하는 구조.
- `recipe.yml`에 `setup-openclaw.sh` 미포함 (빌드 시 HOME이 다름)
- Flatpak에서도 OpenClaw 미포함
- 첫 부팅 시 자동 설치하는 메커니즘 필요 (systemd user service 또는 온보딩)
