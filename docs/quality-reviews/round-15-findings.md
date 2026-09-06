# 15회차 교차 리뷰 지적 (2026-09-06, 스냅숏 249fa4df)

판정: **NOT CLEAN**, 지적 9건. 아래는 리뷰어 원문이다.

---

15회차 적대적 교차 리뷰를 시작합니다. 먼저 프로세스 현황, 지난 회차 닫힘 기록, 게이트 머리말의 위협 경계를 읽고 나서 실증할 구멍을 좁히겠습니다.지난 회차 닫힘 기록과 게이트 머리말을 읽어, 이미 닫힌 형태와 위협 경계를 가릅니다.닫힌 형태는 건너뛰고, 새로 들어온 공용 모듈과 게이트 머리말의 위협 경계를 대조합니다.공용 모듈 나머지와 게이트 호출부를 이어서 읽고, 머리말이 막겠다고 적은 사고와 실제 판정 범위를 대조합니다.`pub(crate)`·`export * as`·명령 `rename`처럼 언어 기능 오독 후보를 코드에서 좁히겠습니다.가설을 모듈에 직접 물은 뒤, 통과하는 형태만 게이트에 심겠습니다. 먼저 런타임과 심을 자리를 확인합니다.기준선은 전부 `EXIT=0`입니다. 가설을 하나씩 심고 게이트를 돌리겠습니다.기준 HEAD는 `4250fc6`입니다. 6~14회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 공용 모듈의 **범위 조건**과 게이트가 그 모듈을 **부르는 규약**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

기준선은 전부 `EXIT=0`이었습니다 (dead-ui 이름 175 / 복구 자리 1·0 / 무음 107 / 파괴 206·16·14 / 데이터 홈 이름표 14·공개 16 / 인벤토리 119).

---

# 판정: **NOT CLEAN** — 실증된 지적 9건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `bindings.mjs:168` `reexportBindings` | `export * as ns from "mod"` 는 재수출이 아니다. `export { x as y } from` 은 같다 |
| 2 | `rust-tokens.mjs:383-425` | `use tauri as t; #[t::command]` 와 `#[tauri_macros::command]` 는 명령이 아니다. `#[tauri::command]` 는 명령이다 |
| 3 | `rust-tokens.mjs:206-216, 528-531` | `fn r#ghost_wipe_everything` 은 목록 이름이 `r` 이다. `fn ghost_wipe_everything` 은 그 이름이다 |
| 4 | `check-data-home-boundary.mjs:346-376` | `use crate::data_home::*;` / `as dh` 는 허용 파일 밖 홈 조회가 아니다. `data_home::user_home_path()` 는 밖이다 |
| 5 | `check-silent-clicks.mjs:490-500` | `!el \|\| el.click()` 은 무음이 아니다. `el && el.click()` 은 무음이다 |
| 6 | `check-destructive-affordance.mjs:253-259` | `path = 'plugins/…'` 홑따옴표는 크레이트 뿌리가 아니다. 겹따옴표는 뿌리다 |
| 7 | `jsx-static.mjs:1175-1176` `alwaysTruthy` | `disabled={+true}` 는 영구 참이 아니다. `disabled={true}` 는 참이다 |
| 8 | `bindings.mjs:118` `importBindings` | `import h = require("react")` 는 요소가 아니다. `import { createElement }` 는 요소다 |
| 9 | `jsx-static.mjs:994` `stringCandidates` | `fetch(new Request("https://…"))` 는 바깥 주소가 아니다. `fetch("https://…")` 는 바깥 주소다 |

---

## 1. `scripts/lib/bindings.mjs:168` — `export * as ns` 는 재수출이 아니다

머리말은 `export * from "mod"` 와 `export { x as y } from "mod"` 를 원래 모듈까지 잇는다고 합니다. `reexportBindings` 는 `ts.isNamespaceExport` 이면 **continue** 합니다. `export * as GhostReact from "react"` 는 정적 재수출이고, 보증 밖 목록(동적 `import`, 고차 함수, 배열·객체)에 없습니다. 13회차가 닫은 것은 `import * as R from "./shim"` (`export * from "react"`) 이고, 이번은 **이름 있는 네임스페이스 재수출**입니다.

**(a) 복구.** `logger.ts` 끝에 `export * as GhostReact from "react"`. `UpdateBanner.tsx:30` 의 `if (installing)` 을 `return GhostReact.createElement("div", { role: "alert" }, "install failed")` 로.

→ 자리 1곳 / 다음 행동 없음 0, **EXIT=0**.

