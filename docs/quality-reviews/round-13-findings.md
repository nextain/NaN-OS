# 13회차 교차 리뷰 지적 (2026-09-06, 스냅숏 b7f94b58)

판정: **NOT CLEAN**, 지적 7건. 아래는 리뷰어 원문이다.

---

13회차 적대적 교차 리뷰를 시작합니다. 먼저 프로세스 현황과 지난 회차에서 닫힌 지적, 게이트 머리말의 위협 경계를 읽고 실제 통과 구멍을 찾겠습니다.지난 회차 닫힘 기록과 게이트 머리말·공용 모듈을 먼저 대조합니다.공용 모듈 나머지와 게이트 호출 규약을 이어서 읽고, 머리말이 막겠다고 적은 사고와 실제 판정 범위를 대조합니다.게이트 호출부와 시딩 계약·인벤토리 분류를 대조해, 공용 모듈이 아는 값을 호출자가 버리는 자리가 있는지 보겠습니다.가설을 모듈에 직접 물은 뒤, 통과하면 게이트에 심어 실증하겠습니다.기준선은 전부 `EXIT=0`입니다. 이제 가설을 하나씩 심고 게이트를 돌리겠습니다.기준 HEAD는 `cf1f875`입니다. 6~12회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 공용 모듈의 **범위 조건**과 게이트가 그 모듈을 **부르는 규약**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

---

# 판정: **NOT CLEAN** — 실증된 지적 7건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `jsx-static.mjs:114-135` `unwrapAll` / `check-silent-clicks.mjs:133-143` | `(0, true)` · `(0, <alert/>)` · `(0, el.click())` 은 같은 값인데 껍데기로 남는다 |
| 2 | `jsx-static.mjs:1013-1015` `alwaysTruthy` | `null ?? true` 는 영구 참이 아니다. `true` 는 참이다 |
| 3 | `bindings.mjs:325` `crossFile` | `export default createElement` 로 건너간 호출은 요소가 아니다 |
| 4 | `bindings.mjs:64,413` `MAX_DEPTH` | const 별명 일곱 겹이면 부르는 값을 모른다 |
| 5 | `rust-tokens.mjs:240,307` | 속성 65개, 또는 `const fn` 이면 명령이 목록에서 사라진다 |
| 6 | `check-silent-clicks.mjs:452-462` | `E ? E.click() : undefined` 는 `E && E.click()` 과 같은 무음인데 세지 않는다 |
| 7 | `credentialed-adk-seed.contract.test.ts:264-305` | 이름만 적고 부르지 않아도 시딩 배선이다 |

---

## 1. `scripts/lib/jsx-static.mjs:114-135` — 쉼표식은 껍데기가 아니다

12회차는 `(0, invoke)("cmd")` 를 닫으며 **callee** 의 쉼표를 `bindings.mjs` 의 `unwrap` 하나로 모았습니다. 값 쪽 껍데기는 `jsx-static` 의 `unwrapAll` 과 무음 클릭의 지역 `unwrap` 이 따로 있고, 둘 다 괄호·`as`·`!` 만 벗깁니다. `(0, true)` 의 값은 `true` 이고, `(0, <div role="alert"/>)` 의 값은 그 알림이며, `(0, el.click())` 은 `el.click()` 입니다.

`SettingsTab.tsx` 연결 탭 뒤에 버튼을 두고, 스펙 `01-app-launch.spec.ts` 가 `[data-testid='ghost-wake-panel']` 을 기다림. `UpdateBanner.tsx:30` 의 `if (installing)`. `01-app-launch.spec.ts` 마지막 단언 뒤. 무음 기준선 107.

**(a)** `disabled={(0, true)}` → 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**.

**대조.** `disabled={true}` → `01-app-launch.spec.ts:51 — ghost-wake-panel`, **EXIT=1**.

**(b)** `return (0, (<div role="alert">install failed</div>))` → 표면 1곳, **EXIT=0**.

