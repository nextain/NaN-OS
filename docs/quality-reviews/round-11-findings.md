# 11회차 교차 리뷰 지적 (2026-09-06, 스냅숏 22d70d43)

판정: **NOT CLEAN**, 지적 9건. 아래는 리뷰어 원문이다.

---

품질 게이트가 막겠다고 적은 사고를 통과시키는지부터 확인하겠습니다. 먼저 프로세스 현황·지난 회차 닫힘 기록·게이트 머리말을 읽고, 새로 들어온 검사기와 호출 규약을 대조합니다.지난 회차 닫힘 기록과 게이트 머리말을 대조해, 새로 들어온 검사기부터 범위를 좁히겠습니다.닫힌 지적과 겹치지 않게, 공용 모듈·깔때기·시딩 쪽 나머지 구현과 계약 테스트를 이어서 읽겠습니다.호출 규약·깔때기 모듈·시딩 배선을 코드에서 좁히고, 이미 계약으로 고정된 형태는 다시 찌르지 않겠습니다.파서 게이트는 루트에 `typescript`가 없어 셸 패키지 쪽으로 모듈 경로를 잡겠습니다. 데이터 홈·인벤토리 기준선은 이미 통과입니다.기준선은 통과입니다. 깔때기가 공개한 홈 조회·디렉터리 상수로 새 자리를 심고 게이트를 돌리겠습니다.공개 API 조립은 통과했습니다. `.naia` 문자열 대조를 심겠습니다.데이터 홈 구멍은 확인됐습니다. 이어서 `disabled={객체.속성}`이 영구 꺼짐으로 안 읽히는지 심겠습니다.꺼짐 속성 구멍도 확인됐습니다. `createElement` 별명으로 막다른 알림을 심겠습니다.기준 HEAD는 `ea5a942`. 6~10회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 공용 모듈·깔때기·파서 게이트·자격증명 시딩의 **범위 조건**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

---

# 판정: **NOT CLEAN** — 실증된 지적 9건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `check-data-home-boundary.mjs:91-102` / `data_home.rs:44,143` | 깔때기가 공개한 홈 조회와 `.naia` 상수로 이름표 없는 새 자리를 만든다 |
| 2 | `jsx-static.mjs:711` `alwaysTruthy` | 객체 속성 `FLAGS.off` 는 영구 참이 아니다. 문자열 후보는 같은 속성을 푼다 |
| 3 | `jsx-static.mjs:97-104` `isCreateElementCall` | `createElement` 라는 **이름**만 요소다. import 별명 `h` 는 알림이 아니다 |
| 4 | `check-recovery-affordance.mjs:80-81` | 알림 **문구** 안의 `onClick=` 이 복구 행동이다 |
| 5 | `check-silent-clicks.mjs:185,289-296` | `el != null && el.click()` 과 `void el.click()` 은 같은 무음인데 세지 않는다 |
| 6 | `check-destructive-affordance.mjs:445-456` | `invoke.bind(null)` 로 부른 삭제는 호출부가 아니다 |
| 7 | `check-destructive-affordance.mjs:181-183` | `#[tauri::command]` 와 `fn` 사이 200자 창 밖의 파괴 명령은 목록에 없다 |
| 8 | `credentialed-adk-seed.contract.test.ts:142-145` | 주석이 시딩 배선을 만족한다 |
| 9 | `build-e2e-inventory.mjs:296-310` | `fetch(url)` 은 바깥 주소가 같은 함수의 리터럴이어도 결정론 칸이다 |

---

## 1. `scripts/check-data-home-boundary.mjs:91-102` — 깔때기 모듈이 홈과 `.naia` 이름을 **공개**해 두면, 모듈 밖에서 이름표 없이 자리를 만든다

머리말은 자리를 늘리려면 모듈 밖에서 홈을 짚어야 하고, 그 사실이 잡힌다고 합니다. 금지 목록은 식별자 `home_dir`·`naia_data_home*` 와 문자열 `HOME`/`USERPROFILE`/`NAIA_HOME`·`.naia` 마디뿐입니다.

`data_home.rs` 는 데이터 홈 디렉터리 자체를 비공개로 내리지 않았습니다. `user_home()`·`user_home_path()`·`DATA_HOME_DIR_NAME`(`".naia"`)이 공개입니다. 모듈 주석은 밖에서는 `child`/`child_of` 만 쓰라고 하지만, 검사기는 그 공개 API를 홈을 짚는 것으로 세지 않습니다.

`packages/shell/src-tauri/src/capture.rs` 의 import 바로 아래.

**(a)**

```rust
#[allow(dead_code)]
fn ghost_cache() -> PathBuf {
    crate::data_home::user_home_path()
        .unwrap_or_default()
        .join(crate::data_home::DATA_HOME_DIR_NAME)
        .join("ghost-cache")
}
```

