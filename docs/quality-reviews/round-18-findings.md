# 18회차 교차 리뷰 지적 (2026-09-06, 스냅숏 fd42f434)

판정: **NOT CLEAN**, 지적 7건. 아래는 리뷰어 원문이다.

---

18회차 적대적 교차 리뷰를 시작합니다. 먼저 프로세스 현황·닫힌 지적·게이트 머리말을 읽고, 그다음에 범위 조건으로 거짓 통과를 실증하겠습니다.지난 회차 닫힘 기록과 게이트 머리말·공용 모듈을 병렬로 읽겠습니다.공용 모듈 머리말과 정적 평가 표부터 대조해, 표 안인데 안 접히는 갈래를 찾겠습니다.정적 평가·바인딩·토큰 구현을 이어서 읽고, 표 안인데 안 접히는 갈래를 좁히겠습니다.가설을 모듈에 직접 묻기 위해 TypeScript를 연결하고, 표 안 형태부터 프로브하겠습니다.기준선은 전부 `EXIT=0`입니다. 이제 가설을 하나씩 심고 게이트를 돌리겠습니다.# 판정: **NOT CLEAN** — 실증된 지적 7건

기준 HEAD는 `01e857a`입니다. 6~17회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, **표 안의 형태가 접히지 않는 갈래**와 게이트가 공용 모듈을 **부르는 규약**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

기준선은 전부 `EXIT=0`이었습니다 (dead-ui 이름 175 / 복구 자리 1·0 / 무음 107 / 파괴 206·16·14 / 데이터 홈 이름표 14·공개 16 / 인벤토리 119 / 린트 위반 0). 되돌린 뒤 같은 숫자로 `EXIT=0`입니다.

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `jsx-static.mjs:625-633, 1438-1439` `accessKey` | `role={["alert"][0+0]}` 은 알림이 아니다. `["alert"][0]` 은 알림이다 |
| 2 | `jsx-static.mjs:338-343` `propertyName` | `{...{ ["role"]: "alert" }}` 는 알림이 아니다. `{...{ role: "alert" }}` 는 알림이다 |
| 3 | `jsx-static.mjs:517-533` `declarationSites` | `const { role } = { role: "alert" }` 는 알림이 아니다. `const role = "alert"` 는 알림이다 |
| 4 | `jsx-static.mjs:1423-1435` tagged-raw | `String.raw\`${"alert"}\`` 은 알림·바깥 주소가 아니다. `` String.raw`alert` `` 와 `` `${"alert"}` `` 는 같다 |
| 5 | `bindings.mjs:405-416` `dynamicModuleOf` | `import(String.raw\`@tauri-apps/api/core\`)` 는 호출부가 아니다. `import("@tauri-apps/api/core")` 는 호출부다 |
| 6 | `check-silent-clicks.mjs:413-429` `clickReceiver` | `if (el) el.click.bind(el)()` 은 무음이 아니다. `el.click()` · `el.click.call(el)` 은 무음이다 |
| 7 | `rust-tokens.mjs:771-774` 명령 이름 | `#[tauri::command(rename = "ghost_wipe_everything")] fn innocent_placeholder` 는 확인 없는 파괴가 아니다. `fn ghost_wipe_everything` 은 파괴다 |

---

## 1. `scripts/lib/jsx-static.mjs:625-633, 1438-1439` — 인덱스가 표 안의 식이어도와 접히지 않는다

17회차는 정적 평가 범위를 `STATIC_EVAL_KINDS` 한 표로 두고, `literal-index`(`["alert"][0]`)와 `binary`(`0+0`)와 `unary`(`+0`)를 모두 표 **안**에 적었습니다. 머리말은 표 안은 전부 접는다고 합니다.

