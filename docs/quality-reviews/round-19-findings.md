# 19회차 교차 리뷰 지적 (2026-09-06, 스냅숏 fa8718d3)

판정: **NOT CLEAN**, 지적 6건. 아래는 리뷰어 원문이다.

---

19회차 적대적 교차 리뷰를 시작합니다. 먼저 프로세스 현황과 닫힌 지적, 게이트 머리말의 보증 범위를 읽고, 그다음 공용 모듈과 호출 규약을 대조하겠습니다.닫힌 지적과 게이트 머리말, 공용 모듈을 병렬로 읽어 이번 회차에서 아직 안 본 경계를 잡겠습니다.18회차 나머지와 공용 모듈 머리말을 이어서 읽고, 표 안인데 안 접히는 갈래를 찾겠습니다.정적 평가·바인딩·토큰 구현을 이어서 읽고, 표 안인데 안 접히는 갈래와 호출 규약 구멍을 좁히겠습니다.호출 규약과 린트 검출기·시딩 계약을 대조해, 표 안 형태가 안 접히는 자리를 좁히겠습니다.가설을 모듈에 직접 묻기 위해 런타임과 심을 자리를 확인한 뒤, 표 안 형태부터 프로브하겠습니다.HEAD는 깨끗합니다. TypeScript만 연결한 뒤 모듈에 가설을 직접 묻겠습니다.기준선 게이트를 병렬로 돌린 뒤, 모듈에서 통과한 형태만 심겠습니다.기준선은 전부 `EXIT=0`입니다. 이제 가설을 하나씩 심고 게이트를 돌리겠습니다.# 판정: **NOT CLEAN** — 실증된 지적 6건

기준 HEAD는 `aac32a5`입니다. 6~18회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, **표 안의 형태가 접히지 않는 갈래**와 게이트가 공용 모듈을 **부르는 규약**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

기준선은 전부 `EXIT=0`이었습니다 (dead-ui 이름 175 / 복구 자리 1·0 / 무음 107 / 파괴 206·16·14 / 데이터 홈 이름표 14·공개 16 / 인벤토리 119 / 린트 위반 0). 되돌린 뒤 같은 숫자로 `EXIT=0`입니다.

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `jsx-static.mjs:349-354, 395` `propertyName` | `{...{ ["role"]: "alert" }}` 는 알림이 아니다. `{...{ role: "alert" }}` 는 알림이다 |
| 2 | `static-eval.mjs:319-327` `isStringRawTag` | `String["raw"]\`alert\`` 은 알림이 아니다. `String.raw\`alert\`` 은 알림이다 |
| 3 | `bindings.mjs:130-137` `memberName` | `invoke[String.raw\`call\`](null, "memory_delete_fact")` 는 호출부가 아니다. `invoke.call(null, …)` 는 호출부다 |
| 4 | `lint-boundary-forms.mjs:218-226` `computedCallee` | `f[String.raw\`call\`]()` 은 금지 형태가 아니다. `f["call"]()` 은 금지다 |
| 5 | `check-silent-clicks.mjs:375-384` `memberName` | `if (el) el[String.raw\`click\`]()` 은 무음이 아니다. `el.click()` 은 무음이다 |
| 6 | `check-dead-ui-specs.mjs:104-114` 명령 목록 | 주석 `// #[tauri::command]` 옆의 `fn ghost_r19_cmd` 는 있는 명령이다. 주석이 없으면 없는 명령이다 |

18회차가 평가기를 `scripts/lib/static-eval.mjs` 하나로 떼어 낸 뒤, **값을 접는 자리**는 그 표를 쓰는데 **이름을 읽는 자리** 넷(`propertyName`·`memberName` 둘·`isStringRawTag`·린트 `computedCallee`)은 여전히 문자열 리터럴 AST만 받습니다. `accessKeyOf`/`declaredPropertyName`/`staticValue`가 이미 접는 키가, 호출자 쪽에서 다시 글자가 됩니다.

---

## 1. `scripts/lib/jsx-static.mjs:349-354, 395` — 계산된 리터럴 키는 속성 이름이 아니다

