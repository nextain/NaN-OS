# 14회차 교차 리뷰 지적 (2026-09-06, 스냅숏 467e6eda)

판정: **NOT CLEAN**, 지적 9건. 아래는 리뷰어 원문이다.

---

품질 게이트가 막겠다고 적은 사고를 그대로 다시 만들 수 있는지부터 확인하겠습니다. 프로세스 현황·이전 회차 닫힘 기록·게이트 머리말을 읽고, 그다음 공용 모듈과 호출 규약을 실증합니다.이전 회차 닫힘 기록과 게이트 머리말·공용 모듈을 함께 읽겠습니다.공용 모듈 머리말과 구현을 읽고, 게이트가 그 모듈을 어떻게 부르는지 대조하겠습니다.나머지 구현과 게이트 호출부를 이어서 읽겠습니다.공용 모듈의 판정 함수와 게이트 호출 규약, 계약 테스트가 고정한 형태를 대조하겠습니다.모듈에 직접 가설을 물은 뒤, 통과하는 형태만 게이트에 심겠습니다. 먼저 심을 자리와 런타임부터 확인합니다.공용 모듈에 가설을 직접 묻기 위해 TypeScript를 연결한 뒤 프로브 스크립트를 돌리겠습니다.가설이 모듈에서 열렸습니다. 게이트 기준선을 찍고, `pub use`·래퍼 깊이·`void` 겹도 이어서 확인하겠습니다.기준선은 전부 `EXIT=0`입니다. 가설을 하나씩 심고 게이트를 돌리겠습니다.`void 0 ?? true`는 통과했습니다. 대조로 `undefined ?? true`와 `true`를 넣겠습니다.대조는 `EXIT=1`입니다. 같은 스펙으로 네임스페이스 import 상수를 이어서 심겠습니다.플러그인 디렉터리가 명령 추출 범위에 빠지는지도 확인하겠습니다.기준 HEAD는 `3c88ab5`입니다. 6~13회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 공용 모듈의 **범위 조건**과 게이트가 그 모듈을 **부르는 규약**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

---

# 판정: **NOT CLEAN** — 실증된 지적 9건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `jsx-static.mjs:1074-1082` `alwaysTruthy` | `void 0 ?? true` 는 영구 참이 아니다. `undefined ?? true` 는 참이다 |
| 2 | `jsx-static.mjs:471-497` `importedBinding` | 네임스페이스·default 재수출 상수는 영구 참이 아니다. named import 는 참이다 |
| 3 | `jsx-static.mjs:1079-1082` `alwaysTruthy` | `` `${true}` `` 와 `{}` 는 영구 참이 아니다. `"true"` 는 참이다 |
| 4 | `jsx-static.mjs:246-249` `elementCallShape` | 자유 식별자 `createElement.call` 은 요소가 아니다. `createElement(...)` 는 요소다 |
| 5 | `rust-tokens.mjs:287-298` | `use tauri::command; #[command]` 는 명령이 아니다. `#[tauri::command]` 는 명령이다 |
| 6 | `check-destructive-affordance.mjs:452-483` | `invoke["call"]` 은 호출부가 아니다. `invoke.call` 은 호출부다 |
| 7 | `check-silent-clicks.mjs:173` | `void` 아홉 겹은 무음이 아니다. 여덟 겹은 무음이다 |
| 8 | `check-data-home-boundary.mjs:227-237` | `pub use` 는 공개 항목이 아니다. `pub fn` 은 공개 항목이다 |
| 9 | `check-destructive-affordance.mjs:218` | 플러그인 디렉터리의 `#[tauri::command]` 는 목록에 없다 |

기준선은 전부 `EXIT=0`이었습니다 (dead-ui 이름 175 / 복구 자리 1·0 / 무음 107 / 파괴 198·15·14 / 데이터 홈 이름표 14·공개 16).

---