`staticPrimitive`의 인덱스 갈래는 키를 `accessKey`로만 읽습니다. `accessKey`는 문자열·숫자 **리터럴 AST**만 받고, `0+0`·`+0`·`0|0`처럼 이미 표가 접는다고 한 식은 `null`입니다. 그래서 `["alert"][0]`은 `"alert"`이고 `["alert"][0+0]`은 `UNKNOWN`입니다. JavaScript에서 둘은 같은 값입니다. 동적 키(`obj[name]`)가 아닙니다.

`UpdateBanner.tsx`의 `if (installing)` 을 `return <div role={["alert"][0 + 0]}>install failed</div>` 로.

→ 자리 1곳 / 다음 행동 없음 0, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `role={["alert"][0]}` 및 `role="alert"` → 자리 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:31`, **EXIT=1**.

같은 구멍이 꺼 둔 조작에도 있습니다. `disabled={["x"][0 + 0]}` + 스펙 `getByTestId("ghost-wake-panel")` → 이름 176개 / 꺼 둔 조작 6곳(기존), **EXIT=0**. 대조 `disabled={true}` → `settings-knowledge.spec.ts:116 — ghost-wake-panel`, **EXIT=1**. 린트 둘 다 **EXIT=0**.

모듈에 직접 물으면 `["alert"][+0]`, `["alert"][0|0]`, `ROLES[0+0]`(`const ROLES = ["alert"]`)도 전부 `UNKNOWN`입니다. `["alert"][0]`과 `["alert"][0x0]`만 `"alert"`입니다.

```
# role={["alert"][0 + 0]}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 role={["alert"][0]} 및 role="alert"
# 자리 2곳 / 다음 행동 없음 1 — UpdateBanner.tsx:31 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 형태를 하나 더 붙이는 대신 **평가기를 재귀로**
닫았다. 인덱스 자리도 값이 필요한 자리이므로 같은 평가기로 접는다 — `[0+0]`,
`["1"]`, `[+"0"]` 이 모두 같은 인덱스다.

```
# role={["alert"][0 + 0]}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1
# 반증 role={["alert"][i]} (인덱스를 모른다) — EXIT=0
# 대조 role="alert" — EXIT=1
# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다.

---

## 2. `scripts/lib/jsx-static.mjs:338-343` — 계산된 리터럴 키는 속성 이름이 아니다

`bindings.mjs`의 `declaredPropertyName`은 `{ ["invoke"]: g }`를 `invoke`로 읽습니다(16회차). `jsx-static`의 `propertyName`은 식별자·문자열·숫자 리터럴만 받고, `ComputedPropertyName`은 `null`입니다. 그때 `elementProps`는 그 자리를 `unknownSpread`로만 표시하고 속성 목록에는 넣지 않습니다.

복구 판정 `isAlert`(`check-recovery-affordance.mjs:238-246`)는 `unknownSpread`를 버리고 `props`만 봅니다. “모른다”를 “role이 없다”로 읽습니다. 죽은 UI 쪽은 `unknownSpread`를 로그로만 세고(5→6), 꺼 둠 판정에는 쓰지 않습니다.

`{...{ ["role"]: "alert" }}`와 `{...{ role: "alert" }}`는 브라우저에서 구별되지 않습니다. 동적 키(`{ [name]: "alert" }`)가 아닙니다.

`UpdateBanner.tsx` installing 반환을 `return <div {...{ ["role"]: "alert" }}>install failed</div>` 로.

→ 자리 1곳 / 0, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `{...{ role: "alert" }}` → 자리 2곳 / 1, `UpdateBanner.tsx:31`, **EXIT=1**.

꺼 둠 표면: `data-testid="ghost-wake-panel" {...{ ["disabled"]: true }}` + 같은 스펙 → 이름 176 / 꺼 둔 조작 6 / 못 읽은 파일 6, **EXIT=0**. 대조 `disabled={true}` → **EXIT=1**.

`createElement("div", { ["role"]: "alert" })`도 모듈에서 속성 이름 0개·`unknownSpread: true`입니다.

```
# {...{ ["role"]: "alert" }}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 {...{ role: "alert" }}
# 자리 2곳 / 1 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 속성 이름을 읽는 자리를 하나로 모았다 —
`declaredPropertyName` 이 이제 계산된 키도 평가기로 접어서 읽는다. 16회차에
구조분해에만 적용했던 것을 객체 리터럴 속성에도 같은 함수로 적용한 것이다.