18회차 지적 2는 `{...{ ["role"]: "alert" }}` 가 알림이 아니라고 심었고, 닫힘 증거는 `role={{ ["ro" + "le"]: "alert" }.role}` 이었습니다. 그건 **값** 자리(`staticValue` → `declaredPropertyName`)이고, 요소 속성을 모으는 `elementProps`는 여전히 지역 `propertyName`을 씁니다. 식별자·문자열·숫자 리터럴만 받고 `ComputedPropertyName`은 `null`입니다. 그때 `unknownSpread = true` 만 올리고 속성 목록에는 넣지 않습니다.

복구 판정 `isAlert`는 `unknownSpread`를 버리고 `props`만 봅니다. 죽은 UI의 꺼 둠 판정도 `props`의 `disabled`만 보고, `unknownSpread`는 로그만 셉니다(5→6).

`{...{ ["role"]: "alert" }}`와 `{...{ role: "alert" }}`는 브라우저에서 구별되지 않습니다. 동적 키(`{ [name]: "alert" }`)가 아닙니다. 표의 `computed-key` 안입니다.

**(a) 복구.** `UpdateBanner.tsx` installing 반환을 `return <div {...{ ["role"]: "alert" }}>install failed</div>` 로.

→ 자리 1곳 / 다음 행동 없음 0, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `{...{ role: "alert" }}` → 자리 2곳 / 1, `UpdateBanner.tsx:31`, **EXIT=1**.

**(b) 꺼 둠.** `SettingsTab.tsx` 끝에 `data-testid="ghost-wake-panel" {...{ ["disabled"]: true }}` + 스펙 `onboarding-fresh.spec.ts` 가 `getByTestId("ghost-wake-panel")`.

→ 이름 176개 / 꺼 둔 조작 6곳(기존) / 못 읽은 파일 6, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `disabled={true}` → `onboarding-fresh.spec.ts:365 — ghost-wake-panel`, **EXIT=1**.

모듈에 직접 물으면 `{...{ ["ro" + "le"]: "alert" }}` 와 `{...{ [`role`]: "alert" }}` 도 속성 이름 0개·`unknownSpread: true`입니다.

```
# {...{ ["role"]: "alert" }}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 {...{ role: "alert" }}
# 자리 2곳 / 1 — UpdateBanner.tsx:31 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 다섯의 뿌리가 하나였으므로 고친 것도 하나다 —
**이름을 읽는 자리**를 `scripts/lib/static-eval.mjs` 의 `memberNameOf` 하나로
모았다. 18회차에 값을 접는 평가기를 정본으로 떼면서 이름 자리에는 안 쓴 것이
이번에 다섯 곳으로 한꺼번에 터진 이유다. 이름도 값이다.

`memberNameOf` 는 점 접근이면 그 이름, 대괄호면 **인덱스 식을 접은** 문자열,
선언에 적힌 속성 이름이면 그 이름을 준다. 못 접으면 `null` — 동적 키는 여전히
보증 밖이다. `declaredPropertyName`·`accessKeyOf` 는 이 함수를 부르는 얇은
이름이 되었다.

네 곳이 그 함수만 쓴다 — `jsx-static.mjs` 의 `propertyName`/`accessKey`,
`bindings.mjs` 의 `memberName`, `check-silent-clicks.mjs` 의 `memberName`,
린트 검출기 `computedCallee`. 계약이 "네 모듈 소스에 `argumentExpression`·
`isComputedPropertyName` 로 키를 직접 읽는 코드가 없다" 를 고정한다.

`isStringRawTag` 도 태그를 같은 함수로 읽어 `String["raw"]` 와
``String[String.raw`raw`]`` 가 `String.raw` 와 같다. 린트 검출기의 "리터럴 키"
도 형태가 아니라 **접히는 키 전부**다.

```
# {...{ ["role"]: "alert" }}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1   (린트 EXIT=0)
# {...{ ["ro" + "le"]: "alert" }} 도 같다 — EXIT=1
# 반증 {...{ [ghostKey]: "alert" }} — 자리 1곳 / 0 — EXIT=0
#      (속성이 "없다" 가 아니라 unknownSpread 로 "못 봤다" 가 된다)
# 대조 role="alert" — EXIT=1
# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

---

## 2. `scripts/lib/static-eval.mjs:319-327` — `String["raw"]` 는 `String.raw` 가 아니다

