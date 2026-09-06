# 16회차 교차 리뷰 지적 (2026-09-06, 스냅숏 04c4c5c1)

판정: **NOT CLEAN**, 지적 6건(린트 경계 반영 첫 회차). 아래는 리뷰어 원문이다.

---

16회차 적대적 교차 리뷰를 시작합니다. 먼저 프로세스 현황·규칙·이전 회차 닫힘 기록과 게이트 머리말을 읽고, 그다음 공용 모듈과 호출 규약을 대조하겠습니다.이전 회차 닫힘 기록과 게이트 머리말(사고·위협 경계)부터 대조한 뒤, 새로 들어온 공용 모듈을 읽겠습니다.게이트 머리말과 공용 모듈을 병렬로 읽어, 막겠다고 적은 사고와 실제 판정 범위를 맞춥니다.닫힌 형태는 건너뛰고, 공용 모듈의 범위 조건과 게이트 호출 규약을 코드에서 직접 대조하겠습니다.공용 모듈의 나머지와 게이트 호출 규약, 린트 검출기 구멍을 이어서 좁히겠습니다.`r#use`가 키워드와 충돌하는지, 구조분해 문자열 키와 린트 검출기 변형을 코드에서 확인한 뒤 심어 보겠습니다.TypeScript를 연결한 뒤, 모듈에 가설을 직접 묻고 통과하는 형태만 게이트에 심겠습니다.기준선은 전부 `EXIT=0`입니다. 가설을 하나씩 심고 게이트를 돌리겠습니다.기준 HEAD는 `27afdd9`입니다. 6~15회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 공용 모듈의 **범위 조건**과 린트 검출기가 `unwrap`을 빼먹은 자리만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

기준선은 전부 `EXIT=0`이었습니다 (dead-ui 이름 175 / 복구 자리 1·0 / 무음 107 / 파괴 206·16·14 / 데이터 홈 이름표 14·공개 16 / 인벤토리 119 / 린트 위반 0).

---

# 판정: **NOT CLEAN** — 실증된 지적 6건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `rust-tokens.mjs:161-167, 323-346` | `fn r#use()` 뒤에 오는 `use` 는 선언이 아니다. `fn ghost()` 뒤에 오는 `use` 는 선언이다 |
| 2 | `bindings.mjs:384-386` `constAlias` | `const { "invoke": g } = core` 는 호출부가 아니다. `const { invoke: g } = core` 는 호출부다 |
| 3 | `jsx-static.mjs:1332-1360` `alwaysTruthy` | `disabled={1 === 1}` 은 영구 참이 아니다. `disabled={true}` 는 참이다 |
| 4 | `check-lint-boundary.mjs:116-145` | `void (0)` · `(f["call"])()` 는 금지 형태가 아니다. `void 0` · `f["call"]()` 는 금지 형태다 |
| 5 | `jsx-static.mjs:200-208` `ELEMENT_MODULES` | `from "react/index.js"` 는 요소가 아니다. `from "react"` 는 요소다 |
| 6 | `check-silent-clicks.mjs:525-536` | `el &&= el.click()` 은 무음이 아니다. `el && el.click()` 은 무음이다 |

---

## 1. `scripts/lib/rust-tokens.mjs:161-167, 323-346` — 생 식별자 `r#use` 는 `use` 키워드다

15회차는 `r#ghost_wipe_everything` 을 이름 `r` 로 잘리던 것을 닫으며, 토크나이저가 `r#이름` 을 `ident` 하나(`text` = `#` 뒤, `raw: true`)로 읽게 했습니다. `useDeclarations` 는 그 `raw` 를 보지 않고 `text === "use"` 인 식별자를 **전부** `use` 선언의 시작으로 봅니다. 그래서 `fn r#use() { … }` 의 이름이 키워드가 되고, 함수 본문의 `{` 를 `use` 나무의 중괄호 묶음으로 건너뛴 뒤 다음 `;` 까지를 한 선언으로 삼습니다. 그 `;` 가 **뒤에 오는 진짜 `use …;`** 의 것이면 그 선언은 목록에 없습니다.