```
# role={{ ["ro" + "le"]: "alert" }.role}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1
# 반증 { [k]: "alert" } (키를 모른다) — 후보 없음
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다.

---

## 3. `scripts/lib/jsx-static.mjs:517-533` — 구조분해 `const`는 사슬이 아니다

표의 `const-chain`은 같은 파일 `const`를 접는다고 하고, `literal-member`는 `{a:1}.a`를 접는다고 합니다. `const { role } = { role: "alert" }`는 그 둘의 같은 뜻입니다.

`declarationSites`는 식별자 이름과 **배열** 구조분해만 봅니다. 객체 구조분해는 선언이 아닙니다. 배열 구조분해는 `useState` 갈래(`index === 0`이고 초기화가 `useState` 호출)에만 쓰여, `const [role] = ["alert"]`는 후보가 없습니다.

`UpdateBanner.tsx` installing 안에 `const { role } = { role: "alert" }; return <div role={role}>install failed</div>`.

→ 자리 1곳 / 0, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `const role = "alert"; return <div role={role}>…` → 자리 2곳 / 1, `UpdateBanner.tsx:32`, **EXIT=1**.

`const [role] = ["alert"]`도 자리 1곳 / 0, **EXIT=0**. 모듈에서 `const { off } = { off: true }; disabled={off}`는 `alwaysTruthy === false`입니다.

```
# const { role } = { role: "alert" }; <div role={role}>
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0

# 대조 const role = "alert"
# 자리 2곳 / 1 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 구조분해는 결국 "그 초기화식의 그 키" 라는 같은
질문이다. 선언 자리 해석이 패턴을 따라가 **키의 차례**(`path`)를 만들고,
평가기가 초기화식에서 그 차례대로 꺼낸다. 깊이 몇 겹이든 같다 —
`const { a: { b: deep } } = { a: { b: "alert" } }` 는 `["a","b"]` 이고,
`const [first] = ["alert"]` 는 `["0"]` 이다. 겹의 수는 세지 않는다.

```
# const { ghostRole } = { ghostRole: "alert" }; role={ghostRole}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1
# const [ghostRole] = ["alert"]; 도 같다 — EXIT=1
# 반증 const { role } = src (초기화식을 모른다) — 후보 없음
# 반증 spread 가 섞이면 무엇이 덮였는지 모른다 — 후보 없음
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다.

---

## 4. `scripts/lib/jsx-static.mjs:1423-1435` — `String.raw`의 정적 보간은 접히지 않는다

표는 `tagged-raw`와 `template`(보간까지 정적이면 이어 붙인다)를 둘 다 안에 둡니다. 구현은 보간 **없는** `String.raw`만 접고, 보간이 있으면 곧바로 `UNKNOWN`입니다. 그래서 `` `${"alert"}` ``는 `"alert"`이고 `` String.raw`${"alert"}` ``는 모릅니다. 실행하면 둘 다 `"alert"`입니다.

인벤토리의 `staticStringsIn`(`jsx-static.mjs:1104-1108`)은 태그 템플릿의 **고정 조각**을 건너뛰고 보간만 따라갑니다. 주석은 “고정 조각과 보간을 모두 본다”인데 코드는 보간만 봅니다. `` String.raw`https://${"ghost-r18.invalid"}/r18` ``의 후보는 호스트 글자 `"ghost-r18.invalid"`뿐이라 `^https?://`에 안 걸립니다.

**(a) 복구.** `return <div role={String.raw\`${"alert"}\`}>install failed</div>`