표는 `tagged-raw`를 안에 두고, 리터럴 키 멤버(`literal-member`·`computed-key`)도 안에 둡니다. `isStringRawTag`는 점 접근 `String.raw`와 식별자 `raw`만 받습니다. `String["raw"]` 는 `ElementAccessExpression`이라 태그가 아닙니다.

`String.raw`alert`` 과 `String["raw"]`alert`` 은 JavaScript에서 같은 함수를 같은 키로 부르는 것입니다. `obj[name]`이 아닙니다. `(String.raw)`alert`` (괄호)은 접히고, `String["raw"]`alert`` 은 `UNKNOWN`입니다.

`UpdateBanner.tsx` installing 반환을 `return <div role={String["raw"]`alert`}>install failed</div>` 로.

→ 자리 1곳 / 0, **EXIT=0**. 린트 **EXIT=0**. (`void String["raw"]`x`` 도 금지 형태가 아닙니다. `void String.raw`x`` 은 금지입니다.)

**대조.** `role={String.raw`alert`}` → 자리 2곳 / 1, `UpdateBanner.tsx:31`, **EXIT=1**.

```
# role={String["raw"]`alert`}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0

# 대조 String.raw`alert`
# 자리 2곳 / 1 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 다섯의 뿌리가 하나였으므로 고친 것도 하나다 —
**이름을 읽는 자리**를 `scripts/lib/static-eval.mjs` 의 `memberNameOf` 하나로
모았다. 18회차에 값을 접는 평가기를 정본으로 떼면서 이름 자리에는 안 쓴 것이
이번에 다섯 곳으로 한꺼번에 터진 이유다. 이름도 값이다.

`memberNameOf` 는 점 접근이면 그 이름, 대괄호면 **인덱스 식을 접은** 문자열,
선언에 적힌 속성 이름이면 그 이름을 준다. 못 접으면 `null` — 동적 키는 여전히
보증 밖이다. `declaredPropertyName`·`accessKeyOf` 는 이 함수를 부르는 얇은
이름이 되었다.

네 곳이 그 함수만 쓴다 — `jsx-static.mjs` 의 `propertyName`/`accessKey`,
`bindings.mjs` 의 `memberName`, `check-silent-clicks.mjs` 의 `memberName`,
린트 검출기 `computedCallee`. 계약이 "네 모듈 소스에 `argumentExpression`·
`isComputedPropertyName` 로 키를 직접 읽는 코드가 없다" 를 고정한다.

`isStringRawTag` 도 태그를 같은 함수로 읽어 `String["raw"]` 와
``String[String.raw`raw`]`` 가 `String.raw` 와 같다. 린트 검출기의 "리터럴 키"
도 형태가 아니라 **접히는 키 전부**다.

```
# role={String["raw"]`alert`}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1   (린트 EXIT=0)
# role={String[String.raw`raw`]`alert`} 도 같다 — EXIT=1
# 반증 String[k]`alert` (태그를 모른다) — 후보 없음
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

---

## 3. `scripts/lib/bindings.mjs:130-137` — 접히는 키는 멤버 이름이 아니다

머리말은 리터럴 키 멤버(`React["createElement"]`, `api.invoke`)를 점 접근과 같다고 합니다. 18회차는 지정자·값을 `staticValue`로 접게 했고, `accessKeyOf`가 인덱스 식도 접습니다. `memberName`은 껍데기만 벗긴 뒤 문자열·보간 없는 템플릿만 받습니다.

그래서 `invoke["call"]` 은 `.call`이고(린트가 막음), `invoke[String.raw`call`]` · `invoke["ca" + "ll"]` · `invoke[`${"call"}`]` 은 `null`입니다. `core[String.raw`invoke`]` · `globalThis[String.raw`fetch`]` 도 같습니다. 실행할 때 조립되는 키가 아닙니다. 표의 `tagged-raw`·`binary`·`template` 안입니다.

**(a) 파괴.** `db.ts` 끝에 확인 없이:

```ts
export async function ghostWipe() {
  return invoke[String.raw`call`](null, "memory_delete_fact");
}
```

→ 명령 206 · 후보 16 · 호출 **14**(기준선), **EXIT=0**. 린트 **EXIT=0**.

**대조.** `invoke.call(null, "memory_delete_fact")` → 호출 15, `db.ts:59 — memory_delete_fact (감싼 함수 ghostWipe)`, **EXIT=1**.

