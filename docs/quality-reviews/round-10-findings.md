# 10회차 교차 리뷰 지적 (2026-09-06, 스냅숏 022e3147)

판정: **NOT CLEAN**, 지적 10건. 아래는 리뷰어 원문이다.

---

품질 게이트가 거짓 통과하는 자리를 실증하겠습니다. 먼저 이전 회차 지적과 게이트 스크립트의 머리말·범위를 읽고, 닫힌 자리를 다시 찌르지 않도록 하겠습니다.이전 회차 지적과 게이트 스크립트 머리말을 먼저 대조하겠습니다.닫힌 지적과 겹치지 않게, 파서로 옮긴 게이트와 새로 들어온 스크립트부터 머리말·범위 조건을 읽겠습니다.파서 기반 분석의 실제 빈틈을 보기 위해 나머지 구현과 신규 계약 테스트를 이어서 읽겠습니다.파서 빈틈과 신규 게이트를 더 좁히기 위해 나머지 판정 루프와 계약 테스트를 읽겠습니다.파서 빈틈·데이터 홈 게이트·신규 계약 테스트를 코드에서 좁히고, 심을 자리를 찾겠습니다.심을 자리와 대조군을 정하기 위해 대상 파일과 나머지 게이트를 확인한 뒤, 기준선부터 돌리겠습니다.워킹트리는 깨끗합니다. 기준선을 돌린 뒤, 파서 빈틈부터 하나씩 심겠습니다.루트에 `typescript`가 없어서, 셸 패키지 쪽에서 모듈 경로를 잡아 게이트를 다시 돌리겠습니다.기준선은 통과입니다. 파서 빈틈부터 심고 게이트를 돌리겠습니다.`&&` 형태는 통과했습니다. 같은 자리에 괄호 `return` 대조를 심겠습니다.복구 게이트는 되돌렸습니다. 죽은 UI 쪽은 고아 `AgentsTab`에 정적 표지부터 심어 대조하겠습니다.`AgentsTab`은 ChatArea에서 살아 있습니다. App이 끊은 `sample-note/index.tsx`로 옮겨 대조하겠습니다.기준 HEAD는 `022e3147`. 6~9b회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 파서로 옮긴 뒤의 **AST 범위**와 새로 들어온 게이트의 **측정 지점**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트(`check-dead-ui-specs`, `check-recovery-affordance`)는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

---

