# 12회차 교차 리뷰 지적 (2026-09-06, 스냅숏 452df767)

판정: **NOT CLEAN**, 지적 9건. 아래는 리뷰어 원문이다.

---

품질 게이트가 막겠다고 적어 둔 사고를 그대로 재현할 수 있는지부터 확인하겠습니다. 먼저 프로세스 현황, 지난 회차 닫힘 기록, 그리고 새로 들어온 공용 모듈과 게이트 머리말을 읽습니다.지난 회차 닫힘 기록과 새로 들어온 공용 모듈·게이트 머리말을 같이 읽겠습니다.공용 모듈을 부르는 게이트와 계약 테스트, 그리고 데이터 홈 깔때기를 이어서 읽겠습니다.게이트가 공용 모듈을 어떻게 부르는지, 그리고 계약 테스트가 무엇을 고정하는지를 대조하겠습니다.호출 규약(`argShift`·`env`)과 토크나이저의 중첩 속성·깔때기 이름표 정규식을 코드에서 좁히겠습니다.루트에 `typescript`만 잠시 연결한 뒤, 공용 모듈을 저장소 밖에서 먼저 찔러 가설을 가리겠습니다.기준선은 모두 `EXIT=0`입니다. 삼항 상수·`createElement.call`·env 미전달부터 심고 게이트를 돌리겠습니다.기준 HEAD는 `dc5700a`. 6~11회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 공용 모듈의 **범위 조건**과 게이트가 그 모듈을 **부르는 규약**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

---

# 판정: **NOT CLEAN** — 실증된 지적 9건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `jsx-static.mjs:894-898` `alwaysTruthy` | `true ? true : false` 는 영구 참이 아니다. `true && true` 는 참이다 |
| 2 | `jsx-static.mjs:266-268` / `bindings.mjs:272-288` | `createElement.call` 은 요소인데 `argShift` 를 안 읽어 알림이 아니다 |
| 3 | `check-recovery-affordance.mjs:195,197,269` | `isElementNode`/`elementChildren` 에 `env` 를 안 넘긴다. 파일을 건너간 별명은 화면이 아니다 |
| 4 | `rust-tokens.mjs:230-239` | `#[cfg_attr(all(), tauri::command)]` 는 명령이 아니다. 확인 없는 삭제가 목록에서 사라진다 |
| 5 | `bindings.mjs:193-252` / `check-destructive-affordance.mjs:435-467` | `(0, invoke)("memory_delete_fact")` 는 호출부가 아니다 |
| 6 | `build-e2e-inventory.mjs:346-353` | `const get = fetch; get("https://…")` 는 바깥 주소가 아니다 |
| 7 | `check-silent-clicks.mjs:277-284` | `el["click"]()` 과 `el.click.call(el)` 은 같은 무음인데 세지 않는다 |
| 8 | `check-data-home-boundary.mjs:364` | `name()` 갈래가 중괄호면 이름표가 늘지 않는다 |
| 9 | `credentialed-adk-seed.contract.test.ts:204-220` | 안 쓰는 함수 안의 호출이 시딩 배선을 만족한다 |

---

## 1. `scripts/lib/jsx-static.mjs:894-898` — 삼항은 **두 갈래가 모두** 참일 때만 언제나 참이다

머리말은 `disabled={true}` 와 `disabled={true && true}` 를 같은 영구 꺼짐으로 읽습니다. `alwaysTruthy` 는 `&&` 는 양쪽, `||` 는 한쪽이면 참인데, 삼항은 **조건이 언제나 참인지 묻지 않고** 두 갈래가 모두 참이기를 요구합니다. `true ? true : false` 는 실행하면 `true` 입니다.

`SettingsTab.tsx` 연결 탭 앞에 버튼을 두고, 스펙 `01-app-launch.spec.ts` 가 `[data-testid='ghost-wake-panel']` 을 기다림.

**(a)** `disabled={true ? true : false}` → 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**.

**대조.** 같은 버튼을 `disabled={true}` 로 → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

React 에서 둘 다 누를 수 없는 버튼입니다. `true && true` 만 닫고 삼항의 상수 조건은 그대로 둔 자리입니다.