15회차가 닫은 것은 명령 **이름**이 `r` 로 잘리는 것이었습니다. 이번은 그 수리가 키워드와 생 식별자를 같은 토큰으로 만든 자리입니다. 매크로가 생성하는 속성도, `include!` 도 아닙니다.

**(a) 데이터 홈.** `capture.rs` 끝.

```rust
fn r#use() {
    let _ghost = 1;
}
use crate::data_home::*;
#[allow(dead_code)]
fn ghost_cache() -> PathBuf {
    user_home_path().unwrap_or_default().join("ghost-cache")
}
```

→ 이름표 14 · 공개 항목 16, **EXIT=0**. 린트 **EXIT=0**.

모듈에 직접 물으면 `useDeclarations` 는 `{ local: "x", path: ["let", "x"] }` 하나뿐이고, `crate::data_home::*` glob 은 없습니다.

**대조.** `fn r#use()` 만 뺀 같은 glob·호출 → `capture.rs:241 — data_home::user_home_path`, **EXIT=1**.

**(b) 파괴 명령.** 같은 `fn r#use()` 뒤에, 이 저장소 STT 플러그인이 이미 쓰는 형태.

```rust
fn r#use() { let _ghost = 1; }
use tauri::command;
#[command]
fn ghost_wipe_everything() {
    let _ = std::fs::remove_dir_all("/tmp/ghost-wipe");
}
```

`db.ts` 에 확인 없이 `invoke("ghost_wipe_everything", { root })`.

→ 명령 **206**(기준선, 207이 아님) / 후보 16 / 호출 14, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `fn r#use()` 만 뺀 같은 `use tauri::command; #[command] fn ghost_wipe_everything` + 같은 `invoke` → 명령 207 / 후보 17 / 호출 15, `db.ts:29 — ghost_wipe_everything`, **EXIT=1**.

```
# (a) capture.rs 에 fn r#use() { … } 뒤 use crate::data_home::*; user_home_path()
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 이름표 14 · 공개 항목 16 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 0곳 — EXIT=0

# 대조 fn r#use() 만 제거
# ❌ 허용 목록이 정한 파일 밖에서 짚었다(1) — capture.rs:241 — EXIT=1

# (b) fn r#use() 뒤 use tauri::command; #[command] fn ghost_wipe_everything + invoke
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 206 · 후보 16 · 호출 14 — EXIT=0

# 대조 fn r#use() 만 제거
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. 판정의 단위를 글자에서 **표시**로 옮겼다. 토크나이저가
식별자 토큰마다 `keyword` 를 달고, 생 식별자는 그 값이 **언제나 거짓**이다 — `r#use` 는
이름이 `use` 인 식별자일 뿐 `use` 키워드가 아니다. 낱말 목록(`RUST_KEYWORDS`)은 엄격·
예약·약한 키워드를 한자리에 모았다.

그리고 이 모듈과 이 모듈을 쓰는 데이터 홈 게이트의 **모든** 낱말 비교를 `isKeyword` ·
`keywordIn` 둘로 모았다. `use`·`fn`·`pub`·`as`·`impl`·`match`·`const`·`extern` 과
아이템 시작 낱말·수식어 묶음이 전부 그 둘을 지난다. 글자 비교(`token.text === "use"`)는
남아 있지 않다 — 남으면 아래 계약이 붉어진다.

남은 글자 비교는 둘뿐이고 토큰이 아니라 **경로 문자열**을 본다(`use tauri::{self as t}`
의 `self` 를 마디에서 떼는 자리). Rust 가 `self`·`crate`·`super`·`Self` 를 생 식별자로
쓰지 못하게 막으므로 그 자리에는 `r#` 형태가 올 수 없다.