**대조.** `export { createElement as GhostReact } from "react"` 후 `return GhostReact("div", { role: "alert" }, "install failed")` → 자리 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:31`, **EXIT=1**.

**(b) 영구 꺼짐.** `logger.ts` 에 `export const GHOST_OFF = true`. `i18n.ts` 에 `export * as ghostFlags from "./logger"`. `SettingsTab.tsx` 연결 탭 뒤에 `disabled={ghostFlags.GHOST_OFF}` 버튼. 스펙 `onboarding-fresh.spec.ts` 가 `getByTestId("ghost-wake-panel")`.

→ 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**.

**대조.** `export { GHOST_OFF } from "./logger"` 후 `disabled={GHOST_OFF}` → `onboarding-fresh.spec.ts:369 — ghost-wake-panel`, **EXIT=1**.

모듈에 직접 물으면 `import * as flags from "./inner"` 의 `flags.GHOST_OFF` 는 참이고(14회차), `export * as flags from "./inner"` 의 `flags.GHOST_OFF` 는 거짓입니다. `reexportBindings` 가 그 선언을 `{ named: Map(0), stars: [] }` 로 버립니다.

**(c) 파괴 호출부.** `logger.ts` 에 `export * as ghostCore from "@tauri-apps/api/core"`. `capture.rs` 에 `#[tauri::command] fn ghost_wipe_everything`(본문 `remove_dir_all`). `db.ts` 에서 확인 없이 `ghostCore.invoke("ghost_wipe_everything")`.

→ 명령 **207** / 후보 17 / 호출 **14**(기준선), **EXIT=0**. 모듈에 물으면 `resolveCallee` 는 `null` 입니다.

**대조.** `return invoke("ghost_wipe_everything", { root })` → 호출 15, `db.ts:30 — ghost_wipe_everything`, **EXIT=1**.

```
# (a) export * as GhostReact from "react"; GhostReact.createElement("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0

# 대조 export { createElement as GhostReact } from "react"
# 자리 2곳 / 다음 행동 없음 1 — UpdateBanner.tsx:31 — EXIT=1
```

한 겹의 재수출 **형태**만 바꾸면 알림·꺼짐·파괴가 같이 열립니다. 판정의 단위가 부르는 값이 아니라 `export *` 와 `export { … }` 두 문법입니다.

**상태 (2026-09-06):** 닫혔다. `reexportBindings` 가 `export * as ns from "mod"`
를 버리지 않고 `namespaces` 로 돌려준다. 그 이름은 **그 모듈 전체**이므로,
바인딩 쪽에서는 `{ module, imported: "*" }` 로, 값 자리 쪽
(`exportedValueSite`)에서는 그 파일의 네임스페이스로 이어 푼다. 그래서
`GhostReact.createElement`·`ghostFlags.GHOST_OFF`·`ghostCore.invoke` 가 모두
`import * as …` 로 적은 것과 같은 답을 받는다.

판정의 단위가 `export *` 와 `export { … }` 라는 **두 문법**이었던 것이 이번
결함의 뿌리다. 이제 셋 다 "그 이름이 무엇을 가리키는가" 하나로 읽힌다.

```
# (a) logger.ts: export * as GhostReact from "react";
#     UpdateBanner: return GhostReact.createElement("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1

# (b) i18n.ts: export * as ghostFlags from "./logger";  disabled={ghostFlags.GHOST_OFF}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# (c) logger.ts: export * as ghostCore from "@tauri-apps/api/core";
#     db.ts: return ghostCore.invoke("memory_delete_fact", { factId });
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 15곳 · 되돌릴 수 없는 동작 1곳 — EXIT=1

# 되돌린 뒤 세 게이트 EXIT=0 (자리 1곳·0 / 이름 175개 / 호출 14곳), git diff 출력 없음
```

---

## 2. `scripts/lib/rust-tokens.mjs:383-425` — 명령 경로는 글자 `tauri` `::` `command` 다

14회차는 `use tauri::command; #[command]` 를 닫으며 **잎** 별명(`as cmd`)과 glob 을 풀었습니다. `isTauriCommandPath` 는 식별자 글자 `"tauri"` 를 요구하고, `isTauriCommandUse` 는 경로가 정확히 `["tauri", "command"]` 일 때만 한 마디 이름에 넣습니다. 크레이트 별명과 실제 proc-macro 크레이트는 같은 속성인데 목록에 없습니다. 목록에 없으면 프런트 `invoke("…")` 는 `commands.includes` 에서 건너뜁니다.

`capture.rs` 의 import 옆에 `use tauri as t;`, 파일 끝에 파괴 본문, `db.ts` 에서 확인 없이 `invoke("ghost_wipe_everything")`.