**(b) 인벤토리.** `100-herdr-first-frame.spec.ts`(지금 `deterministic_ci`)에 `void globalThis[String.raw`fetch`]("https://ghost-r19.invalid/r19")`.

→ `--check` **EXIT=0** (목록 그대로). 린트 **EXIT=0**.

**대조.** `void fetch("https://ghost-r19.invalid/r19")` → `--check` **EXIT=1** (목록이 스펙과 어긋난다).

`--check`가 분류의 옳고 그름을 보증하지 않는다는 문장 자체는 머리말이 보증 밖으로 적었습니다. 이 지적은 그 문장이 아니라, **자국 규칙이 표 안의 전역 `fetch`를 못 본 것**입니다.

```
# invoke[String.raw`call`](null, "memory_delete_fact")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 206 · 후보 16 · 호출 14 — EXIT=0

# 대조 invoke.call(null, "memory_delete_fact")
# 호출 15 — db.ts:59 — EXIT=1

# globalThis[String.raw`fetch`]("https://ghost-r19.invalid/r19")
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ✓ 일치 — EXIT=0

# 대조 fetch("https://ghost-r19.invalid/r19")
# ❌ 목록이 지금 스펙과 어긋난다 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 다섯의 뿌리가 하나였으므로 고친 것도 하나다 —
**이름을 읽는 자리**를 `scripts/lib/static-eval.mjs` 의 `memberNameOf` 하나로
모았다. 18회차에 값을 접는 평가기를 정본으로 떼면서 이름 자리에는 안 쓴 것이
이번에 다섯 곳으로 한꺼번에 터진 이유다. 이름도 값이다.

`memberNameOf` 는 점 접근이면 그 이름, 대괄호면 **인덱스 식을 접은** 문자열,
선언에 적힌 속성 이름이면 그 이름을 준다. 못 접으면 `null` — 동적 키는 여전히
보증 밖이다. `declaredPropertyName`·`accessKeyOf` 는 이 함수를 부르는 얇은
이름이 되었다.

네 곳이 그 함수만 쓴다 — `jsx-static.mjs` 의 `propertyName`/`accessKey`,
`bindings.mjs` 의 `memberName`, `check-silent-clicks.mjs` 의 `memberName`,
린트 검출기 `computedCallee`. 계약이 "네 모듈 소스에 `argumentExpression`·
`isComputedPropertyName` 로 키를 직접 읽는 코드가 없다" 를 고정한다.

`isStringRawTag` 도 태그를 같은 함수로 읽어 `String["raw"]` 와
``String[String.raw`raw`]`` 가 `String.raw` 와 같다. 린트 검출기의 "리터럴 키"
도 형태가 아니라 **접히는 키 전부**다.

```
# invoke[String.raw`call`](null, "memory_delete_fact", { factId })
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 15곳 · 되돌릴 수 없는 동작 1곳 — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 1곳 — EXIT=1   (이 형태는 린트 경계가 따로 금지한다)

# invoke["ca" + "ll"](…) 도 같다 — destructive EXIT=1 · lint EXIT=1
# 대조 invoke.call(…) — destructive EXIT=1 · lint EXIT=0
# 반증 invoke[k](…) — 모른다(모듈 실측 null)
# 되돌린 뒤 호출 14곳 — EXIT=0, git diff 출력 없음
```

---

## 4. `scripts/lib/lint-boundary-forms.mjs:218-226` — 린트「리터럴 키」는 문자열 AST만 리터럴이다

정본 형태 `computed-callee`는 「리터럴 키로 곧바로 부르기 (`f["call"](…)`, `el["click"]()`)」입니다. `void-literal` 검출기는 17회차 이후 「리터럴은 정적으로 값이 정해지는가」로 `staticPrimitive`를 씁니다(`void +0` 금지). `computedCallee`는 키를 벗긴 뒤 문자열·보간 없는 템플릿만 맞춥니다.

같은 「리터럴」이 검출기마다 갈립니다. `f["call"]()` 은 금지이고, `f[String.raw`call`]()` · `f["ca" + "ll"]()` · `f[`${"call"}`]()` 은 금지 형태가 아닙니다. 표 안의 접힌 키입니다.

`db.ts`에 `invoke["call"](null, "memory_delete_fact")`.

→ 린트 **EXIT=1** (`computed-callee`, `db.ts:59`).

같은 자리에 `invoke[String.raw`call`](null, "memory_delete_fact")`.

→ 린트 **EXIT=0**. 파괴 게이트도 **EXIT=0**(지적 3).

```
# invoke["call"](null, "memory_delete_fact")
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 1곳 — computed-callee — db.ts:59 — EXIT=1