→ 이름표 14개, **EXIT=0**.

**대조.** `.join(".naia").join("ghost-cache")` → `capture.rs:24 — 문자열에 \`.naia\` 마디가 있다`, **EXIT=1**.

머리말이 막겠다는 “이름표 없는 `~/.naia` 바로 아래 새 자리”가, 깔때기가 내준 재료만으로 다시 생깁니다. 10회차가 닫은 `push`·상수·200자 패딩은 `.naia` 문자열이나 `home_dir` 이 있을 때만 잡힙니다.

```
# (a) capture.rs 에 user_home_path()?.join(DATA_HOME_DIR_NAME).join("ghost-cache")
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 이름표 14개 · 모듈 밖에서 홈을 짚는 자리 없음 — EXIT=0

# 대조 .join(".naia").join("ghost-cache")
# ❌ 데이터 홈을 모듈 밖에서 짚었다(1) — capture.rs:24 — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. 재료를 없애는 쪽으로 고쳤다. 데이터 홈 이름
(`DATA_HOME_DIR_NAME`)은 이제 `data_home.rs` 안에서만 보인다. 뿌리를 돌려주는
`root_of`·`direct_root_of`·`naia_data_home_*` 는 전부터 비공개였으니, 밖에서
`~/.naia` 를 가리키려면 `.naia` 를 문자열로 적는 수밖에 없고 그것은 예전부터
경로 마디로 잡힌다. 홈 그 자체를 돌려주는 넷(`user_home`, `user_home_path`,
`unix_home`, `windows_home`)은 데이터 홈이 **아닌** 자리(`~/dev`,
`~/.agent-browser`, `~/.cache/huggingface`, 경로 가드의 허용 뿌리)를 위해 공개로
남는다. 대신 밖에서 홈을 쥔 뒤 자리를 조립하던 여덟 자리는 이름표를 받는 새
API 로 옮겼다 — `child_from_dirs_home` 과 `read_child_from_dirs_home`(adk-path
부트스트랩 포인터를 읽는 다섯 자리), 그리고 macOS 딥링크 AppleScript 가 쓰는
`deep_link_helper_script_paths`.

컴파일러는 오늘의 코드만 막으므로, 게이트가 깔때기의 `pub` 항목 열여섯을
`PUBLIC_API` 허용 목록과 대조한다. 목록에 없는 `pub` 이 생기면 붉어지고, 목록에
있는데 더는 공개가 아니면 낡은 항목으로 붉어지며, 모듈 밖에서 `data_home::` 로
짚는 이름도 같은 목록으로 본다. 항목마다 쓸 수 있는 파일도 함께 적었다 — 그
목록이 파일 단위라는 것이 한계이고, 보증은 "`.naia` 라는 이름이 깔때기 밖에
없다" 쪽이 진다. 두 게이트가 쓰던 Rust 토크나이저는 `scripts/lib/rust-tokens.mjs`
로 옮겨 함께 쓴다.

```
# (a) capture.rs 에 user_home_path()?.join(DATA_HOME_DIR_NAME).join("ghost-cache")
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# ❌ 깔때기에서 내주지 않는 것을 밖에서 짚었다(1) — capture.rs:24 — data_home::DATA_HOME_DIR_NAME
# ❌ 허용 목록이 정한 파일 밖에서 짚었다(1) — capture.rs:22 — data_home::user_home_path
# EXIT=1
cargo test --lib data_home
# error[E0603]: constant `DATA_HOME_DIR_NAME` is private — capture.rs:24:33 — cargo EXIT=101

# 대조 .join(".naia").join("ghost-cache")
# ❌ 문자열에 `.naia` 마디가 있다 — capture.rs:24 — EXIT=1
# 대조 깔때기에서 `pub const DATA_HOME_DIR_NAME` 로 되돌리기
# ❌ 깔때기가 허용 목록에 없는 것을 공개했다(1) — data_home.rs:50 — EXIT=1
# 대조 capture.rs 에 dirs::home_dir()
# ❌ `home_dir` (data_home 모듈 밖에서 홈을 구한다) — capture.rs:22 — EXIT=1