```
# (a) SettingsTab.tsx 에
#     <button data-testid="ghost-wake-panel" disabled={true ? true : false}>ghost</button>
#     01-app-launch.spec.ts 가 [data-testid='ghost-wake-panel'] 을 기다림
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 0 — EXIT=0

# 대조 disabled={true}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts:50 — ghost-wake-panel
# EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

모듈에 직접 물으면 `alwaysTruthy(true ? true : false) === false`, `alwaysTruthy(true && true) === true` 입니다. `Boolean(true)` 도 같은 함수에서 거짓입니다 — 이번 게이트 주입의 본문은 삼항입니다.

**상태 (2026-09-06):** 닫혔다. 지적이 맞았다. 삼항은 이제 **실제로 도는 갈래**로
판정한다 — 조건이 언제나 참이면 참 갈래만, 언제나 거짓이면 거짓 갈래만 보고,
조건을 모를 때만 두 갈래가 모두 참이기를 요구한다. `alwaysFalsy` 도 대칭이다.
처음에는 조건 접기를 하지 않고 "얕은 경계" 로 선언했는데, 그것은 잘못이었다.
`true ? true : false` 는 React 에서 누를 수 없는 버튼이고, 스펙이 그 버튼을
기다리면 영원히 실패한다. 게이트가 막겠다고 적어 둔 바로 그 사고다. 머리말
보증 밖 절과 계약 테스트에서 그 "경계" 문장을 지웠고, 대신 접기 계약과 반증
(`false ? true : false` 는 거짓, `true ? false : true` 도 거짓)을 넣었다.

곁들여, 처음에 비어 있던 `alwaysFalsy` 의 삼항 갈래도 함께 채웠다 —
`disabled={!(c ? A : B)}` 가 참 쪽과 판정이 갈리던 자리다.

```
# (a) 리뷰어가 심은 그대로 disabled={true ? true : false}  (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts — EXIT=1

# 반증(조건을 모르는 삼항은 열린 버튼이다) disabled={naiaVrms.length > 0 ? true : false}
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 0 — EXIT=0

# 대조 disabled={true}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음
```

---

## 2. `scripts/lib/jsx-static.mjs:266-268` — `bindings` 가 돌려준 `argShift` 를 호출자가 버린다

`bindings.mjs` 머리말은 `.call`/`.apply` 와 미리 먹인 `.bind` 에서 인자 자리가 밀리면 `argShift`/`argsUnknown` 으로 알리고, 호출자가 "모른다" 를 "그 인자가 없다" 로 읽지 말라고 합니다. `elementFactory` 는 `.call` 을 `classic` 요소로 인정하면서, `elementProps` 는 둘째 인자를 그대로 props 로 읽습니다. `createElement.call(null, "div", { role: "alert" }, "failed")` 의 둘째 인자는 `"div"` 입니다.

`UpdateBanner.tsx:30` 의 `if (installing)`.

**(a)** `import { createElement } from "react"` 후 `return createElement.call(null, "div", { role: "alert" }, "install failed")` → 표면 1곳(기준선), **EXIT=0**.

**대조.** `return createElement("div", { role: "alert" }, "install failed")` → 표면 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:31`, **EXIT=1**.

막다른 오류 화면이, 같은 함수를 `.call` 로 부르면 알림으로도 안 셉니다. 바인딩은 `{ imported: "createElement", via: "call", argShift: 1, argsUnknown: false }` 로 **인자를 알고 있습니다.** 호출자가 자리를 안 밀 뿐입니다.

```
# (a) return createElement.call(null, "div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0

# 대조 createElement("div", { role: "alert" }, "install failed")
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫혔다. `argShift` 를 버리던 자리가 없어졌다.
`elementCallShape(node, env)` 가 방식과 함께 `argShift`/`argsUnknown` 을 돌려주고,
`elementProps`·`elementChildren`·복구 게이트의 태그 읽기가 모두 그만큼 자리를
옮겨서 읽는다. `.apply` 처럼 자리를 믿을 수 없는 경우는 속성을 "없다" 가 아니라
`unknownSpread` 로 — 즉 **모른다** 로 — 돌려준다.

```
# (a) return createElement.call(null, "div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:32 — EXIT=1

# 대조 createElement("div", { role: "alert" }, "install failed")
# 같은 출력 — EXIT=1

# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

---

## 3. `scripts/check-recovery-affordance.mjs:195,197,269` — 화면 후보를 모을 때 `env` 를 안 넘긴다

같은 파일이 `isAlert`/`hasRecovery`/`tagNames` 에는 모듈 `env` 를 넘깁니다. `screenElements` 만 `isElementNode(node)` 와 `elementChildren(node)` 를 **인자 없이** 부릅니다. `bindings.mjs` 의 파일을 건너간 `const` 별명은 `env` 가 있어야 원래 모듈로 돌아갑니다. 안 넘기면 `{ module: "../lib/logger", imported: "ghostCreate" }` 로 끝나고, 그것은 `react` 의 `createElement` 가 아닙니다.

