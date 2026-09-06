# 17회차 교차 리뷰 지적 (2026-09-06, 스냅숏 ca53f579)

판정: **NOT CLEAN**, 지적 9건. 아래는 리뷰어 원문이다.

---

품질 게이트의 거짓 통과 자리를 찾기 위해, 먼저 프로세스 현황·이전 회차 닫힘 기록·게이트 머리말을 읽고 범위를 잡겠습니다.이전 회차 닫힘 기록과 게이트·공용 모듈 머리말을 대조해, 아직 안 닫힌 범위 조건을 좁히겠습니다.공용 모듈의 나머지와 게이트 호출 규약을 이어서 읽고, 닫히지 않은 범위 조건만 남기겠습니다.단항 `!`·옵셔널 체이닝·재수출 문자열 키처럼, 16회차가 닫지 않은 형태를 코드에서 대조하겠습니다.파괴 호출부 모듈 대조·크레이트 발견·데이터 홈·인벤토리·시딩 계약을 이어서 대조합니다.가설을 모듈에 직접 물은 뒤, 통과하는 형태만 게이트에 심겠습니다. 먼저 런타임과 심을 자리를 확인합니다.TypeScript를 연결한 뒤, 모듈에 가설을 직접 묻고 통과하는 형태만 게이트에 심겠습니다.기준선은 전부 `EXIT=0`인지 확인한 뒤, 모듈에서 통과한 형태만 심겠습니다.가설을 하나씩 심고 게이트를 돌리겠습니다.인벤토리가 주소 문자 자체로 걸린 건지 확인하기 위해, 대화 자국에 안 잡히는 호스트로 다시 심겠습니다.기준 HEAD는 `f8ea1da`입니다. 6~16회차에서 닫힌 형태는 같은 자리로 다시 심지 않았고, 공용 모듈의 **범위 조건**과 게이트가 그 모듈을 **부르는 규약**만 심었습니다. 각 지적은 결함을 심어 `EXIT=0`을 본 뒤 대조로 `EXIT=1`을 보고, 전부 되돌렸습니다. `git status --porcelain`은 비어 있습니다. 커밋·push는 하지 않았습니다.

파서 게이트는 이 트리에 `typescript`가 없어 루트 `node_modules`에 패키지만 연결해 실행했습니다. 그 연결은 저장소 파일이 아닙니다.

기준선은 전부 `EXIT=0`이었습니다 (dead-ui 이름 175 / 복구 자리 1·0 / 무음 107 / 파괴 206·16·14 / 데이터 홈 이름표 14·공개 16 / 인벤토리 119 / 린트 위반 0).

---

# 판정: **NOT CLEAN** — 실증된 지적 9건

| # | 대상 | 한 줄 |
|---|---|---|
| 1 | `jsx-static.mjs:662-672, 1556-1559` `alwaysTruthy` | `disabled={"x".length}` 은 영구 참이 아니다. `disabled={true}` 는 참이다 |
| 2 | `jsx-static.mjs:1041-1043` `stringCandidates` | `role={["alert"][0]}` 은 알림이 아니다. `role="alert"` 는 알림이다 |
| 3 | `rust-tokens.mjs:225-228` 문자열 이스케이프 | `"\x2enaia"` · `"\x48OME"` 는 홈 접근이 아니다. `".naia"` · `"HOME"` 는 접근이다 |
| 4 | `rust-tokens.mjs:375-378` `useResolution` | `extern crate tauri as t; #[t::command]` 는 명령이 아니다. `use tauri as t` 는 명령이다 |
| 5 | `check-destructive-affordance.mjs:468-471, 740` | `from "@tauri-apps/api/core.js"` 는 호출부가 아니다. `from "@tauri-apps/api/core"` 는 호출부다 |
| 6 | `check-destructive-affordance.mjs:637, 657` `aliasFromDeclaration` | `{ "invoke": g }` / `{ "invoke": invoke }` 는 호출부가 아니다. 식별자 키는 호출부다 |
| 7 | `check-silent-clicks.mjs:265-270` | `if (Boolean.call(null, el)) el.click()` 은 무음이 아니다. `Boolean(el)` 은 무음이다 |
| 8 | `jsx-static.mjs:1083-1086` `staticStringsIn` | `fetch(String.raw\`https://…\`)` 는 바깥 주소가 아니다. `fetch("https://…")` 는 바깥 주소다 |
| 9 | `lint-boundary-forms.mjs:180-193` `voidLiteral` | `void +0` 은 금지 형태가 아니다. `void 0` 은 금지 형태다 |