**(a)** `#[t::command] fn ghost_wipe_everything` → 명령 **206**(기준선, 207이 아님) / 후보 16 / 호출 14, **EXIT=0**.

**(b)** `#[tauri_macros::command] fn ghost_wipe_everything` → 같은 206·16·14, **EXIT=0**.

**대조.** `#[tauri::command]` → 명령 207 / 후보 17 / 호출 15, `db.ts:29 — ghost_wipe_everything`, **EXIT=1**.

모듈에 직접 물으면 `(a)(b)` 는 `[]`, 대조는 `["ghost_wipe_everything"]` 입니다. 매크로가 **생성**하는 속성은 보증 밖이고, 이것은 소스에 있는 `use` 별명과 같은 크레이트의 다른 경로입니다. STT 플러그인이 이미 `use tauri::command; #[command]` 를 씁니다.

```
# (a) use tauri as t; #[t::command] fn ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 206 · 후보 16 · 호출 14 — EXIT=0

# (b) #[tauri_macros::command] — 같은 출력 — EXIT=0

# 대조 #[tauri::command]
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `scripts/lib/rust-tokens.mjs` 가 속성에 적힌 경로를
**정규화한 뒤** 정본과 대조한다. 정본은 둘이다 — `tauri::command` 와
`tauri_macros::command`(앞이 뒤의 재수출이라 같은 매크로다).

정규화는 이 파일의 `use` 가 만든 표 하나로 한다(`useResolution`). 크레이트 별명
(`use tauri as t`)도 잎 별명(`use tauri::command as cmd`)도 같은 표에 들어간다 — 둘 다
"이 지역 이름은 어느 경로인가" 하나의 물음이기 때문이다. glob 은 이름을 정하지 않으므로
접두만 모아 두고, 명시 이름이 없을 때만 후보로 붙인다(Rust 의 이름 결정과 같다).
그래서 `#[t::command]`·`#[tauri_macros::command]`·`#[::tauri::command]`·
`use tauri::{self as t}` 뒤의 `#[t::command]`·`#[cfg_attr(all(), t::command)]` 가 모두
명령이고, 반대로 `use clap as tauri;` 뒤의 `#[tauri::command]` 는 **아니다** — 정규화는
양쪽으로 작동한다.

**보증 밖으로 머리말에 적었다.** 현재 크레이트 안의 재수출 사슬이다 — 다른 파일에
`pub use tauri::command as mycmd;` 를 두고 이 파일에서 `use crate::macros::mycmd;` 로
받아 `#[mycmd]` 로 적으면, 이 파일의 `use` 는 `crate::macros::mycmd` 까지만 말해 준다.
그 이름이 결국 `tauri::command` 라는 사실은 다른 파일에 있고, 이 모듈은 파일 하나만
읽는다. 크레이트 **밖** 경로와 그 별명은 경계 안이다.

```
# (a) use tauri as t; #[t::command] fn ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# (b) #[tauri_macros::command] — 같은 출력 — EXIT=1
# 대조 #[tauri::command] — 같은 출력 — EXIT=1

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

계약 테스트 `src/test/rust-tokens.contract.test.ts` 에 두 항목을 더했다: 크레이트 별명·
매크로 크레이트·앞머리 `::`·`self as t`·중첩 `cfg_attr`, 그리고 반증으로
`use clap as tauri` 와 `#[clap::command]`.

---

## 3. `scripts/lib/rust-tokens.mjs:206-216, 528-531` — 생 식별자 `r#이름` 은 이름 `r` 이다

토크나이저는 `r#ghost_wipe_everything` 을 식별자 `r`, 구두점 `#`, 식별자 `ghost_wipe_everything` 으로 가릅니다. `tauriCommandBodies` 는 `fn` 다음 **한** 식별자를 명령 이름으로 적습니다. Rust 에서 `r#foo` 의 이름은 `foo` 이고, 프런트 `invoke("ghost_wipe_everything")` 도 그 이름을 씁니다.

같은 `capture.rs` 끝·같은 `db.ts` 호출.

**(a)** `#[tauri::command] fn r#ghost_wipe_everything` → 명령 **207**(이름은 `r`) / 후보 17 / 호출 **14**, **EXIT=0**.

**대조.** `fn ghost_wipe_everything` → 호출 15, `db.ts:29`, **EXIT=1**.

지적 2와 달리 속성은 이미 `tauri::command` 입니다. 빠진 것은 언어의 생 식별자입니다. 계약 테스트는 `r#` 을 고정하지 않습니다.

