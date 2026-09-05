# 7회차 교차 리뷰 지적 (2026-09-05)

판정: **NOT CLEAN**, 지적 8건. 아래는 리뷰어 원문이다. 상태는 **결함을 실제로 심어
EXIT=1 을 본 뒤 되돌려 EXIT=0 을 본 것**만 "닫힘"으로 적는다.

| # | 대상 | 상태 |
|---|---|---|
| 1 | 렌더 판정이 도달 가능성이 아니라 "누가 import 하는가" 였다 | 닫힘 |
| 2 | `import { type X }` 와 주석 import 가 값 import 로 세어졌다 | 닫힘 |
| 3 | `export function` 형태만 컴포넌트로 봤다 | 닫힘 |
| 4 | `disabled={true}` 는 영구 비활성으로 안 봤다 | 닫힘 |
| 5 | 클래스는 `className="..."` 리터럴만 봤다 | 닫힘 |
| 6 | `data-meta-tab` 이 정의 지도에 없고, 조립이면 어떤 값이든 통과 | 닫힘 |
| 7 | 무음 클릭의 부정 분기와 인자 있는 click | 닫힘 |
| 8 | `\u{XXXX}` 코드포인트 이스케이프를 안 풀었다 | 닫힘 |

---

품질 게이트가 거짓으로 통과하는 자리를 찾겠습니다. 먼저 프로세스 현황, 6회차 지적, 그리고 새로 붙은 검사 스크립트를 읽고 실제 결함을 심어 검증하겠습니다.6회차 지적은 닫혀 있습니다. 새로 붙은 `check-dead-ui-specs`와 나머지 게이트 스크립트를 읽고, 머리말이 막는 사고를 정규식이 실제로 잡는지부터 대조하겠습니다.새 검사의 범위 조건을 코드와 실제 컴포넌트 패턴에 대조합니다. `disabled={true}`, `import { type … }`, 자식 파일 표지처럼 머리말이 말하는 사고를 재현할 수 있는 형태부터 보겠습니다.가설을 코드로 확인한 뒤, 결함을 심어 게이트를 돌리겠습니다. 자식이 죽은 부모에게만 import되는 경우, `disabled={true}`, `import { type }`, 클래스 템플릿부터입니다.스펙 삽입이 따옴표 이스케이프 때문에 앵커로 안 잡혔습니다. 문자열을 바로 쓰도록 고쳐 다시 심겠습니다.나머지 게이트와, 실제 사고인 connections 탭을 `disabled={true}`로만 바꿔 통과하는 경로를 이어서 실증합니다.판정: **NOT CLEAN**

기준 HEAD는 `9240dcb4`. 6회차 열한 건은 같은 형태로 다시 심지 않았고, 새로 붙은 렌더·`disabled` 검사와 그 옆 범위 조건을 심어 재었습니다. 주입은 전부 되돌렸고 `git status --porcelain` 은 비어 있습니다. 커밋·push 는 하지 않았습니다.

`check-vacuous-tests.mjs` 는 이 트리에 `typescript` 패키지가 없어 실행 자체를 못 했습니다. 그 게이트는 지적에서 뺐습니다.

---

## 1. `scripts/check-dead-ui-specs.mjs:196-207` — 화면에 오르는지가 아니라, 죽은 부모가 import 하는지만 본다

머리말은 `coding-workers-toggle` 사고입니다. 표지를 정의하는 파일이 **값으로 import 되지 않으면 화면에 오르지 않는다**고 적혀 있습니다. 실제 판정은 진입점 도달이 아니라 **다른 비테스트 파일 하나가 경로 마지막 조각으로 import 하면 산 파일**입니다.

지금 트리에서 `CodingWorkersApp.tsx` 의 값 import 는 `WorkspaceCenterArea.tsx:29` 하나뿐입니다. 그 부모는 이미 고아로 분류돼 `KNOWN_UNRENDERED` 에 있습니다. `IssuesArea.tsx`·`SkillLauncher.tsx` 도 같습니다.

**이미 HEAD 에 있는 거짓 통과.** `packages/shell/e2e-tauri/specs/91-jeonju-course-worker.spec.ts:75` 가 `[data-testid='coding-worker-worktree']` 를 기다립니다. 그 표지는 `CodingWorkersApp.tsx:305` 에만 있습니다. 게이트는 이것을 허용 9곳에 넣지 않은 채 `183/0`, **EXIT=0** 입니다. 토글만 부모 면제에 들어가 있고, 토글 뒤 화면은 검사 밖입니다.

**심은 것.** `CodingWorkersApp.tsx:267` 의 `data-testid` 를 `ghost-wake-panel` 로 바꾸고 `01-app-launch.spec.ts` 에서 그 이름을 기다리게 함 → 이름 184개, 없는 것 0, **EXIT=0**.

