# 9회차 교차 리뷰 지적 (2026-09-05)

판정: **NOT CLEAN**, 지적 14건.

| # | 대상 | 상태 |
|---|---|---|
| 1~5 | 출력을 tail 로만 받아 잃음 — 같은 스냅숏에서 재수집 중 | 미확보 |
| 6 | 패키지 앱 표식이 파일 존재만으로 뿌리가 됐다 | 닫힘 |
| 7 | `<>` 조각은 태그가 아니라 막다른 화면을 비껴갔다 | 닫힘 |
| 8 | 실패 표면이 `role="alert"` 리터럴만이었다 | 닫힘 |
| 9 | `== null` / `!== undefined` 형태를 안 봤다 | 닫힘 |
| 10 | `confirmed === true` 같은 변수 이름이 확인으로 셌다 | 닫힘 |
| 11 | 리터럴 합집합을 파일의 첫 서명에서 읽었다 | 닫힘 |
| 12 | 조립 면제가 그 함수 안의 새 조립까지 삼켰다 | 닫힘 |
| 13 | 대화 자국이 손으로 적은 주소라 xAI 가 빠졌다 | 닫힘 |
| 14 | 로케일을 `localStorage` 에서 읽는 우회표를 안 봤다 | 닫힘 |

**제 실수 하나**: 리뷰 출력을 `tail` 로만 받아 지적 1~5 를 잃었습니다. 같은
스냅숏에서 전체를 다시 받고 있습니다. 이후로는 전체를 파일로 받습니다.

---

---

## 6. `scripts/check-dead-ui-specs.mjs:279-284` — 패키지 앱 표식이 소스의 `app.json` 이라, App 이 끊은 앱이 파일 하나만으로 살아난다

8회차 1번은 `apps/*/index.tsx` 를 전부 뿌리로 센 것이었습니다. 지금은 `package-public/app.json` 이 있는 것만 뿌리입니다. 그 파일은 `existsSync` 라 git 추적도 필요 없고, **App 이 부작용 import 로 등록하는가**와도 무관합니다. 런타임 설치 앱은 `~/.naia/apps` 의 `app.json` 이지 `src/apps/*/package-public` 이 아닙니다.

`App.tsx:74` 는 여전히 `sample-note app removed` 라고 적고 import 를 빼 두었습니다.

**심은 것.** 추적되지 않는 `packages/shell/src/apps/sample-note/package-public/app.json` 한 줄 → 게이트가 `SampleNoteCenterArea.tsx` 가 다시 화면에 올랐으니 목록에서 빼라고 하며 **EXIT=1**.

**그 지시에 따라** `KNOWN_UNRENDERED` 에서 그 항목을 지움 → 화면에 오르지 않는 표지 26곳→23곳, **EXIT=0**. App 은 그 앱을 등록하지 않습니다.

디렉터리 이름만으로 살아나던 사고가, 표식 파일 하나로 다시 통과합니다.

---

## 7. `scripts/check-recovery-affordance.mjs:151-154` — 여는 태그를 걷어 막다른 화면을 보는데, `<>` 조각은 태그가 아니다

8회차는 괄호 없는 `return <div role="alert">` 와 앞쪽 `return () =>` 를 닫았습니다. `isDeadEnd` 는 `return` 과 알림 사이에서 `/<[A-Za-z][\w.]*…>/` 로 여는 태그를 지웁니다. `<>` 는 글자가 없어 남고, 남은 것이 있으면 막다른 화면이 아닙니다.

**심은 것.** `UpdateBanner.tsx:30` 의 `if (installing)` 을

```tsx
return (
  <>
    <div role="alert">install failed</div>
  </>
);
```

로 바꿈 → 표면 4곳(기준선과 같음), **EXIT=0**.

**대조.** `<>` 없이 `return (<div role="alert">install failed</div>)` → `UpdateBanner.tsx:32`, **EXIT=1**.

머리말이 막겠다는 막다른 오류 화면을, 실무에서 흔히 쓰는 조각만 씌워도 통과합니다. `<React.Fragment>` 는 태그로 지워져 잡힙니다.

---

## 8. `scripts/check-recovery-affordance.mjs:31` — 실패 표면이 `role="alert"` 리터럴만이라, `role={"alert"}` 는 자리 자체가 아니다

표지 정의는 JSX 식까지 이었는데, 알림 표지는 그대로 `/role=["']alert["']/` 입니다.