```
# (a) #[tauri::command] fn r#ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 14 — EXIT=0

# 대조 fn ghost_wipe_everything
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. 토크나이저가 `r#이름` 을 `ident` 토큰 **하나**로 읽고
`text` 를 `#` 뒤로 둔다 — Rust 에서 `r#foo` 의 이름은 `foo` 이고, 프런트가
`invoke("foo")` 로 부르는 이름도 그것이다. 그 토큰에는 `raw: true` 를 함께 단다.

생 **문자열**은 그보다 먼저 갈려 `string` 토큰이 되므로 둘이 섞이지 않는다. 이 판정은
명령 이름뿐 아니라 공개 항목 세기·이름표 읽기까지 같은 토크나이저를 쓰는 모든 자리에
함께 적용된다.

```
# (a) #[tauri::command] fn r#ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

계약 테스트에 두 항목을 더했다: `fn r#ghost_wipe_everything` 의 목록 이름이
`ghost_wipe_everything` 이라는 것과, 여러 겹 우물정 생 문자열과 `r#type`·`r#match`
식별자를 가른다는 것.

---

## 4. `scripts/check-data-home-boundary.mjs:346-376` — 밖에서 짚는 것은 `data_home` `::` 글자다

11회차 이후 깔때기의 `pub` 은 `PUBLIC_API` 와 대조하고, 항목마다 **쓸 수 있는 파일**을 적습니다. `user_home_path` 는 `workspace.rs`·`herdr/location.rs`·`lib.rs` 만입니다. `dataHomeReferences` 는 식별자 `data_home` 뒤에 `::` 가 오는 자리만 보고, 중괄호 묶음(`use crate::data_home::{…}`)은 풉니다. glob 과 모듈 별명은 `::` 뒤에 `*` 이거나 `as` 라서 기록이 없습니다. 그 다음 `user_home_path()` 는 금지 식별자(`home_dir` / `naia_data_home*`)도 아닙니다.

`capture.rs:18` 의 import 바로 아래. 그 파일은 허용 목록에 없습니다.

**(a)**

```rust
use crate::data_home::*;
#[allow(dead_code)]
fn ghost_cache() -> PathBuf {
    user_home_path().unwrap_or_default().join("ghost-cache")
}
```

→ 이름표 14개, 공개 항목 16, **EXIT=0**.

**(b)** `use crate::data_home as dh;` 후 `dh::user_home_path()` → 같은 출력, **EXIT=0**.

**대조.** `crate::data_home::user_home_path().unwrap_or_default().join("ghost-cache")` → `capture.rs:22 — data_home::user_home_path`, **EXIT=1**.

머리말이 막겠다는 “아무 파일이나 홈을 손에 쥐게 된다”가, 금지 글자를 하나도 쓰지 않고 다시 열립니다. 파일 단위 목록 **안**에서 홈을 한 번 더 쓰는 것(재고 조사로 명시한 한계)이 아닙니다.

```
# (a) capture.rs 에 use crate::data_home::*; user_home_path()
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 이름표 14 · 공개 항목 16 — EXIT=0

# (b) use crate::data_home as dh; dh::user_home_path() — EXIT=0

# 대조 crate::data_home::user_home_path()
# ❌ 허용 목록이 정한 파일 밖에서 짚었다(1) — capture.rs:22 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `dataHomeReferences` 가 글자 `data_home::` 를 찾는 대신
**이 파일의 `use` 가 만든 지역 이름**으로 본다. 그 풀이의 정본은 `rust-tokens.mjs` 의
`useDeclarations` 하나다 — 명령 속성 판정(지적 2)과 공개 항목 세기가 쓰는 것과 같다.

  - 모듈 이름(`data_home` 자신과 `as dh` 별명) 뒤의 `::X` 는 항목 X 다.
  - glob 이면 깔때기의 공개 이름 전부가 이 파일의 지역 이름이므로, 그 이름을 한 마디로
    적은 자리가 곧 항목 참조다.
  - 잎을 이름으로 들여온 것은 그 `use` 줄에서 이미 `data_home::X` 로 잡히므로 두 번
    세지 않는다.

```
# (a) capture.rs 에 use crate::data_home::*; user_home_path()
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# ❌ 허용 목록이 정한 파일 밖에서 짚었다(1)
#    packages/shell/src-tauri/src/capture.rs:241 — data_home::user_home_path — EXIT=1

# (b) use crate::data_home as dh; dh::user_home_path() — 같은 출력 — EXIT=1