**대조.** `return (<div role="alert">install failed</div>)` → 표면 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:32`, **EXIT=1**.

**(c)** `if (ghostEl) (0, ghostEl.click())` → 107, **EXIT=0**.

**대조.** `if (ghostEl) ghostEl.click()` → 108 > 107, `01-app-launch.spec.ts` 가 파일별 집계에 나타남, **EXIT=1**.

머리말이 모른다고 적은 것은 동적 키·`eval`·고차 함수입니다. 쉼표식의 값은 마지막 항이고, 12회차가 그 사실을 callee 에만 적용한 자리입니다.

```
# (a) SettingsTab.tsx 에 disabled={(0, true)}, 스펙이 ghost-wake-panel 대기
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 0 — EXIT=0
# 대조 disabled={true} — 01-app-launch.spec.ts:51 — ghost-wake-panel — EXIT=1

# (b) return (0, (<div role="alert">install failed</div>))
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0
# 대조 쉼표 없이 — UpdateBanner.tsx:32 — EXIT=1

# (c) if (ghostEl) (0, ghostEl.click())
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0
# 대조 if (ghostEl) ghostEl.click() — 108 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 껍데기를 벗기는 자리를 저장소에 **한 벌**로 모았다
— 새 모듈 `scripts/lib/unwrap.mjs` 의 `unwrapExpression` 이 괄호·`as`/`satisfies`·
non-null·타입 단언·**쉼표식의 마지막 항**을 벗기고, `bindings.mjs` 의 `unwrap`,
`jsx-static.mjs` 의 `unwrapAll`, 무음 클릭 게이트의 지역 `unwrap` 셋이 모두 그
위에 얹힌다. 각 자리에 남은 것은 자기 것뿐이다(JSX 식 컨테이너, `await`).
값을 **바꾸는** 것(`await`·`void`·`!`)은 껍데기가 아니므로 공용 모듈이 벗기지
않는다.

겹의 수도 세지 않는다. 예전에는 여덟·열여섯 번만 돌았는데, 그런 숫자는 "몇 겹을
더 씌우면 통과하는가" 를 알려 주는 눈금이다. 구문 나무는 유한하고 껍데기는
언제나 자식 하나로 내려가므로 반복은 반드시 끝난다.

계약 테스트에 **세 모듈 소스에 자기 껍데기 벗기기가 없다**(`isParenthesizedExpression`
같은 술어를 직접 보지 않고 `unwrap.mjs` 를 쓴다)를 고정했다. 다음 회차에 한쪽만
고쳐진 자리가 생기면 그 테스트가 먼저 붉어진다.

```
# (a) disabled={(0, true)}  (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
# 대조 disabled={true} — EXIT=1

# (b) return (0, (<div role="alert">install failed</div>))
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx — EXIT=1
# 대조 쉼표 없이 — EXIT=1

# (c) if (ghostEl) (0, ghostEl.click())
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1
# 대조 if (ghostEl) ghostEl.click() — 108 — EXIT=1

# 되돌린 뒤 세 게이트 EXIT=0 (175 / 자리 1곳·0 / 107), git diff 출력 없음
```

---

## 2. `scripts/lib/jsx-static.mjs:1013-1015` — `??` 는 왼쪽만 본다

`alwaysTruthy` 는 `false ?? true` 가 거짓이 되도록 왼쪽만 접습니다. `null ?? true` 와 `undefined ?? true` 는 JavaScript 에서 `true` 이고, React 에서 `disabled={null ?? true}` 는 누를 수 없는 버튼입니다. `alwaysTruthy(null ?? true) === false` 를 모듈에 직접 물었습니다.

같은 버튼·같은 스펙.

**(a)** `disabled={null ?? true}` → 이름 176개, 꺼 둔 조작 6곳, **EXIT=0**.

**대조.** `disabled={true}` → `01-app-launch.spec.ts:51 — ghost-wake-panel`, **EXIT=1**.

계약 테스트는 `false ?? true` 만 못 박고 `null ?? true` 는 없습니다. `||` 와 같게 다루지 말라는 반증이, 왼쪽이 널인 갈래를 닫지는 않습니다.