```
# (a) capture.rs 에 fn r#use() { … } 뒤 use crate::data_home::*; user_home_path()
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# ❌ 허용 목록이 정한 파일 밖에서 짚었다(1)
#    packages/shell/src-tauri/src/capture.rs:244 — data_home::user_home_path — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 0곳 — EXIT=0

# 대조 fn r#use() 만 제거 — capture.rs:241 — 같은 실패 — EXIT=1

# (b) fn r#use() 뒤 use tauri::command; #[command] fn ghost_wipe_everything + invoke
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 대조 fn r#use() 만 제거 — 같은 출력 — EXIT=1

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 · 이름표 14 — EXIT=0, git diff 출력 없음
```

HEAD 의 판정과 지금 판정을 같은 소스에 나란히 물어 차이를 직접 확인했다. HEAD 는
`fn r#use() { let _ghost = 1; }` 를 선언 하나로 삼켜 `useDeclarations` 가
`{ path: ["let", "_ghost"] }` 만 돌려주고, 뒤따르는 `use tauri::command;` 도
`use crate::data_home::*;` 도 목록에 없다(그래서 명령은 `[]`, glob 은 없음). 지금은 각각
`tauri::command` 와 `crate::data_home`(glob)이고 명령은 `ghost_wipe_everything` 이다.

계약 테스트 `src/test/rust-tokens.contract.test.ts` 에 네 항목을 더했다(22 → 26):
`fn r#use()` 뒤의 진짜 `use tauri::command;` 가 선언으로 읽히고 `#[command]` 가 명령이라는
것, 키워드와 같은 이름의 생 식별자(`r#use`·`r#fn`·`r#struct`)가 그냥 이름이라는 것,
`r#pub use` 가 재수출이 아니라는 것, 그리고 열 개 낱말을 훑어 맨 낱말은 키워드이고
`r#` 형태는 **이름이 같아도** 키워드가 아니라는 것.

판정의 단위가 “이 이름이 `use` 키워드인가”가 아니라 `text === "use"` 한 글자입니다. 15회차가 단  `raw: true` 는 여기 쓰이지 않습니다.

---

## 2. `scripts/lib/bindings.mjs:384-386` — 구조분해 키는 식별자만 속성이다

머리말은 리터럴 키 멤버(`React["createElement"]`, `core["invoke"]`)를 경계 **안**이라고 하고, 구조분해 별명(`const { createElement } = React`)을 따라간다고 합니다. `constAlias` 는 `propertyName` 이 **Identifier** 일 때만 그 글자를 속성으로 쓰고, 아니면 지역 이름(`el.name.text`)으로 떨어집니다. 그래서 `const { "createElement": ghostCreate } = React` 와 `const { ["createElement"]: ghostCreate } = React` 의 `imported` 는 `createElement` 가 아니라 `ghostCreate` 입니다.

같은 파일의 `importBindings` 는 `el.propertyName.text` 를 식별자 여부와 무관하게 읽으므로 `import { "createElement" as ghostCreate } from "react"` 는 맞습니다. 구멍은 **구조분해** 한 갈래입니다. 동적 키(`obj[name]`)도, 배열을 거쳐 흘러간 함수도 아닙니다.

**(a) 복구.** `UpdateBanner.tsx` import 옆에 `import * as React from "react"; const { "createElement": ghostCreate } = React;`. `if (installing)` 을 `return ghostCreate("div", { role: "alert" }, "install failed")` 로.

→ 자리 1곳 / 다음 행동 없음 0, **EXIT=0**. 린트 **EXIT=0**.

모듈에 물으면 `resolveCallee` 는 `{ imported: "ghostCreate" }` 입니다.

**대조.** `const { createElement: ghostCreate } = React` → 자리 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:33`, **EXIT=1**. `imported` 는 `createElement`.

**(b) 파괴 호출부.** `capture.rs` 끝에 `#[tauri::command] fn ghost_wipe_everything`(본문 `remove_dir_all`) — 명령 목록에는 오릅니다. `db.ts` 에 `import * as core from "@tauri-apps/api/core"; const { "invoke": ghostInvoke } = core;` 후 확인 없이 `ghostInvoke("ghost_wipe_everything", { root })`.