# 되돌린 뒤 — 이름표 14 · 변형 14 · 문서 14행 · 공개 항목 16 — EXIT=0, git diff 출력 없음
```

**함께 닫은 것 — 재수출.** 15회차 리뷰가 번호 없이 적은 자리다. 허용 목록은 그 파일이
홈 조회를 **쓰는** 것을 허락할 뿐인데, 허용된 파일 안에
`pub use crate::data_home::user_home_path;` 한 줄을 두면 그 이름이 크레이트 전체에 다시
열리고, 그 뒤로는 목록에 없는 파일이 `crate::user_home_path()` 로 원 함수를 쓴다 — 파일
단위 목록이 통째로 우회된다. 그래서 `useDeclarations` 가 `pub` 가시성(`pub use`,
`pub(crate) use`, `pub(in …) use`)을 함께 돌려주고, 깔때기 **밖 어느 파일이든** 경로에
`data_home` 이 든 재수출을 하면 그 자체가 위반이다. 머리말의 "파일 단위 재고 조사"
문장을 이 규칙으로 갱신했다.

```
# 허용 파일(lib.rs)에 pub use crate::data_home::user_home_path;
#   + capture.rs 에서 crate::user_home_path() 호출
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# ❌ 깔때기 항목을 밖에서 다시 내줬다(1)
#    packages/shell/src-tauri/src/lib.rs:9 — pub use crate::data_home::user_home_path — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

---

## 5. `scripts/check-silent-clicks.mjs:490-500` — 있음 가드는 `&&` 와 삼항이다

13회차는 `E ? E.click() : undefined` 를 `E && E.click()` 과 같게 읽었습니다. 가드 목록은 `if (E)`, `if (!E) return`, `E &&`, `E?.click()`, 삼항입니다. `!E || E.click()` 은 De Morgan 으로 같은 무음입니다 — 없으면 왼쪽에서 끝나고, 있으면 누릅니다.

`100-herdr-first-frame.spec.ts` 마지막 단언 뒤. 기준선 107.

**(a)** `const ghostEl = document.querySelector(".ghost"); !ghostEl || ghostEl.click();` → 107, **EXIT=0**.

**대조.** `ghostEl && ghostEl.click()` → 108 > 107, `100-herdr-first-frame.spec.ts` 가 파일별 집계에 나타남, **EXIT=1**.

```
# (a) !ghostEl || ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0

# 대조 ghostEl && ghostEl.click();
# 늘었다(108 > 107) — 100-herdr-first-frame.spec.ts 1 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 있음 가드를 연산자가 아니라 **오른쪽이 언제
도는가**로 읽는다. 왼쪽이 있음 검사면 `&&` 의 오른쪽이, 없음 검사면 `||` 의
오른쪽이 "있을 때만 도는" 갈래다 — 드모르간으로 같은 문장이다. 머리말의 가드
목록도 형태 나열에서 그 한 문장으로 고쳤다.

```
# (a) !ghostEl || ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1

# (b) ghostEl == null || ghostEl.click();   — 108 — EXIT=1
# 반증 ghostEl || other.click();  (받는 쪽이 다른 식) — 107 — EXIT=0
# 대조 ghostEl && ghostEl.click(); — 108 — EXIT=1

# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```

---

## 6. `scripts/check-destructive-affordance.mjs:253-259` — 크레이트 자리는 겹따옴표 `path = "…"` 다

14회차는 명령 목록을 `Cargo.toml` 의 `path` 의존과 workspace members 로 플러그인까지 훑는다고 적었습니다. `localCrateReferences` 는 `\bpath\s*=\s*"([^"]+)"` 와 members 배열의 겹따옴표만 읽습니다. TOML 은 홑따옴표를 같은 문자열로 봅니다. 홑따옴표면 플러그인 `src` 가 뿌리에서 빠지고, 목록에 없으면 프런트 `invoke("…")` 는 확인 검사에서 건너뜁니다.

`packages/shell/src-tauri/Cargo.toml:57` 의 `path = "plugins/tauri-plugin-stt"` 를 홑따옴표로 바꾸고, `plugins/tauri-plugin-stt/src/commands.rs` 끝에 `#[tauri::command] fn ghost_wipe_everything`(본문 `remove_dir_all`), `db.ts` 에서 확인 없이 `invoke("ghost_wipe_everything")`.

**(a)** 홑따옴표 → 명령 **198**(플러그인 여덟이 빠짐) / 후보 15 / 호출 14, **EXIT=0**.

**대조.** 같은 선언을 겹따옴표 `path = "plugins/tauri-plugin-stt"` 로 → 명령 207 / 후보 17 / 호출 15, `db.ts:29`, **EXIT=1**. 차이는 속성 형태가 아니라 **따옴표**입니다.