## 1. `scripts/lib/jsx-static.mjs:1074-1082` — `void 0` 은 `undefined` 가 아니다

`unwrap.mjs:23-25` 는 `void x` 가 언제나 `undefined` 라고 적습니다. 13회차는 `undefined ?? true` 와 `null ?? true` 를 영구 참으로 접었습니다. `alwaysTruthy` 는 식별자 `undefined` 와 `NullKeyword` 만 널로 보고, `VoidExpression` 은 맨 아래 `return false` 입니다. `disabled={!undefined}` 는 누를 수 없는 버튼이고, `disabled={!void 0}` 도 같습니다.

`SettingsTab.tsx:3547` 연결 탭 뒤에 버튼을 두고, 스펙 `01-app-launch.spec.ts:51` 가 `[data-testid='ghost-wake-panel']` 을 기다림.

**(a)** `disabled={void 0 ?? true}` → 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**.

**대조.** `disabled={undefined ?? true}` → `01-app-launch.spec.ts:51 — ghost-wake-panel`, **EXIT=1**.

모듈에 직접 물으면 `alwaysTruthy(void 0 ?? true) === false`, `alwaysTruthy(!void 0) === false`, `alwaysTruthy(undefined ?? true) === true` 입니다.

```
# (a) SettingsTab.tsx 에 disabled={void 0 ?? true}, 스펙이 ghost-wake-panel 대기
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 0 — EXIT=0

# 대조 disabled={undefined ?? true}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts:51 — ghost-wake-panel
# EXIT=1
```

**상태 (2026-09-06):** 닫혔다. `void <아무 식>` 을 널 판정과 거짓 판정에서
`undefined` 와 같게 읽는다. 안쪽 식은 따라가지 않는다 — `void x` 는 x 를
계산하고 버리므로 값은 언제나 `undefined` 하나다. `unwrap.mjs` 가 `void` 를
껍데기로 벗기지 **않는** 것과 짝이 맞는다: 껍데기는 값을 통과시키지만 `void`
는 값을 갈아치우므로, 벗기는 대신 뜻을 아는 쪽이 맞다.

```
# (a) disabled={void 0 ?? true}   (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# 대조 disabled={undefined ?? true} — EXIT=1
# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음

# 모듈에 직접 물으면 void 0 ?? true → 참 · !void 0 → 참 · void fn() ?? true → 참
#                    void 0 자체 → 거짓
```

---

## 2. `scripts/lib/jsx-static.mjs:471-497` — 상수 따라가기는 `bindings.mjs` 가 아니다

13회차는 함수 바인딩의 `export default`·네임스페이스·재수출을 `bindings.mjs` 로 닫았습니다. 영구 꺼짐은 그 모듈을 쓰지 않고, 같은 파일 안에 `importedBinding` 을 따로 둡니다. 그 함수는 default·named import 만 보고, 대상 파일에서 **그 이름의 `const` 선언**만 찾습니다. 네임스페이스 import 는 바인딩이 없고, `export default { off: true }` 는 `const default` 가 아니며, `export { off } from "./inner"` 는 중간 파일에 값이 없습니다.

`logger.ts` 에 `export const GHOST_OFF = true` 와 `export default { off: true }`. 같은 버튼·같은 스펙.

**(a)** `import * as ghostFlags from "../lib/logger"` 후 `disabled={ghostFlags.GHOST_OFF}` → 이름 176개, **EXIT=0**.

**(b)** `import ghostFlags from "../lib/logger"` 후 `disabled={ghostFlags.off}` → 이름 176개, **EXIT=0**.

**대조.** `import { GHOST_OFF } from "../lib/logger"` 후 `disabled={GHOST_OFF}` → `01-app-launch.spec.ts:51 — ghost-wake-panel`, **EXIT=1**.

11회차가 닫은 것은 named import 의 `const` 객체입니다. 한 겹의 import **형태**만 바꾸면 다시 열립니다.