→ 자리 1곳 / 0, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `` role={String.raw`alert`} `` 및 `` role={`${"alert"}`} `` → 자리 2곳 / 1, **EXIT=1**.

**(b) 인벤토리.** `31-diagnostics.spec.ts`(지금 `deterministic_ci`)에 `fetch(String.raw\`https://\${"ghost-r18.invalid"}/r18\`)`.

→ `--check` **EXIT=0** (목록 그대로, 바깥 주소가 아님). 린트 **EXIT=0**.

**대조.** `fetch("https://ghost-r18.invalid/r18")` 및 `` fetch(`https://${"ghost-r18.invalid"}/r18`) `` → `--check` **EXIT=1** (목록이 스펙과 어긋난다).

린트 검출기도 같은 평가를 씁니다. 모듈에서 `void String.raw\`x\``는 금지이고 `void String.raw\`${0}\``는 금지 형태가 아닙니다. 정본은 “리터럴은 정적으로 값이 정해지는가”입니다.

```
# (a) role={String.raw`${"alert"}`}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0

# 대조 String.raw`alert` · `${"alert"}`
# 자리 2곳 / 1 — EXIT=1

# (b) fetch(String.raw`https://${"ghost-r18.invalid"}/r18`)
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ✓ 일치 — EXIT=0

# 대조 fetch("https://ghost-r18.invalid/r18")
# ❌ 목록이 지금 스펙과 어긋난다 — EXIT=1
```

`--check`가 분류의 옳고 그름을 보증하지 않는다는 문장 자체는 머리말이 보증 밖으로 적었습니다. 이 지적은 그 문장이 아니라, **자국 규칙이 표 안의 주소를 못 본 것**입니다.

**상태 (2026-09-06):** 닫혔다. `String.raw` 는 raw 조각을 그대로 이어 붙이고,
보간이 있으면 그 값도 같은 평가기로 접어서 넣는다. 보간이 하나라도 안 접히면
전체가 모른다.

```
# role={String.raw`${"al"}ert`}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1
# 반증 String.raw`x${y}` (보간을 모른다) — 후보 없음
# 되돌린 뒤 EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다.

---

## 5. `scripts/lib/bindings.mjs:405-416` — `import(String.raw\`…\`)`는 리터럴 지정자가 아니다

머리말은 지정자가 소스에 그대로 적혀 있으면 동적 `import()`를 따라간다고 합니다. `dynamicModuleOf`는 `StringLiteral`과 보간 없는 템플릿만 받습니다. `` import(`@tauri-apps/api/core`) ``는 따라가고, `` import(String.raw`@tauri-apps/api/core`) ``는 지정자가 태그 템플릿이라 `null`입니다. 실행할 때 조립되는 지정자가 아닙니다. 17회차가 닫은 것은 `fetch(String.raw\`https://…\`)`이지 import 지정자가 아닙니다.

`db.ts` 끝에 확인 없이:

```ts
export async function ghostWipe() {
  const { invoke: ghostInvoke } = await import(String.raw`@tauri-apps/api/core`);
  return ghostInvoke("memory_delete_fact");
}
```

→ 명령 206 · 후보 16 · 호출 **14**(기준선), **EXIT=0**. 린트 **EXIT=0**.

**대조.** `await import("@tauri-apps/api/core")` → 호출 15, `db.ts:60 — memory_delete_fact (감싼 함수 ghostWipe)`, **EXIT=1**.