# invoke[String.raw`call`](null, "memory_delete_fact")
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 0곳 — EXIT=0
```

정당한 위협은 「린트 게이트 EXIT=0 인 채로 다른 게이트를 EXIT=0 으로 속이는 것」이고, 정본 목록에 있는 형태인데 검출기가 놓치는 변형입니다.

**상태 (2026-09-06):** 닫혔다. 다섯의 뿌리가 하나였으므로 고친 것도 하나다 —
**이름을 읽는 자리**를 `scripts/lib/static-eval.mjs` 의 `memberNameOf` 하나로
모았다. 18회차에 값을 접는 평가기를 정본으로 떼면서 이름 자리에는 안 쓴 것이
이번에 다섯 곳으로 한꺼번에 터진 이유다. 이름도 값이다.

`memberNameOf` 는 점 접근이면 그 이름, 대괄호면 **인덱스 식을 접은** 문자열,
선언에 적힌 속성 이름이면 그 이름을 준다. 못 접으면 `null` — 동적 키는 여전히
보증 밖이다. `declaredPropertyName`·`accessKeyOf` 는 이 함수를 부르는 얇은
이름이 되었다.

네 곳이 그 함수만 쓴다 — `jsx-static.mjs` 의 `propertyName`/`accessKey`,
`bindings.mjs` 의 `memberName`, `check-silent-clicks.mjs` 의 `memberName`,
린트 검출기 `computedCallee`. 계약이 "네 모듈 소스에 `argumentExpression`·
`isComputedPropertyName` 로 키를 직접 읽는 코드가 없다" 를 고정한다.

`isStringRawTag` 도 태그를 같은 함수로 읽어 `String["raw"]` 와
``String[String.raw`raw`]`` 가 `String.raw` 와 같다. 린트 검출기의 "리터럴 키"
도 형태가 아니라 **접히는 키 전부**다.

```
# invoke[String.raw`call`](null, "frontend_log");
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 1곳 — EXIT=1
# const GHOST_KEY = "call"; invoke[GHOST_KEY](…) — 위반 1곳 — EXIT=1
# 반증 invoke[ghostDyn](…) (못 접는 키) — 위반 0곳 — EXIT=0
# 대조 invoke["call"](…) — 위반 1곳 — EXIT=1
# 되돌린 뒤 위반 0곳 — EXIT=0, git diff 출력 없음
```

---

## 5. `scripts/check-silent-clicks.mjs:375-384` — 한 겹 `String.raw` 키는 클릭이 아니다

머리말은 `E.click()`, `E["click"]()`(리터럴 키), `E.click.call(E)` 를 같은 클릭으로 읽습니다. 보증 밖은 동적 키(`E[name]()`)와 `Function.prototype`을 **두 겹 이상** 거친 호출입니다. 지역 `memberName`은 바인딩 모듈과 같은 문자열 AST만 받습니다.

린트 `computed-callee`는 `el["click"]()`만 막습니다. `el[String.raw`click`]()` 은 린트를 지나고, 클릭도 아닙니다.

`settings.ts` 끝에:

```ts
export function ghostSilent(el: HTMLElement | null) {
  if (el) el[String.raw`click`]();
}
```

→ 무음 **107**(기준선), **EXIT=0**. 린트 **EXIT=0**.

**대조.** `if (el) el.click()` → 108 > 107, `helpers/settings.ts`가 2곳, **EXIT=1**.

```
# if (el) el[String.raw`click`]()
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0

# 대조 el.click()
# 108 > 107 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 다섯의 뿌리가 하나였으므로 고친 것도 하나다 —
**이름을 읽는 자리**를 `scripts/lib/static-eval.mjs` 의 `memberNameOf` 하나로
모았다. 18회차에 값을 접는 평가기를 정본으로 떼면서 이름 자리에는 안 쓴 것이
이번에 다섯 곳으로 한꺼번에 터진 이유다. 이름도 값이다.