**대조.** 같은 표지를 고아인 `NaiaMetaArea.tsx:49` 에 붙임 → `01-app-launch.spec.ts:53 — ghost-wake-panel`, **EXIT=1**.

게이트가 막겠다고 적어 둔 코딩 워커 화면 사고가, 표지만 자식 파일로 옮긴 형태로 그대로 통과합니다.

---

## 2. `scripts/check-dead-ui-specs.mjs:198-205` — `import type` 접두만 빼고, 타입만 쓰는 자연스러운 두 형태는 값 import 로 친다

주석은 `import type { X } from "./Y"` 는 화면에 올리지 않는다고 합니다. 정규식은 `import` 바로 다음이 `type` 이 아닌지만 봅니다. `unrenderedComponentFiles` 는 주석도 지우지 않습니다(`sourceText` 쪽만 지웁니다).

**(a) `import { type NaiaMetaArea }`.** `NaiaMetaArea.tsx:49` 에 `data-testid="ghost-wake-panel"`, `App.tsx:5` 다음에 `import { type NaiaMetaArea } from "./components/NaiaMetaArea";`, 스펙이 그 표지를 기다림 → 184/0, **EXIT=0**.

**(b) 주석 import.** 같은 표지에 `App.tsx` 에 `// import { NaiaMetaArea } from "./components/NaiaMetaArea";` 만 추가 → **EXIT=0**.

**대조.** 표지만 고아 파일에 두고 import 흔적을 안 넣음 → **EXIT=1** (지적 1의 대조와 같음).

머리말이 막겠다는 “타입만 쓰인다”가, 접두 `import type` 이 아닌 형태로 다시 통과합니다. `App.tsx:5` 의 `import type { WorkspaceAppApi } from ".../WorkspaceCenterArea"` 는 접두라서 부모를 고아로 유지합니다. 중괄호 안 `type` 과 주석은 그 보호를 뒤집습니다.

---

## 3. `scripts/check-dead-ui-specs.mjs:192` — `export function` 가 아니면 그 파일은 렌더 검사 후보가 아니다

컴포넌트 파일 조건은 `/export\s+(?:default\s+)?function\s+[A-Z]/` 뿐입니다.

**심은 것.** `NaiaMetaArea.tsx:45` 를 `export const NaiaMetaArea = function NaiaMetaArea()` 로 바꾸고 `:49` 에 `data-testid="ghost-wake-panel"`, 스펙이 기다림 → 184/0, **EXIT=0**.

**대조.** `export function NaiaMetaArea()` 그대로면 **EXIT=1**.

`Editor.tsx:142` 는 원래 `export const Editor = forwardRef(...)` 이라 이 검사의 후보가 아닙니다. 형태만 바꿔도 고아 화면이 사라집니다.

---

## 4. `scripts/check-dead-ui-specs.mjs:148` — 값 없는 `disabled` 만 영구로 본다. `disabled={true}` 면 실제 사고가 통과한다

머리말은 조건부 `disabled={...}` 는 보지 않고, 값 없이 박힌 `disabled` 만 영구로 본다고 합니다. 정규식은 `\sdisabled\s*(?=[/>\s])` 이라 `=` 가 붙으면 탈락합니다. React 에서 같은 영구 꺼짐은 `disabled={true}` 입니다.

**심은 것 (새 버튼).** `SettingsTab.tsx` 연결 탭 앞에 `data-testid="ghost-wake-panel"` + `disabled={true}` 를 넣고 스펙이 기다림 → **EXIT=0**.

**대조.** `disabled` 만 남김 → `01-app-launch.spec.ts:53 — ghost-wake-panel`, **EXIT=1**.

**실제 사고 재현.** `SettingsTab.tsx:3543` 의 연결 탭 `disabled` 를 `disabled={true}` 로만 바꿈 → 게이트가 `KNOWN_DISABLED` 가 낡았다고 하며 **EXIT=1** (`connections`). 그 지시에 따라 `KNOWN_DISABLED` 를 비움 → 스펙 여섯(그중 `92-discord-secure-cancel.spec.ts:28-29`)이 여전히 꺼진 탭을 누르는데 **EXIT=0**. 탭은 계속 영구히 꺼져 있습니다.

---

## 5. `scripts/check-dead-ui-specs.mjs:236` — 클래스 선택자는 `className="..."` 리터럴만 본다

클래스 검사를 넣은 이유가 `.workspace-app` 이라고 적혀 있습니다. 수집은 `/className="([^"{}]+)"/g` 뿐입니다. 이 코드베이스의 BEM 토글 클래스는 대부분 템플릿입니다. 홈이 없으면 그 선택자는 건너뜁니다.

**심은 것.** 고아 `NaiaMetaArea.tsx:49` 를 `className={\`ghost-wake-panel\`}` 로 바꾸고 스펙이 `.ghost-wake-panel` 을 기다림 → **EXIT=0**.