→ 명령 **207** / 후보 17 / 호출 **14**(기준선), **EXIT=0**. 린트 **EXIT=0**. 목록에 있는데 호출부를 못 본 것입니다.

**대조.** `const { invoke: ghostInvoke } = core` → 호출 15, `db.ts:31 — ghost_wipe_everything`, **EXIT=1**.

```
# (a) const { "createElement": ghostCreate } = React; return ghostCreate("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 const { createElement: ghostCreate } = React
# 자리 2곳 / 다음 행동 없음 1 — UpdateBanner.tsx:33 — EXIT=1

# (b) const { "invoke": ghostInvoke } = core; ghostInvoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 14 — EXIT=0

# 대조 const { invoke: ghostInvoke } = core
# 호출 15 — db.ts:31 — EXIT=1
```

`const ghostCreate = React["createElement"]` 는 멤버 접근이라 따라갑니다. 같은 리터럴 키가 구조분해로 적히면 지역 이름이 export 이름이 됩니다.

**상태 (2026-09-06):** 닫혔다. 선언에 적힌 속성 이름을 읽는 자리를
`declaredPropertyName` 하나로 모았다 — 식별자·문자열 리터럴·계산된 리터럴 키가
모두 같은 이름이다. `constAlias` 의 구조분해와 `importBindings` 의 named import
가 그것을 쓴다.

못 읽는 키(동적 `{ [name]: g }`)는 **지역 이름으로 떨어뜨리지 않고** 아예
따라가지 않는다. 모르는 것을 아는 이름으로 바꿔 읽으면 지역 이름이 export
이름이 되어 남의 모듈 export 가 걸려 든다 — 이번 결함의 뿌리가 바로 그
떨어짐이었다.

```
# (a) const { "createElement": ghostCreate } = React; return ghostCreate("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# (b) const { "invoke": ghostInvoke } = core; ghostInvoke("memory_delete_fact", …)
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 15곳 · 되돌릴 수 없는 동작 1곳 — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# 모듈에 직접 물으면 세 형태 모두 react::createElement, 동적 키는 null
# 되돌린 뒤 자리 1곳 / 0, 호출 14곳 — EXIT=0, git diff 출력 없음
```

---

## 3. `scripts/lib/jsx-static.mjs:1332-1360` — 이항은 `&&` · `||` · `??` 만 접는다

15회차는 단항 `+ - ~ typeof` 를 리터럴 위에서 접었습니다. `alwaysTruthy` 의 이항은 `&&` · `||` · `??` 세 토큰이고, 나머지는 `return false` 입니다. `1 === 1` 은 JavaScript 에서 `true` 이고, React 에서 `disabled={1 === 1}` 은 누를 수 없는 버튼입니다. 머리말이 모른다고 적은 것은 상태·인자·**함수 결과**입니다. `1 === 1` 은 리터럴 위의 비교입니다. `alwaysTruthy(1)` 은 이미 참이고, `alwaysTruthy(true)` 도 참입니다.

`SettingsTab.tsx` 연결 탭 뒤에 버튼, 스펙 `onboarding-fresh.spec.ts` 가 `getByTestId("ghost-wake-panel")`.

**(a)** `disabled={1 === 1}` → 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**. 린트 **EXIT=0**. 모듈에 물으면 `alwaysTruthy(1 === 1) === false`, `alwaysTruthy(true) === true`, `alwaysTruthy(1) === true`. 같은 갈래로 `1 == 1`, `1 + 0`, `1 | 0`, `1 > 0` 도 거짓입니다.

**대조.** `disabled={true}` → `onboarding-fresh.spec.ts:368 — ghost-wake-panel`, **EXIT=1**.

```
# (a) disabled={1 === 1}  (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 이름 176개 / 꺼 둔 조작 6곳 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 disabled={true}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
```

`true && true` 와 `0 || 1` 과 `true ? true : false` 는 이미 참입니다. 빠진 것은 비교·산술·비트 이항입니다.