# 되돌린 뒤 EXIT=0 · cargo test --lib data_home 5 passed · git diff 출력 없음
```

---

## 2. `scripts/lib/jsx-static.mjs:711` `alwaysTruthy` — 속성 접근은 따라가지 않는다

10회차가 영구 꺼짐을 `const off = true` 와 import 상수까지 이었고, `stringCandidates` 는 객체 속성(`obj.id`)도 풉니다. `alwaysTruthy` 는 식별자·논리식·리터럴만 보고 `PropertyAccessExpression` 은 맨 아래 `return false` 입니다. dead-ui 는 그 함수로 꺼짐을 판정합니다.

`SettingsTab.tsx` 연결 탭 앞에 `const GHOST_FLAGS = { off: true };` 와

```tsx
<button type="button" data-testid="ghost-wake-panel" disabled={GHOST_FLAGS.off}>ghost</button>
```

스펙 `01-app-launch.spec.ts` 가 `[data-testid='ghost-wake-panel']` 을 기다림.

**(a)** `disabled={GHOST_FLAGS.off}` → 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**. 모듈에 직접 물으면 `alwaysTruthy(GHOST_FLAGS.off) === false`.

**대조.** 같은 버튼을 `disabled={true}` 로 → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

React 에서 `{ off: true }` 의 `off` 와 `true` 는 둘 다 누를 수 없는 버튼입니다. 표지 문자열은 같은 모듈이 객체 속성을 푸는데, 꺼짐만 한 겹에서 멈춥니다.

```
# (a) SettingsTab.tsx 에 GHOST_FLAGS = { off: true }, disabled={GHOST_FLAGS.off}
#     스펙이 ghost-wake-panel 을 기다림
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# [dead-ui] 스펙이 집는 이름 176개 / 셸 소스에 없는 것 0 — EXIT=0

# 대조 disabled={true}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts:50 — ghost-wake-panel
# EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. `alwaysTruthy` 가 문자열 후보와 같은 방식으로
속성 접근을 푼다. `PropertyAccessExpression` 과 리터럴 키의
`ElementAccessExpression` 을 재대입 없는 `const` 객체 리터럴에서 찾아 그 값에
같은 판정을 다시 건다 — 같은 파일이든 `import` 로 건너간 파일이든, 두 겹
중첩이든 마찬가지다. `as const` 인지는 묻지 않는다. 그것은 타입 표기일 뿐이라
요구하면 `as const` 를 떼는 것만으로 판정이 빠져나간다. 언제나 거짓인지를 보는
쪽(`alwaysFalsy`)에도 같은 것을 달았다 — 참 쪽만 열면 `!FLAGS.on` 이라는 부정
한 겹으로 같은 구멍이 남는다. 못 푸는 자리(spread 가 섞인 객체, 값이 변수인
속성, 없는 키, 계산된 키, 재대입되는 이름)는 전부 거짓, 즉 **모른다** 다.

```
# (a) SettingsTab.tsx 에 const GHOST_FLAGS = { off: true }, disabled={GHOST_FLAGS.off}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — 01-app-launch.spec.ts:50 — ghost-wake-panel — EXIT=1

# 같은 뜻의 다른 형태도 같다
# disabled={GHOST_FLAGS["off"]}                       — EXIT=1
# disabled={GHOST_FLAGS.panel.off} (두 겹 중첩)        — EXIT=1
# disabled={!GHOST_FLAGS.on} (on: false)              — EXIT=1
# 대조 disabled={true}                                 — EXIT=1

# 반증(모른다는 참이 아니다)
# let GHOST_FLAGS = {...}; GHOST_FLAGS = {...}         — EXIT=0
# const GHOST_FLAGS = { off: ghostEnabled }            — EXIT=0
# disabled={GHOST_FLAGS.missing}                       — EXIT=0

# 되돌린 뒤 [dead-ui] 이름 175개 / 없는 것 0 — EXIT=0, git diff 출력 없음
```
---

## 3. `scripts/lib/jsx-static.mjs:97-104` — `createElement` 는 **이름**이다

공용 모듈 머리말은 `createElement("div", { role: "alert" })` 가 JSX 와 같은 화면이라고 합니다. `isCreateElementCall` 은 식별자/속성 이름이 글자 그대로 `"createElement"` 일 때만 요소입니다. 파괴 게이트는 10회차에 import 별명을 따라가게 바꿨는데, 알림 판정은 그 수리를 받지 않았습니다.

`UpdateBanner.tsx` 의 `if (installing)` 을 바꿨습니다.

**(a)** `import { createElement as h } from "react"` 후 `return h("div", { role: "alert" }, "install failed")` → 표면 1곳(기준선), **EXIT=0**.

**대조.** `return createElement("div", { role: "alert" }, "install failed")` → 표면 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:31`, **EXIT=1**.

막다른 오류 화면이, 같은 함수의 별명 하나면 알림으로도 안 셉니다.

```
# (a) return h("div", { role: "alert" }, "install failed");
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# [recovery] 실패가 화면을 통째로 대신하는 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0