---

## 1. `scripts/lib/jsx-static.mjs:662-672, 1556-1559` — 리터럴의 `.length` 는 접히지 않는다

16회차는 비교·산술·비트를 **두 피연산자가 정해지면 결과도 정해진다**는 규칙으로 접었습니다. `alwaysTruthy` 의 멤버 접근은 `constAccessValue` 로만 풀고, 그 함수는 객체·배열 **리터럴**과 식별자 const 만 받습니다. 문자열 리터럴 `"x"` 는 그 세 갈래 어디에도 없습니다. `"x".length` 는 JavaScript 에서 `1` 이고, React 에서 `disabled={"x".length}` 는 누를 수 없는 버튼입니다. 머리말이 모른다고 적은 것은 상태·인자·**함수 결과**입니다. `.length` 는 호출이 아닙니다.

같은 갈래로 `[1].length` 도 거짓입니다 — 배열 리터럴은 `constAccessValue` 에 들어가지만 `literalMember` 가 숫자 키만 읽어 `"length"` 는 버립니다.

`SettingsTab.tsx` 연결 탭 뒤에 버튼, 스펙 `onboarding-fresh.spec.ts` 가 `getByTestId("ghost-wake-panel")`.

**(a)** `disabled={"x".length}` → 이름 176개, 꺼 둔 조작 6곳(기존), **EXIT=0**. 린트 **EXIT=0**.

**대조.** `disabled={true}` → `onboarding-fresh.spec.ts:365 — ghost-wake-panel`, **EXIT=1**.

```
# (a) disabled={"x".length}  (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 이름 176개 / 꺼 둔 조작 6곳 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 disabled={true}
# ❌ 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 무엇을 접는지를 코드 여기저기가 아니라
`STATIC_EVAL_KINDS` **한 표**로 두고, 표 안은 전부 접고 표 밖은 전부 "모른다" 로
통일했다. 이번에 표에 들어온 것은 리터럴의 멤버(`"x".length`, `[1,2].length`,
`{a:1}.a`)와 리터럴의 리터럴 인덱스(`["alert"][0]`, `ROLES[0]`)다. 담는 것이
이름이면 그 `const` 값으로 바꿔 들므로 `const ROLES = ["alert"]` 뒤의 `ROLES[0]`
도 같다.

표는 모듈 머리말과 `docs/quality-reviews/obfuscation-forms.md` 의 "정적 평가
범위" 절이 그대로 싣고, 셋이 어긋나면 계약 테스트가 붉어진다. 표 밖(함수 호출의
결과 일반, 정규식 실행, 전역 객체 속성, 실행할 때 조립되는 값)은 보증 밖이라고
같은 자리에 적었다 — 리뷰어가 경계를 읽을 수 있어야 한다.

```
# (a) disabled={"x".length}   (+ 스펙이 ghost-wake-panel 대기)
node scripts/check-dead-ui-specs.mjs; echo EXIT=$?
# 영구히 꺼 둔 조작을 기다리는 스펙 1곳 — EXIT=1

# (b) disabled={[1].length} — EXIT=1
# 반증 disabled={naiaVrms.length} (표 밖) — 이름 176개 — EXIT=0
# 반증 빈 문자열·빈 배열의 length 는 모듈에서 거짓
# 대조 disabled={true} — EXIT=1
# 되돌린 뒤 이름 175개 — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다(금지 형태가 아니다).

---

## 2. `scripts/lib/jsx-static.mjs:1041-1043` — 대괄호 인덱스는 문자열이 아니다

복구 판정은 `role` 값을 `staticChunks` → `stringCandidates` 로 읽습니다. `stringCandidates` 는 식별자와 **점** 속성(`obj.key`)만 따라가고, 대괄호 인덱스에서 `return { values, complete: false }` 입니다. `["alert"][0]` 은 글자 `"alert"` 이고, `<div role={["alert"][0]}>` 는 브라우저에서 `role="alert"` 과 구별되지 않습니다. 동적 키(`obj[name]`)가 아닙니다.

`UpdateBanner.tsx` 의 `if (installing)` 을 `return <div role={["alert"][0]}>` 로.