**심은 것.** 같은 `UpdateBanner` 분기를 `return (<div role={"alert"}>install failed</div>)` 로 바꿈 → 표면 4곳, **EXIT=0** (새 표면으로 세지도 않음).

**대조.** `role="alert"` → **EXIT=1** (지적 7의 대조와 같음).

---

## 9. `scripts/check-silent-clicks.mjs:46-55` — `!el` 과 `!== null` 은 넣었고, TypeScript 가 쓰는 `== null` / `!== undefined` 는 안 본다

8회차는 중괄호와 `!== null` 이었습니다. 부정 조기 return 은 `if (!el)` 만, 긍정 널 비교는 `!==? null` 만 압니다. `el == null` 은 null 과 undefined 를 함께 보는 이 코드베이스의 관용입니다.

기준선과 실측이 둘 다 59라, 세 개를 넣어 경계를 넘겼습니다.

**심은 것 (통과).** `01-app-launch.spec.ts` 에 `if (a == null) { return; } await a.click();` 세 쌍 → 59, **EXIT=0**. `if (a !== undefined) a.click();` 세 줄 → 59, **EXIT=0**.

**대조.** `if (!a) { return; } await a.click();` 세 쌍 → 62 > 59, **EXIT=1**.

같은 무음 클릭을 비교만 바꿔도 안 보입니다.

---

## 10. `scripts/check-destructive-affordance.mjs:108-109` — `confirm(` 가 아니라 `\bconfirm\w* ===` 이라, `confirmed === true` 가 확인이다

6회차는 단어 경계 없는 `/confirm/i` 였습니다. 지금은 호출·대화상자·`set*Confirm(` 와 함께 `\bconfirm\w*\s*(?:===|!==|\?|&&)` 를 인정합니다. `confirmed` 는 그 패턴에 그대로 들어갑니다.

**심은 것.** `db.ts` 의 `deleteAgentFact` 아래에

```ts
export function ghostWipeFact(factId: string) {
  const confirmed = true;
  if (confirmed === true) return invoke("memory_delete_fact", { factId });
}
```

→ 호출 16곳, **EXIT=0**.

**대조.** 같은 함수에서 `confirmed` 줄을 빼고 `return invoke("memory_delete_fact", { factId });` 만 남김 → `db.ts:29 — memory_delete_fact (감싼 함수 ghostWipeFact)`, **EXIT=1**.

사용자에게 묻지 않는 불리언 변수 이름이 확인으로 셉니다. `{ return invoke(...) }` 처럼 안쪽 블록으로 나누면 함수 이름으로 `confirmed` 를 읽어 오히려 붉어지므로, **한 함수 본문에 같이 두는** 자연스러운 형태가 통과합니다.

---

## 11. `scripts/check-destructive-affordance.mjs:358-366` — 인자 타입 리터럴 합집합을 **파일에서 첫 번째** `command:` 로 읽는다

8회차는 조립 면제를 자리로 옮기고, 인자 타입이 `"a" | "b"` 이면 그 리터럴로 판정한다고 했습니다. 구현은 `code.slice(0, match.index)` 에 `/g` 없는 `.exec` 라 **그 앞의 첫 주석**입니다.

**심은 것.** `db.ts` 에

```ts
export function decoyPing(command: "validate_api_key") {
  return invoke(command);
}
export function ghostWipeFact(factId: string) {
  const command = "memory_delete_fact";
  return invoke(command, { factId });
}
```

→ 호출 15곳(조립 호출로도 안 셈), **EXIT=0**. 앞선 `"validate_api_key"` 가 파괴 후보가 아니라서 `invoke(command)` 가 통째로 사라집니다.

**대조.** `decoyPing` 만 지움 → `db.ts:25 — invoke(command)`, **EXIT=1**.

---

## 12. `scripts/check-destructive-affordance.mjs:334-339` — 조립 면제가 파일이 아니라 함수인데, 그 함수 안의 **새** 조립 파괴는 그대로 삼킨다

8회차 9번은 파일 전체 면제였습니다. 지금은 `environment-skill.ts::tauriCommands` 자리입니다. 이유가 “동작 표에서 리터럴로 정한 이름만 그 자리를 지난다” 인데, 판정은 함수 이름이라 그 함수에 확인 없는 파괴를 조립해 넣어도 통과합니다.

