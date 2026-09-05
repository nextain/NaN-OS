# 8회차 교차 리뷰 지적 (2026-09-05)

판정: **NOT CLEAN**, 지적 10건. 아래는 리뷰어 원문이다. 상태는 결함을 실제로
심어 EXIT=1 을 본 뒤 되돌려 EXIT=0 을 본 것만 "닫힘" 으로 적는다.

| # | 대상 | 상태 |
|---|---|---|
| 1 | `apps/*/index.tsx` 를 전부 진입점으로 셌다 | 닫힘 |
| 2 | 타입 자리의 `import()` 와 문자열 속 import 가 값 간선이었다 | 닫힘 |
| 3 | 렌더 잇기가 `data-testid="..."` 리터럴만 봤다 | 닫힘 |
| 4 | 조립 탭 값이 저장소 아무 곳의 `id:` 로 살아났다 | 닫힘 |
| 5 | 클래스가 `className="..."` 과 템플릿만 잡혔다 | 닫힘 |
| 6 | `disabled="true"` / `{true as const}` 를 안 봤다 | 닫힘 |
| 7 | 무음 클릭이 중괄호와 `!== null` 을 안 봤다 | 닫힘 |
| 8 | 복구 게이트가 괄호 없는 return·`Start` 한 단어·이펙트 cleanup 에 속았다 | 닫힘 |
| 9 | 조립 `invoke` 면제가 파일 전체에 걸렸다 | 닫힘 |
| 10 | 대화 헬퍼 모듈 목록이 수기였다 | 닫힘 |