```
# (a) path = 'plugins/tauri-plugin-stt' + 플러그인에 #[tauri::command] fn ghost_wipe_everything
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 198 · 후보 15 · 호출 14 — EXIT=0

# 대조 path = "plugins/tauri-plugin-stt"
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. 이 트리에 TOML 패키지가 없어(`node_modules` 확인) 최소
파서 `scripts/lib/toml-min.mjs` 를 두고, `localCrateReferences` 가 정규식 대신 그것이
돌려준 값 나무를 훑는다. 문자열 넷(겹따옴표·홑따옴표와 그 여러 줄 형태)이 모두 값
하나이고, 주석은 값이 아니며, 배열·인라인 테이블·테이블 헤더·점 찍은 키는 구조다.
그래서 따옴표 모양은 판정에 들어오지 않고, 주석이나 여러 줄 문자열 **안**의
`path = "…"` 는 키가 아니라 값이라 저절로 빠진다.

훑기는 어느 테이블인지 가리지 않는다 — `path` 값과 `members` 배열이면 전부 크레이트
자리다. `[dependencies]`·`[dev-dependencies]`·`[target."cfg(unix)".dependencies]`·
`[patch.*]` 를 열거하면 다음 테이블에서 같은 일이 나기 때문이다. 넓어지는 쪽으로만
틀린다 — 소스가 아닌 자리를 더해도 거기에 명령 속성이 없으면 목록은 그대로다.

```
# (a) path = 'plugins/tauri-plugin-stt' + 플러그인에 #[tauri::command] fn ghost_wipe_everything
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1
#   (홑따옴표에도 플러그인 src 가 뿌리에 그대로 있다 — 옛 정규식은 여기서 198 이었다)

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

계약 테스트 `src/test/toml-min.contract.test.ts` 를 새로 두었다(7항목): 홑따옴표와
겹따옴표가 같은 자리라는 것, 인라인 테이블·자기 테이블·`[target."…".dependencies]` 가
같다는 것, `members` 의 따옴표 섞임·주석·꼬리 쉼표, 주석 안의 가짜 `path`, 여러 줄
문자열 안의 가짜 `path`(그 글자가 값으로는 남는다는 것까지), 따옴표 키와 유니코드
이스케이프, 그리고 이 저장소의 실제 `Cargo.toml` 에서 플러그인 자리를 읽는다는 것.

14회차가 닫은 “디렉터리를 옮기는 것만으로 초록”이, Cargo 가 아는 같은 자리를 따옴표만 바꿔 적으면 다시 열립니다.

---

## 7. `scripts/lib/jsx-static.mjs:1175-1176` — 단항은 `!` 만 접는다

`alwaysTruthy` 는 `!false` 를 참으로 접고, `1` 도 참입니다. `+true` 는 JavaScript 에서 `1` 이고, React 에서 `disabled={+true}` 는 누를 수 없는 버튼입니다. 단항 `+` 는 `PrefixUnaryExpression` 인데 `ExclamationToken` 만 다룹니다. 머리말이 모른다고 적은 것은 상태·인자·**함수 결과**입니다. `+true` 는 리터럴 위의 단항입니다.

`SettingsTab.tsx` 연결 탭 뒤에 버튼, 스펙 `onboarding-fresh.spec.ts` 가 `getByTestId("ghost-wake-panel")`.

**(a)** `disabled={+true}` → 이름 176개, 꺼 둔 조작 6곳, **EXIT=0**. 모듈에 물으면 `alwaysTruthy(+true) === false`, `alwaysTruthy(1) === true`.

**대조.** `disabled={true}` → `onboarding-fresh.spec.ts:369 — ghost-wake-panel`, **EXIT=1**.

```
# (a) disabled={+true}  (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 이름 176개 / 꺼 둔 조작 6곳 — EXIT=0

# 대조 disabled={true}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
```

난독화 목록의 `void <식>` 변형이 아닙니다. `void` 는 값을 `undefined` 로 갈아치우고, `+` 는 숫자로 바꿉니다. `+true === 1` 이고 둘 다 꺼진 버튼입니다.

**상태 (2026-09-06):** 닫혔다. `+`·`-`·`~` 는 값을 숫자로 바꿀 뿐이라, 안쪽이
리터럴이면 결과도 리터럴이다. `staticNumber` 가 그 사슬을 접는다 — `const` 를
지나서도 접고, 안쪽을 모르면 참으로도 거짓으로도 접지 않는다. `typeof x` 는
안쪽이 무엇이든 비어 있지 않은 문자열이라 언제나 참이다. `alwaysFalsy` 도
대칭이고, 널 판정에서는 이 단항들의 결과가 **결코 널이 아니다**.