```
# (a) disabled={null ?? true}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 이름 176개 / 꺼 둔 조작 6곳 — EXIT=0

# 대조 disabled={true} — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. `??` 가 고르는 기준은 참·거짓이 아니라 **널인가**
이므로, 이제 왼쪽이 널인지부터 묻는다. 왼쪽이 정적으로 널이면(리터럴 `null`·
`undefined`, 또는 그것으로 접히는 `const`) 오른쪽만, 정적으로 널이 아니면
(불리언·수·문자열·객체·배열·함수·JSX 리터럴, 또는 그것으로 접히는 `const`)
왼쪽만 본다. 널인지 **모르면** 둘 다 언제나 참일 때만 참이다 — 모른다를
"널이 아니다" 로 접으면 `x ?? true` 가 영구 참으로 읽힌다. `alwaysFalsy` 도
대칭으로 같은 규칙을 갖는다.

```
# (a) disabled={null ?? true}   (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# 반증(왼쪽이 널인지 모르는 자리) disabled={naiaVrms.length > 0 ?? true}
# [dead-ui] 스펙이 집는 이름 176개 — EXIT=0

# 대조 disabled={true} — EXIT=1
# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음

# 모듈에 직접 물으면
#   null ?? true → 참 · undefined ?? true → 참 · false ?? true → 거짓
#   x ?? true → 거짓(모른다) · !(null ?? false) → 참
```

---

## 3. `scripts/lib/bindings.mjs:325` — 파일을 건너갈 때 `default` 는 따라가지 않는다

12회차는 `export const y = x` 와 `export { x as y } from "mod"` 와 `export * from "mod"` 를 원래 모듈까지 잇는다고 적었습니다. `crossFile` 은 그 앞에서 `hit.imported === "*" || hit.imported === "default"` 이면 `null` 을 돌려, default import 는 그 파일에서 멈춥니다. `export default createElement` 는 정적 재수출이고 보증 밖 목록(동적 `import`, 고차 함수, 배열·객체)에 없습니다.

`logger.ts` 에 `import { createElement } from "react"; export default createElement;` 를 두고, `UpdateBanner` 가 `import ghostCreate from "../lib/logger"` 한 뒤 `return ghostCreate("div", { role: "alert" }, "install failed")`.

**(a)** default 재수출 → 표면 1곳, **EXIT=0**. 모듈에 물으면 `{ module: "../lib/logger", imported: "default" }`, `isCreateElementCall === false`.

**대조.** `export const ghostCreate = createElement` + named import → 표면 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:32`, **EXIT=1**. 12회차가 닫은 바로 그 형태입니다.

같은 `crossFile` 가드 때문에 `import * as R from "./shim"` (`export * from "react"`) 의 `R.createElement(...)` 도 `{ module: "./shim", imported: "createElement" }` 로 끝나고 요소가 아닙니다. named `import { createElement } from "./shim"` 은 `via: "reexport"` 로 react 까지 갑니다. 네임스페이스만 한 겹 다르면 갈립니다.

```
# (a) logger.ts: export default createElement;
#     UpdateBanner: import ghostCreate from "../lib/logger"; return ghostCreate("div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0

# 대조 export const ghostCreate = createElement (named import)
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:32 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. `crossFile` 의 `default` 가드를 걷어 내고,
`default` 를 **이름 하나로** 다뤘다. `export default createElement`(이름 없는
`ExportAssignment`), `export { createElement as default }`,
`export { x as default } from "mod"` 를 모두 원래 모듈까지 잇는다.

리뷰어가 같은 문단에서 지적한 네임스페이스 한 겹도 함께 닫았다 —
`import * as R from "./shim"` 의 `R.createElement` 는 이제 shim 이 재수출한
react 의 것으로 풀린다(저장소 안 파일로 풀리는 모듈일 때만이다. `react` 자신처럼
파일이 아닌 모듈은 그 모듈의 export 로 남긴다 — 그 너머를 지어내면 남의 모듈을
안다고 말하는 것이다).

```
# (a) logger.ts: export default createElement;
#     UpdateBanner: import ghostCreate from "../lib/logger";
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx — EXIT=1

# (b) logger.ts: export { createElement as default };  — 같은 출력, EXIT=1
# 대조 export const ghostCreate = createElement (named import) — EXIT=1

# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

---

## 4. `scripts/lib/bindings.mjs:64,413` — const 별명은 여섯 겹까지다

머리말은 같은 파일 const 별명을 따라간다고 하고, 깊이를 세는 자리는 없다고 합니다. `resolveBinding` 은 `depth > MAX_DEPTH`(6) 이면 `null` 입니다. 일곱 번째 별명에서 부르는 값은 그대로 `createElement` 인데 요소가 아닙니다. 여섯 겹은 요소입니다. 200자 창·64개 속성과 같은 **세는 자리**입니다.