**심은 것.** `environment-skill.ts:60` 의 어댑터 본문을

```ts
invoke: (command, args) => {
  const wipe = "memory_delete_fact";
  void invoke(wipe);
  return invoke<unknown>(command, args as Record<string, unknown>);
},
```

로 바꿈 → 호출 15곳, **EXIT=0**.

**대조.** 같은 `invoke(command)` 를 허용 목록 밖 `db.ts` 에 넣음 → **EXIT=1** (지적 11의 대조). 허용 함수의 리터럴 `invoke("memory_delete_fact")` 는 8회차와 같이 잡힙니다.

파일에서 함수로 좁힌 면제가, 면제 이유가 거짓인 새 호출을 같은 함수 안에서 다시 받습니다.

---

## 13. `scripts/build-e2e-inventory.mjs:75-76` — 대화 자국이 openai·anthropic·google·openrouter 주소라, 이 저장소가 쓰는 xAI 는 결정론 칸이다

8회차는 모듈 수기 목록을 없애고 “모델과 말을 섞는 자국”으로 고른다고 했습니다. 자국에 `api.x.ai` 가 없습니다. 이 저장소의 기본 모델 경로가 그 주소입니다.

**심은 것.** `helpers/click.ts` 에 `talkToGrok`(실제 `https://api.x.ai/v1/chat/completions` fetch), `100-herdr-first-frame.spec.ts` 가 그것을 부름. `--check` **EXIT=0**. 생성 결과는 그 스펙이 계속 `tier: "deterministic_ci"`, `env: []`. 요약 `deterministic_ci` 23 그대로입니다.

**대조.** URL 만 `api.openai.com` 으로 바꿈 → click.ts 가 대화 모듈이 되어 `clickElement` 를 쓰는 스펙이 자격증명 칸으로 올라가고 `--check` **EXIT=1**.

목록에 없는 제공자만 고르면, 이미 두 번 겪은 오분류가 다시 나옵니다. `--check` 는 그 틀린 분류가 목록과 일치하는지만 보증합니다.

---

## 14. `scripts/check-untranslated-ui.mjs:117-118` — 로케일 우회표는 `getLocale`·`navigator.language` 등만 보고, `localStorage` 로케일은 안 본다

8회차 이전에 `navigator.language` 를 넣었습니다. 이 앱이 로케일을 실제로 들고 있는 자리(`localStorage` / `loadConfig().locale`)는 `USES_LOCALE` 에 없습니다. 언어 코드 비교(`=== "ko"`)는 그 파일이 로케일을 **읽는 것으로 보일 때만** 표로 셉니다.

**심은 것.** `logger.ts` 끝에  
`(localStorage.getItem("naia-locale") ?? "en") === "ko" ? "Update" : "Update"`  
→ 585줄/66파일, **EXIT=0**.

**대조.** 같은 표를 `(getLocale() ?? "en") === "ko" ? …` 로 바꿈 → `logger.ts` 가 우회표 1개, **EXIT=1**.

한글 줄 수를 올리지 않아도, 열넷 로케일을 우회하는 표가 다시 생깁니다.

---

## 닫히지 않은 채 잘 잡는 자리 (이번 주입의 대조)

| 변이 | 게이트 | 결과 |
|---|---|---|
| 고아 파일의 따옴표 `data-testid` / `className="..."` | dead-ui | EXIT=1 |
| `typeof import("./X")` | dead-ui | EXIT=1 |
| `disabled={true}` + 따옴표 표지 | dead-ui | EXIT=1 |
| `return (<div role="alert">install failed</div>)` | recovery | EXIT=1 |
| `if (!el) { return; } await el.click()` | silent-clicks | EXIT=1 |
| 확인 없는 `invoke("memory_delete_fact")` | destructive | EXIT=1 |
| 허용 목록 밖 파일의 `invoke(command)` | destructive | EXIT=1 |
| 헬퍼에 `api.openai.com` | inventory `--check` | EXIT=1 |
| `getLocale() === "ko"` 표 | untranslated | EXIT=1 |

---

**NOT CLEAN** — 실증된 지적 14건. 1·3·6은 게이트가 막겠다고 적어 둔 사고(죽은 화면을 기다리는 스펙, 꺼 둔 연결 탭, App 이 뺀 sample-note)를, 8회차가 닫은 형태 옆의 범위 조건만 바꿔 다시 통과시킨 것입니다.

[exited with code 0]