```
# import(String.raw`@tauri-apps/api/core`) + invoke("memory_delete_fact")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 206 · 후보 16 · 호출 14 — EXIT=0

# 대조 import("@tauri-apps/api/core")
# 호출 15 — db.ts:60 — memory_delete_fact — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 평가기를 `scripts/lib/static-eval.mjs` 로 떼어
`jsx-static.mjs`·`bindings.mjs`·린트 경계가 **같은 하나**를 쓴다. 그래서
지정자도 리터럴만이 아니라 접히는 식 전부다 — 템플릿, 이어 붙인 문자열,
`const` 사슬(import 로 건너간 것까지).

`STATIC_EVAL_KINDS` 표의 정본도 그 파일로 옮겼고, 머리말·문서·계약이 새 위치를
본다. 이 모듈은 `const` 를 직접 찾지 않는다 — 부르는 쪽이 "이름을 어떻게
푸는가" 를 훅으로 준다. 그래야 파일을 건너가는 규칙이 두 벌로 생기지 않는다.

```
# const { invoke: g } = await import(`@tauri-apps/api/core`); g("memory_delete_fact")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 15곳 — EXIT=1
# "@tauri-apps/api" + "/core" 도 같다 — EXIT=1
# 반증 await import(spec) (실행할 때 정해진다) — 호출 14곳 — EXIT=0
# 되돌린 뒤 호출 14곳 — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다.

---

## 6. `scripts/check-silent-clicks.mjs:413-429` — 한 겹 `.bind`는 클릭이 아니다

머리말은 `E.click()`, `E?.click()`, `E.click.call(E)` / `.apply(E)`를 같은 클릭으로 읽고, 보증 밖은 `Function.prototype`을 **두 겹 이상** 거친 호출입니다. `bindings.mjs`도 한 겹 `.bind`는 경계 안입니다.

`clickReceiver`는 바깥 호출의 callee가 `click`이거나, `.call`/`.apply`의 안쪽이 `click`일 때만 E를 꺼냅니다. `el.click.bind(el)()`의 바깥 callee는 `el.click.bind(el)` 호출식이라 이름이 없고, 클릭이 아닙니다. 린트 `computed-callee`는 `f["call"](…)`만 막습니다.

`settings.ts` 끝에:

```ts
export function ghostSilent(el: HTMLElement | null) {
  if (el) el.click.bind(el)();
}
```

→ 무음 **107**(기준선), **EXIT=0**. 린트 **EXIT=0**.

**대조.** `if (el) el.click()` 및 `if (el) el.click.call(el)` → 108 > 107, `helpers/settings.ts`가 2곳, **EXIT=1**.

```
# if (el) el.click.bind(el)()
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0

# 대조 el.click() · el.click.call(el)
# 108 > 107 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. `bind` 로 한 겹 묶어 두고 부른 것도 같은 클릭이다
— `.call`/`.apply` 와 같은 규칙으로 받는 쪽을 확인한다. `bind` 의 첫 인자가
받는 쪽이고, 없으면 받는 쪽을 안 바꾼 것이다.

```
# if (ghostEl) ghostEl.click.bind(ghostEl)();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1
# 반증 ghostEl.click.bind(other)() (남의 요소를 눌러 준다) — 107 — EXIT=0
# 대조 ghostEl.click() — 108 — EXIT=1
# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다.

---

## 7. `scripts/lib/rust-tokens.mjs:771-774` — IPC 이름은 `rename`이 아니라 `fn` 이름이다

명령 목록은 속성 안의 `tauri::command` 경로를 이미 토큰으로 찾습니다. 그 다음 이름은 뒤따르는 `fn`의 식별자입니다. Tauri의 `#[tauri::command(rename = "ghost_wipe_everything")]`는 IPC 이름을 리터럴로 바꾸는데, 그 문자열은 읽히지 않습니다. 매크로가 **생성**하는 속성이 아닙니다. 소스에 `rename = "…"`가 있습니다.

호출부는 `commands.includes(리터럴)`이라, 프런트가 IPC 이름으로 불러도 목록의 `fn` 이름과 다르면 그 자리는 확인 검사에서 통째로 빠집니다. 목록에만 있는 `fn` 이름은 호출이 없어도 무방비로 세지 않습니다 — 검사는 찾은 호출부만 봅니다.