**대조.** `className="ghost-wake-panel"` → `01-app-launch.spec.ts:53 — ghost-wake-panel`, **EXIT=1**.

이미 있는 템플릿 `NaiaMetaArea.tsx:55` 의 `.naia-meta-app__tab` 을 기다려도 **EXIT=0**. 같은 파일의 정적 `.naia-meta-app` 은 **EXIT=1**.

---

## 6. `scripts/check-dead-ui-specs.mjs:228,337-342` — `data-meta-tab` 은 정의 파일에 잇지 않고, `{` 조립이면 어떤 값이든 살아 있다

머리말의 둘째·셋째 사고는 Agents 탭과 렌더되지 않는 `NaiaMetaArea` 입니다. 그 탭 표지는 `data-meta-tab={tab.id}` (`NaiaMetaArea.tsx:59`) 입니다.

- 렌더 잇기(`definedIn`)는 `data-(testid|settings-tab|app-id)` 만 봅니다. `data-meta-tab` 은 없습니다.
- 이름 존재 검사는 `data-meta-tab={` 만 있으면 값과 무관하게 살아 있다고 칩니다.

**이미 HEAD 에 있는 거짓 통과.** `e2e-tauri/helpers/selectors.ts:59,89,126` 이 `[data-meta-tab="progress"|"skills"|"diagnostics"]` 를 집습니다. 그 속성은 고아 `NaiaMetaArea` 에만 있습니다. 게이트는 **EXIT=0** 입니다.

**심은 것.** 스펙에 `[data-meta-tab='ghost-wake']` 만 추가(소스에 그 값은 없음) → 이름 184개, 없는 것 0, **EXIT=0**.

**대조.** `[data-testid='ghost-wake-panel']` 만 추가(소스에 없음) → 없는 이름 1, **EXIT=1**.

존재하지도 않는 메타 탭을 기다려도, 고아 파일의 `{tab.id}` 한 줄이 전부 살려 줍니다.

---

## 7. `scripts/check-silent-clicks.mjs:35-45` — `await` 는 넣었지만, 부정 분기와 인자가 있는 `click()` 은 여전히 안 본다

6회차 1번은 `await` 형태였고 닫혔습니다. 정규식은 여전히 빈 괄호 `click\(\)` 과 `if (el)` / `el &&` / `el?.` 만 압니다. 머리말의 사고는 “없으면 조용히 넘어가는 클릭”입니다.

현재 실측은 59인데 baseline 은 61이라, 한두 개는 숫자가 막지 않습니다. 세 개를 넣어 경계를 넘겼습니다.

**심은 것 (통과).** `01-app-launch.spec.ts` 에  
`const el = await $("#x"); if (!el) return; await el.click();` 세 줄 → 59, **EXIT=0**.  
`if (el) await el.click({ force: true });` 세 줄 → 59, **EXIT=0**.

**대조.** `if (el) el.click();` 세 줄 → 62 > 61, **EXIT=1**.

같은 무음 클릭을 `if (!el) return` 으로 뒤집거나, 드라이버가 받는 옵션 객체만 넣으면 안 보입니다.

---

## 8. `scripts/check-untranslated-ui.mjs:45-54` — `\uXXXX` 는 풀고 `\u{XXXX}` 는 안 푼다

6회차 4번의 `\uc5c5\ub370\uc774\ud2b8` 는 닫혔습니다. `hasHangul` 은 `\\u([0-9a-fA-F]{4})` 만 디코드합니다. ES6 코드포인트 `\u{c5c5}` 는 그대로 남습니다.

**심은 것.** `UpdateBanner.tsx` 끝에  
`export const GHOST_WAKE = "\u{c5c5}\u{b370}\u{c774}\u{d2b8}";`  
→ 585줄/66파일, **EXIT=0**.

**대조.** `"\uc5c5\ub370\uc774\ud2b8"` → 586/67, **EXIT=1**.  
`"업데이트"` → 586/67, **EXIT=1**.

---

## 닫히지 않은 채 잘 잡는 자리 (이번 주입의 대조)

- 고아 파일의 따옴표 `data-testid` → dead-ui **EXIT=1**
- 소스에 없는 `data-testid` → **EXIT=1**
- 값 없는 `disabled` → **EXIT=1**
- 고아 파일의 `className="..."` 리터럴 → **EXIT=1**
- `\uXXXX` 한글 이스케이프와 한글 리터럴 → untranslated **EXIT=1**

---

**NOT CLEAN** — 실증된 지적 8건. 1·4·6은 게이트가 막겠다고 적어 둔 사고(코딩 워커 화면, 꺼 둔 연결 탭, 죽은 NaiaMetaArea 탭)를 범위 조건만 바꿔 다시 통과시킨 것입니다.

[exited with code 0]