# 판정: **NOT CLEAN** — 실증된 지적 10건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `check-recovery-affordance.mjs:200,229` | return 이 JSX 요소가 아니면 막다른 알림이 아니다 |
| 2 | `check-recovery-affordance.mjs:186` / `check-dead-ui-specs.mjs:337` | `JsxAttribute` 만 본다. spread·`createElement` 는 표지·꺼짐·알림이 아니다 |
| 3 | `check-dead-ui-specs.mjs:357-362` | `disabled={true}` 만 영구. 식별자·`&&` 는 열린 것으로 본다 |
| 4 | `check-dead-ui-specs.mjs:265,92-95,646` | 조건부 표지는 정의 지도에 없고, `id={` 문자열이 존재를 증명한다 |
| 5 | `check-dead-ui-specs.mjs:509` | 조립 파일의 아무 `id:` 가 탭 값이다 (9b #6, 이 HEAD 에서 그대로) |
| 6 | `check-data-home-boundary.mjs:66-68` | `.join("리터럴")` 200자 창만 본다. `push`·상수·창 밖은 새 자리가 아니다 |
| 7 | `check-destructive-affordance.mjs:356,416` | `invoke(` 식별자만 본다. import 별명은 확인 없는 삭제 |
| 8 | `check-silent-clicks.mjs:52` | `return undefined` 는 넣었고 `return void 0` 은 같은 무음이다 |
| 9 | `build-e2e-inventory.mjs:81-120` | registry 의 `api.*` 주소만 대화 자국이다. 이 저장소의 Ollama(`127.0.0.1:11434`) 는 결정론 칸 |
| 10 | `e2e-runtime-isolation.contract.test.ts:93` / `check-untranslated-ui.mjs:117` | 주석이 배선을 만족하고, `process.env.LANG` 우회표는 로케일 접근자가 아니다 |

---

## 1. `scripts/check-recovery-affordance.mjs:200,229-237` — 파서는 return 이 **JSX 요소 하나**일 때만 막다른 화면이다

머리말은 `if (error) return <... role="alert">` 입니다. `unwrap` 은 괄호·`as` 만 벗기고, `onlyElement` 는 `JsxElement` / `JsxFragment` 만 받습니다. `&&`·삼항·`createElement`·자식이 `{cond && …}` 인 컨테이너는 알림이 아닙니다. 기준선은 표면 1곳.

`UpdateBanner.tsx:30` 의 `if (installing)` 을 바꿨습니다.

**(a) `return true && (<div role="alert">install failed</div>)`** → 표면 1곳, **EXIT=0**.

**(b) `return installing ? (<div role="alert">install failed</div>) : null`** → **EXIT=0**.

**(c) `return createElement("div", { role: "alert" }, "install failed")`** → **EXIT=0**.

**(d) `return (<div>{true && <div role="alert">install failed</div>}</div>)`** → **EXIT=0**.

**대조.** `return (<div role="alert">install failed</div>)` → `UpdateBanner.tsx:32`, 표면 2곳 / 다음 행동 없음 1, **EXIT=1**.

게이트가 막겠다고 적어 둔 막다른 오류 화면이, React 에서 흔한 return 모양이면 알림으로도 안 셉니다.

**상태 (2026-09-06):** 막다른 화면 판정을 "돌려주는 것이 JSX 요소 하나인가"
에서 "이 return 이 화면에 올리는 것이 **이 알림 하나뿐인가**" 로 바꿨다.
`&&` 의 오른쪽, 삼항의 두 갈래, `||`·`??` 의 양쪽, `createElement`, 자식의
`{cond && …}` 를 모두 뚫고 내려가되 어느 층에서든 형제가 둘 이상이면 멈춘다.
속성은 새 공용 모듈 `scripts/lib/jsx-static.mjs` 의 `elementProps` 로 읽고,
`role` 값은 `staticChunks` 가 주는 후보 전부에서 "alert" 를 찾는다. 형제 규칙은
그대로 두었다 — 복구 조작은 알림 요소의 하위 트리 안에서만 센다. 다만 복구
표지에 `createElement("button"…)` 와 `onClick:`·`href:` 를 더했다. 알림을
`createElement` 로 읽게 됐으니 복구도 같은 형태로 읽어야 한쪽만 세지 않는다.

```
# (a) UpdateBanner.tsx:31 의 return 을 아래 넷으로 차례로 바꾸고 게이트를 돌렸다.
#   (a) return true && (<div role="alert">install failed</div>);
#   (b) return installing ? (<div role="alert">install failed</div>) : null;
#   (c) return createElement("div", { role: "alert" }, "install failed");
#   (d) return (<div>{true && <div role="alert">install failed</div>}</div>);
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# (a) [recovery] 실패가 화면을 통째로 대신하는 자리 2곳 / 다음 행동이 없는 곳 1
#     packages/shell/src/components/UpdateBanner.tsx:31
#     EXIT=1
# (b) 같은 출력, EXIT=1   (c) 같은 출력, EXIT=1   (d) 같은 출력, EXIT=1

# 되돌린 뒤
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# [recovery] 실패가 화면을 통째로 대신하는 자리 1곳 / 다음 행동이 없는 곳 0
# EXIT=0
git diff packages/shell/src/components/UpdateBanner.tsx   # 출력 없음

# 대조: return (<div role="alert">install failed</div>);
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# UpdateBanner.tsx:31 / EXIT=1
```


---

## 2. `check-recovery-affordance.mjs:186-192` / `check-dead-ui-specs.mjs:337` — 속성은 `ts.isJsxAttribute` 만 읽는다

spread 와 `React.createElement` 의 props 는 속성 목록에 없습니다. 그래서 알림·영구 꺼짐·클래스 집이 통째로 비습니다. 클래스 집은 비면 검사를 `continue` 로 건너뜁니다.

**(a) 복구.** `UpdateBanner` 를 `return (<div {...{ role: "alert" }}>install failed</div>)` 로 → 표면 1곳, **EXIT=0**. 대조는 지적 1과 같음, **EXIT=1**.

**(b) 꺼짐.** 산 파일 `SettingsTab.tsx` 연결 탭 앞에

```tsx
<button type="button" data-testid="ghost-wake-panel" {...{ disabled: true }}>ghost</button>
```

스펙 `01-app-launch.spec.ts` 가 `[data-testid='ghost-wake-panel']` 을 기다림 → 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**.

**대조.** 같은 버튼을 `disabled={true}` 로 → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

**(c) 클래스.** App 이 끊은 `packages/shell/src/apps/sample-note/index.tsx`(KNOWN_UNRENDERED 밖)에 `createElement("div", { className: "ghost-wake-panel" })`, 스펙이 `".ghost-wake-panel"` 을 기다림 → **EXIT=0**. `{...{ className: "ghost-wake-panel" }}` 도 **EXIT=0**.

**대조.** `<div className="ghost-wake-panel" />` → `01-app-launch.spec.ts:50 — ghost-wake-panel (정의: …/sample-note/index.tsx)`, **EXIT=1**.

머리말이 막겠다는 꺼 둔 조작·죽은 화면·막다른 알림이, spread/`createElement` 면 자리가 아닙니다.

**상태 (2026-09-06):** 두 게이트가 속성을 각자 읽던 코드를 없애고 공용
`elementProps(node, sf, env)` 하나로 모았다. `JsxAttribute` 에 더해
`JsxSpreadAttribute` 의 객체 리터럴, 같은 파일(또는 import 로 건너간 파일)의
`const` 객체를 펼친 spread, `createElement` 둘째 인자의 객체까지 같은 속성
목록으로 온다. 풀 수 없는 spread(함수 인자, import 된 값)는 `unknownSpread`
로 표시되어 호출자가 "모른다" 를 "없다" 로 읽지 못하게 했다. 클래스 집이
비면 `continue` 하는 자리는 그대로 두되, 그 침묵이 파서 한계인지 정의가 없는
것인지 드러나도록 dead-ui 가 `클래스 집을 못 찾은 선택자 N개 / 속성을 다 읽지
못한 파일 M개(풀 수 없는 spread)` 를 함께 보고한다(현재 48개 / 5개).

```
# (a) UpdateBanner.tsx:31 → return (<div {...{ role: "alert" }}>install failed</div>);
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1
# 대조(지적 1과 같음) EXIT=1, 되돌린 뒤 EXIT=0 · git diff 없음

# (b) SettingsTab.tsx 연결 탭 앞에
#     <button type="button" data-testid="ghost-wake-panel" {...{ disabled: true }}>ghost</button>
#     01-app-launch.spec.ts 가 [data-testid='ghost-wake-panel'] 를 기다림
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts:50 — ghost-wake-panel
# EXIT=1
# 대조 disabled={true} → 같은 출력, EXIT=1

# (c) 고아 파일 packages/shell/src/apps/sample-note/index.tsx 에
#     export const Ghost = () => createElement("div", { className: "ghost-wake-panel" });
#     (그리고 <div {...{ className: "ghost-wake-panel" }} /> 변형)
#     스펙이 ".ghost-wake-panel" 을 기다림
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 화면에 오르지 않는 표지를 기다리는 스펙 1곳 — ghost-wake-panel
#    (정의: packages/shell/src/apps/sample-note/index.tsx)
# EXIT=1  (두 변형 모두)
# 대조 <div className="ghost-wake-panel" /> → 같은 출력, EXIT=1

# 되돌린 뒤
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?   # EXIT=0
git diff packages/shell/src/components/SettingsTab.tsx \
         packages/shell/src/apps/sample-note/index.tsx \
         packages/shell/e2e-tauri/specs/01-app-launch.spec.ts   # 출력 없음
```

**후속 (계약 테스트 작성자 지적, 같은 날):** `elementProps` 가 파일을 건너갈 때
값의 **출처 파일**을 잃고 있었다. `constValue` 가 돌려주는 `{ node, sf }` 에서
노드만 쓰고 파일을 버려, 건너간 파일의 노드를 불러온 쪽 트리로 풀었다. 그
탓에 중첩 spread(`const BASE = { role: "alert" }; export const P = { ...BASE,
… }`)는 `role` 을 통째로 잃고 `unknownSpread` 만 켰다. 이제 속성마다 그 값이
적혀 있는 파일을 `prop.sf` 로 함께 싣고, 객체 안의 spread 도 그 파일 트리에서
이어 편다. 두 게이트도 값을 풀 때 `prop.sf` 를 넘긴다. 함께 `createElement` 의
공백뿐인 자식을 JSX 와 똑같이 걸러 자식 수 판정을 대칭으로 맞췄고,
`jsxElementsIn` 머리말을 실제 계약(전위 순회 전체 열거, 유일성 판정 아님)대로
고쳤다.


---

## 3. `scripts/check-dead-ui-specs.mjs:357-362` — 영구 꺼짐을 `TrueKeyword`(와 `"true"`) 로만 본다

주석은 형태가 아니라 뜻이라고 합니다. `isTrueLiteral` 은 식별자를 따라가지 않고, `&&` 도 풀지 않습니다. 복구 게이트의 `staticText` 는 식별자를 따라갑니다.

`SettingsTab.tsx` 연결 탭 앞, 스펙이 `ghost-wake-panel` 을 기다림.

**(a) `const ghostOff = true;` 후 `disabled={ghostOff}`** → **EXIT=0**.

**(b) `disabled={true && true}`** → **EXIT=0**.

**대조.** `disabled={true}` → **EXIT=1** (지적 2의 대조와 같음).

React 에서 둘 다 영구히 꺼진 버튼입니다.

**상태 (2026-09-06):** `isTrueLiteral` 을 버리고 공용 `alwaysTruthy` 로 바꿨다.
`true`, `"true"`, 비어 있지 않은 문자열, 0 아닌 숫자, `!false`, `!!x`,
`a && b`(둘 다 참), `a || b`(하나라도 참), 괄호·`as`, 그리고 같은 파일에서
재대입 없는 `const` 식별자를 따라간다. `a ?? b` 는 왼쪽만 본다 — `false ?? true`
는 거짓이므로 `||` 와 같이 다루면 열린 버튼을 꺼졌다고 말하게 된다.

```
# (a) SettingsTab.tsx 에 const ghostOff = true; 를 두고
#     <button data-testid="ghost-wake-panel" disabled={ghostOff}>ghost</button>
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts:50 — ghost-wake-panel
# EXIT=1

# (b) disabled={true && true}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?   # 같은 출력, EXIT=1

# 대조 disabled={true} → 같은 출력, EXIT=1
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**후속 (계약 테스트 작성자 지적, 같은 날):** 위 상수 추적이 **파일을 건너가면**
다시 열려 있었다. 값의 출처 파일을 잃은 탓에, `i18n.ts` 의 `const OFF = true`
로 꺼 둔 props 를 spread 로 받아도 불러온 화면에 우연히 `const OFF = false`
가 있으면 열린 버튼으로 읽혔다. `prop.sf` 로 풀도록 고친 뒤 그 자리가 잡힌다.

```
# packages/shell/src/lib/i18n.ts 끝에
#   const GHOST_OFF = true;
#   export const GHOST_PROPS = { disabled: GHOST_OFF, "data-testid": "ghost-wake-panel" };
# SettingsTab.tsx 는 그것을 import 하고, 같은 파일에 const GHOST_OFF = false; 를 둔 뒤
#   <button type="button" {...GHOST_PROPS}>ghost</button>
# 스펙이 [data-testid='ghost-wake-panel'] 를 기다림
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts:50 — ghost-wake-panel
# EXIT=1

# 같은 결함을, 값의 출처 파일을 버리는 옛 방식(alwaysTruthy(p.value, tree, env))으로 돌리면
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 0 — EXIT=0  ← 이것이 결함이었다

# 되돌린 뒤 EXIT=0, git diff 출력 없음
# 모듈 계약: npx vitest run src/test/jsx-static.contract.test.ts → 61 passed, EXIT=0
#   (고치기 전 같은 테스트는 6 failed — 반증이 실제로 작동한다)
```


---

## 4. `scripts/check-dead-ui-specs.mjs:265-275, 92-95, 646-657` — 조건부 표지는 정의 지도에 없고, 집이 없으면 고아 검사를 끈 채 `id={` 문자열이 존재를 증명한다

`staticString` 은 조건부·식별자를 풀지 않습니다. 고아 판정은 `definedIn` 집이 있을 때만 돕니다. 존재는 여전히 정규식 `identifierContexts` 이고, 그 안에 `id` 와 `htmlFor` 가 들어 있습니다.

고아 `sample-note/index.tsx` + 스펙이 `ghost-wake-panel` 을 기다림.

**(a) `<div data-testid={false ? "ghost-wake-panel" : "sample-note"} />`** → 이름 176/0, **EXIT=0**. 화면에는 그 표지가 없습니다.

**(b) 합성.** `function Ghost({ id }) { return <div data-testid={id} />; }` 후 `<Ghost id={"ghost-wake-panel"} />` → **EXIT=0**. `name={"ghost-wake-panel"}` 로 바꾸면 없는 이름 1, **EXIT=1** — 살리는 것은 표지가 아니라 `id={` 문맥입니다.

**대조.** 같은 고아 파일의 `<div data-testid="ghost-wake-panel" />` → **EXIT=1**.

동적 값·조건부·합성으로 숨긴 표지가, 집이 비는 바람에 고아 검사를 비껴 갑니다.

**상태 (2026-09-06):** 존재 증명을 파서로 옮기고 **파일을 함께 적게** 했다.
(a) `staticChunks`·`stringCandidates` 가 조건식의 모든 갈래를 돌려주므로
`data-testid={false ? "ghost-wake-panel" : "sample-note"}` 는 두 이름 다 그
파일의 정의로 등록된다. (b) 등록 대상을 표지 속성이 아니라 **모든 JSX·
createElement 속성의 정적 문자열 후보 전부**로 넓혔다 — 그래서 합성
(`<Ghost id={"ghost-wake-panel"} />`)의 이름도 그 파일에 등록되고, 그 파일이
고아면 고아로 잡힌다. (c) 정규식 `identifierContexts` 폴백과 소스 전문
`sourceText` 를 통째로 지웠다. 남은 조립 이름 판정은 파서가 읽은 템플릿의
고정 앞·뒷조각뿐이고, 그 조각도 파일을 달고 다녀 도달 가능성 판정에 들어간다.

현재 HEAD 에서 **새로 잡힌 이름은 없다**(스펙이 집는 이름 175개 / 없는 것 0).
다만 표지의 집을 이름이 아니라 **속성별**로 좁히면서, `[data-meta-tab="skills"]`
한 자리가 새로 고아로 드러났다(화면에 오르지 않는 표지 11곳 → 12곳). 그 값은
고아 `NaiaMetaArea.tsx` 에만 있고, 예전에는 설정 탭의 `data-settings-tab="skills"`
가 이름만으로 집을 늘려 주고 있었다. `KNOWN_UNRENDERED` 의 NaiaMetaArea 사유가
그대로 덮으므로 기준선은 올리지 않았다.

```
# (a) 고아 sample-note/index.tsx 에
#     export const Ghost = () => <div data-testid={false ? "ghost-wake-panel" : "sample-note"} />;
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 화면에 오르지 않는 표지를 기다리는 스펙 1곳 — ghost-wake-panel
#    (정의: packages/shell/src/apps/sample-note/index.tsx) — EXIT=1

# (b) 같은 파일에
#     function Ghost({ id }) { return <div data-testid={id} />; }
#     export const GhostPanel = () => <Ghost id={"ghost-wake-panel"} />;
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?   # 같은 출력, EXIT=1

# 대조 <div data-testid="ghost-wake-panel" /> → 같은 출력, EXIT=1
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```


---

## 5. `scripts/check-dead-ui-specs.mjs:509` — 조립 값은 그 파일로 좁혔지만, 그 파일의 아무 `id:` 나 탭이 된다

9b #6 과 같은 정규식입니다. 이 HEAD 에서 다시 심었습니다. `SettingsTab.tsx:380` 에 `{ id: "ko", label: "한국어" }` 가 있습니다.

**심은 것.** `SettingsTab.tsx:3474` 탭 바에 `data-settings-tab={activeSettingsTab}`, 스펙이 `[data-settings-tab='ko']` 를 기다림 → 176/0, **EXIT=0**.

**대조.** 같은 조립 속성으로 `[data-settings-tab='ghost-wake']` (그 파일 `id:` 에 없음) → 없는 이름 `data-settings-tab="ghost-wake"`, **EXIT=1**.

존재하지 않는 설정 탭 `"ko"` 가 언어 목록 한 줄로 살아납니다.

**상태 (2026-09-06):** "같은 파일의 아무 `id:`" 를 버리고 식별자의 값 출처를
푼다. `const [I, setI] = useState<T>(init)` 이면 `init` 의 리터럴 + `T` 의 문자열
유니언(같은 파일 또는 import 로 따라간 타입 별칭 포함) + 그 파일의 `setI("리터럴")`
인자 전부가 후보다. `xs.map((x) => <… data-tab={x.id}>)` 이면 `xs` 를 배열
리터럴로 풀어 그 속성 값들을 쓴다(구조분해 `({ id })` 도 같다). 풀지 못하면
집이 없는 것으로 다뤄 없는 이름 판정으로 떨어진다.

`SettingsTab.tsx` 의 `activeSettingsTab` 은 `useState<"profile" | "brain" |
"voice" | "avatar" | "persona" | "memory" | "knowledge" | "skills" |
"connections" | "general">("profile")` 의 **타입 인자 유니언**으로 풀린다 —
후보 10개, 닫힌 집합(`complete`)이다. 초기값 `"profile"` 과 세터 리터럴은 그
유니언 안에 있다. `"ko"` 는 그 열에 없으므로 살아나지 않는다. `AppBar.tsx` 의
`data-app-id={mode.id}` 는 `modes` 가 `useMemo` 로 만들어져 풀 수 없고, 그
사실을 `값의 출처를 못 푼 표지 속성` 줄로 드러낸다(지금 그 속성을 값까지
집는 스펙은 없다).

```
# SettingsTab.tsx 탭 바에 data-settings-tab={activeSettingsTab} 를 달고
# 01-app-launch.spec.ts 가 [data-settings-tab='ko'] 를 기다림
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 1
#   01-app-launch.spec.ts — data-settings-tab="ko"
# EXIT=1

# 대조 [data-settings-tab='ghost-wake'] → data-settings-tab="ghost-wake", EXIT=1
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```


---

## 6. `scripts/check-data-home-boundary.mjs:66-68` — 새 자리 탐지가 `naia_data_home*(…).join("리터럴")` 의 200자 창이다

머리말은 홈을 직접 짚는 **새 자리**를 막습니다. 정규식은 이중따옴표 `join` 만, 함수 호출 뒤 200자만 봅니다.

`lib.rs` 의 `naia_data_home_from` 바로 아래.

**(a) `let mut dir = naia_data_home_from(home); dir.push("ghost-cache");`** → 이름 13개, **EXIT=0**.

**(b) `const NAME: &str = "ghost-cache"; naia_data_home_from(home).join(NAME)`** → **EXIT=0**.

**(c) `join("ghost-cache")` 앞에 200자 넘는 패딩** → **EXIT=0**.

**대조.** `naia_data_home_from(home).join("ghost-cache")` → `ghost-cache (packages/shell/src-tauri/src/lib.rs)`, **EXIT=1**.

`PathBuf::push` 는 이 코드베이스의 다른 `join` 과 같은 자리 만들기입니다.

**상태 (2026-09-06):** 측정 지점을 창에서 코드 구조로 옮겼다. 데이터 홈 아래
경로를 만드는 코드를 `packages/shell/src-tauri/src/data_home.rs` 한 파일로 모으고,
자리마다 `DataHomeChild` 변형과 이름표를 두었다. 그 파일 밖에서는 데이터 홈을
돌려주는 함수도, 사용자 홈을 구하는 길(`home_dir`·`HOME`·`USERPROFILE`)도,
`.naia` 라는 경로 마디도 쓸 수 없다 — 검사기는 정규식이 아니라 Rust 토크나이저로
주석·문자열을 갈라 그것을 본다. 그래서 `push`·상수·패딩은 형태와 무관하게 "모듈
밖에서 홈을 짚었다" 하나로 잡힌다. 뿌리를 돌려주던 함수는 비공개로 내려 컴파일러가
함께 막는다. 자리 이름표는 검사기의 `KNOWN` 표, `docs/storage-locations.md` 의 표와
셋이 정확히 같아야 한다. 보증 범위(바로 아래 새 자리만 본다)와 보증하지 않는 것
(알려진 자리 안쪽, 문자열 위조, 돌려받은 경로를 위로 거슬러 가는 것, Rust 밖)은
검사기 머리말에 적었다.

옮기면서 자리가 하나 더 나왔다. `lib.rs` 의 게이트웨이 기본 설정이
`"~/.naia/workspace"` 를 **문자열로** 설정에 실어 보내고 있었다 — 200자 창을 보던 옛
검사가 원리상 볼 수 없던 자리다. `DataHomeChild::Workspace` 로 이름표를 붙여 열셋이
열넷이 되었고, 문서 표도 그렇게 고쳤다.

경로가 한 글자도 바뀌지 않았음은 `data_home::tests::child_paths_are_frozen`
(열넷의 전체 경로 문자열을 고정), `child_names_are_the_fourteen`(이름표),
`override_applies_only_to_the_respecting_half`(`NAIA_HOME` 을 타는 쪽과 안 타는 쪽이
갈리는지), `tilde_child_uses_the_same_label` 이 든다.

실증:

1. 심은 것 — 리뷰어의 (a) `push`, (b) 상수 이름, (c) 200자 패딩, 그리고 오늘
   컴파일되는 우회 둘((d) `user_home_path()?.join(".naia").join("ghost-cache")`,
   (e) `dirs::home_dir()?.join(".naia").join(GHOST_NAME)`).
   `node scripts/check-data-home-boundary.mjs` → 다섯 모두 **EXIT=1**.
2. 되돌린 뒤 → **EXIT=0**, `git diff --stat`(lib.rs) 이 심기 전과 같음(스크립트가
   매 변형마다 대조).
3. 대조 `naia_data_home_from(home).join("ghost-cache")` → **EXIT=1**.

```
$ python3 <실증 스크립트>   # 변형마다 심기 → 게이트 → 되돌리기 → diff 대조
=== 기준선(심기 전) ===        EXIT=0
=== (a) push ===               EXIT=1
=== (b) 상수 이름 ===          EXIT=1
=== (c) 200자 넘는 패딩 ===    EXIT=1
=== (d) 홈에서 다시 조립 ===   EXIT=1
=== (e) 홈 재조립 + 상수 ===   EXIT=1
=== 대조 ===                   EXIT=1
=== 되돌린 뒤 ===              EXIT=0   (git diff --stat 기준선과 같음: True)
```

Rust 는 `cargo check --lib` **EXIT=0**, `cargo check --bins` **EXIT=0**,
`cargo test --lib` **EXIT=0** (291 passed). 짝 저장소가 이 기계의 체크아웃과 달라
`NAIA_AGENT_SCRIPT`/`NAIA_AGENT_PROTO_DIR` 은 핀 커밋(bc468a17)을 스크래치패드에
복제해 가리켰다 — 저장소 파일이 아니다. macOS·윈도우 `cfg` 코드는 이 기계에서
컴파일되지 않으므로 그쪽은 검사기와 눈으로만 확인했다.

---

## 7. `scripts/check-destructive-affordance.mjs:356,416` — 호출부는 `invoke(` 라는 **이름**이다

머리말은 확인 없는 삭제를 막습니다. 리터럴·조립 루프가 모두 `\binvoke\s*(?:<…>)?\s*\(` 입니다.

`db.ts` 에 `import { invoke, invoke as tauriInvoke }` 와

```ts
export async function ghostWipeFact(factId: string) {
  return tauriInvoke("memory_delete_fact", { factId });
}
```

→ 호출 14곳 그대로, **EXIT=0**.

**대조.** `tauriInvoke` 만 `invoke` 로 → `db.ts:29 — memory_delete_fact (감싼 함수 ghostWipeFact)`, **EXIT=1**.

확인 없이 기억을 지우는 사고 그대로가, import 별명 하나면 호출부가 아닙니다.

**상태 (2026-09-06):** 호출부 판정을 이름에서 바인딩으로 옮겼다. `typescript`
파서로 각 파일의 import 를 읽어 `@tauri-apps/api/core` 에서 온 `invoke` 의 로컬
이름(별명·네임스페이스 포함)을 얻고, 그 바인딩을 부르는 `CallExpression` 만 호출부로
센다. 첫 인자를 그대로 넘기는 얇은 감싸기 함수는 고정점으로 따라가고, `export` 된
것은 파일을 건너뛰어도 같다. 356·416 두 자리의 정규식이 `invokeBindings` 하나로
합쳐졌다.

실증:

1. 심은 것 — (a) 리뷰어의 `import { invoke, invoke as tauriInvoke }` +
   `tauriInvoke("memory_delete_fact", …)`, (b) 첫 인자를 넘기는 감싸기
   `ghostCall(name, args)`, (c) 네임스페이스 `import * as tauriCore` 로 부르기.
   `node scripts/check-destructive-affordance.mjs` → 셋 모두 **EXIT=1**
   ((a)·(c) 는 "확인도 되돌리기도 없다 — db.ts … memory_delete_fact",
   (b) 는 "명령 이름을 조립해 부르는 자리" 로 걸린다).
2. 되돌린 뒤 → **EXIT=0** (호출 14곳, 사람이 확인해 적어 둔 자리 3), `git diff
   --stat`(db.ts) 이 심기 전과 같음.
3. 대조 `invoke("memory_delete_fact", …)` → **EXIT=1**.

```
=== 기준선 ===                          EXIT=0
=== (a) import 별명 tauriInvoke ===     EXIT=1
=== (b) 첫 인자를 그대로 넘기는 감싸기 === EXIT=1
=== (c) 네임스페이스 import ===          EXIT=1
=== 대조 invoke("memory_delete_fact") === EXIT=1
=== 되돌린 뒤 ===                        EXIT=0   (git diff --stat 기준선과 같음: True)
```

---

## 8. `scripts/check-silent-clicks.mjs:52` — `return undefined` 는 넣었고 `return void 0` 은 같은 무음이다

9b #9 는 `return undefined` 를 닫았습니다. 정규식은 `(?:return|continue)(?:\s+undefined)?\s*;` 라 `return` 다음이 `void` 이면 탈락합니다. `void 0` 은 `return;` 과 같습니다. 기준선 59라 세 개를 넣었습니다.

**심은 것.** `01-app-launch.spec.ts` 에 `if (!a) return void 0; await a.click();` 세 쌍 → 59, **EXIT=0**.

**대조.** `if (!a) return; await a.click();` 세 쌍 → 62 > 59, **EXIT=1**.

머리말의 “없으면 조용히 넘어가는 클릭”입니다.

**상태 (2026-09-06):** 판정을 파서로 옮겼다. 조건이 어떤 이름의 있음/없음인가,
없음일 때 그 가지가 **값 없이** 빠져나가는가(`return`·`return undefined`·
`return void …`·`continue`), 그 뒤 같은 블록에서 그 이름을 누르는가를 본다.
`void 0` 과 `undefined` 와 빈 `return` 은 파서에게 같은 것이므로 형태를 따로 적어
둘 자리가 없다. 값을 돌려주는 `return false` 는 그대로 세지 않는다.

기준선은 59 에서 **107 로 올랐다.** 새로 생긴 것이 아니라 옛 셈이 두 가지로 틀려
있었다. 옛 정규식은 `?.` 앞에 낱말이 있어야 세어서(`(\w+)\?\.click\(`) 이
저장소에서 가장 흔한 무음 클릭인
`(document.querySelector(sel) as HTMLElement)?.click()` 쉰 곳을 통째로 못 보고
있었다 — `querySelector` 는 못 찾으면 `null` 을 주므로 그 자리는 정확히 "없으면
조용히 넘어가는 클릭" 이다. 반대로 옛 셈에는 **주석 안의 예시** 두 건
(`92-browser-app-clicks.spec.ts` 의 설명 문장)이 들어 있었다. 그래서
59 = 코드 57 + 주석 2 였고, 지금 107 = 57 + 새로 보인 50 이다.

실증:

1. 심은 것 — 리뷰어의 `if (!a) return void 0; await a.click();` 세 쌍, 그리고 변형
   `return undefined` 세 쌍, `a == null` / `b === undefined` / `for … continue`
   세 쌍. `node scripts/check-silent-clicks.mjs` → 셋 모두 110 > 107, **EXIT=1**.
2. 되돌린 뒤 → 107, **EXIT=0**, `git diff --stat`(01-app-launch.spec.ts) 이 심기 전과
   같음.
3. 대조 `if (!a) return;` 세 쌍 → 110, **EXIT=1**. 권하는 형태
   `if (!a) return false;` 세 쌍은 107 그대로 **EXIT=0** — 이 게이트가 아무것이나
   세는 것이 아님을 함께 보인다.

---

## 9. `scripts/build-e2e-inventory.mjs:81-120` — 대화 자국이 registry 에서 뽑은 `api.*` 호스트라, 이 저장소의 로컬 제공자 Ollama 는 결정론 칸이다

모듈 목록은 없앴고 제공자 주소는 registry 에서 뽑습니다. 식별자 `ollama` 는 `api.ollama/` 꼴로만 자국이 됩니다. 실제 기본 로컬 주소는 `127.0.0.1:11434` 입니다.

**심은 것.** `helpers/click.ts` 에 `talkToOllama` (`fetch("http://127.0.0.1:11434/api/chat")`), `13-nva-capability.spec.ts`(인벤토리 `deterministic_ci`, `env: []`)가 그것을 부름. `--check` **EXIT=0**. 생성 결과는 그 스펙이 계속 `tier: "deterministic_ci"`. 요약 `deterministic_ci` 21 그대로.

**대조.** URL 만 `https://api.openai.com/v1/chat/completions` 로 → `--check` **EXIT=1**, 그 스펙이 `credentialed_live`, `deterministic_ci` 21→12 (`click.ts` 의 `clickElement` 를 쓰는 스펙까지 대화 모듈로 올라감).

목록에 없는 주소만 고르면, 07-cleanup 오분류가 다시 납니다. `--check` 는 그 틀린 분류가 목록과 일치하는지만 보증합니다.

**상태 (2026-09-06):** 대화 자국을 제공자 **식별자**에서 **주소 전체**로 넓혔다.
셸이 모델에 닿는 모듈(`src/lib/llm/` 전부와 `src/lib/config.ts`)을 읽어
`http(s)://…` 의 호스트·포트, 스킴 없는 `localhost:11434`·`127.0.0.1:8011` 꼴,
`/v1/…`·`/api/…` 경로 리터럴을 통째로 자국에 넣는다. 목록을 손으로 적지 않으므로
제공자를 붙이면 자국도 같이 는다. Ollama 의 기본 주소가
`src/lib/config.ts:DEFAULT_OLLAMA_HOST = "http://localhost:11434"` 라 `:11434` 가
자국으로 들어온다.

한 겹 더 두었다 — 헬퍼·스펙이 `fetch`/`request` 로 **리터럴** 주소를 부르면
결정론 칸에서 뺀다. 바깥 인터넷 호스트면 자격증명이 필요한 것으로, 고정 포트의
로컬 서비스면 그 기계의 것으로 본다. 자기 서버는 포트가 변수라
(`http://127.0.0.1:${port}/health`) 구별된다. 이 두 규칙으로 지금 트리의 분류는
**한 건도 바뀌지 않았다**(`docs/e2e-inventory.json` 이 바이트까지 같다).

`--check` 의 보증 범위는 머리말에 적었다 — 저장된 목록이 지금 스펙에서 다시 계산한
것과 글자 그대로 같은지만 본다. 분류가 옳은지는 보증하지 않고, 그것은 위 자국
규칙이 진다.

실증:

1. 심은 것 — 리뷰어의 `helpers/click.ts` + `13-nva-capability.spec.ts` 조합으로
   (a) `fetch("http://127.0.0.1:11434/api/chat")`,
   (b) `fetch("http://localhost:11434/v1/chat/completions")`.
   `node scripts/build-e2e-inventory.mjs --check` → 둘 다 **EXIT=1**, 다시 생성하면
   `13-nva-capability.spec.ts` 가 `credentialed_live` (리뷰어 때는 `deterministic_ci`
   에 남아 EXIT=0 이었다).
2. 되돌린 뒤 → **EXIT=0**, 세 파일(`click.ts`·스펙·`e2e-inventory.json`)의
   `git diff --stat` 이 심기 전과 같음.
3. 대조 `https://api.openai.com/v1/chat/completions` → **EXIT=1**, 분류
   `credentialed_live`.

---

## 10. `src/test/e2e-runtime-isolation.contract.test.ts:93` 와 `scripts/check-untranslated-ui.mjs:117-118` — 적어 둔 문자열·접근자만 본다

**(a) 격리 계약.** 앞의 단정 다섯은 `wdio.conf.ts` 를 실제로 import 합니다. `it.each` 세 파일은 `process.env.NAIA_E2E_RUNTIME_DIR\s*=` 문자열입니다.

`radio-queue-e2e-environment.ts:72` 의 대입을 `// process.env.NAIA_E2E_RUNTIME_DIR = runtime;` 로만 바꿈 → 그 정규식이 참. 대입 줄은 없음. 이 트리에 vitest 가 없어 파일 전체 process exit 는 못 돌렸고, **그 `it.each` 가 쓰는 정규식 그대로**를 세 파일에 적용했습니다. 주석을 지우면 radio-queue 만 거짓.

전용 설정에서 배선을 빼면서 이유를 주석으로 남기는 것이, 이 테스트가 막겠다고 적어 둔 사고입니다.

**(b) 번역표.** `USES_LOCALE` 에 `getLocale`·`navigator`·`localStorage`·`Intl`·`documentElement.lang` 은 있고 `process.env.LANG` 은 없습니다.

`logger.ts` 끝에 `(process.env.LANG ?? "en").slice(0, 2) === "ko" ? "Update" : "Updates"` → 523줄/61파일, **EXIT=0**.

**대조.** `getLocale()` 로 바꿈 → `logger.ts` 우회표 1개, **EXIT=1**.

**상태 (2026-09-06):**

**(a) 격리 계약.** `it.each` 의 문자열 정규식을 파서로 바꿨다. `typescript` 로 각
설정 파일을 파싱해 **실제 대입**(`=` 이항식의 좌변이
`process.env.NAIA_E2E_RUNTIME_DIR`, 속성 접근과 `["…"]` 접근 둘 다)을 찾는다.
주석에는 노드가 없으므로 주석은 저절로 거짓이고, 문자열 안의 같은 글자도 대입이
아니다.

실증(`cd projects/naia-shell && npx vitest run
src/test/e2e-runtime-isolation.contract.test.ts` — 이 테스트는 저장소 루트 패키지의
vitest 가 돌린다):

1. 심은 것 — 리뷰어처럼 `radio-queue-e2e-environment.ts:72` 의 대입을
   `// process.env.NAIA_E2E_RUNTIME_DIR = runtime;` 주석으로만 남김 →
   `Tests 1 failed | 7 passed`, **EXIT=1**. 변형으로 같은 글자를 문자열에 담아도
   (`const why = "process.env.NAIA_E2E_RUNTIME_DIR = runtime";`) **EXIT=1**.
2. 되돌린 뒤 → `Tests 8 passed`, **EXIT=0**, `git diff --stat` 이 심기 전과 같음.
3. 대조(대입 그대로) → `Tests 8 passed`, **EXIT=0**.

**(b) 번역표.** `USES_LOCALE` 에 `process.env.LANG|LC_ALL|LC_MESSAGES|LANGUAGE`,
`app.getLocale`, `getSystemLocale`, `osLocale` 을 넣었다. 다만 목록은 다음 접근자에
지므로 거기서 끝내지 않고, **접근자와 무관한 신호**를 하나 더 두었다 — 값을 어떻게
얻었든 `locales/` 의 파일 이름에서 얻은 언어 코드(`"ko"`, `"ko-KR"`, …)와
`===`/`!==`/`startsWith`/`includes`/`in` 으로 견주어 **문자열 둘 중 하나를 고르는
삼항식**이 있으면 우회표로 본다. 판정은 파서가 한다. 현재 HEAD 에서 오탐은 없었고
`BASELINE_LINES` 는 다른 작업자의 522(#554·#558)를 그대로 보존했다.

실증:

1. 심은 것 — 리뷰어의 `logger.ts` 끝
   `(process.env.LANG ?? "en").slice(0, 2) === "ko" ? "Update" : "Updates"` →
   `node scripts/check-untranslated-ui.mjs` **EXIT=1**("로케일 밖에서 언어로 분기하는
   번역표 1개 — logger.ts"). 접근자 목록 밖으로 더 밀어낸 변형
   (`readSystemLanguage()?.startsWith("ko") ? … : …`)과 지역 코드 변형
   (`someTag === "ko-KR" ? … : …`)도 **EXIT=1**.
2. 되돌린 뒤 → 522줄/61파일, **EXIT=0**, `git diff --stat`(logger.ts) 이 심기 전과
   같음.
3. 대조 `getLocale() === "ko" ? … : …` → **EXIT=1**. 우회표가 아닌
   `new Intl.DateTimeFormat(locale).format(when)` 은 **EXIT=0** — 로케일을 읽기만
   하는 자리는 여전히 세지 않는다.

---

## 닫히지 않은 채 잘 잡는 자리 (이번 주입의 대조)

| 변이 | 게이트 | 결과 |
|---|---|---|
| 고아 파일의 따옴표 `data-testid` / `className="..."` | dead-ui | EXIT=1 |
| `disabled={true}` + 따옴표 표지 | dead-ui | EXIT=1 |
| 조립 파일 `id:` 에 없는 탭 값 | dead-ui | EXIT=1 |
| `return (<div role="alert">install failed</div>)` | recovery | EXIT=1 |
| 확인 없는 `invoke("memory_delete_fact")` | destructive | EXIT=1 |
| `if (!el) return; await el.click()` | silent-clicks | EXIT=1 |
| `naia_data_home_from(home).join("ghost-cache")` | data-home | EXIT=1 |
| 헬퍼의 `api.openai.com` | inventory `--check` | EXIT=1 |
| `getLocale() === "ko"` 표 | untranslated | EXIT=1 |

`herdr-workspace.test.tsx` 의 Herdr 브리지 블록과 89·84 대표 제공자 구조는, 이 환경에서 해당 테스트 러너를 돌리지 못해 지적에 넣지 않았습니다.

---

**NOT CLEAN** — 실증된 지적 10건. 1·2·4는 파서로 옮긴 뒤에도 return 모양·spread/`createElement`·조건부 값이 뜻으로 안 읽히는 자리이고, 5는 9b가 닫았다고 한 조립 `id:` 범위가 이 HEAD 에 남아 있는 것입니다. 6·7·9·10은 새로 들어온 게이트와 계약의 측정 지점(리터럴 `join`, `invoke(` 이름, `api.*` 주소, 주석이 통과하는 grep)입니다.