**상태 (2026-09-06):** 닫혔다. 연산자를 하나씩 열거하는 대신 **두 피연산자가
정해지면 결과도 정해진다**는 규칙 하나로 읽는다. `staticPrimitive` 가 리터럴과
`const` 사슬을 원시값으로 접고, 그 위에서 비교(`=== !== == != < <= > >=`)·
산술(`+ - * / % **`)·비트(`& | ^ << >> >>>`)를 실제 JavaScript 연산으로
계산한다. 한쪽이라도 모르면 결과도 모른다.

`&&`·`||`·`??` 는 그대로 갈래로 읽는다 — 값이 안 정해져도 "언제나 참인가" 는
답할 수 있는 자리가 있기 때문이다(`x || true`). `alwaysFalsy` 도 대칭이다.

고치면서 한 번 헛디뎠다. 접기 함수에 `alwaysTruthy` 의 방문 자국을 그대로
넘겼더니 시작하자마자 "이미 지난 노드" 로 멈춰 전부 거짓이 나왔다. 자국은 새로
든다.

```
# (a) disabled={1 === 1}   (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# (b) disabled={1 + 0} — EXIT=1
# 반증 disabled={naiaVrms.length === 1} (한쪽을 모른다) — 이름 176개 — EXIT=0
# 대조 disabled={true} — EXIT=1

# 모듈에 물으면 1===1 참 · 1==1 참 · 1|0 참 · 2**0 참 · "a"+"" 참
#              1!==1 거짓 · 1-1 거짓 · 5%5 거짓 · x===1 거짓(모른다)
# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음
```

---

## 4. `scripts/check-lint-boundary.mjs:116-145` — 검출기는 껍데기를 벗기지 않는다

정본 목록의 형태는 `void 0` 과 `f["call"](…)`. `scripts/lib/unwrap.mjs` 는 괄호·`as`·`satisfies`·non-null 을 값이 그대로인 껍데기로 벗깁니다. 게이트 모듈 여섯은 그것을 씁니다. 린트 검출기 둘은 자식 노드를 **그대로** 맞춥니다.

- `voidLiteral`: `node.expression` 이 리터럴이어야 한다 → `void (0)` 의 안은 `ParenthesizedExpression`
- `computedCallee`: `CallExpression.expression` 이 `ElementAccessExpression` 이고 키가 리터럴이어야 한다 → `(f["call"])()` 의 callee 는 괄호, `f["call" as const]()` 의 키는 `as`

둘 다 정본 목록에 있는 형태의 **껍데기 한 겹**입니다. 오너 결정의 린트 경계 구멍을 세라는 조건에 해당합니다.

**(a)** `logger.ts` import 다음 줄 `void (0);`

→ 위반 0곳, **EXIT=0**.

**대조.** `void 0;` → `logger.ts:9 — void 0`, **EXIT=1**.

**(b)** `logger.ts` import 다음 줄 `(invoke["call"])(null, "frontend_log");`

→ 위반 0곳, **EXIT=0**. (파괴 게이트는 이 호출을 `invoke.call` 로 읽지만 `frontend_log` 는 파괴 후보가 아니라 파괴 게이트는 기준선 그대로 **EXIT=0**.)

**대조.** `invoke["call"](null, "frontend_log");` → `logger.ts:9 — invoke["call"](…)`, **EXIT=1**.

**(c)** `invoke["call" as const](null, "frontend_log");` → 위반 0곳, **EXIT=0**. 바인딩 쪽은 `unwrap` 으로 키를 읽어 이 호출을 `invoke.call` 로 봅니다 — 린트만 놓칩니다.

```
# (a) void (0);
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 0곳 — EXIT=0

# 대조 void 0;
# void-literal — logger.ts:9 — EXIT=1

# (b) (invoke["call"])(null, "frontend_log");
# 위반 0곳 — EXIT=0

# 대조 invoke["call"](null, "frontend_log");
# computed-callee — logger.ts:9 — EXIT=1

# (c) invoke["call" as const](null, "frontend_log");
# 위반 0곳 — EXIT=0
```

`void (void 0)` 의 **안쪽** `void 0` 은 리터럴 검출에 걸립니다. `void (0)` 은 어느 검출기에도 안 걸립니다.