```
# (a) import * as ghostFlags from "../lib/logger"; disabled={ghostFlags.GHOST_OFF}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 이름 176개 / 꺼 둔 조작 6곳 — EXIT=0

# (b) export default { off: true }; import ghostFlags from "..."; disabled={ghostFlags.off}
# 같은 출력 — EXIT=0

# 대조 import { GHOST_OFF } from "../lib/logger"; disabled={GHOST_OFF}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. `jsx-static.mjs` 에서 import 선언을 읽는 코드를
없앴다. `bindings.mjs` 에 `importedValueSite`/`exportedValueSite` 를 두어
"이 이름의 값이 **어느 파일의 어느 이름**인가" 를 답하게 하고, `importedBinding`
은 그 답을 받기만 한다. named·default 는 물론 네임스페이스, `export default`,
`export { x } from "…"`, `export *` 가 같은 규칙으로 풀린다.

멤버 접근도 같이 고쳤다. `constAccessValue` 가 네임스페이스 import 의 멤버
(`flags.GHOST_OFF` → 그 파일이 내주는 `GHOST_OFF`)와 default 객체의 속성
(`flags.off` → `export default { off: true }` 의 그 속성)을 푼다.

계약 테스트에 **jsx-static 소스에 import 선언을 직접 읽는 코드가 없다**
(`isImportDeclaration`·`isNamedImports`·`isNamespaceImport`·`importClause`·
`moduleSpecifier` 가 하나도 없고 `bindings.mjs` 를 쓴다)를 고정했다.

```
# (a) import * as ghostFlags from "../lib/logger"; disabled={ghostFlags.GHOST_OFF}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# (b) export default { off: true }; import ghostFlags …; disabled={ghostFlags.off}
# 같은 출력 — EXIT=1
# 대조 import { GHOST_OFF } …; disabled={GHOST_OFF} — EXIT=1
# 중간 파일 재수출(export { HIDDEN } from "./inner") 도 같다 — 모듈 실측 참

# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음
```

---

## 3. `scripts/lib/jsx-static.mjs:1079-1082` — 영구 참은 `true`·문자열·숫자뿐이다

`stringCandidates` 는 템플릿의 모든 갈래를 접습니다(`:926-938`). `alwaysTruthy` 는 `TrueKeyword`·문자열·숫자만 접고 `TemplateExpression` 과 객체·배열 리터럴은 모릅니다. React 에서 `disabled={`${true}`}` 는 `"true"` 이고, `disabled={{}}` 는 빈 객체이며, 둘 다 누를 수 없는 버튼입니다.

같은 버튼·같은 스펙.

**(a)** `disabled={`${true}`}` → 이름 176개, **EXIT=0**.

**(b)** `disabled={{}}` → 이름 176개, **EXIT=0**.

**대조.** `disabled={"true"}` → `01-app-launch.spec.ts:51 — ghost-wake-panel`, **EXIT=1**. `disabled={true}` 도 같습니다.

머리말이 모른다고 적은 것은 상태·인자·**함수 결과**입니다. 템플릿의 `${true}` 와 `{}` 는 리터럴입니다. `Boolean(true)` 는 함수 결과라 지적 번호에서 뺐습니다.

```
# (a) disabled={`${true}`}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 이름 176개 — EXIT=0

# (b) disabled={{}}
# 같은 출력 — EXIT=0

# 대조 disabled={"true"}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 영구 참의 정의를 리터럴 전체로 넓혔다. 객체·배열·
함수식·클래스식·`new X()`·정규식·JSX 는 만들자마자 참인 값이다 — "비어 있음" 과
"거짓" 은 다르다.

