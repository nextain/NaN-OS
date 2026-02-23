# Agent 번들링 누락 분석 및 수정

## 날짜
2026-02-23

## 상태: 부분 완료
- [x] `tauri.conf.json` — bundle resources 추가 (커밋 `ea72dbd`)
- [x] `lib.rs` — Tauri Resource API로 agent 경로 해석 (커밋 `ea72dbd`)
- [x] `naia-gateway.service` — ReadWritePaths 수정 (커밋 `ea72dbd`)
- [ ] **`release-app.yml` — agent 빌드 단계 추가 (PAT에 workflow scope 없어 미푸시)**

## 증상
AppImage 실행 시 agent-core 로드 실패:
```
Error: Cannot find module '/tmp/.mount_naia-sXXXXXX/agent/dist/index.js'
```

## AppImage 내부 구조 (실제 확인)
```
squashfs-root/
├── AppRun
├── apprun-hooks/linuxdeploy-plugin-gtk.sh   # GDK_BACKEND=x11 강제
├── usr/bin/naia-shell                        # Tauri 바이너리 (84MB)
├── usr/lib/...                               # GTK/WebKit 공유 라이브러리
└── (agent/ 없음, node 없음)                   # ← 문제
```

## 근본 원인 (3계층)

### 1. CI 파이프라인: agent 빌드 단계 누락
### 2. Tauri 번들 설정: resources 미설정
### 3. Rust 경로 로직: 상대경로 하드코딩

## 적용된 수정 (커밋 `ea72dbd`)

### `shell/src-tauri/tauri.conf.json`
```json
"resources": {
    "../../agent/dist": "agent/dist",
    "../../agent/package.json": "agent/package.json",
    "../../agent/node_modules": "agent/node_modules"
}
```

### `shell/src-tauri/src/lib.rs` (spawn_agent_core)
```rust
// 기존: "../agent/dist/index.js" 하드코딩
// 수정: Tauri Resource API로 번들된 경로 해석
if let Ok(resource_dir) = app_handle.path().resource_dir() {
    let bundled = resource_dir.join("agent/dist/index.js");
    if bundled.exists() {
        return bundled.to_string_lossy().to_string();
    }
}
// Fallback: 기존 상대경로 (legacy)
"../agent/dist/index.js".to_string()
```

### `config/files/usr/lib/systemd/user/naia-gateway.service`
```diff
-ReadWritePaths=%h/.naia %h/.openclaw
+ReadWritePaths=%h/.naia
```
`%h/.openclaw` 디렉토리가 존재하지 않아 NAMESPACE 에러 발생 → 제거.
OpenClaw은 `%h/.naia/openclaw/`에 설치되므로 `%h/.naia`로 충분.

## 미적용: release-app.yml (개발 PC에서 푸시 필요)

PAT에 `workflow` scope가 없어 이 머신에서 push 불가.

**개발 PC에서 적용할 diff:**

```yaml
# .github/workflows/release-app.yml

# 1. cache-dependency-path에 agent 추가 (44행 부근)
          cache-dependency-path: |
            shell/pnpm-lock.yaml
            agent/pnpm-lock.yaml

# 2. "Install frontend dependencies" 와 "Build Tauri app" 사이에 추가 (63행 부근)
      - name: Build agent
        working-directory: agent
        run: pnpm install --frozen-lockfile && pnpm run build
```

이 변경이 없으면 CI에서 AppImage 빌드 시 `agent/dist/`가 생성되지 않아
`tauri.conf.json`의 resources가 빈 디렉토리를 번들하게 됨.

## 추가 검증 결과

### OpenClaw Gateway 연동 검증
- `setup-openclaw.sh` 실행 → OpenClaw 2026.2.15 설치 성공
- naia-shell이 Gateway를 자동 감지하고 spawn:
  ```
  [Naia] Gateway process spawned (PID: 21499)
  [Naia] Gateway ready (managed=true, node_host=true)
  ```
- 단, systemd 서비스로 실행 시 NAMESPACE 에러 (수정 완료)

### 잔여 이슈
1. **EGL 흰 화면**: 소스 수정(커밋 `cd2aff2`)은 완료, CI 빌드 후 검증 필요
2. **OpenClaw 번들링**: 현재는 사용자가 `setup-openclaw.sh` 수동 실행 필요
   - 첫 부팅 시 자동 설치 메커니즘 미구현
3. **Node.js 번들링**: AppImage에 node 미포함, Naia OS는 시스템 node 사용