→ 자리 1곳 / 다음 행동 없음 0, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `role="alert"` → 자리 2곳 / 다음 행동 없음 1, `UpdateBanner.tsx:32`, **EXIT=1**.

```
# role={["alert"][0]}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 1곳 / 0 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 role="alert"
# 자리 2곳 / 다음 행동 없음 1 — UpdateBanner.tsx:32 — EXIT=1
```

`const ROLES = ["alert"]; role={ROLES[0]}` 도 같은 대괄호 갈래입니다. 16회차가 닫은 것은 구조분해 **키**이고, 이번은 값 자리의 인덱스입니다.

**상태 (2026-09-06):** 닫혔다. `stringCandidates` 가 마지막에 정적 평가 표에
묻는다 — 리터럴의 리터럴 인덱스(`["alert"][0]`, `{a:"alert"}["a"]`)와 `const`
배열의 인덱스(`ROLES[0]`)가 거기서 풀린다. 형태를 열거하는 대신 "표 안이면
접는다" 한 규칙이다.

```
# role={["alert"][0]}
node scripts/check-recovery-affordance.mjs; echo EXIT=$?
# 자리 2곳 / 다음 행동이 없는 곳 1 — EXIT=1
# 대조 role="alert" — EXIT=1
# 반증 ROLES[i] (인덱스를 모른다) — 후보 없음, complete=false
# 되돌린 뒤 자리 1곳 / 0 — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다(금지 형태가 아니다).

---

## 3. `scripts/lib/rust-tokens.mjs:225-228` — `\xNN` 은 글자 `x` 다

데이터 홈 검사는 문자열 토큰의 **값**을 `HOME` / `.naia` 와 대조합니다. 보통 문자열의 이스케이프는 `value += source[j + 1]` 한 글자입니다. Rust 에서 `"\x48OME"` 의 값은 `HOME` 이고 `"\x2enaia"` 의 값은 `.naia` 입니다. 토큰 값은 `x48OME` / `x2enaia` 라서 금지 집합에 없습니다.

머리말이 위조로 적은 것은 `format!(".{}", "naia")` 처럼 **조각을 이어 붙이는 것**입니다. 이것은 문자열 리터럴 하나이고, 적는 법만 다릅니다. `\u{48}OME` · `\u{2e}naia` 도 같은 한 글자 소비로 깨집니다.

`capture.rs` 끝.

```rust
fn ghost_cache() -> PathBuf {
    std::env::var("\x48OME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join("\x2enaia")
        .join("ghost-cache")
}
```

→ 이름표 14 · 공개 항목 16, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `"HOME"` · `".naia"` → `capture.rs:239` 환경 변수 HOME, `capture.rs:242` `.naia` 마디, **EXIT=1**.

```
# "\x48OME" + "\x2enaia"
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# 이름표 14 · 공개 항목 16 — EXIT=0
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# EXIT=0

# 대조 "HOME" + ".naia"
# ❌ 데이터 홈을 모듈 밖에서 짚었다(2) — EXIT=1
```

**상태 (2026-09-06):** 닫았다. 문자열 토큰이 이제 **값**을 갖는다 — 적는 법이 아니라 뜻이다.
보통 문자열과 바이트 문자열은 원문을 모은 뒤 한 번에 풀고(`\xNN`, `\u{…}`,
`\n \r \t \0 \\ \" \'`, 줄 끝 `\` 이어쓰기), 생 문자열(`r"…"`, `r#"…"#`)은 이스케이프가
없으므로 적힌 그대로가 값이다. 문자 리터럴도 같다. 예전에는 `value += source[j + 1]`
한 글자를 삼켜 `"\x48OME"` 이 `x48OME` 로, `"\x2enaia"` 가 `x2enaia` 로 남았다.

값을 보는 자리(홈 검사·`.naia` 마디 검사·이름표 읽기)는 모두 `value` 를 읽는다.

**소스에서 `.text` 비교를 찾아 없애는 대신 불변식을 두었다.** 문자열·문자 토큰은 `text`
와 `value` 가 **언제나 같은 값**이다. 값을 읽는 자리는 앞으로도 늘어날 텐데(15회차에 하나,
16·17회차에 각각 하나), 그중 하나가 `text` 를 읽어도 답이 달라지지 않아야 한다. 계약은 그
불변식을 고정한다 — 글자를 찾는 검사보다 강하고, 새 소비자가 생겨도 자동으로 지켜진다.

```
# (a) std::env::var("\x48OME") … .join("\x2enaia")
node scripts/check-data-home-boundary.mjs; echo EXIT=$?
# ❌ 데이터 홈을 모듈 밖에서 짚었다(2)
#    capture.rs:240 — 환경 변수 "HOME" 를 직접 읽는다
#    capture.rs:243 — 문자열에 `.naia` 마디가 있다 (".naia")   — EXIT=1
node scripts/check-lint-boundary.mjs; echo EXIT=$?   # EXIT=0

# (a2) "\u{48}OME" · "\u{2e}naia" — 같은 두 줄 — EXIT=1, 린트 EXIT=0
# 대조 "HOME" · ".naia" — 같은 두 줄 — EXIT=1, 린트 EXIT=0

# 되돌린 뒤 — 이름표 14 · 변형 14 · 문서 14행 · 공개 항목 16 — EXIT=0, git diff 출력 없음
```

메시지가 대조와 **글자까지 같다**는 점이 이 고침의 요지다. 적는 법이 판정에 들어오지
않으므로 세 형태가 한 줄로 보고된다.

HEAD 와 나란히 물어 차이를 확인했다 — 같은 소스에서 HEAD 의 `splitCodeAndStrings` 는
`["x48OME", "x2enaia"]`, 지금은 `["HOME", ".naia"]` 다.

계약 테스트 `src/test/rust-tokens.contract.test.ts` 에 네 항목을 더했다: 일곱 가지 문자열
형태의 값(생 문자열은 그대로라는 것 포함), 줄 끝 이어쓰기, `text === value` 불변식,
그리고 `splitCodeAndStrings` 가 값을 넘긴다는 것.

---

## 4. `scripts/lib/rust-tokens.mjs:375-378` — `extern crate tauri as t` 는 별명이 아니다

15회차는 `use tauri as t; #[t::command]` 를 `useResolution` 으로 닫았습니다. 그 표는 `useDeclarations` 만 채웁니다. `extern crate tauri as t` 는 같은 크레이트 별명이고, 2018/2021 edition 에서도 유효합니다. `use` 가 아니라서 표에 없고, `#[t::command]` 는 정본 경로가 아닙니다. 매크로가 **생성**하는 속성이 아닙니다.

`capture.rs` 끝 + `db.ts` 에 확인 없이 `invoke("ghost_wipe_everything")`.

**(a)** `extern crate tauri as t; #[t::command] fn ghost_wipe_everything` → 명령 **206**(기준선) / 후보 16 / 호출 14, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `use tauri as t; #[t::command]` → 명령 207 / 후보 17 / 호출 15, `db.ts:29 — ghost_wipe_everything`, **EXIT=1**.

```
# extern crate tauri as t; #[t::command] fn ghost_wipe_everything + invoke
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 206 · 후보 16 · 호출 14 — EXIT=0

# 대조 use tauri as t
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — EXIT=1
```

**상태 (2026-09-06):** 닫았다. 별명 표(`useResolution`)를 `use` 만 채우던 것을 고쳐,
`extern crate tauri as t;` 도 같은 표에 넣는다(`externCrateDeclarations`). 별명이 없는
`extern crate tauri;` 는 지역 이름이 크레이트 이름과 같아 표에 넣을 것이 없고,
`#[tauri::command]` 가 이미 정본 경로로 풀린다.

`extern "C" fn` 의 `extern` 은 뒤가 문자열이라 크레이트 선언이 아니고, 낱말 판정은
16회차에 넣은 `isKeyword` 를 지나므로 `r#extern` 같은 생 식별자도 걸리지 않는다.
정규화는 양쪽으로 작동한다 — `extern crate clap as t;` 뒤의 `#[t::command]` 는 명령이
아니다.

```
# (a) extern crate tauri as t; #[t::command] fn ghost_wipe_everything + invoke
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 15 — db.ts:29 — ghost_wipe_everything — EXIT=1

# 대조 use tauri as t — 같은 출력 — EXIT=1

# 되돌린 뒤 — 명령 206 · 후보 16 · 호출 14 — EXIT=0, git diff 출력 없음
```

HEAD 와 나란히 물어 차이를 확인했다 — 같은 소스에서 HEAD 는 `[]`, 지금은
`["ghost_wipe_everything"]` 이다. 데이터 홈 게이트 기준선(이름표 14 · 공개 항목 16)은
그대로다.

계약 테스트에 한 항목을 더했다: 별명 있는/없는 `extern crate`, 다른 크레이트의 별명,
`extern "C"` 구분, 그리고 `externCrateDeclarations` 가 돌려주는 짝.

---

## 5. `scripts/check-destructive-affordance.mjs:468-471, 740` — 요소 모듈은 패키지 이름, invoke 모듈은 적힌 문자열

16회차는 요소 모듈을 `packageOf` 로 고쳤습니다. 파괴 게이트의 `INVOKE_MODULES` 는 여전히 `"@tauri-apps/api/core"` · `"@tauri-apps/api/tauri"` **글자 그대로**입니다. `resolveCallee` 는 `{ module: "@tauri-apps/api/core.js", imported: "invoke" }` 를 주는데 `Set.has` 가 거절합니다. 명령 목록에는 오르고 호출부가 사라집니다.

같은 갈래: `core/index.js`, `core/`(끝 슬래시).

`capture.rs` 에 `#[tauri::command] fn ghost_wipe_everything`. `db.ts` 에 `import { invoke as ghostInvoke } from "@tauri-apps/api/core.js"` 후 확인 없이 `ghostInvoke("ghost_wipe_everything")`.

→ 명령 **207** / 후보 17 / 호출 **14**(기준선), **EXIT=0**. 린트 **EXIT=0**.

**대조.** `from "@tauri-apps/api/core"` → 호출 15, `db.ts:30 — ghost_wipe_everything`, **EXIT=1**.

```
# from "@tauri-apps/api/core.js"; ghostInvoke("ghost_wipe_everything")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 명령 207 · 후보 17 · 호출 14 — EXIT=0

# 대조 from "@tauri-apps/api/core"
# 호출 15 — db.ts:30 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 뿌리는 파괴 게이트가 **자기 해석을 한 벌 더 들고
있던 것**이라, 이번에 그것을 전부 지웠다.

`INVOKE_MODULES` 문자열 집합은 `INVOKE_PACKAGES` 로 바뀌었고 대조는
`bindings.mjs` 의 `packageOf`/`isModuleOfPackage` 를 지난다 — `core.js` 도
`core/index.js` 도 같은 패키지다. 요소 판정과 같은 함수다.

게이트에 남은 것은 이 게이트만의 개념 하나뿐이다 — 첫 인자를 그대로 넘기는
**감싸기 함수**를 고정점으로 키우는 일(`wrapperOffset`). import 를 읽는 자리도
공용 `importBindings` 로 넘겼다. 계약 테스트가 "게이트 소스에 import·구조분해·
모듈 경로 문자열 해석이 없다" 를 고정한다(주석은 뺀다 — 왜 그렇게 했는지 적은
문장까지 금지할 이유는 없다).

```
# import { invoke as ghostInvoke } from "@tauri-apps/api/core.js"; ghostInvoke("memory_delete_fact")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 15곳, 되돌릴 수 없는 동작 1곳 — EXIT=1
# 되돌린 뒤 호출 14곳 — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다(금지 형태가 아니다).

---

## 6. `scripts/check-destructive-affordance.mjs:637, 657` — 보탬 경로의 키는 식별자만

16회차는 `declaredPropertyName` 으로 구조분해 문자열·계산된 리터럴 키를 닫았습니다. 파괴 게이트가 **일부러** 들고 있는 보탬 둘은 그 함수를 쓰지 않고 `ts.isIdentifier` 만 봅니다.

- `const { "invoke": g } = await import("@tauri-apps/api/core")` — 머리말이 셸 지연 로딩으로 따라간다고 적은 형태
- `const ns = { "invoke": invoke }` / `{ ["invoke"]: invoke }` — 머리말이 `const ns = { invoke }` 로 따라간다고 적은 형태

동적 `import()` 자체는 `bindings.mjs` 의 보증 밖입니다. 이 게이트는 그 형태를 **읽겠다고** 적어 두었고, 식별자 키만 읽습니다.

`capture.rs` 에 `#[tauri::command] fn ghost_wipe_everything`.

**(a)** `const { "invoke": ghostInvoke } = await import("@tauri-apps/api/core"); ghostInvoke("ghost_wipe_everything")` → 호출 **14**, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `const { invoke: ghostInvoke } = await import(...)` → 호출 15, `db.ts:30`, **EXIT=1**.

**(b)** `const ns = { "invoke": invoke }; ns.invoke("ghost_wipe_everything")` → 호출 14, **EXIT=0**. `{ ["invoke"]: invoke }` 도 14, **EXIT=0**.

**대조.** `const ns = { invoke }; ns.invoke(...)` → 호출 15, **EXIT=1**.

```
# (a) const { "invoke": ghostInvoke } = await import("@tauri-apps/api/core")
# 명령 207 · 호출 14 — EXIT=0
# 대조 { invoke: ghostInvoke } — 호출 15 — EXIT=1

# (b) const ns = { "invoke": invoke }; ns.invoke(...)
# 호출 14 — EXIT=0
# 대조 const ns = { invoke } — 호출 15 — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 게이트가 "일부러 들고 있던 보탬" 두 형태를
`bindings.mjs` 로 옮겼다. 그러면 형제 모듈에서 고친 것이 저절로 따라온다 —
문자열 키·계산된 리터럴 키가 `declaredPropertyName` 하나로 읽히는 것이 그것이다.

  - `const { invoke } = await import("@tauri-apps/api/core")` — 지정자가
    **리터럴일 때만** 그 모듈로 읽는다. 실행할 때 조립되는 지정자는 그대로
    모른다. 보증 밖 문장도 그렇게 좁혔다.
  - `const ns = { invoke }; ns.invoke(...)` — 그 자리에서 만든 객체 리터럴
    네임스페이스. 어느 속성이 무엇인지 소스에 그대로 적혀 있다. 배열·`Map` 을
    거쳐 흘러간 함수는 여전히 모른다.

```
# (a) const { "invoke": g } = await import("@tauri-apps/api/core"); g("memory_delete_fact")
node scripts/check-destructive-affordance.mjs; echo EXIT=$?
# 프런트 호출 15곳 — EXIT=1

# (b) const ns = { "invoke": ghostNs.invoke }; ns.invoke(...)   — EXIT=1
#     const ns = { ["invoke"]: ghostNs.invoke }; ns.invoke(...) — EXIT=1
# 반증 const fns = [invoke]; fns[0](...) — 여전히 모른다(계약)
# 되돌린 뒤 호출 14곳 — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다(금지 형태가 아니다).

---

## 7. `scripts/check-silent-clicks.mjs:265-270` — `Boolean(E)` 의 `.call` 은 있음 가드가 아니다

머리말은 `Boolean(E)` 를 `E` · `!!E` 와 같은 있음 검사로 적습니다. `booleanCallArgument` 는 callee 가 **식별자 `Boolean`** 일 때만 E 를 꺼냅니다. `Boolean.call(null, el)` 은 같은 함수이고, 클릭 쪽은 이미 `E.click.call(E)` 를 같은 클릭으로 읽습니다. 있음 가드만 식별자를 요구합니다.

`100-herdr-first-frame.spec.ts` 마지막 단언 뒤. 기준선 107.

**(a)** `if (Boolean.call(null, ghostEl)) ghostEl.click();` → 107, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `if (Boolean(ghostEl)) ghostEl.click();` → 108 > 107, `100-herdr-first-frame.spec.ts` 가 파일별 집계에 나타남, **EXIT=1**.

```
# if (Boolean.call(null, ghostEl)) ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 107 (baseline 107) — EXIT=0

# 대조 if (Boolean(ghostEl)) ghostEl.click();
# 늘었다(108 > 107) — EXIT=1
```

**상태 (2026-09-06):** 닫혔다. 무엇을 부르는지는 `bindings.mjs` 가 답한다 —
`booleanCallArgument` 가 `resolveCallee` 로 "전역 `Boolean` 을 부르는 호출인가" 를
묻고, 인자 자리는 그쪽이 아는 `argShift` 가 옮겨 준다. 그래서
`Boolean.call(null, E)` 가 `Boolean(E)` 와 같은 검사다.

`.apply` 는 가드로 세지 않는다 — 인자 자리를 믿을 수 없으면 **무엇을
검사했는지 모르는 것**이고, 모르는 것을 "그 식을 검사했다" 로 읽으면 안 된다.

```
# (a) if (Boolean.call(null, ghostEl)) ghostEl.click();
node scripts/check-silent-clicks.mjs; echo EXIT=$?
# 늘었다(108 > 107) — EXIT=1

# (b) Boolean["call"](null, ghostEl) — 108 — EXIT=1
#     (이 형태는 린트 경계가 따로 금지한다 — 그 게이트만 EXIT=1)
# 반증 Boolean.apply(null, [ghostEl]) — 107 — EXIT=0 (인자 자리를 모른다)
# 대조 Boolean(ghostEl) — 108 — EXIT=1
# 되돌린 뒤 107 (baseline 107) — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다(금지 형태가 아니다).

---

## 8. `scripts/lib/jsx-static.mjs:1083-1086` — 태그 템플릿은 값이 흐르는 자리가 아니다

15회차는 `fetch(new Request(url))` 를 **값이 흘러가는 자리**(호출·`new` 의 인자)를 재귀로 모아 닫았습니다. `staticStringsIn` 의 재귀는 `CallExpression` 과 `NewExpression` 뿐입니다. `String.raw\`https://evil.example/hook\`` 은 `TaggedTemplateExpression` 이라 인자 안으로 내려가지 않습니다. 보간 없는 태그 템플릿의 값은 그 글자 그대로이고, `fetch` 가 그 주소로 나갑니다.

`TALKS_TO_MODEL` 발자국에 없는 호스트여야 `--check` 가 분류 변화를 보여 줍니다(`api.openai.com` 은 스펙 원문에 발자국 정규식이 걸려 재분류됩니다).

`100-herdr-first-frame.spec.ts`(지금 `deterministic_ci`) 끝.

**(a)** `await fetch(String.raw\`https://evil.example/hook\`)` → 목록 일치, **EXIT=0**. 린트 **EXIT=0**.

**대조.** `await fetch("https://evil.example/hook")` → 목록과 어긋남, **EXIT=1**.

```
# fetch(String.raw`https://evil.example/hook`)
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# ✓ 지금 스펙과 일치한다 (119개) — EXIT=0

# 대조 fetch("https://evil.example/hook")
# ❌ docs/e2e-inventory.json 이 지금 스펙과 어긋난다 — EXIT=1
```

`--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장 자체는 지적에서 뺐습니다. 이번은 목록이 **안 바뀌는** 쪽으로 바깥 fetch 가 숨는 자리입니다.

**상태 (2026-09-06):** 닫혔다. 보간 없는 태그 템플릿의 값은 고정 조각 그대로다.
`String.raw` 는 정적 평가 표의 `tagged-raw` 갈래로 들어갔고, `staticStringsIn`
은 태그 템플릿도 **값이 흘러가는 자리**로 보아 보간까지 내려간다. 모르는 태그는
값이 아니다 — 그 함수가 무엇을 하는지 모르기 때문이다.

```
# await fetch(String.raw`https://evil.example/hook`)
node scripts/build-e2e-inventory.mjs --check; echo EXIT=$?
# 지금 스펙과 어긋난다 — EXIT=1
# 대조 await fetch("https://evil.example/hook") — EXIT=1
# 되돌린 뒤 지금 스펙과 일치한다 (119개) — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다(금지 형태가 아니다).

---

## 9. `scripts/lib/lint-boundary-forms.mjs:180-193` — `void +0` 은 리터럴이 아니다

정본 형태는 리터럴에 씌운 `void`. 16회차는 괄호·`as` 를 `unwrap` 으로 벗겼습니다. `unwrap` 은 값을 바꾸는 단항을 벗기지 않습니다. `void +0` 의 안은 `PrefixUnaryExpression` 이라 검출기가 거절하고, 값은 `undefined` 로 `void 0` 과 같습니다.

`logger.ts` import 다음 줄 `void +0;`.

→ 위반 0곳, **EXIT=0**.

**대조.** `void 0;` → `logger.ts:9 — void 0`, **EXIT=1**.

```
# void +0;
node scripts/check-lint-boundary.mjs; echo EXIT=$?
# 위반 0곳 — EXIT=0

# 대조 void 0;
# void-literal — logger.ts:9 — EXIT=1
```

`void -0` · `void ~0` · `void !0` 도 같은 검출기에서 0곳입니다.

**상태 (2026-09-06):** 닫혔다. 검출기의 "리터럴" 을 형태가 아니라 **정적으로
값이 정해지는가**로 바꿨다 — `jsx-static.mjs` 의 `staticPrimitive` 와
`STATIC_UNKNOWN` 을 그대로 쓴다. 그래서 `void +0`, `void -1`, `void ~0`,
`void !0`, `void "x".length`, `void (1 === 1)` 이 모두 같은 형태이고,
`void asyncFn()` 은 표 밖이라 여전히 정당한 관용구다.

린트 경계의 판정이 게이트의 정적 평가 표에 기대게 되었으므로, 표가 넓어지면
경계도 함께 넓어진다. 그것이 맞다 — 게이트가 읽을 수 있게 된 형태를 굳이 금지할
이유가 없고, 게이트가 못 읽는 형태는 여전히 막힌다.

```
# void +0;          → 위반 1곳 — EXIT=1
# void -1;          → 위반 1곳 — EXIT=1
# void ~0;          → 위반 1곳 — EXIT=1
# void "x".length;  → 위반 1곳 — EXIT=1
# 반증 void invoke("frontend_log"); → 위반 0곳 — EXIT=0
# 되돌린 뒤 위반 0곳 — EXIT=0, git diff 출력 없음
```

모든 주입에서 린트 게이트는 **EXIT=0** 이다(금지 형태가 아니다).

---

머리말이 보증하지 않는다고 적어 둔 자리(동적 `import()` **호출**의 결과 — 다만 파괴 게이트가 그 형태를 읽겠다고 적은 보탬은 지적 6, `eval`/`Reflect.apply`/두 겹의 `Function.prototype`, 문자를 `format!` 로 조립해 `.naia` 를 만드는 위조, 데이터 홈 허용 목록이 파일 단위라는 점, `--check` 가 분류의 옳고 그름을 보증하지 않는다는 문장 자체, 배열·객체를 거쳐 흘러간 함수)는 지적 번호에서 뺐습니다.

얇은 감싸기 일곱 겹(`w7`→`w1`→`invoke(cmd)`)은 고정점 `round < 6` 이 있어도, 중간 `invoke(cmd)` 가 **조립 호출**로 이미 붉어져 거짓 통과가 되지 않았습니다.

> **후속 (2026-09-06) — 그 숫자도 없앴다.** 거짓 통과로 쓰이지 못했지만
> `round < 6` 은 13·14회차에 없앤 것과 같은 종류의 눈금이다. 이제 이름 집합이
> **더 자라지 않을 때까지** 돈다 — 집합은 한 방향으로만 자라고(이미 있는 이름은
> 다시 넣지 않는다) 저장소의 선언 수는 유한하므로 반드시 끝난다. 그 집합 자체가
> "이미 지난 자리" 표시다. 같은 파일의 `enclosingFunction` 이 바깥 블록을 열두
> 겹까지만 세던 자리도 함께 없앴다. 계약이 "게이트 소스에 반복 횟수 상수 없음"
> (`round < <숫자>`·`MAX_`·`for (…; … < <숫자>`)을 고정한다.
>
> 실증은 **선언 순서를 뒤집은** 여덟 겹 사슬로 했다. 순서대로 적으면 한 바퀴에
> 여러 겹이 함께 풀려 차이가 안 보이고, 뒤집으면 한 바퀴에 한 겹씩만 자란다.
>
> ```
> # w8 … w1 순으로 선언한 여덟 겹 뒤 w8("memory_delete_fact")
> 지금(한계 없음)  — 조립해 부르는 자리 8곳 — EXIT=1   (사슬을 끝까지 따라감)
> 옛 한계(round<6) — 조립해 부르는 자리 7곳 — EXIT=1   (한 겹을 놓침)
> 되돌린 뒤        — 프런트 호출 14곳 — EXIT=0, git diff 출력 없음
> ```
>
> 리뷰어가 두 회차에 걸쳐 적은 대로, 이 자리는 안쪽 `invoke(cmd)` 가 조립
> 호출로 먼저 붉어져 **거짓 통과가 되지 않는다**. 그래서 EXIT 은 전후가 같고,
> 차이는 게이트가 사슬을 어디까지 따라갔는지(조립 자리 8곳 대 7곳)로만 보인다.

되돌린 뒤 일곱 게이트는 다시 `EXIT=0` 입니다. 최종 `git status --porcelain` 은 비어 있습니다.

**NOT CLEAN**