템플릿은 길이 하나로 정해진다. 그래서 묻는 것은 "무슨 글자가 나오는가" 가
아니라 **"한 글자라도 나오는가"** 다. 고정 조각이 하나라도 비어 있지 않으면 참,
모두 비어 있으면 삽입을 본다. 삽입 값이 정적으로 글자를 만들면(`${true}` 는
`"true"`) 참, 모든 삽입이 정적으로 빈 문자열이면 거짓, 그 밖은 모른다.
`${false}`·`${0}`·`${null}` 이 **참**이라는 데 주의한다 — 글자로 바뀌면
`"false"`·`"0"`·`"null"` 이고 모두 비어 있지 않다. 삽입 값의 참·거짓으로 접으면
여기서 뒤집힌다. `alwaysFalsy` 도 같은 규칙으로 대칭이다.

```
# (a) disabled={`${true}`}   (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# (b) disabled={{}} — EXIT=1 · disabled={[]} — EXIT=1
# 반증 disabled={`${naiaVrms.length}`} (삽입 값을 모른다) — 이름 176개 — EXIT=0
# 대조 disabled={"true"} — EXIT=1

# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음
```

---

## 4. `scripts/lib/jsx-static.mjs:246-249` — 자유 `createElement` 의 `.call` 은 버린다

`resolveCallee` 는 자유 식별자 `createElement.call(null, "div", props)` 를 `{ global: "createElement", via: "call", argShift: 1 }` 로 풉니다. `elementCallShape` 는 `binding.module` 이 있을 때만 그 답을 쓰고, 없으면 식별자 글자 `"createElement"` 만 옛 판정으로 남깁니다. callee 가 `createElement.call` 이면 식별자가 아니라서 요소가 아닙니다. 같은 자유 식별자를 괄호로 부르면 알림입니다.

`UpdateBanner.tsx:30` 의 `if (installing)`. import 없음.

**(a)** `return createElement.call(null, "div", { role: "alert" }, "install failed")` → 표면 1곳(기준선), **EXIT=0**.

**대조.** `return createElement("div", { role: "alert" }, "install failed")` → 표면 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:31`, **EXIT=1**.

12회차가 닫은 것은 **import 된** `createElement.call` 입니다. 자유 식별자 폴백에 `argShift` 를 잇지 않은 자리입니다. 한 겹의 `.call` 은 `bindings.mjs` 머리말의 경계 **안**입니다.

```
# (a) return createElement.call(null, "div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0

# 대조 createElement("div", { role: "alert" }, "install failed")
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 자유 식별자 `createElement` 를 이름으로 잠근
결정은 그대로 두고, 그 잠금이 `.call`/`.apply` 에도 걸리게 했다.
`elementCallShape` 이 `binding.global === "createElement"` 를 옛 판정과 같은
자리로 받아, `argShift` 까지 그대로 잇는다. 잠금은 여전히 `createElement`
하나뿐이다 — 자유 `h(...)` 까지 요소로 보면 hyperscript 든 무엇이든 끌려
들어와 게이트가 과탐지로 곧 꺼진다.

```
# (a) import 없이 return createElement.call(null, "div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx — EXIT=1

# 대조 createElement("div", { role: "alert" }, "install failed") — EXIT=1
# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음

# 모듈에 직접 물으면 { factory: "classic", argShift: 1 } 이고 props = ["role"]
# 반증 자유 h.call(...) 은 요소가 아니다(요소 0개)
```

---

## 5. `scripts/lib/rust-tokens.mjs:287-298` — 명령 속성은 `tauri` `::` `command` 글자다

머리말은 속성 토큰 열 어디든 `tauri :: command` 연쇄가 있으면 명령이라고 합니다. `use tauri::command; #[command]` 는 같은 proc-macro 이고, 이 저장소의 STT 플러그인(`packages/shell/src-tauri/plugins/tauri-plugin-stt/src/commands.rs:8`)이 이미 그 형태로 명령을 엽니다. `isTauriCommandPath` 는 식별자 글자 `"tauri"` 를 요구하므로 `#[command]` 는 목록에 없습니다. 목록에 없으면 프런트 `invoke("…")` 는 `commands.includes` 에서 건너뜁니다.