`memberNameOf` 는 점 접근이면 그 이름, 대괄호면 **인덱스 식을 접은** 문자열,
선언에 적힌 속성 이름이면 그 이름을 준다. 못 접으면 `null` — 동적 키는 여전히
보증 밖이다. `declaredPropertyName`·`accessKeyOf` 는 이 함수를 부르는 얇은
이름이 되었다.

네 곳이 그 함수만 쓴다 — `jsx-static.mjs` 의 `propertyName`/`accessKey`,
`bindings.mjs` 의 `memberName`, `check-silent-clicks.mjs` 의 `memberName`,
린트 검출기 `computedCallee`. 계약이 "네 모듈 소스에 `argumentExpression`·
`isComputedPropertyName` 로 키를 직접 읽는 코드가 없다" 를 고정한다.

`isStringRawTag` 도 태그를 같은 함수로 읽어 `String["raw"]` 와
``String[String.raw`raw`]`` 가 `String.raw` 와 같다. 린트 검출기의 "리터럴 키"
도 형태가 아니라 **접히는 키 전부**다.

```
# 모듈 실측: el["click"] · el[String.raw`click`] · const KEY="click" 뒤 el[KEY]
#            셋 다 같은 이름 "click", el[name] 은 null(보증 밖)
#
# 게이트 실행은 이번에 **못 했다** — 다른 손이 #567 로 e2e 스펙 넷을 작업 트리에서
# 지운 상태라(`05-skill-system`·`21-cron-recurring`·`29-cron-gateway`·`30-exec-approvals`),
# `git ls-files` 에는 남아 있는 그 파일들을 열다가 무음 클릭·죽은 UI 게이트가
# ENOENT 로 죽는다. 내 변경과 무관하고, 그쪽 작업이 끝난 뒤 같은 주입으로
# 확인해야 한다.
```

---

## 6. `scripts/check-dead-ui-specs.mjs:104-114` — 주석이 명령을 만든다

파괴 게이트는 명령 목록을 `rust-tokens.mjs` 토크나이저로 뽑습니다. 주석은 토큰이 아니라서 `// #[tauri::command]` 는 명령이 아닙니다. 죽은 UI 게이트는 같은 목록을 **원문 정규식** `#\[tauri::command[^\]]*\][\s\S]{0,200}?\bfn\s+` 으로 뽑습니다. 주석을 버리지 않고, 200자 창도 그대로입니다. 11회차가 파괴 쪽에서 닫은 바로 그 측정 지점입니다. 공용 모듈이 있는데 호출자가 안 부릅니다.

`31-diagnostics.spec.ts` 끝에 `void invoke("ghost_r19_cmd")` 만 두면:

→ `스펙이 부르는데 Rust 에 없는 명령: 31-diagnostics.spec.ts:124 — ghost_r19_cmd`, **EXIT=1**.

같은 스펙에 `capture.rs` 끝:

```rust
// #[tauri::command]
fn ghost_r19_cmd() {}
```

→ 이름 175 / 없는 것 0, **EXIT=0**. 린트 **EXIT=0**. 파괴 게이트는 명령 **206**(기준선) — 토크나이저는 주석을 명령으로 안 읽습니다.

```
# invoke("ghost_r19_cmd") 만
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# Rust 에 없는 명령 ghost_r19_cmd — EXIT=1

# + 주석 // #[tauri::command] \n fn ghost_r19_cmd() {}
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 이름 175 / 없는 것 0 — EXIT=0
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 206 — EXIT=0   ← 토크나이저는 주석을 안 본다
```

**상태 (2026-09-06):** 닫았다. 죽은 UI 게이트가 명령 목록을 스스로 세지 않고, 파괴
게이트와 **같은 두 자리**에서 받는다.

  - 이름 — `scripts/lib/rust-tokens.mjs` 의 `tauriCommandNames`. 토크나이저라 주석과
    문자열은 토큰이 아니고, `rename` 인자가 있으면 그 IPC 이름이다.
  - 소스 뿌리 — 새 `scripts/lib/crate-roots.mjs` 의 `crateSourceRoots`. `Cargo.toml` 의
    `[workspace] members` 와 `path` 의존을 따라가므로 플러그인 크레이트가 함께 든다.