**(a)** `logger.ts` 에 `import { createElement } from "react"; export const ghostCreate = createElement;` 를 두고, `UpdateBanner` 가 그것을 import 한 뒤 `return ghostCreate("div", { role: "alert" }, "install failed")` → 표면 1곳, **EXIT=0**.

같은 모듈에 `env` 를 넘기면 `elementFactory` 는 `classic` 입니다. 게이트만 안 넘깁니다.

**(b)** `export { createElement as ghostCreate } from "react"` 재수출. `env` 를 넘겨도 `crossFile` 은 `const` 별명과 import 선언만 따라가고 `export { … } from` 은 보지 않습니다. 같은 화면, **EXIT=0**.

**대조.** 같은 파일 `createElement("div", { role: "alert" }, "install failed")` → **EXIT=1**.

11회차가 닫은 것은 `import { createElement as h } from "react"` 같은 **그 파일** 별명입니다. 한 파일만 건너가면 다시 열립니다.

```
# (a) logger.ts: export const ghostCreate = createElement;
#     UpdateBanner: return ghostCreate("div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0

# (b) export { createElement as ghostCreate } from "react"  — 같은 출력, EXIT=0

# 대조 같은 파일 createElement(...) — UpdateBanner.tsx:31 — EXIT=1
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

`check-dead-ui-specs.mjs:146,398` 의 `jsxElementsIn(tree, tree)` 도 셋째 인자 `env` 가 없습니다. 표지가 JSX 에 있으면 존재 판정은 살아 있고, 꺼짐을 `createElement` 별명에만 두면 열린 버튼으로 읽힙니다. 이번 주입의 본문은 복구 게이트입니다.

**상태 (2026-09-06):** 닫혔다. 두 갈래로 고쳤다.

첫째, **호출 규약을 강제**했다. `jsx-static.mjs` 의 요소 함수
(`elementFactory`·`elementCallShape`·`isCreateElementCall`·`isElementNode`·
`elementProps`·`elementChildren`·`jsxElementsIn`)는 `env` 없이 부르면 던진다.
파일을 건너가지 않겠다는 뜻이면 `null` 을 넘긴다 — 빠뜨린 것과 일부러 안 넘긴
것이 구별되지 않으면, 인자 하나를 잊은 게이트가 조용히 좁게 판정하고 그 사실이
아무 데도 남지 않는다. 복구 게이트와 dead-ui 게이트의 호출자를 전부 고쳤다.

둘째, **재수출을 따라간다**. `bindings.mjs` 가 `export const y = x`,
`export { x as y }`, `export { x as y } from "mod"`, `export * from "mod"` 를
모두 원래 모듈까지 이어 푼다(파일을 여러 겹 건너가도 같다).

```
# (a) logger.ts: export const ghostCreate = createElement;
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:32 — EXIT=1

# (b) logger.ts: export { createElement as ghostCreate } from "react";
# 같은 출력 — EXIT=1

# 대조 같은 파일 createElement(...) — EXIT=1
# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

---

## 4. `scripts/lib/rust-tokens.mjs:230-239` — `#[tauri::command]` 판정이 속성 **머리** 네 토큰이다

머리말은 글자 창을 버리고 토큰으로 옮겼으며, 보증하지 않는 것은 **소스에 그 토큰이 없는** 매크로 생성입니다. `#[cfg_attr(all(), tauri::command)]` 는 소스에 `tauri` `::` `command` 가 있습니다. 다만 `isTauriCommandAttribute` 가 `[` 바로 다음 네 토큰만 이어 `tauri::command` 인지만 묻습니다. 머리는 `cfg_attr(all(` 입니다.

`capture.rs` 에 파괴 본문 `remove_dir_all` 을 가진 명령을 두고, `db.ts` 에서 확인 없이 `invoke("ghost_wipe_everything")`.

**(a)** `#[cfg_attr(all(), tauri::command)]` → Rust 명령 **198개**(기준선, 199가 아님) / 파괴 후보 15 / 호출 14, **EXIT=0**.

**대조.** `#[tauri::command]` → 명령 199 / 후보 16 / 호출 15, `db.ts:29 — ghost_wipe_everything`, **EXIT=1**.