`capture.rs:18` 의 import 에 `command` 를 더하고, 파일 끝(`:238`)에 파괴 본문을 둔 뒤, `db.ts:59` 에서 확인 없이 `invoke("ghost_wipe_everything")`.

**(a)** `use tauri::{command, …}; #[command] fn ghost_wipe_everything` → Rust 명령 **198개**(기준선, 199가 아님) / 파괴 후보 15 / 호출 14, **EXIT=0**.

**대조.** `#[tauri::command] fn ghost_wipe_everything` → 명령 199 / 후보 16 / 호출 15, `db.ts:59 — ghost_wipe_everything`, **EXIT=1**.

11회차 지적 3 과 같은 사고입니다. 판정의 단위가 바인딩이 아니라 적힌 경로입니다. 매크로가 **생성**하는 속성은 보증 밖이고, 이것은 소스에 있는 import 별명입니다.

```
# (a) #[command] fn ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 198 · 후보 15 · 호출 14 — EXIT=0

# 대조 #[tauri::command]
# 명령 199 · 후보 16 · 호출 15 — db.ts:59 — ghost_wipe_everything — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `scripts/lib/rust-tokens.mjs` 가 이제 파일의 `use` 선언을
토큰으로 읽어(`useDeclarations`) `tauri::command` proc-macro 가 **어떤 지역 이름으로**
들어왔는지 푼 뒤, 속성 토큰 열을 그 이름으로도 대조한다. `use tauri::command;` 면
`command`, `use tauri::command as cmd;` 면 `cmd`, `use tauri::{command as cmd, …}` 면 같은
`cmd`, `use tauri::*;` 면 `command` 다. `#[cfg_attr(all(), command)]` 처럼 중첩된 자리도
같다.

다른 크레이트의 같은 이름은 아니다. `use clap::command;` 는 경로가 `clap::command` 라
넣지 않고, `use tauri::*;` 와 `use clap::command;` 가 함께 있으면 명시 import 가 이기므로
(Rust 의 이름 결정과 같다) 역시 넣지 않는다. 속성 안에서 앞뒤에 `::` 가 붙은 마디
(`clap::command`, `command::inner`)도 한 마디 이름이 아니므로 아니다.

```
# (a) use tauri::{command, …}; #[command] fn ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 대조 #[tauri::command] — 같은 출력 — EXIT=1

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

**기준선이 바뀌었다.** 이 고침과 지적 9 의 고침이 함께 STT 플러그인의 명령 여덟 개
(`start_listening`·`stop_listening`·`is_available`·`get_supported_languages`·
`check_permission`·`request_permission`·`register_listener`·`remove_listener`)를 목록에
들였다. 그래서 명령 수는 198 → **206**, 파괴 후보는 15 → **16** 이다(늘어난 하나는 이름
때문에 후보가 된 `remove_listener` 이고, 프런트가 부르지 않아 판정은 그대로 초록이다).
프런트 호출 수는 14 로 그대로다.

계약 테스트 `src/test/rust-tokens.contract.test.ts` 에 네 항목을 더했다(14 → 18):
`use tauri::command;` 뒤의 `#[command]`, 별명·중괄호·glob·중첩 `cfg_attr`, 반증으로
`use clap::command` 와 glob 을 가리는 명시 import 와 `#[clap::command]`, 그리고
`useDeclarations` 가 잎을 지역 이름·경로로 읽는다는 것.

---

## 6. `scripts/check-destructive-affordance.mjs:452-483` — 호출부는 `resolveCallee` 가 아니다

`bindings.mjs` 는 리터럴 키 `f["call"]` 을 `f.call` 과 같게 읽고, 인벤토리 게이트는 `resolveCallee` 로 그 답을 씁니다. 파괴 게이트는 호출식의 **callee 식**에 `resolveBinding` 을 걸고, `.call` 보정은 `PropertyAccessExpression` 만 봅니다. `invoke["call"]` 은 ElementAccess 이라 로컬 보정도, 공용 모듈의 callee 판정도 타지 않습니다.

