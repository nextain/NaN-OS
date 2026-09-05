품질 게이트가 막겠다고 적어 둔 사고를 실제로 재현할 수 있는지부터 보겠습니다. 먼저 프로세스 현황, 이전 회차 지적, 게이트 스크립트를 읽고 범위를 잡겠습니다.8회차 뒤에 바뀐 게이트부터 머리말·범위 조건을 대조해 읽겠습니다.닫힌 우회와 겹치지 않는 범위 구멍을 코드에서 좁히고, 이어서 실제 파일에 심어 게이트를 돌리겠습니다.HEAD가 깨끗한지 게이트 기준선을 먼저 돌린 뒤, 가설을 하나씩 심어 재겠습니다.고아 `IssuesArea`에 표지를 심고, 타입 자리 `import()`가 여전히 간선으로 세어지는지부터 재겠습니다.타입 자리 `import()`가 간선으로 세어집니다. 나머지 형태와 대조도 이어서 찍겠습니다.복구 게이트로 넘어가, `role={"alert"}`와 변수로 넘긴 알림이 막다른 화면으로 세어지는지 보겠습니다.조립 표지 값이 그 파일의 아무 `id:` 에나 묶이는지 한 번 더 심어 보겠습니다.기준 HEAD는 `c41cae5d`. 6~8회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 8회차 뒤에 고친 **범위 조건**만 노렸습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status`는 깨끗합니다. 커밋·push는 하지 않았습니다.

`check-vacuous-tests.mjs`는 이 트리에 `typescript` 패키지가 없어 실행 자체를 못 했습니다. 그 게이트는 지적에서 뺐습니다.

---

# 판정: **NOT CLEAN** — 실증된 지적 11건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `check-dead-ui-specs.mjs:236-243` | 타입 자리 `import()` 가 줄 머리·`typeof` 가 아니면 값 간선 |
| 2 | `check-dead-ui-specs.mjs:341-346, 508-511` | 정의 지도가 백틱을 모르고, 존재 검사는 아무 따옴표 문자열 |
| 3 | `check-dead-ui-specs.mjs:368-370` | `className={"x" as const}` 는 클래스 집에 안 들어감 |
| 4 | `check-dead-ui-specs.mjs:167-176` | 영구 꺼짐 넷 밖에 `{ "true" }` / `{true as boolean}` / JSX 표지 |
| 5 | `check-dead-ui-specs.mjs:279-283` | `package-public/app.json` 파일이 있으면 App 이 뺀 앱이 뿌리 |
| 6 | `check-dead-ui-specs.mjs:350-357` | 조립 파일 안의 아무 `id:` 가 탭 값이 됨 |
| 7 | `check-recovery-affordance.mjs:31, 132` | `role={"alert"}` 은 알림이 아니고, 600자 창 밖 `return` 은 막다른 화면이 아님 |
| 8 | `check-destructive-affordance.mjs:334-366` | ALLCAPS 상수·허용 함수 안·앞쪽 리터럴 합집합 |
| 9 | `check-silent-clicks.mjs:52, 55` | `return undefined` 와 `!== undefined` |
| 10 | `build-e2e-inventory.mjs:75-92, 188` | 자국 목록에 없는 주소, 스펙에 직접 적은 호출 |
| 11 | `check-untranslated-ui.mjs:117-118` | `document.documentElement.lang` / `Intl` 로케일 표 |

---

## 1. `scripts/check-dead-ui-specs.mjs:236-243` — 타입 자리 `import()` 는 `typeof` 와 줄 머리 `type` 만 빼고, 주석이 막아 둔 나머지 형태는 값 간선이다

8회차는 `typeof import("./X")` 와 한 줄 `type _ = import("./X")` 를 닫았습니다. 가드는 그 줄이 `type`/`interface` 로 시작하거나 `typeof import(` 가 있을 때만 간선이 아닙니다.

고아 `IssuesArea.tsx`(값 import 는 닿지 않는 `WorkspaceCenterArea` 하나, `KNOWN_UNRENDERED` 밖)에 `data-testid="ghost-wake-panel"`, 스펙이 기다림.

**(a) 값 자리 타입 주석.** `App.tsx:5` 다음에 `const _ghost: import("./apps/workspace/IssuesArea").GithubIssue = null as never;` → 이름 184개, 없는 것 0, **EXIT=0**.

**(b) `as import()`.** `const _ghost = null as import("./apps/workspace/IssuesArea").GithubIssue;` → **EXIT=0**.

**(c) 두 줄 타입.**
```
type _Ghost =
	import("./apps/workspace/IssuesArea").GithubIssue;
```
`import()` 가 있는 줄은 `type` 으로 시작하지 않습니다 → **EXIT=0**.

**대조.** 표지만 고아 파일에 두고 import 없음 → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**. 한 줄 `type _Ghost = import("./apps/workspace/IssuesArea").GithubIssue;` (8회차가 닫은 형태) → **EXIT=1**.

머리말이 막겠다는 “타입만 쓰인다”가, 줄 머리/`typeof` 가 아닌 타입 `import()` 로 다시 통과합니다.

---

## 2. `scripts/check-dead-ui-specs.mjs:341-346, 452, 508-511` — 정의 지도는 따옴표만 잇고, 집이 없으면 고아 판정을 건너뛴 채 아무 문자열로 살아 있다고 친다

8회차는 `data-testid={"x"}` 를 `definedIn` 에 넣었습니다. 정규식은 선택 `{` 뒤에 **따옴표**가 와야 합니다. 존재 검사는 그 지도가 아니라 `sourceText.includes('"'+name+'"')` / 백틱입니다. 고아 판정은 `homes && homes.size > 0` 일 때만 돕니다.

**(a) 템플릿.** 고아 `IssuesArea.tsx:304` 를 `data-testid={\`ghost-wake-panel\`}` 로 바꾸고 스펙이 기다림 → 184/0, **EXIT=0**.

**(b) 표지가 아닌 문자열.** 소스에 표지 없이 스펙만 기다림 → 없는 이름 1, **EXIT=1**. `logger.ts` 끝에 `const _removed = "ghost-wake-panel";` 한 줄 → 184/0, **EXIT=0**.

**대조.** 고아 파일의 따옴표 `data-testid="ghost-wake-panel"` → **EXIT=1**. 문자열 없이 스펙만 → **EXIT=1**.

8회차가 이은 JSX 식은 따옴표 한 겹이고, 백틱과 “어디든 따옴표”는 정의 지도를 비워 고아 검사를 끕니다. 6회차가 닫은 주석 부활이, 주석이 아닌 문자열로 남아 있습니다.

---

## 3. `scripts/check-dead-ui-specs.mjs:368-370` — `className={"x"}` 는 넣었지만 `as const` 가 붙으면 집이 없다

클래스 JSX 식은 `className={\s*["']...["']\s*\}` 입니다. `\}` 앞에 ` as const` 가 오면 탈락하고, 집이 없으면 클래스 검사는 `continue` 입니다.

**심은 것.** 고아 `IssuesArea.tsx:304` 를 `className={"ghost-wake-panel" as const}` 로 바꾸고 스펙이 `.ghost-wake-panel` 을 기다림 → **EXIT=0**.

**대조.** `className="ghost-wake-panel"` → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

`disabled={true as const}` 는 8회차 뒤에 영구 꺼짐으로 넣었습니다. 같은 표기를 클래스에 쓰면 화면이 사라집니다.

---

## 4. `scripts/check-dead-ui-specs.mjs:167-176` — 영구 꺼짐을 넷으로 본다고 적었는데, 같은 뜻의 JSX 문자열·`as boolean`·식 표지는 안 본다

주석은 `disabled` / `{true}` / `"true"` / `{true as const}` 넷이라고 합니다. `"true"` 는 HTML 속성 `disabled="true"` 이지 `disabled={"true"}` 가 아닙니다. 표지 추출은 여전히 `data-testid="..."` 따옴표만 봅니다.

**(a) 새 버튼.** `SettingsTab.tsx` 연결 탭 앞에 `data-testid="ghost-wake-panel"` + `disabled={"true"}` → **EXIT=0**. `disabled={true as boolean}` 도 **EXIT=0**.

**(b) 식 표지 + 값 없는 `disabled`.** `data-testid={"ghost-wake-panel"} disabled` (정의 지도에는 잇고, 꺼짐 짝은 못 봄) → **EXIT=0**.

**대조.** `disabled={true}` → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**. `data-testid="ghost-wake-panel" disabled` → **EXIT=1**. `disabled={true as const}` (닫힌 넷 중 하나) → **EXIT=1**.

**실제 사고.** `SettingsTab.tsx:3543` 의 연결 탭 `disabled` 를 `disabled={"true"}` 로만 바꿈 → 게이트가 `KNOWN_DISABLED` 가 낡았다고 하며 **EXIT=1** (`connections`). 그 지시에 따라 `KNOWN_DISABLED` 를 비움 → 스펙 여섯이 여전히 꺼진 탭을 누르는데 **EXIT=0**. 탭은 계속 영구히 꺼져 있습니다.

---

## 5. `scripts/check-dead-ui-specs.mjs:279-283` — 패키지 앱 뿌리가 App 등록이 아니라 `package-public/app.json` 의 **디스크 존재**다

8회차는 `apps/*/index.tsx` 전부를 뿌리로 세던 것을 막았습니다. 지금은 `existsSync(.../package-public/app.json)` 입니다. 런타임 설치본은 `~/.naia/apps/*/app.json` 이고, 소스 트리의 그 파일은 슬라이드 패키징 표식일 뿐입니다. `App.tsx:74` 는 여전히 `sample-note app removed` 입니다.

**심은 것.** `packages/shell/src/apps/sample-note/package-public/app.json` 만 만듦 → 게이트가 `SampleNoteCenterArea.tsx` 면제가 낡았다고 하며 **EXIT=1**. 지시에 따라 `KNOWN_UNRENDERED` 에서 빼고 표지를 붙여 스펙이 기다림 → 이름 184개, 고아 표지 26→23, **EXIT=0**. `App.tsx:74` 주석은 그대로입니다.

**대조.** 그 JSON 없이 고아 파일의 따옴표 표지 → **EXIT=1**.

디렉터리 이름 대신 JSON 파일 이름만 맞으면, 화면에서 뺀 앱이 다시 뿌리입니다.

---

## 6. `scripts/check-dead-ui-specs.mjs:350-357` — 조립 값은 그 파일로 좁혔지만, 그 파일의 아무 `id:` 나 탭이 된다

8회차는 저장소 전체의 `id:` 를 닫고, `data-*-tab={` 가 있는 **그 파일** 안의 `id:`/`key:` 만 보기로 했습니다. `SettingsTab.tsx:380` 에는 로케일 표 `{ id: "ko", ... }` 가 있습니다. 설정 탭 값은 `"profile"` 등이지 `"ko"` 가 아닙니다.

**심은 것.** 산 파일 `SettingsTab.tsx:3473` 에 `data-settings-tab={activeSettingsTab}` 한 속성, 스펙이 `[data-settings-tab="ko"]` 를 기다림 → 184/0, **EXIT=0**.

**대조.** 같은 조립 속성으로 `[data-settings-tab="ghost-wake"]` (그 파일 `id:` 에 없음) → 없는 이름 1, **EXIT=1**. 조립 속성을 빼고 `[data-settings-tab="ko"]` 만 (로케일 `id:` 는 남아 있음) → **EXIT=1**.

존재하지 않는 설정 탭 `"ko"` 가, 같은 파일의 언어 목록 한 줄로 살아납니다.

---

## 7. `scripts/check-recovery-affordance.mjs:31, 132-141` — 머리말의 `role="alert"` 막다른 화면이, 식·공백·600자 창이면 알림이 아니다

`FAILURE_SURFACE` 는 `role=["']alert["']` 입니다. `isDeadEnd` 는 알림 앞 600자 안의 `return` 만 봅니다. HEAD 는 표면 4곳 / 다음 행동 없음 1곳(면제된 Mermaid).

**(a) JSX 식.** `UpdateBanner.tsx:30` 의 `if (installing)` 를 `return (<div role={"alert"}>install failed</div>);` 로 바꿈 → 표면 4곳 그대로, **EXIT=0**.

**(b) 변수.** `const role = "alert"; return (<div role={role}>install failed</div>);` → **EXIT=0**.

**(c) 공백.** `return (<div role = "alert">install failed</div>);` (JSX 에서 合法) → **EXIT=0**.

**(d) 창.** 따옴표 `role="alert"` 를 쓰되 `return (` 과 알림 사이를 607자로 늘림 → 표면 4곳, **EXIT=0**.

**대조.** `return (<div role="alert">install failed</div>);` → `UpdateBanner.tsx:32`, 표면 5곳 / 다음 행동 없음 2, **EXIT=1**.

게이트가 막겠다고 적어 둔 형태 그대로가, 식·공백·측정 창 때문에 알림으로도 안 셉니다.

---

## 8. `scripts/check-destructive-affordance.mjs:334-366` — 조립 검사가 리터럴을 따라간다고 적힌 세 자리가 따라가지 않는다

8회차는 파일 면제를 자리(`file::함수이름`)로 옮기고, 인자 타입이 리터럴 합집합이면 그 리터럴을 읽기로 했습니다. HEAD 는 호출 15곳.

**(a) ALLCAPS 상수.** 주석 352-354는 “상수의 값이 리터럴이면 게이트가 따라갈 수 있다”며 `invoke(MEMORY_DELETE)` 를 조립에서 `continue` 합니다. 리터럴 호출 루프는 `invoke("memory_delete_fact")` 만 봅니다. `db.ts` 에
```ts
const MEMORY_DELETE_FACT = "memory_delete_fact";
export function ghostWipeFact(factId: string) {
  return invoke(MEMORY_DELETE_FACT, { factId });
}
```
→ 호출 15곳 그대로, **EXIT=0**.

**(b) 허용 자리 = 함수 전체.** `environment-skill.ts:60` `tauriCommands` 객체 안에
```ts
ghostWipe: (factId: string) => {
  const command = "memory_delete_fact";
  return invoke(command, { factId });
},
```
자리 이름이 여전히 `environment-skill.ts::tauriCommands` 이라 면제 → **EXIT=0**.

**(c) 합집합을 파일 앞부분에서 처음 만남.** 같은 파일에
```ts
function listOnly(command: "validate_api_key") { return invoke(command); }
export function ghostWipeFact(command: string) { return invoke(command); }
```
`command: "validate_api_key"` 가 앞쪽에 있어, 뒤의 `string` 인자 `invoke(command)` 도 안전한 합집합으로 읽힘 → **EXIT=0**.

**대조.** `db.ts` 의 `invoke(command)` (소문자 변수) → `db.ts:25 — invoke(command)`, **EXIT=1**. `environment-skill.ts` 에 **새 함수** `ghostWipeFact` 로 같은 조립 → `environment-skill.ts:66 — invoke(command)`, **EXIT=1**.

면제 이유가 거짓이 되어도, 상수 대문자·허용 함수 이름·앞에 있는 다른 시그니처만 맞으면 확인 없는 삭제가 통과합니다.

---

## 9. `scripts/check-silent-clicks.mjs:52, 55` — `return;` 과 `!== null` 은 넣었고, `return undefined` 와 `!== undefined` 는 같은 무음이다

8회차는 `if (!el) { return; }` 와 `!== null` 을 닫았습니다. `return;` 은 세미콜론 직전 값이 없어야 하고, 널 비교는 리터럴 `null` 만 봅니다. 현재 실측 59 / baseline 59라 세 개를 넣어 경계를 넘겼습니다.

**심은 것 (통과).** `01-app-launch.spec.ts` 에 `if (!el) return undefined; await el.click();` 세 쌍 → 59, **EXIT=0**. `if (el !== undefined) el.click();` 세 줄 → 59, **EXIT=0**.

**대조.** `if (!el) return; await el.click();` 세 쌍 → 62 > 59, **EXIT=1**. (`if (el != null) el.click()` 는 잡힙니다.)

호출자가 무시하는 `return undefined` 는 머리말의 “없으면 조용히 넘어가는 클릭” 그대로입니다.

---

## 10. `scripts/build-e2e-inventory.mjs:75-92, 188` — 모듈 목록은 없앴지만, 자국은 수기 URL 이고 스펙 본문은 안 본다

8회차는 헬퍼 모듈 이름 둘을 닫고, 헬퍼 디렉터리를 훑어 `api.openai.com` 같은 자국이 있는 모듈의 export 를 대화 신호로 쓰기로 했습니다. 스펙이 모델을 부르는지는 그 이름 호출만 봅니다.

**(a) 목록에 없는 주소.** `helpers/click.ts` 에 `talkToJudge` (`fetch("https://api.x.ai/v1/chat/completions")`), `13-nva-capability.spec.ts`(지금 `deterministic_ci`, env `[]`)가 그것을 부름. 생성기 → 그 스펙은 계속 `tier: deterministic_ci`, env `[]`. 요약 `deterministic_ci` 23 그대로.

**(b) 스펙에 직접.** 헬퍼 없이 스펙에 `fetch("https://api.openai.com/v1/chat/completions", ...)` → 역시 `deterministic_ci` 23.

**대조.** 같은 `talkToJudge` 의 주소만 `api.openai.com` 으로 바꾸면 그 모듈의 export 가 전부 대화 신호가 되어 `13-nva-capability` 가 `credentialed_live` 로 올라갑니다 (`deterministic_ci` 23→13). `--check` 는 그 틀린 분류가 목록과 일치하는지만 보증합니다.

자국 목록에 `api.x.ai` 가 없고, 스펙 본문의 모델 호출은 헬퍼를 거치지 않으면 결정론 칸입니다. 07-cleanup 오분류와 같은 사고입니다.

---

## 11. `scripts/check-untranslated-ui.mjs:117-118` — 로케일 우회표는 적어 둔 접근자만 보고, `documentElement.lang` 과 `Intl` 은 안 본다

7회차는 `navigator.language` 를 `USES_LOCALE` 에 넣었습니다. 목록은 `getLocale()` / `navigator.language(s)` / `detectLocale(` / `i18n.locale` / `currentLocale` 입니다. 한글 줄 수는 그대로 두려고 표의 문구는 영어로 적었습니다.

**심은 것.** `logger.ts` 끝에
```ts
const lang = document.documentElement.lang.slice(0, 2);
export const GHOST_WAKE = lang === "ko" ? "Update" : "Updates";
```
→ 585줄/66파일, **EXIT=0**. `Intl.DateTimeFormat().resolvedOptions().locale` 로 바꿔도 **EXIT=0**.

**대조.** 같은 표를 `getLocale() === "ko" ? ...` 로 적음 → `logger.ts` 번역표 1개, **EXIT=1**.

HTML `lang` 과 `Intl` 은 언어를 읽는 흔한 길이고, 적어 둔 접근자만 바꾸면 열두 로케일이 다시 빠집니다.

---

## 닫히지 않은 채 잘 잡는 자리 (이번 주입의 대조)

| 변이 | 게이트 | 결과 |
|---|---|---|
| 고아 파일의 따옴표 `data-testid` | dead-ui | EXIT=1 |
| 한 줄 `type _ = import("./X")` | dead-ui | EXIT=1 |
| 소스에 없는 `data-testid` / 조립 파일 `id:` 에 없는 탭 값 | dead-ui | EXIT=1 |
| `disabled={true}` / `disabled={true as const}` / 따옴표 표지+`disabled` | dead-ui | EXIT=1 |
| 고아 파일의 `className="..."` 리터럴 | dead-ui | EXIT=1 |
| `return (<div role="alert">install failed</div>)` | recovery | EXIT=1 |
| 허용 목록 밖 파일·새 함수의 `invoke(command)` | destructive | EXIT=1 |
| `if (!el) return; await el.click()` | silent-clicks | EXIT=1 |
| 헬퍼 모듈의 `api.openai.com` 자국 | inventory | `credentialed_live` 로 재분류 |
| `getLocale() === "ko"` 표 | untranslated | EXIT=1 |

---

**NOT CLEAN** — 실증된 지적 11건. 1·5·6은 다시 쓴 렌더 그래프의 간선·뿌리·조립 값 범위이고, 4·7은 게이트가 막겠다고 적어 둔 사고(꺼 둔 연결 탭, `role="alert"` 막다른 화면)를 범위 조건만 바꿔 다시 통과시킨 것입니다.