11회차 지적 7 과 같은 사고입니다. 창 길이 대신 속성 중첩이 명령을 목록에서 지웁니다. 목록에 없으면 프런트 `invoke("…")` 는 `commands.includes` 에서 건너뜁니다.

```
# (a) #[cfg_attr(all(), tauri::command)] fn ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# Rust 명령 198개 중 파괴 후보 15개 / 프런트 호출 14곳 — EXIT=0

# 대조 #[tauri::command]
# 명령 199 · 후보 16 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. `scripts/lib/rust-tokens.mjs` 의 `isTauriCommandAttribute` 가
속성 **머리** 네 토큰을 잇는 대신, `#[` 부터 짝이 맞는 `]` 까지 속성 토큰 열 전체를 훑어
`tauri` `::` `command` 연쇄가 어디든 있으면 명령 속성으로 본다(`isTauriCommandPath`). 중첩된
`cfg_attr` 도 같은 규칙으로 잡힌다. 명령을 부르는 `check-destructive-affordance.mjs` 는
건드리지 않았다.

문자열과 주석은 토크나이저가 이미 갈라 두므로 `#[doc = "#[tauri::command] …"]` 는 `string`
토큰 하나라서 연쇄를 이루지 못한다. 그물은 넓어지는 쪽으로만 틀린다 — 명령이 아닌 것을
명령으로 볼 수는 있어도 명령을 목록에서 빠뜨리지는 않는다. 이 게이트가 지키는 것이 "확인
없는 파괴 조작이 목록 밖으로 새지 않는다" 이므로 틀리는 방향은 이쪽이어야 한다.

**보증 밖으로 머리말에 적었다.** 소스에 토큰이 없는 둘이다 — 매크로가 **생성**하는
`#[tauri::command]`(`macro_rules!`·proc-macro 확장 결과에만 토큰이 있다)와 `include!` 로
다른 파일에서 끌어오는 소스(이 모듈은 넘겨받은 문자열 하나만 읽는다).

```
# 리뷰어가 심은 결함 그대로 (#[cfg_attr(all(), tauri::command)] + invoke("ghost_wipe_everything"))
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 199 · 후보 16 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 대조 #[tauri::command] — 같은 출력, EXIT=1

# 되돌린 뒤 — 명령 198 · 후보 15 · 호출 14 — EXIT=0, git diff 출력 없음
```

HEAD 의 옛 판정과 지금 판정을 같은 소스에 나란히 물어 차이를 직접 확인했다 — 옛 판정은
`[]`, 지금 판정은 `["ghost_wipe_everything"]` 이다. 계약 테스트
`src/test/rust-tokens.contract.test.ts` 에 세 항목을 더했다(8 → 11): `cfg_attr` 변형,
중첩 `cfg_attr`, 속성 안 문자열에 적힌 가짜 선언(명령 아님).

---

## 5. `scripts/lib/bindings.mjs:193-252` — 호출식의 callee 가 쉼표식이면 모른다

`unwrap` 은 괄호·단언만 벗깁니다. `(0, invoke)("memory_delete_fact")` 의 callee 는 쉼표 이항입니다. `resolveBinding` 은 식별자·멤버·`.bind` 만 보고 `null` 입니다. 파괴 게이트는 아직 자기 파일의 `invokeAliasOffset` 을 쓰지만 같은 구멍을 가집니다. `(0, f)()` 는 가져온 함수를 `this` 없이 부르는 JavaScript 의 흔한 호출입니다.

`db.ts` 의 `deleteAgentFact` 바로 아래.

**(a)** `return (0, invoke)("memory_delete_fact", { factId })` → 프런트 호출 14곳(기준선), **EXIT=0**.

**대조.** `return invoke("memory_delete_fact", { factId })` → 호출 15곳, `db.ts:29 — memory_delete_fact (감싼 함수 ghostWipeFact)`, **EXIT=1**.

같은 쉼표를 알림에 쓰면 복구 게이트도 못 봅니다. `return (0, createElement)("div", { role: "alert" }, "install failed")` → 표면 1곳, **EXIT=0**. 대조 `createElement(...)` 는 지적 2와 같음, **EXIT=1**.

머리말이 모른다고 적은 것은 재대입 `let`, 동적 `import`, 배열·객체·고차 함수가 돌려준 값입니다. 쉼표식은 그 목록에 없고, 부르는 값은 그대로 `invoke`/`createElement` 입니다.