```
# (a) disabled={+true}   (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# (b) disabled={typeof naiaVrms} — EXIT=1
# 반증 disabled={-naiaVrms.length} (안쪽을 모른다) — 이름 176개 — EXIT=0
# 대조 disabled={true} — EXIT=1

# 모듈에 직접 물으면 +true 참 · -0 거짓 · ~0 참 · ~-1 거짓 · +"a" 거짓 · -x 거짓(모른다)
# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음
```

---

## 8. `scripts/lib/bindings.mjs:118` — 정적 import 는 `ImportDeclaration` 뿐이다

머리말은 정적 `import` 선언만 따라가고, 보증 밖은 `const { invoke } = await import("…")` 같은 **동적** `import()`/`require()` 의 결과라고 적습니다. `import h = require("react")` 는 TypeScript 의 **정적** `ImportEqualsDeclaration` 입니다. `importBindings` 는 `ts.isImportDeclaration` 만 보고, `declaredNames` 도 이 선언을 지역 이름으로 넣지 않아 `h` 가 전역으로 읽힙니다. 자유 식별자 잠금은 `createElement` 하나뿐이라 `h.createElement` 는 요소가 아닙니다.

`UpdateBanner.tsx:30` 의 `if (installing)`.

**(a)** `import h = require("react"); return h.createElement("div", { role: "alert" }, "install failed")` → 자리 1곳, **EXIT=0**. 모듈에 물으면 `resolveCallee` 는 `null`, `isCreateElementCall === false`.

**대조.** `import { createElement } from "react"; return createElement("div", { role: "alert" }, "install failed")` → 자리 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:31`, **EXIT=1**.

```
# (a) import h = require("react"); return h.createElement("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0

# 대조 import { createElement } from "react"
# 자리 2곳 / 다음 행동 없음 1 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 모듈 바인딩을 만드는 선언을 형태로 열거하지 않고
TypeScript 의 두 술어로 명시했다 — `isModuleBindingDeclaration(node)` 는
`ts.isImportDeclaration || ts.isImportEqualsDeclaration` 이다. `importBindings`
와 `declaredNames` 가 그것을 쓴다.

`import h = require("react")` 는 그 모듈 전체이므로 네임스페이스 import 와 같은
답(`imported: "*"`)을 준다. `import x = ns.member` 는 이름을 이름에 붙인 것이라
`resolveEntityName` 이 왼쪽 끝을 풀고 마디를 멤버로 적용한다. 그리고 그 이름이
`declaredNames` 에 들어가므로 더는 자유 식별자(전역)로 읽히지 않는다.

동적 `require()` **호출**은 그대로 보증 밖이다. 정적 선언과 실행할 때 부르는
호출은 다르고, 계약에 그 반증을 함께 넣었다.

```
# (a) import h = require("react"); return h.createElement("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1

# 대조 import { createElement } from "react" — EXIT=1
# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

---

## 9. `scripts/lib/jsx-static.mjs:994` — `fetch` 인자의 정적 후보는 문자열·식별자·멤버다

11회차는 `const url = "https://…"; fetch(url)` 을 닫았습니다. `stringCandidates` 는 문자열·템플릿·조건·`+` 연결·식별자·속성 접근을 풀고, 그 밖의 식은 `{ values: ∅, complete: false }` 입니다. `new Request("https://ghost-llm.example:9999/x")` 는 Fetch 가 받는 인자이고, 주소는 생성자 **리터럴**입니다. `outboundAddresses` 는 후보가 비고 완전하지 않으면 못 푼 인자로만 세고, 바깥 호스트로는 세지 않습니다. `--check` 는 분류가 틀린 목록과도 글자만 같으면 초록입니다. 이 지적은 그 문장이 아니라, 분류를 진다고 적은 `outboundAddresses` 입니다.

결정론 칸 스펙 `packages/shell/e2e-tauri/specs/100-herdr-first-frame.spec.ts` 마지막 단언 뒤.

**(a)** `await fetch(new Request("https://ghost-llm.example:9999/ghost-complete"))` → `--check` **EXIT=0** (119개, 지금 스펙과 일치). 모듈에 물으면 `stringCandidates` 는 값 0·`complete: false`.

**대조.** `await fetch("https://ghost-llm.example:9999/ghost-complete")` → `--check` **EXIT=1** (지금 스펙과 어긋난다).

머리말이 모른다고 적은 것은 함수 매개변수, 실행할 때 조립되는 템플릿, 배열·객체·Map 을 거쳐 흘러간 주소입니다. `new Request("리터럴")` 은 생성자 인자가 정적 문자열입니다.

```
# (a) await fetch(new Request("https://ghost-llm.example:9999/ghost-complete"));
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ✓ 지금 스펙과 일치한다 (119개) — EXIT=0