# 대조 createElement("div", { role: "alert" }, "install failed")
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. 요소 판정을 이름에서 바인딩으로 옮겼다. 새
공용 모듈 `scripts/lib/bindings.mjs` 가 "이 호출식의 callee 는 어느 모듈의 어느
export 인가" 하나만 답한다 — 직접 식별자, default·namespace import 의 멤버,
같은 파일 `const` 별명, 구조분해 별명, `.bind` 로 만든 별명, 호출부의
`.call`/`.apply`, 그리고 `env` 를 넘기면 상대 경로로 건너간 파일의 별명까지
한 단계씩 따라간다. `jsx-static` 의 `elementFactory` 는 그 답을 받아
`react`·`preact`·`react/jsx-runtime`·`react/jsx-dev-runtime` 의
`createElement`/`h`/`jsx`/`jsxs`/`jsxDEV` 인지만 묻는다.

두 가지가 함께 바뀌었다. `jsx`/`jsxs` 는 자식을 props 안의 `children` 에 넣으므로
`elementChildren` 이 그 자리를 읽는다 — 읽지 않으면 자식 없는 요소로 보여
"화면에 오르는 것이 이 알림 하나뿐인가" 판정이 통째로 갈린다. 반대로 출처가
있는 다른 `createElement`(`document.createElement("canvas")`)는 이제 화면
요소가 아니다. 딱 한 자리는 이름으로 남겼다 — 아무 데서도 오지 않은 자유
식별자 `createElement(...)` 는 그대로 요소다. 모르는 것을 아니라고 단정하면
놓치는 쪽으로 틀린다.

```
# (a) import { createElement as h } from "react"; return h("div", { role: "alert" }, "install failed")
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1

# 같은 화면을 적는 다른 방법도 모두 같다 (각각 EXIT=1)
# React.createElement (default import) · Rx.createElement (namespace)
# const make = createElement.bind(null); make(...)
# jsx("div", { role: "alert", children: "install failed" })  (react/jsx-runtime)

# 되돌린 뒤 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0, git diff 출력 없음
```
---

## 4. `scripts/check-recovery-affordance.mjs:80-81` — 복구는 여전히 요소 **원문** 정규식이다

알림 판정은 파서로 옮겼습니다. 복구 표시 `RECOVERY` 는 `element.getText()` 전체에 `/onClick[=:]/` 등을 그대로 적용합니다. 머리말은 `"Start-up failed"` 같은 **문구**가 복구로 세던 자리를 이미 한 번 닫았다고 적습니다. 자식 텍스트 안의 `onClick=` 은 그 사고입니다.

`UpdateBanner.tsx:30` 의 `if (installing)`.

**(a)** `return <div role="alert">install failed (missing onClick=)</div>` → 표면 2곳 / 다음 행동 없음 0, **EXIT=0**.

**대조.** `return <div role="alert">install failed</div>` → `UpdateBanner.tsx:31`, **EXIT=1**.

버튼이 없는데 오류 문장에 속성 이름만 있어도 빠져나갈 길이 있다고 합니다.

```
# (a) return <div role="alert">install failed (missing onClick=)</div>;
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 0 — EXIT=0

# 대조 install failed
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. 요소 원문 정규식을 버렸다. 이제 알림 요소의
하위 트리를 `jsxElementsIn` 으로 걸어 **요소**를 찾고, 그 요소가 조작인지만
묻는다 — 태그가 `button`·`a`·`textarea` 이거나 `Link` 류 컴포넌트인가,
`onClick`·`onPress`·`onCopy`·`href`·`to` 를 가졌는가, `role` 이 `button`·`link`
인가. 값이 대놓고 없는 속성(`onClick={undefined}`)은 조작으로 세지 않는다.
JSX 로 적었든 `createElement`/`jsx` 로 적었든 같은 목록으로 온다.

텍스트 노드의 글자는 어떤 경우에도 근거가 아니다. 그래서 머리말에서 "문구가
복구로 세던 자리를 한 번 닫았다" 던 문장을 고쳤다 — 그때 닫은 것은 `Start`
라는 낱말 하나였고, 자리 자체는 열려 있었다. 지금 닫은 것이 그 자리다.

```
# (a) return <div role="alert">install failed (missing onClick=)</div>
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — UpdateBanner.tsx:31 — EXIT=1
# 자식 글자에 `<button href=` 를 적어도, `createElement("button")` 을 적어도 EXIT=1

# 대조(진짜 조작이면 초록)
# <button onClick={…}>retry</button>      — 자리 2곳 / 없는 곳 0 — EXIT=0
# <AppLink to="/settings">settings</AppLink> — EXIT=0
# <div role="button">retry</div>           — EXIT=0