```
# (a) return (0, invoke)("memory_delete_fact", { factId });
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 14곳 · 확인 없는 파괴적 동작 없음 — EXIT=0

# 대조 invoke("memory_delete_fact")
# 되돌릴 수 없는 동작 1곳 — db.ts:29 — EXIT=1

# (같은 쉼표) return (0, createElement)("div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0

# 되돌린 뒤 두 게이트 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫혔다. 껍데기를 벗기는 자리를 **하나로 합쳤다**.
`bindings.mjs` 의 `unwrap` 이 괄호·`as`/`satisfies`·`!`·타입 단언에 더해
**쉼표식의 마지막 항**(`CommaListExpression` 과 쉼표 이항식 둘 다)을 벗긴다.
그리고 파괴 게이트가 자기 `unwrapExpression` 을 버리고 이 함수를 쓴다 —
`resolveInvokeBinding` 은 없어졌고, 별명을 푸는 일반 규칙은 `invokeAliasOffset`
이 `bindings.mjs` 에게 물어 답한다. 두 게이트가 같은 규칙을 갖는다.

파괴 게이트에 남은 것은 공용 모듈이 보증 밖이라고 적어 둔 두 형태에 대한 이
게이트만의 보탬뿐이다(객체 리터럴 네임스페이스 `const ns = { invoke }`, 동적
`import` 구조분해 `const { invoke } = await import("…/core")`). 셸 코드에 실제로
있는 형태라 놓치면 호출부가 목록에서 사라지므로, 경계 밖이라고 적는 대신 좁게
받았고 그 이유를 `aliasFromDeclaration` 머리말에 적었다.

```
# (a) return (0, invoke)("memory_delete_fact", { factId });
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 15곳 · db.ts:29 — memory_delete_fact (감싼 함수 ghostWipeFact) — EXIT=1

# 대조 invoke("memory_delete_fact") — 같은 출력, EXIT=1

# (같은 쉼표) return (0, createElement)("div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1

# 되돌린 뒤 두 게이트 EXIT=0 (호출 14곳 / 자리 1곳), git diff 출력 없음
```

**후속 (2026-09-06):** 같은 파일에 남아 있던 약한 자리도 닫았다. 인자를 미리
먹인 `.bind` 를 옛 산술이 오프셋 0 으로 접어, 게이트가 **페이로드를 명령 이름으로
읽고** "그런 명령 없음" 으로 조용히 지나갔다. 이제 그 경우는
`bindings.mjs` 의 `argsUnknown` 과 같은 뜻인 "이름 자리 모름"(-1)으로 올라가
조립 호출 검사에 걸리고, 그 수가 보고 줄에도 드러난다. 지금 저장소에는 그런
호출이 **0곳**이라 기준선 14 는 그대로다.

```
# (a) const ghostBoundWipe = invoke.bind(null, "memory_delete_fact");
#     return ghostBoundWipe({ factId });
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# ❌ 명령 이름을 조립해 부르는 자리 1곳 — db.ts:31 — invoke(이름자리모름) — EXIT=1

# (b) 옛 산술이 조용히 흘려보내던 모양 return ghostBoundWipe("ghost_payload");
#     지금       — 같은 출력, EXIT=1
#     옛 산술로  — 프런트 호출 14곳 · 확인 없는 파괴적 동작 없음, EXIT=0  (실측)

# 되돌린 뒤 호출 14곳 / 이름 자리를 못 읽은 호출 0곳 — EXIT=0, git diff 출력 없음
```

---

## 6. `scripts/build-e2e-inventory.mjs:346-353` — 바깥 `fetch` 는 **이름** `fetch`/`request` 다

11회차는 인자를 `stringCandidates` 로 풀었습니다. 호출부가 fetch 인지는 여전히 식별자 글자 또는 속성 이름이 `"fetch"`/`"request"` 인지로 봅니다. `const ghostGet = fetch; ghostGet("https://…")` 의 이름은 `ghostGet` 입니다. `fetch.call(null, "https://…")` 의 이름은 `call` 입니다.

결정론 칸 스펙 `packages/shell/e2e-tauri/specs/100-herdr-first-frame.spec.ts`.

**(a)** `const ghostGet = fetch; await ghostGet("https://ghost-llm.example:9999/ghost-complete")` → `node scripts/build-e2e-inventory.mjs --check` **EXIT=0** (저장된 목록과 다시 계산한 분류가 같다 — 그 스펙은 계속 `deterministic_ci`).

**대조.** `await fetch("https://ghost-llm.example:9999/ghost-complete")` → `--check` **EXIT=1** (지금 스펙과 어긋난다).

`--check` 머리말은 분류의 옳고 그름을 보증하지 않습니다. 이 지적은 그 문장이 아니라, 분류를 진다고 적은 자국 규칙 `outboundAddresses` 입니다. 10·11회차가 닫은 것은 **주소 인자**를 변수에 담는 것이었고, **fetch 바인딩**은 이름입니다.

```
# (a) const ghostGet = fetch; await ghostGet("https://ghost-llm.example:9999/ghost-complete");
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ✓ 지금 스펙과 일치한다 — EXIT=0

