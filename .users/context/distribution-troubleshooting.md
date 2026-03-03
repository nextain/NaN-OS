# Distribution Troubleshooting

Build and runtime issues encountered during Naia OS development.

## pnpm Store Corruption

**Symptom**: `Invalid package config ... Unexpected end of JSON input` or `ERR_INVALID_PACKAGE_CONFIG` when running `pnpm dev` / `cargo tauri dev`. Multiple `package.json` files in `node_modules` are 0 bytes.

**Cause**: pnpm content-addressable store (`~/.local/share/pnpm/store/v10`) gets corrupted. pnpm uses hardlinks from store to `node_modules`, so corrupted store files produce 0-byte hardlinks on every subsequent `pnpm install`. Even `pnpm store prune` + `pnpm install --force` does NOT fix it — prune only removes orphans, not corrupted content files.

**Diagnosis**:
```bash
# Check for empty package.json in node_modules (should be 0)
find node_modules -name 'package.json' -empty | wc -l

# Check store corruption (should be ~0)
find ~/.local/share/pnpm/store/v10 -empty -type f | wc -l
```

**Fix**:
```bash
rm -rf ~/.local/share/pnpm/store/v10
rm -rf shell/node_modules agent/node_modules shell/src-tauri/target/debug/agent/node_modules
cd shell && pnpm install
cd agent && pnpm install
cd shell/src-tauri/target/debug/agent && CI=true pnpm install --shamefully-hoist
```

**Prevention**: If corruption recurs, use `node-linker=hoisted` to avoid hardlinks:
```bash
pnpm install --config.node-linker=hoisted
```
This copies files instead of hardlinking — immune to store corruption. Caution: hoisted layout allows phantom dependency access.

**Incident**: 2026-03-03 — 2300 empty files in store, affected shell + agent node_modules.

---

## Agent node_modules Missing ws

**Symptom**: agent-core crashes with `Cannot find package 'ws'` at startup. Path: `shell/src-tauri/target/debug/agent/node_modules/ws`

**Cause**: Bundled agent at `target/debug/agent/` uses pnpm default isolated node_modules. `ws` is an indirect dependency not hoisted to top level.

**Fix**:
```bash
cd shell/src-tauri/target/debug/agent
CI=true pnpm install --shamefully-hoist
```

> `--shamefully-hoist` is REQUIRED for bundled agent (indirect deps like ws, p-retry).

---

## Vite White Screen After cargo build

**Symptom**: App launches but shows white/blank screen.

**Cause**: Used `cargo build --release` instead of `npx tauri build --no-bundle`.

**Fix**: ALWAYS use `npx tauri build --no-bundle` (WebKitGTK asset protocol requires Tauri's build pipeline).