`capture.rs` 에 `#[tauri::command] fn ghost_wipe_everything`(본문 `remove_dir_all`), `db.ts:59`.

**(a)** `return invoke["call"](null, "ghost_wipe_everything")` → 명령 199 / 후보 16 / 호출 **14**(기준선), **EXIT=0**. 모듈에 물으면 `resolveCallee` 는 `{ imported: "invoke", via: "call", argShift: 1 }` 이고, `resolveBinding(callee)` 는 `null` 입니다.

**대조.** `return invoke.call(null, "ghost_wipe_everything")` → 호출 15, `db.ts:59 — ghost_wipe_everything`, **EXIT=1**.

12회차 지적 7 이 무음 클릭에서 닫은 바로 그 대괄호입니다. 공용 모듈이 아는 값을 호출자가 버립니다.

```
# (a) invoke["call"](null, "ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 199 · 후보 16 · 호출 14 — EXIT=0

# 대조 invoke.call(null, "ghost_wipe_everything")
# 명령 199 · 후보 16 · 호출 15 — db.ts:59 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `bindings.mjs` 는 고치지 않았다 — 확인해 보니
`resolveCallee` 는 이미 리터럴 키를 속성과 같게 읽어 `invoke["call"](…)` 에도
`{ imported: "invoke", via: "call", argShift: 1 }` 를 돌려준다. 버린 쪽은 호출자였다.

그래서 `scripts/check-destructive-affordance.mjs` 의 `invokeCallOffset` 이 이제 callee
**식**에 `resolveBinding` 을 거는 대신 **호출식 전체**를 `resolveCallee` 에 넘기고, 인자
자리도 그쪽이 아는 `argShift`/`argsUnknown` 을 그대로 쓴다. `.call`·`.apply`·`.bind` 의
자리 산술을 이 게이트가 다시 적지 않으므로, 공용 모듈이 형태를 하나 더 알게 되면 이
게이트도 같이 안다. 공용 모듈이 못 푸는 자리(이 게이트의 고정점이 키운 감싸기 함수
이름들)만 지역 판정으로 내려간다.

값으로 흘러가는 경로도 같이 닫았다. 지역 `invokeAliasOffset` 의 멤버 판정을
`memberOf` 하나로 모아 `invoke["call"]` 을 `invoke.call` 과 같게 읽는다 —
`const del = invoke["call"];` 같은 별명이 그 경로로 들어온다. 동적 키는 여전히 `null`
이고, 그것이 이 게이트의 경계다.

```
# (a) return invoke["call"](null, "ghost_wipe_everything", { root })
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 대조 invoke.call(null, "ghost_wipe_everything", { root }) — 같은 출력 — EXIT=1

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

---

## 7. `scripts/check-silent-clicks.mjs:173` — `void` 는 여덟 겹까지다

13회차는 껍데기 겹의 숫자 한계를 없애고, `void el.click()` 은 `el.click()` 이라고 적었습니다. 게이트의 `unwrapDiscarded` 만 `for (let i = 0; i < 8` 으로 다시 셉니다. 아홉 번째 `void` 에서 알맹이는 여전히 `el.click()` 인데 클릭이 아닙니다. 여덟 겹은 클릭입니다.

`01-app-launch.spec.ts:52`. 기준선 107.

**(a)** `if (ghostEl) void void void void void void void void void ghostEl.click()` (아홉) → 107, **EXIT=0**.

**대조.** 여덟 겹 → 108 > 107, `01-app-launch.spec.ts` 가 파일별 집계에 나타남, **EXIT=1**.

200자 창·별명 여섯 겹과 같은 **세는 자리**입니다.