**고치자 드러난 것**: sample-note 앱 화면(App 이 등록을 뺐다), NaiaMetaArea
전체(진행·진단 탭이 여기에만 있다), Mermaid 오류 화면에 다음 행동 없음(#558).

---

## 1. `scripts/check-dead-ui-specs.mjs:264-266` — `apps/*/index.tsx` 를 전부 진입점으로 세서, App 이 끊은 앱이 살아 있다

머리말은 진입점에서 닿는 파일만 산다고 합니다. 슬라이드처럼 매니페스트로 올라오는 앱을 놓치지 않으려고 `apps/*/index.tsx`·`standalone.tsx` 를 뿌리로 넣었습니다. 그 목록은 **App 이 실제로 등록하는가**와 무관합니다.

`App.tsx:74` 는 `sample-note app removed` 라고 적고 부작용 import 를 빼 두었습니다. 그런데 `apps/sample-note/index.tsx` 는 여전히 뿌리라 `SampleNoteCenterArea.tsx` 가 LIVE 입니다.

**심은 것.** `SampleNoteCenterArea.tsx:55` 에 `data-testid="ghost-wake-panel"`, `01-app-launch.spec.ts` 가 그 이름을 기다림 → 이름 184개, 없는 것 0, **EXIT=0**.

**대조.** 같은 따옴표 표지를 고아 `NaiaMetaArea.tsx:49` 에 붙임 → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

화면에서 뺀 앱의 표지를 기다리는 스펙이, 디렉터리 이름만으로 살아납니다.

---

## 2. `scripts/check-dead-ui-specs.mjs:235-253` — `import type` / `{ type X }` 만 빼고, 타입 자리의 `import()` 와 문자열 속 import 는 값 간선이다

주석은 접두 `import type` 과 중괄호 안이 전부 `type` 인 것은 값이 아니라고 합니다. 동적 `import("...")` 에는 그 가드가 없습니다. 파일별 소스는 주석만 지우고 문자열은 남깁니다.

**(a) `typeof import("./components/NaiaMetaArea")`.** `App.tsx:5` 다음에 타입만 적고, 고아 파일에 따옴표 `data-testid="ghost-wake-panel"`, 스펙이 기다림 → **EXIT=0**.

**(b) `type _ = import("./components/NaiaMetaArea").NaiaMetaArea`.** 같은 표지 → **EXIT=0**.

**(c) 템플릿 문자열.** `App.tsx` 에 `` const _ghost = `import { NaiaMetaArea } from "./components/NaiaMetaArea";`; `` 만 추가 → **EXIT=0**.

**대조.** `import { type NaiaMetaArea } from "./components/NaiaMetaArea"` (7회차에서 닫은 형태) → **EXIT=1**. 표지만 고아 파일에 두고 import 흔적 없음 → **EXIT=1**.

방금 닫은 “타입만 쓰인다”가, 접두/`{ type }` 이 아닌 타입 `import()` 와 문자열 속 문구로 다시 통과합니다.

---

## 3. `scripts/check-dead-ui-specs.mjs:320-321` — 렌더 잇기는 `data-testid="..."` 리터럴만 보고, `data-testid={"..."}` 는 존재 검사만 통과한다

`definedIn` 은 `=["']...["']` 만 집습니다. 이름 존재 검사는 `sourceText.includes('"'+name+'"')` 이라 JSX 식 `data-testid={"ghost-wake-panel"}` 안의 따옴표로도 살아 있다고 칩니다. 정의 파일이 이어지지 않으니 고아 판정은 건너뜁니다.

**심은 것.** 고아 `NaiaMetaArea.tsx:49` 를 `data-testid={"ghost-wake-panel"}` 로 바꾸고 스펙이 기다림 → 184/0, **EXIT=0**.

**대조.** `data-testid="ghost-wake-panel"` → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

같은 고아 화면에 표지를 붙이는 자연스러운 JSX 식만으로 렌더 잇기가 사라집니다.

---

## 4. `scripts/check-dead-ui-specs.mjs:112-119, 320-321, 454-455` — 조립 탭 값은 정의 파일에 잇지 않고, 저장소 아무 곳의 `id:` 로 살아난다

머리말의 둘째·셋째 사고는 Agents 탭과 렌더되지 않는 `NaiaMetaArea` 입니다. 그 탭 표지는 아직도 `data-meta-tab={tab.id}` (`NaiaMetaArea.tsx:59`) 입니다.

- `definedIn` 은 따옴표 리터럴만 잇습니다. `{tab.id}` 의 `"progress"` 는 집에 없습니다.
- 존재 검사는 `data-meta-tab={` 가 있고 `id:`/`key:` 표에 그 문자열이 있으면 통과합니다. 그 표는 **파일과 무관**합니다.

**이미 HEAD 에 있는 거짓 통과.** `e2e-tauri/helpers/selectors.ts:59,89,126` 이 `[data-meta-tab="progress"|"skills"|"diagnostics"]` 를 집습니다. `progress`/`diagnostics` 의 `definedIn` 은 비어 있고, 값은 고아 `NaiaMetaArea` 의 `id: "progress"` 등에서 옵니다. 게이트는 **EXIT=0** 입니다. `skills` 는 산 파일 `SettingsTab` 의 `data-settings-tab="skills"` 와 값만 같아 산 표지로 오인됩니다.

**심은 것.** 스펙에 `[data-meta-tab='ghost-wake']` 만 추가 → 없는 이름 1, **EXIT=1**. `logger.ts` 끝에 `{ id: "ghost-wake" }` 한 줄 → 184/0, **EXIT=0**.

**대조.** 소스에 없는 `[data-testid='ghost-wake-panel']` → **EXIT=1**.

존재하지도 않는 메타 탭을, 로그 모듈의 `id:` 한 줄이 살려 줍니다.

---

## 5. `scripts/check-dead-ui-specs.mjs:332-337` — 클래스 선택자는 `className="..."` 과 `` className={`...`} `` 만 본다

7회차는 템플릿을 닫았습니다. JSX 식 `className={"ghost-wake-panel"}` / `className={'ghost-wake-panel'}` 은 여전히 `classDefinedIn` 에 안 들어갑니다. 집이 없으면 클래스 검사는 `continue` 로 건너뜁니다.

**심은 것.** 고아 `NaiaMetaArea.tsx:49` 를 `className={"ghost-wake-panel"}` 로 바꾸고 스펙이 `.ghost-wake-panel` 을 기다림 → **EXIT=0**. `className={'ghost-wake-panel'}` 도 **EXIT=0**.

**대조.** `className="ghost-wake-panel"` → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

---

## 6. `scripts/check-dead-ui-specs.mjs:170-172` — `disabled` 와 `disabled={true}` 만 영구로 본다. `disabled="true"` 면 실제 사고가 통과한다

머리말은 값 없이 박힌 `disabled` 와, 7회차에 넣은 `disabled={true}` 만 영구로 봅니다. React 에서 같은 영구 꺼짐은 `disabled="true"` 와 `disabled={true as const}` 입니다.

**심은 것 (새 버튼).** `SettingsTab.tsx` 연결 탭 앞에 `data-testid="ghost-wake-panel"` + `disabled="true"` 를 넣고 스펙이 기다림 → **EXIT=0**. `disabled={true as const}` 도 **EXIT=0**.

**대조.** `disabled={true}` → `01-app-launch.spec.ts:50 — ghost-wake-panel`, **EXIT=1**.

**실제 사고 재현.** `SettingsTab.tsx:3543` 의 연결 탭 `disabled` 를 `disabled="true"` 로만 바꿈 → 게이트가 `KNOWN_DISABLED` 가 낡았다고 하며 **EXIT=1** (`connections`). 그 지시에 따라 `KNOWN_DISABLED` 를 비움 → 스펙 여섯(그중 `92-discord-secure-cancel.spec.ts:28-29`)이 여전히 꺼진 탭을 누르는데 **EXIT=0**. 탭은 계속 영구히 꺼져 있습니다.

---

## 7. `scripts/check-silent-clicks.mjs:52` — `await` 와 `if (!el) return;` 는 넣었지만, 포매터가 넣는 중괄호와 `!== null` 은 안 본다

7회차 7번은 빈 괄호 `click()` 과 `if (!el) return;` 이었습니다. 정규식은 여전히 `if (!el) return;` 처럼 **중괄호 없는 한 줄**만 압니다. 이 저장소의 포매터가 권하는 형태는 `if (!el) { return; }` 입니다. `if (el !== null) el.click()` 도 같은 무음입니다.

현재 실측은 59이고 baseline 도 59라, 세 개를 넣어 경계를 넘겼습니다.

**심은 것 (통과).** `01-app-launch.spec.ts` 에 `if (!el) { return; } await el.click();` 세 쌍 → 59, **EXIT=0**. `if (el !== null) el.click();` 세 줄 → 59, **EXIT=0**.

**대조.** `if (!el) return; await el.click();` 세 쌍 → 62 > 59, **EXIT=1**.

같은 무음 클릭을 중괄호로 감싸거나 널 비교만 바꿔도 안 보입니다.

---

## 8. `scripts/check-recovery-affordance.mjs:43, 125` — 머리말이 예시로 든 `return <div role="alert">` 는 막다른 화면이 아니고, `Start` 한 단어와 `return () =>` 가 복구로 센다

머리말은 막다른 화면을 `if (error) return <... role="alert">` 라고 적습니다. `isDeadEnd` 는 `return (` 가 있어야 하고, 그 앞 600자 안의 **첫** `return (` 를 씁니다. `RECOVERY` 는 `Start` 부분문자열을 행동으로 인정합니다.

**심은 것 (통과).** `UpdateBanner.tsx` 의 `if (installing)` 분기를 `return <div role="alert">install failed</div>` 로 바꿈 (괄호 없음, 머리말 예시와 같음) → 표면 3곳, **EXIT=0**.

같은 자리를 `return (<div role="alert">Start-up failed</div>)` 로 바꿈 → 표면 4곳인데 다음 행동 0, **EXIT=0** (`Start` 가 복구).

`SplashScreen.tsx` 는 `return () => clearTimeout` 이 600자 안에 있습니다. 여기에 `return (<div role="alert">install failed</div>)` 를 넣어도 표면 3곳, **EXIT=0**.

**대조.** `UpdateBanner.tsx` 를 `return (<div role="alert">install failed</div>)` 로만 바꿈 → `UpdateBanner.tsx:32`, **EXIT=1**.

게이트가 막겠다고 적어 둔 형태 그대로가, 괄호 하나·`Start` 한 단어·이펙트 cleanup 때문에 통과합니다.

---

## 9. `scripts/check-destructive-affordance.mjs:330-339` — 조립 `invoke` 면제가 호출부가 아니라 **파일 전체**에 걸린다

주석은 environment-skill 의 동작 표에서 리터럴로 정한 이름만 그 자리를 지난다고 합니다. 판정은 `COMPOSED_ALLOWED.has(hit.file)` 이라, 그 파일에 확인 없는 파괴 명령을 조립해 새로 넣어도 조립 검사가 삼킵니다. 리터럴 이름 검색은 `invoke(command)` 를 못 봅니다.

**심은 것.** `environment-skill.ts` 끝에

```ts
export function ghostWipeFact(factId: string) {
  const command = "memory_delete_fact";
  return invoke(command, { factId });
}
```

→ 호출 15곳, **EXIT=0**.

**대조.** 같은 함수를 `db.ts` 에 넣음 → `db.ts:55 — invoke(command)`, **EXIT=1**. 같은 파일에 `invoke("memory_delete_fact", { factId })` 리터럴로 넣음 → `environment-skill.ts:278 — memory_delete_fact`, **EXIT=1**.

면제 이유가 거짓이 되어도, 파일 이름만 맞으면 새 파괴 호출이 통과합니다.

---

## 10. `scripts/build-e2e-inventory.mjs:65` — 대화 헬퍼를 모듈에서 읽게 고쳤지만, 모듈 목록 두 칸은 수기다

6회차 10번은 `CHAT_HELPERS` 함수 네 칸이었습니다. 지금은 `chat.ts`·`semantic.ts` 의 export 를 읽습니다. `click.ts` 같은 다른 헬퍼 모듈에 모델을 부르는 함수를 두면 결정론 칸에 들어갑니다. `--check` 는 그 틀린 분류가 목록과 일치하는지만 보증합니다.

**심은 것.** `helpers/click.ts` 에 `talkToJudge` (실제 `api.openai.com` fetch), `13-nva-capability.spec.ts` 가 그것을 부름. 생성기를 돌리면 그 스펙은 계속 `tier: deterministic_ci`, env `[]`. 요약은 `deterministic_ci` 23 그대로입니다.

**대조.** 같은 스펙이 `chat.ts` 의 `verifyWithSubAgent(` 를 부르면 자격증명 칸으로 올라갑니다. 목록에 없는 모듈만 고르면 이미 두 번 겪은 오분류가 다시 나옵니다.

---

## 닫히지 않은 채 잘 잡는 자리 (이번 주입의 대조)

| 변이 | 게이트 | 결과 |
|---|---|---|
| 고아 파일의 따옴표 `data-testid` | dead-ui | EXIT=1 |
| `import { type X }` | dead-ui | EXIT=1 |
| 소스에 없는 `data-testid` / 조립 표에 없는 `data-meta-tab` | dead-ui | EXIT=1 |
| `disabled={true}` | dead-ui | EXIT=1 |
| 고아 파일의 `className="..."` 리터럴 | dead-ui | EXIT=1 |
| `if (!el) return; el.click()` | silent-clicks | EXIT=1 |
| `return (<div role="alert">install failed</div>)` (앞에 `return () =>` 없음) | recovery | EXIT=1 |
| 허용 목록 밖 파일의 조립 `invoke(command)` | destructive | EXIT=1 |
| 허용 파일의 리터럴 `invoke("memory_delete_fact")` | destructive | EXIT=1 |
| `"업데이트"` 리터럴 | untranslated | EXIT=1 |

---

**NOT CLEAN** — 실증된 지적 10건. 1·2는 다시 쓴 렌더 그래프의 진입점·간선 범위이고, 4·6은 게이트가 막겠다고 적어 둔 사고(죽은 NaiaMetaArea 탭, 꺼 둔 연결 탭)를 범위 조건만 바꿔 다시 통과시킨 것입니다.

[exited with code 0]