`UpdateBanner.tsx:30` 의 `if (installing)`. `import { createElement, useState } from "react"` 후

```ts
const a = createElement;
const b = a; const c = b; const d = c; const e = d; const f = e; const g = f;
return g("div", { role: "alert" }, "install failed");
```

**(a)** 일곱 겹 `g(...)` → 표면 1곳, **EXIT=0**.

**대조.** `return f(...)` (여섯 겹) → 표면 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:37`, **EXIT=1**.

깊이 한도에 닿으면 "모른다"가 아니라 **요소가 아니다** 로 접혀, 막다른 오류 화면이 초록 안에 숨습니다.

```
# (a) a..g 일곱 겹, return g("div", { role: "alert" }, "install failed")
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0

# 대조 return f(...) 여섯 겹 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. `MAX_DEPTH` 를 없앴다. 이제 끝나는 이유는 깊이를
세는 것이 아니라 **같은 자리에 두 번 가지 않는 것**이다 — 이름을 풀 때마다
(파일, 이름)을 방문 집합에 적고, 두 번째로 닿으면 모른다로 답한다. 그래서 겹은
몇이든 따라가고, `const a = b; const b = a;` 같은 순환은 끊긴다. 파일을 건너가는
재수출 순환도 같은 집합이 끊는다.

`resolveBinding` 의 넷째 인자는 이제 숫자가 아니라 그 집합이다. 숫자를 넘기던
호출자는 그대로 두어도 새 집합으로 시작한다.

```
# (a) a..g 일곱 겹, return g("div", { role: "alert" }, "install failed")
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1

# 열두 겹도 같다 — EXIT=1
# 순환 별명(const p = q; const q = p;) — 멈추고 EXIT=0 (모른다)
# 대조 여섯 겹 — EXIT=1

# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

**후속 (2026-09-06):** 같은 눈금이 `jsx-static.mjs` 에도 다섯 자리 있었다.
리뷰어는 이번에 그쪽으로 넣지 않았지만 같은 결함 유형이라 함께 닫았다 —
`constValue`·`constOnlyValue`(파일을 건너뛴 횟수 넷), `constAccessValue`(속성
사슬 다섯), `typeStrings`(타입 별칭 다섯), `elementProps` 의 spread 네 겹이다.
전부 방문 집합으로 바꿨다. 이름은 (파일, 이름)으로, 값과 타입은 그 노드
자신으로 적고, 갈래가 갈리는 자리(유니언 형제)는 자국을 따로 든다 — 순환은
한 갈래 안에서 되돌아오는 것이지, 형제가 같은 별칭을 쓰는 것이 아니다.

이제 이 세 모듈(`jsx-static.mjs`·`bindings.mjs`·`unwrap.mjs`) 소스에 깊이
상수가 하나도 없고, 계약 테스트가 그것을 고정한다(`/depth\s*[><]=?\s*\d/`
불일치, `MAX_DEPTH` 없음).

```
# (a) spread 여섯 겹 뒤의 disabled: true  (+ 스펙이 그 표지를 기다림)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
#    HEAD 모듈에 직접 물으면 그 속성이 아예 안 읽힌다(열린 버튼 = 거짓 초록)

# (b) data-testid 를 열 겹 const 사슬로 두고 스펙이 기다림
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 0 — EXIT=0
# 대조(그 이름을 아무도 안 만든다) — 셸 소스에 없는 것 1 — EXIT=1

# (c) 진짜 눈금은 파일 건너뛴 횟수였다. 모듈에 직접 물으면
#     HEAD  파일 8 겹 건너간 표지 = []                 complete=false
#     지금  파일 8 겹 건너간 표지 = ["deep-cross-mark"] complete=true