# 되돌린 뒤 자리 1곳 / 다음 행동이 없는 곳 0 — EXIT=0, git diff 출력 없음
```
---

## 5. `scripts/check-silent-clicks.mjs:185,289-296` — `&&` 왼쪽이 식별자가 아니거나, 클릭이 `void` 면 무음이 아니다

머리말은 “있으면 누르고 없으면 넘어가는 꼴”을 파서로 읽는다고 합니다. `el && el.click()` 은 왼쪽이 **식별자**일 때만, `if (el) el.click()` 은 그 문이 **곧바로** `name.click(...)` 일 때만 셉니다. `unwrap` 은 `void` 를 벗기지 않습니다.

`01-app-launch.spec.ts` 마지막 단언 뒤에 한 줄을 넣었습니다. 기준선은 107이라 하나가 늘어야 붉어집니다.

**(a)** `ghostEl != null && ghostEl.click()` → 107, **EXIT=0**.

**(b)** `if (ghostEl) void ghostEl.click()` → 107, **EXIT=0**.

**대조.** `ghostEl && ghostEl.click()` 또는 `if (ghostEl) ghostEl.click()` → 108 > 107, `01-app-launch.spec.ts` 가 파일별 집계에 나타남, **EXIT=1**.

`el != null && el.click()` 은 `el && el.click()` 과 같은 무음이고, `void el.click()` 은 값을 버리는 `el.click()` 입니다.

```
# (a) ghostEl != null && ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 조용히 넘어가는 클릭 107 (baseline 107) — EXIT=0

# (b) if (ghostEl) void ghostEl.click();
# 같은 출력, EXIT=0

# 대조 ghostEl && ghostEl.click()  /  if (ghostEl) ghostEl.click()
# 늘었다(108 > 107) — 01-app-launch.spec.ts 1 — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. 판정의 단위를 이름에서 **보호되는 식 E** 로
옮겼다. 존재를 묻는 형태(`E`, `!!E`, `E != null`, `E !== null`,
`E !== undefined`, `Boolean(E)`, `typeof E !== "undefined"`, 그리고 부정형이
`return`/`continue` 로 이어지는 꼴)를 하나로 읽어 E 를 꺼내고, 그 자리에서
눌리는 것이 같은 E 인지만 본다. E 는 식별자여야 할 이유가 없다 — 속성 접근도,
단언으로 싼 호출도 글자가 같으면 같은 식이다. 클릭 쪽은 `void`·`await`·괄호·
`as` 를 벗기므로 `void el.click()` 은 `el.click()` 과 같은 클릭이다. `void` 를
벗기는 것은 클릭 자리뿐이다 — 값 없이 나가는지 보는 자리에서는 `void` 가
근거 그 자체이므로 벗기면 안 된다.

기준선은 107 그대로다. 새로 보게 된 형태가 지금 이 저장소에 하나도 없기
때문이고, 늘지도 줄지도 않았으니 옮길 이유가 없다. 잡히는지는 셈이 아니라
주입으로 확인했다. 판단 기준은 옛 방식과 같다 — 파서가 더 밝아진 만큼은
잠그고, 판정 범위 자체(가지의 **첫 문**만 본다)는 넓히지 않았다.

```
# 아홉 가지 형태를 하나씩 01-app-launch.spec.ts 에 넣었다. 전부 108 > 107 — EXIT=1
# ghostEl != null && ghostEl.click();
# if (ghostEl) void ghostEl.click();
# Boolean(ghostEl) && ghostEl.click();
# typeof ghostEl !== "undefined" && ghostEl.click();
# if (!!ghostEl) await ghostEl.click();
# if (state.el != null) void (state.el.click() as unknown);   ← E 가 이름이 아니다
# if (ghostEl === undefined) return; ghostEl.click();
# 대조 ghostEl && ghostEl.click()  /  if (ghostEl) ghostEl.click()

# 반증(판정 범위를 넓히지 않았다)
# if (ghostEl) other.click();                        — 107 — EXIT=0
# if (!ghostEl) throw new Error(...); ghostEl.click(); — 107 — EXIT=0

# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```
---

## 6. `scripts/check-destructive-affordance.mjs:445-456` — 바인딩을 따라가되 `.bind` 로 부른 삭제는 호출부가 아니다

10회차는 `invoke as tauriInvoke` 와 네임스페이스를 닫았습니다. `callsInvoke` 는 식별자가 그 바인딩이거나 `ns.invoke(...)` 일 때만 호출입니다. `invoke.bind(null)` 은 `invoke` 를 부르는 것이 아니고, 그 결과로 `call("memory_delete_fact")` 를 부르면 로컬 집합에 `call` 이 없습니다.

`packages/shell/src/lib/db.ts` 의 `deleteAgentFact` 바로 아래.

**(a)**

```ts
export async function ghostWipeFact(factId: string): Promise<boolean> {
  const call = invoke.bind(null);
  return call("memory_delete_fact", { factId });
}
```

→ 프런트 호출 14곳(기준선), **EXIT=0**.