**상태 (2026-09-06):** 닫혔다. 두 가지를 고쳤다.

첫째, 검출기가 `scripts/lib/unwrap.mjs` 의 `unwrapExpression` 을 쓴다. `void` 의
안쪽, 호출의 callee, 그리고 대괄호 **키** 까지 벗기고 본다. 경계를 지는 게이트가
게이트 모듈보다 얕게 보면 안 된다.

둘째, 형태의 **정의**를 정본으로 옮겼다. 검출기 셋이
`scripts/lib/lint-boundary-forms.mjs` 의 `LINT_BOUNDARY_DETECTORS` 에 있고 게이트는
그것을 그대로 쓴다. 정의가 정본과 게이트 두 곳에 있었기 때문에 한쪽만 고쳐진
자리가 생겼다 — 이번 구멍의 뿌리가 그 두 벌이다.

계약 테스트가 검출기를 직접 태워 `void (0)`·`void ((0))`·`void (0 as never)` 와
`(f["call"])()`·`f["call" as const]()` 를 못 박고, 게이트·정본 소스에 자기 껍데기
벗기기가 없다는 것도 함께 고정한다. 과탐지 반증(`void (asyncFn())`,
`f[name](…)`, `f.call(…)`)도 넣었다.

```
# (a) void (0);            → 위반 1곳 — EXIT=1
# (b) void ((0));          → 위반 1곳 — EXIT=1
# (c) void (void (0));     → 위반 2곳 — EXIT=1
# (d) (invoke["call"])(null, "frontend_log");        → 위반 1곳 — EXIT=1
# (e) invoke["call" as const](null, "frontend_log"); → 위반 1곳 — EXIT=1
# 대조 void 0; / invoke["call"](…)                    → 위반 1곳 — EXIT=1
# 되돌린 뒤 위반 0곳 — EXIT=0, git diff 출력 없음
```

---

## 5. `scripts/lib/jsx-static.mjs:200-208` — 요소 모듈은 적힌 문자열이다

요소인지는 바인딩의 `module` 문자열이 `ELEMENT_MODULES` 안에 있는지로 정합니다. 목록은 `react`, `react/jsx-runtime`, `preact/compat` 처럼 **패키지 이름 그대로**입니다. Node/Vite 가 같은 진입으로 푸는 `react/index.js` · `react/jsx-runtime.js` 는 목록에 없습니다. 15회차의 `tauri` 대 `tauri_macros` 와 같은 종류의 자리입니다 — 같은 값, 다른 경로 문자열. 동적 `import()` 가 아닙니다.

`UpdateBanner.tsx` 에 `import { createElement } from "react/index.js";`. `if (installing)` 을 `return createElement("div", { role: "alert" }, "install failed")` 로.

→ 자리 1곳 / 0, **EXIT=0**. 린트 **EXIT=0**. 모듈에 물으면 `resolveCallee` 는 `{ module: "react/index.js", imported: "createElement" }` 이고 `elementFactory` 는 `null` 입니다.

**대조.** `from "react"` → 자리 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:32`, **EXIT=1**.

```
# import { createElement } from "react/index.js"; return createElement("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 from "react"
# 자리 2곳 / 다음 행동 없음 1 — UpdateBanner.tsx:32 — EXIT=1
```

`react/index` · `react.js` · `preact/compat/dist/compat.mjs` 도 같은 목록에서 `null` 입니다.

**상태 (2026-09-06):** 닫혔다. 요소를 내주는 모듈을 적힌 문자열이 아니라
**패키지 이름**으로 대조한다. `packageOf` 가 첫 마디(스코프 패키지면 두 마디)를
읽고, `ELEMENT_PACKAGES` 는 기존 목록에서 패키지 이름만 남긴 것이다. 저장소 안
파일(`./shim`)은 패키지가 아니다.

어떤 방식인지는 그대로 **가져온 이름**이 정한다 — `createElement`/`h` 는 옛
방식, `jsx`/`jsxs`/`jsxDEV` 는 automatic runtime 이다. 그래야 `react` 본체와
`react/jsx-runtime` 의 export 집합이 섞이지 않는다.

```
# import { createElement } from "react/index.js"; return createElement("div", { role: "alert" }, …)
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# 모듈에 물으면 react/index.js → classic · react/jsx-runtime.js → runtime
#              preact/compat/dist/compat.mjs → classic
#              react-dom → null · ./shim → null
# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