# 순환 const·순환 spread 는 멈추고 모른다로 답한다(계약 테스트).
# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음
```

---

## 5. `scripts/lib/rust-tokens.mjs:240,307` — 속성과 `fn` 사이를 다시 센다

머리말은 글자 창을 버렸고, "속성이 몇 개든, `pub(crate) async unsafe fn` 이든 토큰으로 건너뛴 뒤 `fn <이름>` 을 읽는다" 고 합니다. `tauriCommandBodies` 는 명령 속성 뒤에서 속성·`pub`·수식어를 **64번**만 건너뛰고, 수식어 집합은 `async`·`unsafe`·`extern`·`default` 뿐입니다. `const` 는 없습니다.

목록에 없으면 프런트 `invoke("…")` 는 `commands.includes` 에서 건너뜁니다. 11회차 지적 7·12회차 지적 4 와 같은 사고입니다.

`capture.rs` 끝에 파괴 본문 `remove_dir_all` 을 가진 명령을 두고, `db.ts` 에서 확인 없이 `invoke("ghost_wipe_everything")`.

**(a)** `#[tauri::command]` 와 `fn` 사이에 `#[allow(dead_code)]` 65개 → Rust 명령 **198개**(기준선, 199가 아님) / 파괴 후보 15 / 호출 14, **EXIT=0**. 모듈에 물으면 65개는 `[]`, 64개는 `["ghost_wipe_everything"]`.

**(b)** `#[tauri::command] const fn ghost_wipe_everything() { … }` → 명령 198, **EXIT=0**.

**대조.** 추가 속성 없이 `#[tauri::command] fn ghost_wipe_everything` → 명령 199 / 후보 16 / 호출 15, `db.ts:29 — ghost_wipe_everything`, **EXIT=1**. `const` 만 떼도 같습니다.

```
# (a) #[tauri::command] + #[allow(dead_code)] ×65 + fn ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 198 · 후보 15 · 호출 14 — EXIT=0

# (b) #[tauri::command] const fn ghost_wipe_everything
# 같은 출력 — EXIT=0

# 대조 속성 0개 / 그냥 fn
# 명령 199 · 후보 16 · 호출 15 — db.ts:29 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `scripts/lib/rust-tokens.mjs` 의 `tauriCommandBodies` 에서
세는 자리 둘을 없앴다. 건너뛰기의 **64회** 한계를 지웠고 — 토큰 열은 유한하고 모든 갈래가
`j` 를 앞으로만 옮기므로 반드시 끝난다 — 수식어를 목록으로 **허용**하던 것을
`ITEM_STARTERS` 로 **멈추는** 구조로 뒤집었다.

이제 `fn` 에 닿을 때까지 속성 그룹(`#[…]` 짝)과 가시성 괄호(`pub(crate)`,
`pub(in crate::a)`)를 짝으로 건너뛰고, ABI 문자열(`extern "C"`)을 지나며, 그 밖의 낱말은
모두 수식어로 본다. `struct`·`enum`·`impl`·`mod`·`use`·`static`·`type`·`trait`·`union`·
`macro_rules`·`let` 이나 `;`·`{`·`}` 가 먼저 나오면 함수 선언이 아니다. 언어가 수식어를
하나 더 늘려도 명령이 목록에서 사라지지 않고, `#[tauri::command] struct X;` 는 명령이
아니다.

```
# (a) #[tauri::command] + #[allow(dead_code)] ×65 + fn ghost_wipe_everything + invoke(...)
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 199 · 후보 16 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# (b) #[tauri::command] const fn ghost_wipe_everything — 같은 출력 — EXIT=1

# 대조 속성 0개 / 그냥 fn — 같은 출력 — EXIT=1

# 되돌린 뒤 — 명령 198 · 후보 15 · 호출 14 — EXIT=0, git diff 출력 없음
```

두 게이트 기준선은 그대로다 — 파괴 조작 198·15·14, 데이터 홈 이름표 14(변형 14 · 갈래 14 ·
문서 14행). 계약 테스트 `src/test/rust-tokens.contract.test.ts` 에 세 항목을 더했다
(11 → 14): 속성 100개, `const fn` 과 `pub(in crate::a) const unsafe extern "C" fn` 을 비롯한
수식어 전부, 그리고 반증으로 `#[tauri::command] struct X;` · `enum` · 속성 뒤 `;`(뒤따르는
`remove_dir_all` 함수를 명령으로 삼지 않는다).

---

## 6. `scripts/check-silent-clicks.mjs:452-462` — 있음 가드는 `if` 와 `&&` 뿐이다