**대조.** `return invoke("memory_delete_fact", { factId })` → `db.ts:29 — memory_delete_fact (감싼 함수 ghostWipeFact)`, **EXIT=1**.

확인 없는 기억 삭제가, 별명 대신 `.bind` 한 겹이면 다시 호출부가 아닙니다.

```
# (a) const call = invoke.bind(null); return call("memory_delete_fact", { factId });
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 14곳 · 확인 없는 파괴적 동작 없음 — EXIT=0

# 대조 invoke("memory_delete_fact")
# 되돌릴 수 없는 동작 1곳 — db.ts:29 — memory_delete_fact — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. 호출부 판정에 별명 추적을 더했다. 같은 파일 안에서
`const call = invoke.bind(null)`·`.call`·`.apply`, `const x = invoke`, 구조 분해
`const { invoke: iv } = ns`, 그리고 객체 리터럴로 만든 네임스페이스
(`const ns = { invoke }` 뒤의 `ns.invoke(…)`)를 고정점으로 따라가고, 그 별명의
호출도 호출부로 센다. 별명마다 **명령 이름이 몇 번째 인자인지**를 함께 들어
`invoke.call(null, "…")` 처럼 한 칸 밀리는 꼴도 리터럴로 읽는다. `.apply` 는
이름이 배열 안에 있어 자리를 알 수 없으므로 조립 호출로 세어 막는다.

판정은 `resolveInvokeBinding(node, sf, bindings)` 하나에 모아 두었다. 이번
회차에 다른 손이 만드는 `scripts/lib/bindings.mjs`(`importBindings`·
`resolveCallee`)로 다음 회차에 합칠 수 있도록 그 사실을 함수 주석에 적었다.

```
# (a) const call = invoke.bind(null); return call("memory_delete_fact", { factId });
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 되돌릴 수 없는 동작 1곳 — db.ts:30 — memory_delete_fact (감싼 함수 ghostWipeFact) — EXIT=1

# 같은 자리에 심은 다른 꼴도 전부 EXIT=1
#   invoke.bind(null, "memory_delete_fact") → call({ factId })
#   invoke.call(null, "memory_delete_fact", { factId })
#   const call = invoke
#   const ns = { invoke }; const { invoke: iv } = ns; iv("memory_delete_fact", …)
# 대조 invoke("memory_delete_fact", { factId }) — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

---

## 7. `scripts/check-destructive-affordance.mjs:181-183` — 명령 추출이 `#[tauri::command]` 뒤 **200자** 창이다

머리말은 목록을 손으로 적지 않고 `#[tauri::command]` 선언에서 뽑는다고 합니다. 정규식은 `][\s\S]{0,200}?fn` 입니다. 속성 주석이 200자를 넘기면 그 명령은 후보에도 없고, 프런트의 `invoke("…")` 는 `commands.includes` 에서 건너뜁니다. 10회차 데이터 홈 창과 같은 측정 지점입니다.

`capture.rs` 에 파괴 본문 `remove_dir_all` 을 가진 명령을 두고, `db.ts` 에서 확인 없이 불렀습니다. 문서 주석 길이는 속성 `]` 와 `fn` 사이 321자.

**(a)** 긴 `///` 주석 → Rust 명령 **198개**(기준선, 199가 아님) / 파괴 후보 15 / 호출 14, **EXIT=0**.

**대조.** `/// wipe` (짧은 주석) → 명령 199 / 후보 16 / 호출 15, `db.ts:29 — ghost_wipe_everything`, **EXIT=1**.

확인 없는 삭제가, 명령 위에 문서만 길게 적으면 목록에서 사라집니다.

```
# (a) #[tauri::command] + 321자 문서 + fn ghost_wipe_everything + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# Rust 명령 198개 중 파괴 후보 15개 / 프런트 호출 14곳 — EXIT=0

# 대조 /// wipe
# 명령 199 · 후보 16 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. 200자 창을 없애고 명령 추출을 토큰 기반으로 바꿨다.
`scripts/lib/rust-tokens.mjs` 의 `tauriCommandBodies` 가 주석을 버린 뒤
`#[tauri::command]` 속성 다음의 속성·가시성·`async`·`unsafe` 를 토큰으로 건너뛰고
`fn <이름>` 을 읽는다. 본문도 원문 문자 세기가 아니라 토큰의 중괄호 균형으로
자르므로 문자열 안의 `}` 가 본문을 일찍 끊지 않는다. 이 토크나이저는 데이터 홈
경계 검사가 쓰던 것을 떼어 낸 것이라, 두 게이트가 같은 자리에서 잰다.

