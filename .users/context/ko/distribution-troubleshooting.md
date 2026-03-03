# 배포 트러블슈팅

Naia OS 개발 중 발생한 빌드 및 런타임 문제들.

## pnpm Store 손상

**증상**: `pnpm dev` / `cargo tauri dev` 실행 시 `Invalid package config ... Unexpected end of JSON input` 또는 `ERR_INVALID_PACKAGE_CONFIG` 에러. `node_modules` 내 다수의 `package.json` 파일이 0바이트.

**원인**: pnpm content-addressable store(`~/.local/share/pnpm/store/v10`)가 손상됨. pnpm은 store → `node_modules`로 hardlink를 생성하므로, store 파일이 깨지면 이후 `pnpm install`마다 0바이트 hardlink가 복사됨. `pnpm store prune` + `pnpm install --force`로도 해결 안 됨 — prune은 고아 파일만 제거하고 손상된 콘텐츠 파일은 건드리지 않음.

**진단**:
```bash
# node_modules 내 빈 package.json 확인 (0이어야 정상)
find node_modules -name 'package.json' -empty | wc -l

# store 손상 확인 (거의 0이어야 정상)
find ~/.local/share/pnpm/store/v10 -empty -type f | wc -l
```

**수정**:
```bash
rm -rf ~/.local/share/pnpm/store/v10
rm -rf shell/node_modules agent/node_modules shell/src-tauri/target/debug/agent/node_modules
cd shell && pnpm install
cd agent && pnpm install
cd shell/src-tauri/target/debug/agent && CI=true pnpm install --shamefully-hoist
```

**재발 방지**: 재발 시 `node-linker=hoisted`로 hardlink 대신 복사 방식 사용:
```bash
pnpm install --config.node-linker=hoisted
```
store 손상에 영향 안 받음. 단, hoisted 레이아웃은 phantom dependency 접근을 허용하는 부작용 있음.

**사례**: 2026-03-03 — store에 2300개 빈 파일 발견, shell + agent node_modules 전체 영향.

---

## Agent node_modules ws 패키지 누락

**증상**: agent-core 시작 시 `Cannot find package 'ws'` 에러. 경로: `shell/src-tauri/target/debug/agent/node_modules/ws`

**원인**: `target/debug/agent/`의 번들 에이전트가 pnpm 기본 격리 node_modules를 사용. `ws`는 간접 의존성이라 최상위로 호이스트되지 않음.

**수정**:
```bash
cd shell/src-tauri/target/debug/agent
CI=true pnpm install --shamefully-hoist
```

> `--shamefully-hoist`는 번들 에이전트에 필수 (ws, p-retry 등 간접 의존성 때문).

---

## cargo build 후 흰 화면

**증상**: 앱은 실행되지만 화면이 비어있음 (흰 화면).

**원인**: `npx tauri build --no-bundle` 대신 `cargo build --release`를 사용.

**수정**: 반드시 `npx tauri build --no-bundle` 사용 (WebKitGTK asset protocol은 Tauri 빌드 파이프라인을 거쳐야 함).