# 대조 await fetch("https://ghost-llm.example:9999/ghost-complete")
# ❌ 지금 스펙과 어긋난다 — EXIT=1

# 되돌린 뒤 --check EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫혔다. `bindings.mjs` 에 **전역 바인딩**을 더했다.
이 파일 어디에도 선언이 없는 자유 식별자(`fetch`), 전역 뿌리의 멤버
(`globalThis.fetch`, `window["fetch"]`), 그리고 그것으로 만든 const 별명·구조분해
(`const get = fetch`, `const { fetch: f } = globalThis`)가 모두 `{ global: "fetch" }`
로 돌아온다. `outboundAddresses` 는 이름이 아니라 이 해석으로 호출부를 고르고,
`.call` 처럼 자리가 밀리면 `argShift` 만큼 옮겨 주소를 읽으며, `.apply` 처럼
자리를 믿을 수 없으면 못 푼 인자로 센다. 옛 이름 판정은 그대로 남겼다 —
`page.request.get(…)` 처럼 바인딩으로는 안 풀리지만 이름으로는 드러나는 자리가
있고, 둘 중 하나라도 걸리면 본다.

```
# (a) const ghostGet = fetch; await ghostGet("https://ghost-llm.example:9999/…");
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ❌ 지금 스펙과 어긋난다 — EXIT=1

# (b) const { fetch: ghostGet } = globalThis; await ghostGet("https://…");   — EXIT=1
# (c) await fetch.call(null, "https://…");                                   — EXIT=1
# 대조 await fetch("https://…")                                              — EXIT=1

# 되돌린 뒤 ✓ 지금 스펙과 일치한다 (119개) — EXIT=0, git diff 출력 없음
```

---

## 7. `scripts/check-silent-clicks.mjs:277-284` — 클릭은 `E.click(...)` **속성 접근**만 클릭이다

11회차는 단위를 보호되는 식 E 로 옮기고 `void`·`await`·괄호를 벗겼습니다. `clickReceiver` 는 여전히 `PropertyAccessExpression` 이고 이름이 `"click"` 일 때만 클릭입니다. `E["click"]()` 은 같은 메서드이고, `E.click.call(E)` 은 같은 호출입니다. 파괴 게이트는 11회차에 `.call` 을 닫았습니다. 무음 클릭은 그 수리를 받지 않았습니다.

`01-app-launch.spec.ts` 마지막 단언 뒤. 기준선 107.

**(a)** `if (ghostEl) ghostEl["click"]()` → 107, **EXIT=0**.

**(b)** `if (ghostEl) ghostEl.click.call(ghostEl)` → 107, **EXIT=0**.

**대조.** `if (ghostEl) ghostEl.click()` → 108 > 107, `01-app-launch.spec.ts` 가 파일별 집계에 나타남, **EXIT=1**.

```
# (a) if (ghostEl) ghostEl["click"]();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 조용히 넘어가는 클릭 107 (baseline 107) — EXIT=0

# (b) if (ghostEl) ghostEl.click.call(ghostEl);
# 같은 출력, EXIT=0

# 대조 if (ghostEl) ghostEl.click();
# 늘었다(108 > 107) — 01-app-launch.spec.ts 1 — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫혔다. 클릭 판정을 형태 열거에서 **E 에 대한 `click`
멤버 호출**로 옮겼다. `E.click(...)`, `E?.click(...)`, `E["click"](...)`(리터럴 키),
`E.click.call(E, …)`/`.apply(E, …)`(받는 쪽이 같은 식일 때)가 모두 같은 하나로
읽힌다. `isOptionalClick` 도 같은 멤버 규칙을 쓴다. 동적 키 `E[name]()` 과 받는
쪽이 다른 `E.click.call(other)` 는 보증 밖이며, 그 목록을 머리말에 절로 적었다.

```
# (a) if (!ghostEl) return; ghostEl["click"]();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1