```
# (a) #[tauri::command] + 376자 문서 주석 + fn ghost_wipe_everything
#     + db.ts 에서 확인 없이 invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# Rust 명령 199개 중 파괴 후보 16개 / 프런트 호출 15곳
# 되돌릴 수 없는 동작 1곳 — db.ts:29 — ghost_wipe_everything — EXIT=1
#
# 같은 소스에서 옛 200자 창이 뽑는 이름: ["capture_screen_region"]
# 토큰이 뽑는 이름:                      ["ghost_wipe_everything","capture_screen_region"]

# 대조 /// wipe (짧은 주석)
# 같은 199 · 16 · 15, 같은 자리 — EXIT=1

# 되돌린 뒤 EXIT=0 (198 · 15 · 14), git diff 출력 없음
```

계약 테스트 `src/test/rust-tokens.contract.test.ts` 여덟을 붙였다 — 321자를 넘는
문서 주석 뒤의 `fn`, 속성 여러 개, `pub(crate) async fn`·`pub async unsafe fn`·
`pub(in crate::app) fn`, 줄 주석과 블록 주석 안의 가짜 `#[tauri::command]`,
보통 문자열과 로 문자열 안의 가짜 선언, 문자열 안의 `}` 를 넘긴 본문 자르기,
본문 없는 선언, 그리고 코드·문자열 가르기의 줄 번호다.

---

## 8. `src/test/credentialed-adk-seed.contract.test.ts:142-145` — 시딩 배선이 **문자열**이다

이 테스트 머리말은 “시딩 함수만 남고 설정이 부르지 않으면 계약은 초록인데 회귀는 여전히 fetch failed 로 죽는다”고 하고, 그래서 기본 설정이 실제로 부르는지를 잰다고 합니다. 재는 방법은 `/seedCredentialedAdk\(/`, `/credentialedSeedAvailable\(\)/`, `/NAIA_E2E_CREDENTIALED_SEED/` 세 정규식입니다. 10회차가 격리 계약에서 주석 대입을 파서로 옮긴 바로 그 사고입니다.

`packages/shell/e2e-tauri/wdio.conf.ts`.

**(a)** 실제 호출을 끊고 주석만 남김.

```ts
const SEEDS_CREDENTIALED_ADK = false; // credentialedSeedAvailable()
// ...
// seedCredentialedAdk(
const seeded = { provider: "nextain", model: "deepseek-v4-flash", ... };
```

세 정규식 모두 참, 살아 있는 `seedCredentialedAdk(` 호출은 없음, **EXIT=0**.

**대조.** 그 주석 두 줄을 지움 → `seedCredentialedAdk(` 거짓, `credentialedSeedAvailable()` 거짓, **EXIT=1**.

배선을 지워도 계약이 초록입니다. (이 트리에 vitest 가 없어 해당 `it` 의 세 단언을 같은 정규식으로 돌렸습니다.)

```
# (a) 호출을 주석으로 바꾸고 정규식이 찾는 토큰만 남김
# seedCredentialedAdk( true / credentialedSeedAvailable() true / NAIA_E2E_CREDENTIALED_SEED true
# live call present false — EXIT=0

# 대조: 그 주석 제거
# seedCredentialedAdk( false / credentialedSeedAvailable() false — EXIT=1

# 되돌린 뒤 세 정규식 참 · live call true · git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. 세 정규식을 파서로 바꿨다. `wdio.conf.ts` 를
`ts.createSourceFile` 로 읽어 `./credentialed-adk-seed.js` 에서 들어온
`seedCredentialedAdk`·`credentialedSeedAvailable` 의 **바인딩**을 잡고(별명으로
import 해도 따라간다), 그 바인딩을 실제로 부르는 `CallExpression` 이 있는지,
그리고 `process.env.NAIA_E2E_CREDENTIALED_SEED` 를 실제로 대입하거나 읽는 노드가
있는지를 본다. 주석에는 노드가 없으니 주석은 저절로 거짓이다. 10회차가 격리
계약(`e2e-runtime-isolation.contract.test.ts`)에서 쓴 방식 그대로다.

```
# (a) 호출을 주석으로 바꾸고 정규식이 찾는 토큰만 남김
node -e '세 정규식 검사'
# /seedCredentialedAdk\(/ true · /credentialedSeedAvailable\(\)/ true · /NAIA_E2E_CREDENTIALED_SEED/ true
npx vitest run src/test/credentialed-adk-seed.contract.test.ts; echo EXIT=$?
# ✗ 기본 설정이 그 시딩에 실제로 배선돼 있다
#   "import 만 하고 부르지 않으면 격리 워크스페이스는 비어 있다" — expected false to be true
# 1 failed | 4 passed — EXIT=1