`capture.rs` 끝 + `db.ts`에 확인 없이 `invoke("ghost_wipe_everything")`.

```rust
#[tauri::command(rename = "ghost_wipe_everything")]
fn innocent_placeholder() {
    let _ = std::fs::remove_dir_all("/tmp/ghost-wipe");
}
```

→ 명령 **207** · 후보 **17** · 호출 **14**(기준선과 같음), **EXIT=0**. 린트 **EXIT=0**. (`innocent_placeholder`는 본문의 `remove_dir_all`로 후보가 되고, `ghost_wipe_everything` 호출은 목록에 없어 건너뛰어집니다.)

**대조.** `#[tauri::command] fn ghost_wipe_everything()` + 같은 `invoke` → 호출 15, `db.ts:59 — ghost_wipe_everything`, **EXIT=1**.

```
# rename = "ghost_wipe_everything" + invoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 14 — EXIT=0

# 대조 fn ghost_wipe_everything
# 호출 15 — db.ts:59 — ghost_wipe_everything — EXIT=1
```

**상태 (2026-09-06) — 모듈 쪽은 닫았고, 게이트 배선은 넘긴다.** 이번 회차에는
`check-destructive-affordance.mjs` 를 다른 작업이 함께 만지고 있어, 반환 형태를 바꾸는
대신 **새 함수**를 두고 게이트가 옮겨 갈 자리를 아래에 적는다.

`scripts/lib/rust-tokens.mjs` 에 `tauriCommandDeclarations(source)` 를 두었다 —
`{ fnName, ipcName, body, line }` 이다. `ipcName` 은 `rename = "…"` 인자가 있으면 그
리터럴이고, 없으면 함수 이름이다. `tauriCommandNames(source)` 는 그 IPC 이름만 돌려주는
얇은 감싸기다. 기존 `tauriCommandBodies(source)`(함수 이름 → 본문)는 그대로 둔다.

**근거는 짐작이 아니라 이 기계에 받아 둔 매크로 소스다.**
`~/.cargo/registry/src/…/tauri-macros-2.6.2/src/command/wrapper.rs` 를 읽었다.

  - `300~306` 줄: `RenamePolicy::Rename` 이면 외부에서 부르는 이름이 그 리터럴이고,
    아니면 함수 식별자다. `rename` 은 실제로 IPC 이름을 바꾼다.
  - `62~78` 줄: `rename_all` 은 `"camelCase"` 와 `"snake_case"` **둘만** 받아
    `argument_case` 를 정한다. `510~520` 줄이 그것으로 **인자 키**를 바꾼다.

그래서 `rename_all` 로는 이름을 바꾸지 않는다. 바꾸면 Tauri 가 등록하지도 않는 이름을
목록에 넣고 진짜 이름(함수 이름)을 잃어, 지금보다 나쁜 자리가 된다. 리뷰 지시에
`rename_all` 도 이름 규칙으로 적혀 있었으나 소스가 그렇지 않아 그 부분은 따르지 않았다.

**게이트가 옮겨 갈 자리(다른 작업 몫).** `scripts/check-destructive-affordance.mjs`:

  1. `91` 줄 `import { tauriCommandBodies } from "./lib/rust-tokens.mjs";`
     → `tauriCommandDeclarations` 로.
  2. `313~322` 줄 `tauriCommands()` 의 `for (const [name, body] of tauriCommandBodies(…))`
     → `for (const d of tauriCommandDeclarations(…))` 로 바꾸고 열쇠를 `d.ipcName` 으로,
     값에 `d.body` 와 `d.fnName` 을 함께 담는다(메시지에 함수 이름을 적으려면 필요하다).
  3. `420~425` 줄 파괴 후보 판정의 `DESTRUCTIVE_NAME.test(name)` 은 `ipcName` 과 `fnName`
     **둘 다** 보게 한다 — 이름만 파괴적이고 본문은 조용한 반대 방향도 있다.