# 대조 await fetch("https://ghost-llm.example:9999/ghost-complete")
# ❌ 지금 스펙과 어긋난다 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 주소를 찾는 자리가 묻던 질문이 틀렸다.
`stringCandidates` 는 "이 식의 **값**이 무엇인가" 를 묻는데, `new Request("…")`
의 값은 Request 객체이지 문자열이 아니다. 필요한 것은 "이 식 **안 어딘가에**
적혀 있는 문자열이 무엇인가" 다.

그래서 `staticStringsIn` 을 새로 두고 `outboundAddresses` 가 그것을 쓴다. 형태를
열거하지 않고 **값이 담겨 흘러가는 자리**를 따라간다 — 호출·`new` 의 인자, 객체
리터럴의 속성값, 배열 요소, 그리고 그 사슬에 놓인 `const`. 같은 노드에 두 번
가지 않으므로 순환은 끊기고 겹은 세지 않는다.

`stringCandidates` 는 그대로 두었다. 판정을 이 넓은 수집으로 바꾸면 표지·영구
꺼짐 판정이 과탐지가 된다 — 두 질문이 다르다는 것을 계약에 반증으로 넣었다.

```
# (a) await fetch(new Request("https://ghost-llm.example:9999/ghost-complete"));
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ❌ 지금 스펙과 어긋난다 — EXIT=1

# (b) new URL("https://…")                        — EXIT=1
# (c) { url: "https://…" }                        — EXIT=1
# 대조 await fetch("https://…")                    — EXIT=1

# 되돌린 뒤 ✓ 지금 스펙과 일치한다 (119개) — EXIT=0, git diff 출력 없음
```

---

머리말이 보증하지 않는다고 적어 둔 자리(동적 `import`/`require()` **호출**의 결과, `eval`/`Reflect.apply`/두 겹의 `Function.prototype`, 문자를 조립해 `.naia` 를 만드는 위조, 데이터 홈 허용 목록이 파일 단위라는 점, `--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장 자체)는 지적 번호에서 뺐습니다. 8번은 동적 `require()` 호출이 아니라 정적 `ImportEqualsDeclaration` 입니다. 9번은 `--check` 가 아니라 분류를 진다고 적은 자국 규칙입니다.

같은 부류로만 적는 것: `void` 열 겹·쉼표식 안의 쉼표식은 난독화 목록에 이미 있습니다. 감싸기 함수 일곱 겹(`round < 6`)은 14회차가 열림(무해)으로 남겨 두었습니다.

경계가 부당하다고 보는 자리(번호 없음): `role="alertdialog"` 막다른 오류 화면은 머리말이 `role="alert"` 로 정한 범위 밖입니다.

> **오너 판단 (2026-09-06) — 넓혔다.** WAI-ARIA 에서 `alertdialog` 는 `alert` 의
> 하위 역할이다. 같은 알림이고 **사용자의 응답을 요구한다**는 것만 다르며,
> 응답을 요구하면서 빠져나갈 길을 안 주는 화면이 더 나쁘다. 그래서
> `check-recovery-affordance.mjs` 의 알림 역할을 `ALERT_ROLES = { alert,
> alertdialog }` 한 목록으로 두고, 역할 판정이 글자 하나를 직접 비교하지 않게
> 고쳤다. 머리말에 그 이유를 적었고
> `src/test/recovery-alert-roles.contract.test.ts` 가 목록이 다시 좁아지는 것을
> 막는다.
>
> 기준선은 움직이지 않았다 — **자리 1곳 / 다음 행동이 없는 곳 0** 그대로다.
> 셸 소스에 `alertdialog` 를 쓰는 자리가 아직 하나도 없어서, 넓힌 판정이 오늘
> 새로 잡는 화면은 없다. 앞으로 생기는 것부터 잡힌다.
>
> ```
> # (a) return <div role="alertdialog">install failed</div>;
> node scripts/check-recovery-affordance.mjs; echo EXIT=$?
> # 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1
>
> # 반증 같은 role 에 재시도 버튼을 두면 — 자리 2곳 / 0 — EXIT=0
> # 대조 role="alert" — EXIT=1
> # 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
> ``` 허용된 파일(`lib.rs`)에서 `pub use data_home::user_home_path` 로 크레이트 전체에 다시 열면, 목록이 파일 단위라 받는 쪽 파일은 안 봅니다 — 그 한계는 머리말에 재고 조사로 명시돼 있습니다.

되돌린 뒤 여섯 게이트는 다시 `EXIT=0` 입니다. 최종 `git status --porcelain` 은 비어 있습니다.

**NOT CLEAN**