```
# (a) if (ghostEl) void ×9 ghostEl.click()
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0

# 대조 void ×8
# 늘었다(108 > 107) — 01-app-launch.spec.ts 1 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. `unwrapDiscarded` 의 여덟 번 반복을 고정점으로
바꿨다 — `void` 가 아닐 때까지 벗긴다. 껍데기는 언제나 자식 하나로 내려가므로
반복은 반드시 끝난다.

계약 테스트에 **소스에 반복 횟수 상수가 없다**(`check-silent-clicks.mjs`·
`unwrap.mjs`·`jsx-static.mjs`·`bindings.mjs` 에서 `for (…; … < <숫자>` 불일치)를
고정했다. 13회차의 깊이 상수 계약과 짝을 이룬다.

```
# (a) if (ghostEl) void ×9 ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1

# void ×20 도 같다 — 108 — EXIT=1
# 대조 void ×8 — 108 — EXIT=1
# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```

---

## 8. `scripts/check-data-home-boundary.mjs:227-237` — 공개 항목 낱말에 `use` 가 없다

11회차 이후 깔때기의 `pub` 은 `PUBLIC_API` 와 대조하고, 목록에 없는 `pub` 이 생기면 붉어진다고 적습니다. `publicItems` 의 `ITEM_KEYWORDS` 는 `fn`·`const`·`struct` … 를 열거하고 `use` 가 없습니다. `pub use dirs::home_dir` 은 `data_home::home_dir` 을 밖에 내주는 공개 항목인데, 추출 목록은 16개(기준선)로 남습니다.

`data_home.rs:52`.

**(a)** `pub use dirs::home_dir;` → 공개 항목 16개(허용 목록 16), **EXIT=0**.

**대조.** `pub fn ghost_home() -> Option<PathBuf> { … }` → 공개 항목 17, `data_home.rs:52 — pub fn ghost_home`, **EXIT=1**.

11회차 대조가 쓰던 바로 그 사고입니다 — 목록에 없는 `pub` 이 붙어도 오늘 코드의 사용처가 없으면 조용히 재료가 다시 열립니다. `pub use` 는 그 대조를 우회합니다.

```
# (a) pub use dirs::home_dir;
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 깔때기 공개 항목 16개 (허용 목록 16) — EXIT=0

# 대조 pub fn ghost_home
# ❌ 깔때기가 허용 목록에 없는 것을 공개했다(1) — data_home.rs:52 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `scripts/check-data-home-boundary.mjs` 의 `ITEM_KEYWORDS` 에
`use`·`macro`·`macro_rules`·`crate` 를 더했고, `use` 는 이름이 낱말 **뒤**가 아니라 경로의
**잎**에 있으므로 따로 읽는다 — `rust-tokens.mjs` 의 `useDeclarations` 가 돌려준 잎마다
공개 항목 하나다. `pub use dirs::home_dir;` 은 `home_dir`, `pub use dirs::home_dir as h;`
는 `h`, `pub use crate::inner::*;` 는 이름을 셀 수 없으므로 `crate::inner::*` 로 남겨 허용
목록에서 반드시 붉어지게 했다.

허용 목록 대조는 예전부터 이름만 본다(`PUBLIC_API.has(item.name)`) — 항목 종류는 메시지에만
쓰인다. 그래서 같은 이름을 `pub fn` 에서 `pub use` 로 바꿔 적어도 판정이 달라지지 않는다.

```
# (a) 리뷰어가 심은 그대로: data_home.rs:52 에 pub use dirs::home_dir;
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 깔때기 공개 항목 17개 (허용 목록 16)
# ❌ 깔때기가 허용 목록에 없는 것을 공개했다(1)
#    packages/shell/src-tauri/src/data_home.rs:52 — pub use home_dir — EXIT=1

# 되돌린 뒤 — 공개 항목 16개 (허용 목록 16) — EXIT=0, git diff 출력 없음
```

이름표·변형·문서 대조(14 · 14 · 14행)는 그대로다.

---

## 9. `scripts/check-destructive-affordance.mjs:218` — 명령 목록은 `src-tauri/src` 뿐이다

머리말은 목록을 손으로 적지 않고 `#[tauri::command]` 에서 뽑으며, 명령이 늘면 게이트도 같이 는다고 합니다. `tauriCommands` 는 `packages/shell/src-tauri/src` 만 돕니다. 플러그인 크레이트의 같은 속성은 목록에 없고, 프런트 `invoke("…")` 는 확인 검사에서 건너뜁니다.

`packages/shell/src-tauri/plugins/tauri-plugin-stt/src/commands.rs` 끝에 `#[tauri::command] fn ghost_wipe_everything`(본문 `remove_dir_all`), `db.ts` 에서 확인 없이 `invoke("ghost_wipe_everything")`.

**(a)** 플러그인 파일 → 명령 **198**(기준선), **EXIT=0**.

**대조.** 같은 선언을 `capture.rs` 에 두면(지적 5의 대조) 명령 199 / 호출 15, `db.ts:59`, **EXIT=1**. 차이는 속성 형태가 아니라 **디렉터리**입니다.

```
# (a) plugins/tauri-plugin-stt/src/commands.rs 에 #[tauri::command] fn ghost_wipe_everything
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 198 · 후보 15 · 호출 14 — EXIT=0

# 대조 같은 선언을 src-tauri/src/capture.rs 에
# 명령 199 · 후보 16 · 호출 15 — db.ts:59 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `scripts/check-destructive-affordance.mjs` 의
`tauriCommands` 가 `packages/shell/src-tauri/src` 한 자리를 도는 대신, `Cargo.toml` 에게
크레이트 자리를 묻는다(`crateSourceRoots`). `packages/shell/src-tauri/Cargo.toml` 에서
시작해 `[workspace] members` 와 `path = "…"` 로 적힌 지역 의존을 따라가며, 닿는 크레이트
마다 그 `src` 를 소스 뿌리로 더한다. 지금은 셸 크레이트와
`plugins/tauri-plugin-stt` 둘이다.

뿌리를 손으로 적으면 다음 크레이트에서 같은 일이 난다. 크레이트를 하나 붙이려면 Cargo 에
그 자리를 적어야 하고, 적으면 여기서 보인다. 틀리는 방향도 안전한 쪽이다 — `path` 를
넉넉히 읽어 소스가 아닌 자리를 더해도 거기에 명령 속성이 없으면 목록은 그대로다.

```
# (a) plugins/tauri-plugin-stt/src/commands.rs 에 #[tauri::command] fn ghost_wipe_everything
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 대조 같은 선언을 src-tauri/src/capture.rs 에 — 같은 출력 — EXIT=1

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

기준선 이동(198 → 206)은 지적 5 의 상태 문단에 적었다 — 두 고침이 함께 플러그인의 명령
여덟 개를 목록에 들였고, 그 여덟은 이제 프런트 확인 검사의 대상이다.

---

머리말이 보증하지 않는다고 적어 둔 자리(`Boolean(true)` 같은 함수 결과, 동적 `import`/`require`, 배열·객체로 흘러간 함수, `Reflect.apply`/두 겹의 `Function.prototype`, 문자를 조립해 `.naia` 를 만드는 위조, 데이터 홈 허용 목록이 파일 단위라는 점, `--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장)는 지적 번호에서 뺐습니다.

감싸기 함수 일곱 겹(`round < 6`)은 안쪽 `invoke(cmd)` 가 **조립 호출**로 이미 붉어져, 이번 범위에서 거짓 통과로 쓰지 못했습니다. `regression-selection.mjs` 와 시딩 호출 그래프에서는 이번 범위 안에서 실증된 거짓 통과가 없었습니다.

되돌린 뒤 다섯 게이트는 다시 `EXIT=0` 입니다. 최종 `git status --porcelain` 은 비어 있습니다.

**NOT CLEAN**