---

## 6. `scripts/check-silent-clicks.mjs:525-536` — 있음 가드의 `&&` 는 대입이 아니다

머리말은 묻는 것이 문법이 아니라 **클릭이 E 가 있을 때만 도는가** 라고 하고, 15회차는 `!E || E.click()` 을 `E && E.click()` 과 같게 읽었습니다. 짧은회로 판정은 `AmpersandAmpersandToken` 과 `BarBarToken` 두 토큰입니다. `E &&= E.click()` 은 있을 때만 오른쪽이 도는 같은 짧은회로이고, 없으면 누르지 않습니다. `&&=` 는 `BinaryExpression` 이지만 토큰이 `AmpersandAmpersandEqualsToken` 이라 가드가 `null` 입니다. 보증 밖 목록(동적 키, `eval`, 고차 함수, 배열·객체)에 없고, 린트 정본에도 없습니다.

`100-herdr-first-frame.spec.ts` 마지막 단언 뒤. 기준선 107.

**(a)** `const ghostEl = document.querySelector(".ghost"); ghostEl &&= ghostEl.click();` → 107, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `ghostEl && ghostEl.click();` → 108 > 107, `100-herdr-first-frame.spec.ts` 가 파일별 집계에 나타남, **EXIT=1**.

```
# (a) ghostEl &&= ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 ghostEl && ghostEl.click();
# 늘었다(108 > 107) — 100-herdr-first-frame.spec.ts 1 — EXIT=1
```

연산자를 세면 매 회차에 하나가 더 옵니다. 15회차가 `||` 에 대해 적어 둔 그 문장입니다.

**상태 (2026-09-06):** 닫혔다. 짧은회로 **대입**을 같은 뜻의 이항으로 바꾼 뒤
한 규칙으로 읽는다 — `shortCircuitOf` 가 `&&=`→`&&`, `||=`→`||`, `??=`→`??` 로
토큰을 옮긴다. 그래서 `E &&= E.click()` 은 `E && E.click()` 과 같은 무음이다.

`||=`·`??=` 는 규칙에서 저절로 빠진다. 둘은 **없을 때** 오른쪽이 도는 형태라
무음 클릭이 아니라 그냥 깨지는 코드다 — 그 사실이 판정에서 따라 나오지, 목록에
없어서 빠지는 것이 아니다.

```
# (a) ghostEl &&= ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# 반증 ghostEl ||= ghostEl.click();  — 107 — EXIT=0
# 반증 ghostEl ??= ghostEl.click();  — 107 — EXIT=0
# 대조 ghostEl && ghostEl.click();   — 108 — EXIT=1
# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```

---

머리말이 보증하지 않는다고 적어 둔 자리(동적 `import()`/`require()` **호출**의 결과, `eval`/`Reflect.apply`/두 겹의 `Function.prototype`, 문자를 조립해 `.naia` 를 만드는 위조, 데이터 홈 허용 목록이 파일 단위라는 점, `--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장 자체, 배열·객체를 거쳐 흘러간 함수)는 지적 번호에서 뺐습니다.

`await el.click()` 은 무음 게이트의 지역 `unwrap` 이 벗기므로(머리말과 같음) 심으면 108로 붉어집니다 — 지적이 아닙니다. `const ghostCreate = React["createElement"]` 는 멤버 접근이라 따라갑니다. 지적 2는 그 키가 **구조분해**로 적힐 때만입니다.

되돌린 뒤 여섯 게이트는 다시 `EXIT=0` 입니다. 최종 `git status --porcelain` 은 비어 있습니다.

**NOT CLEAN**