# 되돌린 뒤 5 passed — EXIT=0, git diff 출력 없음
```

---

## 9. `scripts/build-e2e-inventory.mjs:296-310` — 바깥 `fetch` 는 **호출 자리의 리터럴**만 본다

10회차는 registry 의 주소 리터럴과 `fetch("https://…")` 를 자국으로 넣었습니다. `outboundAddresses` 는 `fetch`/`request` 바로 다음 따옴표 주소만 봅니다. 같은 함수 안의 `const url = "https://…"; fetch(url)` 은 자국도, 바깥 호출도 아닙니다. `--check` 는 분류가 틀린 목록과도 글자만 같으면 초록입니다. 분류의 옳고 그름은 이 자국 규칙이 집니다.

결정론 칸 스펙 `packages/shell/e2e-tauri/specs/100-herdr-first-frame.spec.ts`.

**(a)**

```ts
const ghostUrl = "https://ghost-llm.example:9999/ghost-complete";
await fetch(ghostUrl);
```

생성 후 그 스펙 `tier: deterministic_ci`, `node scripts/build-e2e-inventory.mjs --check` **EXIT=0**.

**대조.** `await fetch("https://ghost-llm.example:9999/ghost-complete")` → `tier: credentialed_live` (91→92, 결정론 20→19).

바깥 모델에 닿는 스펙이, 주소를 변수에 한 번 담으면 자격증명 없는 기계의 몫으로 남습니다.

```
# (a) const ghostUrl = "https://ghost-llm.example:9999/ghost-complete"; fetch(ghostUrl);
node scripts/build-e2e-inventory.mjs
# 100-herdr-first-frame.spec.ts tier=deterministic_ci
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ✓ 지금 스펙과 일치한다 — EXIT=0

# 대조 fetch("https://ghost-llm.example:9999/ghost-complete")
# tier=credentialed_live

# 스펙과 docs/e2e-inventory.json 되돌린 뒤 --check EXIT=0, git diff 출력 없음
```

**상태 (2026-09-06):** 닫았다. `outboundAddresses` 가 호출 자리의 글자를 보지
않는다. 파서로 `fetch`/`request` 호출을 찾아 첫 인자를 `stringCandidates` 로
풀고 — 같은 파일 `const`, 조건식의 모든 갈래, 템플릿의 고정 조각, `import` 로
건너간 `const` 까지 — 후보 중 **하나라도** 바깥 호스트면 대화 자국으로 센다.
값을 변수에 한 겹 담는 것으로는 빠져나가지 못한다. 자기 서버(`http://127.0.0.1:
${port}`)는 값이 실행할 때 정해져 후보가 없으므로 예전처럼 결정론 칸에 남는다.

보증 밖은 머리말에 적었다: 함수 매개변수로 받은 주소, 실행할 때 조립되는
템플릿, 객체·배열을 거쳐 흘러간 주소는 후보가 없다. 그런 자리는 "바깥 주소가
없다" 가 아니라 **모른다** 이고, 이 목록은 그것을 결정론 칸에 남긴다. 못 푼
인자 수는 생성할 때 표준 출력에 함께 적는다(지금 1개). 지금 스펙에서는 분류가
하나도 바뀌지 않아 `docs/e2e-inventory.json` 은 그대로다.

```
# (a) const ghostUrl = "https://ghost-llm.example:9999/ghost-complete"; await fetch(ghostUrl);
node scripts/build-e2e-inventory.mjs
# 100-herdr-first-frame.spec.ts tier=credentialed_live (91→92, 결정론 20→19)
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ❌ 지금 스펙과 어긋난다 — EXIT=1

# 같은 주소를 한 겹 더 숨겨도 같다 (각각 tier=credentialed_live · --check EXIT=1)
# const GHOST_BASE = "https://…:9999"; fetch(`${GHOST_BASE}/x`)
# const u = cond ? "/local" : "https://…:9999/x"; fetch(u)      ← 갈래 하나면 족하다
# helpers/click.ts 의 export const 를 import 해서 fetch(GHOST_ENDPOINT)

# 반증 const selfUrl = `http://127.0.0.1:${browser.options.port}/health`; fetch(selfUrl)
# tier=deterministic_ci · --check EXIT=0

# 되돌린 뒤 결정론 20 / 자격증명 91 / 장치 8 — --check EXIT=0, git diff 출력 없음
```
---

머리말이 보증하지 않는다고 적어 둔 자리(문자열로 `.naia` 를 조립하는 위조, 돌려받은 경로의 `parent`/`pop`, `--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장 자체)는 지적 번호에서 뺐습니다. 9번은 그 `--check` 가 아니라, 분류를 진다고 적은 자국 규칙(`outboundAddresses`)을 겨냥합니다.

최종 `git status --porcelain` 은 비어 있고, 위 게이트 여섯은 되돌린 뒤 모두 `EXIT=0` 입니다.