그 파일에는 이제 `tauri::command` 라는 글자가 **한 번도** 나오지 않는다. 옛 정규식을
설명하는 주석까지 그 글자 없이 다시 적었다 — 계약이 그 사실을 글자 하나로 확인할 수
있어야 하기 때문이다.

`crate-roots.mjs` 는 `check-destructive-affordance.mjs` 안에 있던 `crateSourceRoots` ·
`localCrateReferences` 를 **이름과 시그니처 그대로** 옮긴 것이다. 그 게이트는 이번
회차에 다른 작업이 함께 만지고 있어 손대지 않았다. 그래서 지금은 판단이 두 벌 있다 —
공용 모듈과 그 게이트 안의 사본이다. 남은 한 줄은 아래에 적는다.

**파괴 게이트가 옮겨 갈 자리(다른 작업 몫).** `scripts/check-destructive-affordance.mjs`:
`import { crateSourceRoots } from "./lib/crate-roots.mjs";` 한 줄을 더하고, 파일 안의
`crateSourceRoots`(259줄 부근)와 `localCrateReferences`(293줄 부근) 정의와 이제 쓰이지
않는 `parseToml`·`existsSync`·`dirname`·`join`·`normalize` import 를 지운다. 부르는
자리(324줄)는 이름이 같아 그대로다. 그러면 두 게이트가 한 자리에서 센다.

```
# capture.rs 끝에 주석으로 적은 명령 선언
#   // #[tauri::command]
#   fn ghost_r19_cmd() {}
#
# 옛 정규식이 ghost_r19_cmd 를 명령으로 세는가 : true    ← 주석이 명령을 만들었다
# 지금 판정이 세는가                          : false
# 이름 수  옛: 199 / 지금: 206                        ← 옛 쪽은 주석 하나를 더 세고,
#   플러그인 크레이트의 명령 여덟은 통째로 빠져 있었다(옛: 없음 / 지금: 있음)
#
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 206 · 후보 16 · 호출 14 — EXIT=0   ← 토크나이저는 주석을 안 본다
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# 되돌린 뒤 git diff 출력 없음
```

**소비자가 사라진 함수를 지웠다.** 18회차에 게이트가 옮겨 가기 전까지 두었던
`tauriCommandBodies`(함수 이름 → 본문)는 이제 부르는 곳이 없다(`grep` 으로 확인).
모듈에서 지우고, 그 함수를 쓰던 계약 항목 서른한 곳을 `tauriCommandNames` ·
`tauriCommandDeclarations` 로 옮겼다. "옛 함수가 함수 이름을 열쇠로 쓴다" 를 고정하던
항목은 "선언마다 두 이름을 함께 준다" 로 바꿨다.

계약 테스트 `src/test/rust-command-list.contract.test.ts` 를 새로 두었다(6항목): 죽은 UI
게이트 소스에 명령 속성 정규식이 없다는 것, 그 게이트가 두 공용 모듈에서 이름과 뿌리를
받는다는 것, 주석·문자열에 적은 선언은 명령이 아니라는 것(주석을 떼면 명령이라는 대조
포함), 소스 뿌리에 플러그인 크레이트가 든다는 것, `path`·`members` 가 따옴표 모양을
가리지 않는다는 것.

기준선: 파괴 206 · 16 · 14, 데이터 홈 이름표 14 · 변형 14 · 문서 14행 · 공개 항목 16 —
모두 그대로다.

---

## 번호 없는 관찰 (머리말이 보증하지 않는다고 적은 자리)

- `#[tauri::command(rename = concat!("ghost_", "wipe_everything"))]` 는 매크로가 이름을 조립합니다. 머리말이 보증 밖으로 적은 자리라 지적 번호를 주지 않습니다. (모듈은 함수 이름 `innocent`을 IPC 이름으로 남깁니다.)
- 배열을 거쳐 흘러간 함수(`const [g] = [invoke]; g("cmd")`)는 바인딩 머리말이 보증 밖으로 적었습니다.
- 데이터 홈 허용 목록이 파일 단위라는 점, `--check`가 분류의 옳고 그름을 보증하지 않는다는 문장 자체, 동적 키·`eval`·두 겹 `Function.prototype`은 머리말 그대로 보증 밖입니다.

되돌린 뒤 기준선 게이트 전부 `EXIT=0`, `git status --porcelain` 출력 없음.