# (b) ghostEl.click.call(ghostEl);        — 108 — EXIT=1
# (c) ghostEl["click"].apply(ghostEl, []); — 108 — EXIT=1
# 대조 ghostEl.click();                    — 108 — EXIT=1

# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```

---

## 8. `scripts/check-data-home-boundary.mjs:364` — 이름표는 `=> "리터럴"` **정규식**이다

머리말은 자리를 늘리려면 `DataHomeChild` 에 변형을 더해야 하고, 그러면 이름표가 늘어나 `KNOWN`·문서와 어긋나 붉어진다고 합니다. 경로 조립은 토크나이저로 옮겼지만, 이름표 목록은 여전히 `DataHomeChild::\w+\s*=>\s*"([^"]+)"` 입니다. 갈래 본문이 중괄호면 이름표가 늘지 않습니다.

`data_home.rs` 에 `GhostCache` 변형을 더하고 `ALL_CHILDREN` 를 15로 늘린 뒤, `name()` 에

```rust
DataHomeChild::GhostCache => {
    "ghost-cache"
}
```

**(a)** 이름표 **14개**(기준선), 공개 항목 16, **EXIT=0**. `child(DataHomeChild::GhostCache)` 는 `~/.naia/ghost-cache` 를 만듭니다.

**대조.** 같은 갈래를 `DataHomeChild::GhostCache => "ghost-cache"` 한 줄로 → 이름표 15, `이름표에는 있고 사유가 없다: ghost-cache`, **EXIT=1**.

10회차가 닫은 200자 창과 같은 측정 지점입니다. 형태를 하나 바꾸면 이름표가 늘었다는 사실이 사라집니다.

```
# (a) DataHomeChild::GhostCache => { "ghost-cache" }
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 이름표 14개 · 공개 항목 16개 — EXIT=0

# 대조 => "ghost-cache"
# 이름표 15개 — ❌ 이름표에는 있고 사유가 없다: ghost-cache — EXIT=1

# 되돌린 뒤 이름표 14 — EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. `scripts/check-data-home-boundary.mjs` 의 `funnelNames` 에서
`DataHomeChild::\w+\s*=>\s*"([^"]+)"` 정규식을 버리고 `rust-tokens.mjs` 토큰으로 `match`
갈래를 읽는다. 갈래 머리는 `Self::Variant` 또는 `DataHomeChild::Variant` 이고, `=>` 뒤에서
중괄호와 괄호를 벗긴 첫 토큰을 이름표로 삼는다. 갈래 본문이 중괄호면 통째로 건너뛰어 본문
안의 `Self::` 를 다음 갈래로 잘못 읽지 않는다.

그 자리가 문자열 리터럴이 아니면(상수 이름, `concat!`, 함수 호출) 통과가 아니라 **실패**다.
모르는 것을 통과로 세면 아래 대조가 전부 헛돈다. 더해서 `ALL_CHILDREN` 의 변형 수,
`name()` 의 갈래 수, `docs/storage-locations.md` 표의 행 수가 셋 다 같은지 따로 센다 — 자리를
하나 늘리면서 셋 중 하나만 늘리는 것도 그 자리에서 걸린다.

```
# 리뷰어가 심은 결함 그대로 (GhostCache 변형 + ALL_CHILDREN 15 + `=> { "ghost-cache" }`)
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 이름표 15개 — ❌ 이름표에는 있고 사유가 없다: ghost-cache
# ❌ 문서의 자리 표가 이름표와 다르다 / ❌ 변형 15 · 갈래 15 · 문서 14 — EXIT=1

# 같은 갈래를 상수로 (`=> GHOST_CACHE_NAME`)
# ❌ 이름표를 읽을 수 없는 갈래가 있다(1) — data_home.rs:134 — GhostCache — EXIT=1

# 대조 한 줄 `=> "ghost-cache"` — 같은 세 줄, EXIT=1

# 되돌린 뒤 — 이름표 14 · 변형 14 · 갈래 14 · 문서 14행 — EXIT=0, git diff 출력 없음
```

---

## 9. `src/test/credentialed-adk-seed.contract.test.ts:204-220` — 시딩 배선이 **파일 안 어딘가의** `CallExpression` 이다

11회차는 주석 정규식을 파서 호출 노드로 바꿨습니다. `callsBinding` 은 그 이름의 식별자를 부르는 호출이 **파일 전체**에 있는지만 봅니다. 기본 설정의 `onPrepare` 인지는 묻지 않습니다. 머리말이 막겠다는 사고는 "시딩 함수만 남고 설정이 부르지 않으면 계약은 초록인데 회귀는 여전히 fetch failed 로 죽는다" 입니다.