11회차는 단위를 보호되는 식 E 로 옮겼고, 12회차는 클릭 멤버 형태를 닫았습니다. 가드는 여전히 `if (E) E.click()`, `if (!E) return; E.click()`, `E && E.click()`, `E?.click()` 입니다. `E ? E.click() : undefined` 는 같은 무음입니다. `&&` 는 세고 삼항은 세지 않습니다 — 12회차 지적 1 이 `alwaysTruthy` 에서 닫은 바로 그 비대칭입니다.

`01-app-launch.spec.ts` 마지막 단언 뒤. 기준선 107.

**(a)** `ghostEl ? ghostEl.click() : undefined` → 107, **EXIT=0**.

**대조.** `ghostEl && ghostEl.click()` → 108, `01-app-launch.spec.ts` 1, **EXIT=1**.

```
# (a) ghostEl ? ghostEl.click() : undefined
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0

# 대조 ghostEl && ghostEl.click()
# 늘었다(108 > 107) — 01-app-launch.spec.ts 1 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 있음 가드에 삼항을 더해 `&&` 와 같게 읽는다.
조건이 있음(또는 없음) 검사이고, 도는 갈래가 그 식을 누르고, 다른 갈래가 값을
남기지 않으면(`undefined`·`null`·`void …`) 그것은 같은 무음이다. 방향을 뒤집은
`!E ? undefined : E.click()` 도 같다.

값을 **돌려주는** 갈래는 그대로 세지 않는다. `const pressed = E ? E.click() :
false` 는 못 눌렀다는 사실을 부르는 쪽에 넘기는 것이고, 이 게이트가 권하는
형태다 — 그 자리까지 세면 고치라는 방향과 세는 방향이 어긋난다.

```
# (a) ghostEl ? ghostEl.click() : undefined;
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1

# (b) !ghostEl ? undefined : ghostEl.click();   — 108 — EXIT=1
# (c) ghostEl ? ghostEl.click() : void 0;       — 108 — EXIT=1
# 반증 const pressed = ghostEl ? ghostEl.click() : false;  — 107 — EXIT=0
# 대조 ghostEl && ghostEl.click();               — 108 — EXIT=1

# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```

---

## 7. `src/test/credentialed-adk-seed.contract.test.ts:264-305` — 도달은 **호출 그래프가 아니라 이름 언급**이다

12회차는 파일 안 어딘가의 호출을 닫고, `config.onPrepare` 에서 도달 가능한 몸통만 본다고 적었습니다. `reachableFrom` 은 식별자가 **적히기만** 하면 그 이름의 몸통을 넣습니다. 부르지 않아도 됩니다.

`wdio.conf.ts` 의 `onPrepare` 에서 `seedCredentialedAdk(...)` 를 지우고, 모듈 스코프에

```ts
function unusedGhostSeed() {
  return seedCredentialedAdk(SEEDED_ADK_PATH, credentialedSeedOptionsFromEnv());
}
```

을 둔 뒤, `onPrepare` 첫 줄에 `const _ghostSeed = unusedGhostSeed;`(호출 없음).

**(a)** 계약과 같은 술어(`configHookBody` · `reachableFrom` · `callsBinding`) → `seedCredentialedAdk` 호출 있음 = 참, **EXIT=0**. `onPrepare` 는 시딩 함수를 부르지 않습니다.

**대조.** 그 한 줄 언급만 지움(안 쓰는 함수는 파일에 남음) → `seed called false`, **EXIT=1**.

이 스냅숏에는 `vitest` 가 없어 해당 `it` 의 술어를 그대로 돌렸습니다. 12회차가 닫은 것은 "아무도 참조하지 않는 함수"이고, 이번 구멍은 **값으로만 적고 부르지 않는 참조**입니다.

```
# (a) onPrepare 의 seedCredentialedAdk 호출을 지우고
#     const _ghostSeed = unusedGhostSeed; 만 남김
# 계약 술어: seed called true / available called true — WIRING_PASS — EXIT=0

# 대조: 그 언급을 지움 (unusedGhostSeed 함수는 파일에 남음)
# seed called false — WIRING_FAIL — EXIT=1
```