호출부 대조(`commands.includes(리터럴)`)는 열쇠가 `ipcName` 이 되는 순간 저절로 맞는다.

```
# 리뷰어가 심은 그대로 (rename = "ghost_wipe_everything" + invoke("ghost_wipe_everything"))
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 14 — EXIT=0      ← 배선 전이라 아직 열려 있다
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# 같은 소스에 모듈이 답하는 것
#   tauriCommandBodies 열쇠 : ["innocent_placeholder"]
#   tauriCommandNames       : ["ghost_wipe_everything"]   ← 프런트가 부르는 이름

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

계약 테스트 `src/test/rust-tokens.contract.test.ts` 에 여섯 항목을 더했다(31 → 37):
`rename` 이 IPC 이름이라는 것(본문 판정까지), `rename_all` 이 camelCase·snake_case 어느
쪽이든 이름을 **바꾸지 않는다**는 것, 둘 다 있으면 `rename` 이 이긴다는 것, 인자가
없거나 `async`·`rename_all` 뿐이면 함수 이름이라는 것, `cfg_attr`·크레이트 별명·
`tauri_macros` 형태에서도 읽힌다는 것, 그리고 `tauriCommandBodies` 가 예전 그대로
함수 이름을 열쇠로 쓴다는 것(게이트가 옮겨 가면 이 항목이 그 사실을 알려 준다).

데이터 홈 게이트 기준선은 그대로다 — 이름표 14 · 변형 14 · 문서 14행 · 공개 항목 16.


**게이트 배선 (2026-09-06):** 파괴 게이트가 새 API 를 쓰도록 이었다.
`tauriCommandBodies` 대신 `tauriCommandDeclarations` 를 쓰고, 명령 목록의
**열쇠를 IPC 이름**으로 바꿨다 — 함수 이름으로 목록을 만들면 `rename` 이
붙은 명령이 `commands.includes` 에서 그냥 건너뛴다. 값에는 본문과 함수 이름을
함께 담아 보고 줄에 함수 이름이 나오게 했고, 파괴 후보 판정은 IPC 이름과 함수
이름을 **둘 다** 본다(한쪽만 무해해 보이게 적는 것이 이번 우회였다).

```
# capture.rs: #[tauri::command(rename = "ghost_wipe_everything")] fn innocent_placeholder
#             (본문 remove_dir_all)
# db.ts: 확인 없이 invoke("ghost_wipe_everything", { root })
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# Rust 명령 207개 중 파괴 후보 17개 / 프런트 호출 15곳
#   db.ts:29 — ghost_wipe_everything (감싼 함수 ghostWipeEverything) — EXIT=1
# 되돌린 뒤 206 · 16 · 14곳 — EXIT=0, git diff 출력 없음
```

`tauriCommandBodies` 는 이제 이 게이트가 쓰지 않는다. 그 함수와 계약 항목을
지우는 것은 `rust-tokens.mjs` 소유자의 몫이라 그대로 두었다.

---

## 번호 없는 관찰 (머리말이 보증하지 않는다고 적은 자리 · 또는 실증이 안 된 자리)

- `--check`가 분류의 옳고 그름을 보증하지 않는다는 문장 자체, 데이터 홈 허용 목록이 파일 단위라는 점, 함수 호출 결과 일반, 실행 시 조립 문자열, 매크로가 생성하는 속성은 머리말 그대로 보증 밖입니다.
- 얇은 감싸기 `function wrap(cmd) { return invoke(cmd); } wrap.call(null, "…")`는 `wrap.call` 자체가 호출부가 아니지만, 안의 `invoke(cmd)`가 조립 호출로 이미 붉어져 **거짓 통과로 실증되지 않았습니다.** 지적 번호를 주지 않습니다.

되돌린 뒤 기준선 게이트 전부 `EXIT=0`, `git status --porcelain` 출력 없음.