`packages/shell/e2e-tauri/wdio.conf.ts`. `onPrepare` 의 `seedCredentialedAdk(...)` 를 지우고, 모듈 스코프에 안 쓰는 함수만 남김.

```ts
function unusedGhostSeed() {
  return seedCredentialedAdk(SEEDED_ADK_PATH, credentialedSeedOptionsFromEnv());
}
```

**(a)** `npx vitest run src/test/credentialed-adk-seed.contract.test.ts` → 5 passed, **EXIT=0**. `onPrepare` 에는 살아 있는 시딩 호출이 없습니다.

**대조.** 그 안 쓰는 함수까지 지움 → `import 만 하고 부르지 않으면 격리 워크스페이스는 비어 있다`, 1 failed / 4 passed, **EXIT=1**.

주석을 닫은 다음 구멍이, 호출을 설정이 타지 않는 함수로 옮기는 것입니다.

```
# (a) onPrepare 호출을 지우고 unusedGhostSeed() 에만 남김
npx vitest run src/test/credentialed-adk-seed.contract.test.ts; echo EXIT=$?
# Tests 5 passed — EXIT=0

# 대조: 그 함수까지 제거
# ✗ 기본 설정이 그 시딩에 실제로 배선돼 있다
#   "import 만 하고 부르지 않으면 …" expected false to be true
# 1 failed | 4 passed — EXIT=1

# 되돌린 뒤 5 passed — EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. `src/test/credentialed-adk-seed.contract.test.ts` 가 파일
전체가 아니라 **기본 설정이 실행하는 자리**에서 잰다. `export const config = {…}` 의
`onPrepare` 속성을 파서로 찾고(메서드·함수식·화살표·같은 파일 함수 참조를 모두 푼다), 그
몸통에서 시작해 같은 파일의 함수 선언과 `const` 초기화식을 한 단계씩 따라가는 고정점으로
도달 가능한 몸통을 모은다. `seedCredentialedAdk` 와 `credentialedSeedAvailable` 호출은 그
집합 안에 있어야 참이다. 아무도 부르지 않는 함수는 그 집합에 없다.

워커에게 넘기는 표시도 같은 방식으로 잰다 — `process.env.NAIA_E2E_CREDENTIALED_SEED` 를 읽는
노드가 `config.before` 에서 도달해야 한다. 지금 배선에서는 `before` 가
`CREDENTIALED_SEED_ACTIVE` 를 보고, 그 `const` 의 초기화식이 그 환경 변수를 읽으므로
도달한다.

```
# 리뷰어가 심은 결함 그대로 (onPrepare 호출 삭제 + 안 쓰는 unusedGhostSeed 안에만 호출)
npx vitest run src/test/credentialed-adk-seed.contract.test.ts; echo EXIT=$?
# ✗ 기본 설정이 그 시딩에 실제로 배선돼 있다
#   "import 만 하고 부르지 않으면 …" expected false to be true
# 1 failed | 4 passed — EXIT=1

# 대조 그 함수까지 제거 — 1 failed | 4 passed — EXIT=1

# before 쪽 대조: before 의 `if (CREDENTIALED_SEED_ACTIVE)` 를 다른 표시로 바꿈
#   (파일에는 NAIA_E2E_CREDENTIALED_SEED 가 그대로 있다 — 옛 파일 전체 검사라면 참이었다)
# ✗ "워커에게 넘기는 표시가 없으면 스펙은 키 없이 돈다" expected false to be true — EXIT=1

# 되돌린 뒤 5 passed — EXIT=0, git diff 출력 없음
```

---

머리말이 보증하지 않는다고 적어 둔 자리(동적 `import`/`require`, 배열·객체로 흘러간 함수, 고차 함수가 돌려준 함수, 문자를 조립해 `.naia` 를 만드는 위조, `--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장 자체)는 지적 번호에서 뺐습니다. 6번은 그 `--check` 가 아니라 분류를 진다고 적은 `outboundAddresses` 를 겨냥합니다. `#[cfg_attr]` 는 매크로가 소스에 없는 토큰을 만들어 내는 경우가 아닙니다 — `tauri::command` 토큰이 속성 안에 있습니다.

최종 `git status --porcelain` 은 비어 있고, 위 게이트는 되돌린 뒤 모두 `EXIT=0` 입니다.

**NOT CLEAN**