**상태 (2026-09-06):** 닫았다. `src/test/credentialed-adk-seed.contract.test.ts` 의 도달
판정을 **이름 언급**에서 **호출 그래프**로 바꿨다. 모듈 스코프 선언을 셋으로 가른다 —
부르면 실행되는 몸통(`function`), 다른 이름을 그대로 가리키는 `const` 별명(`alias`), 그
밖의 값(`value`). 부름은 `function`·`alias` 만 따라가고, 값 참조는 `value` 만 따라간다.
그래서 함수를 값으로 적기만 한 자리는 어느 쪽으로도 몸통에 닿지 못한다.

따라가는 것은 실행으로 이어지는 자리뿐이다 — 호출식의 callee(식별자, 껍데기를 벗긴
쉼표식, `f.call`/`f.apply`/`f.bind`, 같은 파일 `const` 별명), `new X()`, 즉시 실행 함수식,
그리고 인자 자리로 넘겨진 함수 참조·함수식(`then(fn)`, `forEach(fn)`, `setTimeout(fn)`).
안 부르는 함수식의 몸통에는 훑기 자체가 들어가지 않는다(`forEachExecutedNode`).

callee 판정은 이름이 아니라 바인딩으로 한다 — `scripts/lib/bindings.mjs` 의 `resolveCallee`
를 파일 URL 동적 import 로 그대로 쓴다(그 모듈은 고치지 않았다). 그래서 별명·쉼표식·
`.call` 로 감싼 시딩 호출도 같은 답을 받는다.

가능 여부 판단은 상수 하나를 거쳐 훅에 닿으므로(`const SEEDS_CREDENTIALED_ADK = … &&
credentialedSeedAvailable()`), 부름 그래프에 모듈 스코프 `value` 상수의 초기화식을 더한
`consultedFrom` 으로 따로 본다. 거기서도 **함수 몸통에는 들어가지 않으므로** 이번 구멍은
그쪽으로도 열리지 않는다.

```
# (a) 리뷰어 변형: onPrepare 의 시딩 호출을 지우고 첫 줄에 const _ghostSeed = unusedGhostSeed;
npx vitest run src/test/credentialed-adk-seed.contract.test.ts; echo EXIT=$?
# ✗ "onPrepare 가 그 시딩을 실제로 부르지 않으면 격리 워크스페이스는 비어 있다"
# 1 failed | 4 passed — EXIT=1

# 대조: 그 언급을 지움 (unusedGhostSeed 함수는 파일에 남음) — 같은 실패 — EXIT=1

# 반대 방향(그래프가 지나치게 좁지 않은지):
#   seedAlias() → seedIfNeeded() → seedCredentialedAdk(...)      — 5 passed — EXIT=0
#   Promise.resolve().then(seedIfNeeded) (인자 자리)             — 5 passed — EXIT=0

# 되돌린 뒤 (실제 wdio.conf.ts) 5 passed — EXIT=0, git diff 출력 없음
```

실제 배선의 도달 경로는 둘 다 짧다. `seedCredentialedAdk` 는 `config.onPrepare` 몸통에서
곧바로 불린다(`wdio.conf.ts:494`) — 중간 함수가 없다. `credentialedSeedAvailable` 은 모듈
스코프의 `SEEDS_CREDENTIALED_ADK` 초기화식에서 불리고(`wdio.conf.ts:106`), `onPrepare` 가
`if (SEEDS_CREDENTIALED_ADK)` 로 그 값을 보므로 `consultedFrom` 이 그 초기화식을 범위에
넣는다. `before` 쪽의 `NAIA_E2E_CREDENTIALED_SEED` 도 같은 모양이다 —
`CREDENTIALED_SEED_ACTIVE` 상수의 초기화식이 그 변수를 읽고, `before` 가 그 상수를 본다.

---

머리말이 보증하지 않는다고 적어 둔 자리(동적 `import`/`require`, 배열·객체로 흘러간 함수, 고차 함수가 돌려준 함수, 문자를 조립해 `.naia` 를 만드는 위조, 데이터 홈 허용 목록이 파일 단위라는 점, `--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장 자체)는 지적 번호에서 뺐습니다. `regression-selection.mjs` 와 데이터 홈 깔때기에서는 이번 범위 안에서 실증된 거짓 통과가 없었습니다.

되돌린 뒤 복구·무음 클릭·데이터 홈 게이트는 다시 `EXIT=0` 입니다. 최종 `git status --porcelain` 은 비어 있습니다.

**NOT CLEAN**
