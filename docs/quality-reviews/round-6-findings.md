# 6회차 교차 리뷰 지적 (2026-09-05)

판정: **NOT CLEAN**, 지적 11건. 아래는 리뷰어 원문이고, 각 항목의 처리 상태는 이 표에 있다.
상태는 **결함을 실제로 주입해 EXIT=1 을 본 뒤 원복해 EXIT=0 을 본 것**만 "닫힘"으로 적는다.

| # | 대상 | 상태 |
|---|---|---|
| 1 | check-silent-clicks.mjs — `await` 형태 누락 | 닫힘 |
| 2 | check-dead-ui-specs.mjs — 주석 부활, `.not.` 면제 | 닫힘 |
| 3 | check-destructive-affordance.mjs — 네 갈래 | 닫힘 |
| 4 | check-untranslated-ui.mjs — 접근자 바꾸면 안 보임 | 닫힘 |
| 5 | i18n-user-facing.test.ts — 0.6 한계 | 닫힘 |
| 6 | wdio-node26-request.contract.test.ts — 주석으로 만족 | 닫힘 |
| 7 | 900-startup-latency.spec.ts — 측정 지점 | 닫힘 |
| 8 | app_sandbox.rs — 가드 둘이 미고정 | 닫힘 |
| 9 | check-uc-traceability.mjs — 표제 깊이, 추적 인정 | 닫힘 |
| 10 | build-e2e-inventory.mjs — 수기 헬퍼 목록 | 닫힘 |
| 11 | check-vacuous-tests.mjs — `verify*` 를 단정으로 셈 | 닫힘 |

---

NOT CLEAN

거짓 통과 열한 자리를 실제로 주입해 확인했습니다. 모두 baseline 숫자가 아니라 **범위 조건**(정규식이 아는 형태 하나, 손으로 적은 목록, 측정 지점, 문자열 grep, 면제의 적용 범위)에서 나왔습니다. 감사 중 저장소 작성자가 같은 파일들을 동시에 고치고 있었으므로(커밋 `33e2b5cd`, 16:44), 각 항목에 어느 시점 코드로 쟀는지 적었습니다. 주입은 전부 되돌렸고 `git status` 로 제 흔적이 없음을 확인했습니다(현재 워킹트리의 `UU`/`M` 은 작성자의 진행 중 병합입니다).

## 1. scripts/check-silent-clicks.mjs:30 — `await` 가 붙으면 무음 클릭이 통째로 보이지 않는다

`SILENT_CLICK` 정규식은 `if (el) el.click()` 처럼 **동기 형태만** 압니다. e2e 코드에서 자연스러운 형태는 `await` 가 낀 쪽인데 그것이 전부 빠져나갑니다.

01-app-launch.spec.ts 에 세 형태(`if (el) await el.click();`, `if (el) { await el.click(); }`, `el && (await el.click());`)를 넣었습니다 — 61/61, exit 0. 같은 줄에서 `await` 한 단어만 지우니 62 > 61, exit 1. 즉 이 게이트는 "무음 클릭 금지"가 아니라 "await 없는 무음 클릭 금지"입니다. 게이트 머리말이 말하는 실제 사고(92번 스펙)는 async 코드에서 일어납니다.

## 2. scripts/check-dead-ui-specs.mjs:158 — 주석 한 줄이면 사라진 화면이 되살아난다

`sourceText.includes(`"${name}"`)` 는 셸 소스 **어디든** 그 이름이 따옴표 안에 있으면 살아 있는 것으로 봅니다. 주석은 지우지 않습니다.

01-app-launch.spec.ts 에 `[data-testid="ghost-wake-panel"]` 를 기다리는 스펙을 넣으니 exit 1. i18n.ts 끝에 `// removed: the old "ghost-wake-panel" element` 한 줄만 붙이니 exit 0. 화면을 지우면서 "지웠다"고 주석을 남기는 것이 정상 습관이므로, 이 게이트가 잡으려는 세 번의 사고(음성 깨우기 화면은 코드에 "UI + handlers deleted" 라고 적혀 있었습니다) 그대로가 통과합니다.

같은 파일 앵커 뒤 220자 안에 `.not.` 가 있어도 면제됩니다. 죽은 앵커 바로 다음 줄에 관계없는 `await expect(await $("#chat")).not.toHaveText("x")` 를 두니 exit 0.

## 3. scripts/check-destructive-affordance.mjs — 네 갈래로 빠져나간다

**(a) 이름을 조립하면 호출부가 사라진다.** `invoke("memory_delete_fact", …)` 를 확인 없이 넣으면 exit 1(호출 10곳). 같은 코드를 ``invoke(`${FACT_CMD}_fact`, …)`` 로 바꾸니 호출 9곳, exit 0. 게이트는 명령 이름을 Rust 에서 자동으로 뽑지만 **호출부는 리터럴 문자열로만** 찾습니다.

**(b) `confirm` 이 든 식별자 하나면 방어로 인정된다 — 4000자 상한과 무관하다.** `AFFORDANCE`(59행)는 단어 경계가 없는 `/confirm/i` 입니다. 네 줄짜리 함수에 관계없는 `const emailConfirmedAt = Date.now();` 를 두고 그 아래에서 확인 없이 삭제하니 exit 0. 3,445자짜리(상한 바로 아래) 함수로도 같은 결과였습니다. 상한은 "큰 덩어리 안의 한 글자"만 막을 뿐, **정상 크기 함수 안의 한 글자**는 그대로 통과합니다.

**(c) 이름이 낱말 목록 밖이면 아예 후보가 아니다.** Rust 에 `app_sandbox_discard_everything`(`remove_dir_all` 로 앱 구역 전체 삭제)을 만들고 프런트에서 확인 없이 부르니 명령 수만 198→199 로 늘고 exit 0. 손으로 적은 목록을 없앴다는 것은 절반만 사실입니다 — 명령 추출은 자동이지만 그 뒤의 `DESTRUCTIVE_NAME`(32행) 낱말 목록이 같은 성격의 수기 목록이고, `discard`/`unlink`/`truncate`/`factory` 같은 흔한 이름이 빠져 있습니다.

**(d) `REVERSIBLE` 면제가 호출부가 아니라 명령 이름 전체에 걸린다.** `delete_naia_settings` 의 사유는 "부르는 곳도 초기화 흐름 안이다" 인데, 초기화와 무관한 곳에 확인 없는 새 호출부를 넣어도 exit 0 이고 호출 수(9)조차 늘지 않습니다. `pty_kill` 도 같습니다. `ACKNOWLEDGED` 에는 낡은 면제 검사가 있지만 `REVERSIBLE` 에는 없습니다.

## 4. scripts/check-untranslated-ui.mjs:82,32 — 로케일 우회표는 접근자만 바꾸면 보이지 않는다

우회표 탐지는 `getLocale()` 이 **그 파일에** 문자로 있을 때만 돕니다. UpdateBanner.tsx 에 `getLocale() === "ko" ? … : …` 표를 넣으면 exit 1. 같은 표를 `navigator.language.slice(0,2)` 로 바꾸고 한국어를 `\uc5c5\ub370\uc774\ud2b8` 로 적으니 exit 0 — `HANGUL` 정규식도 이스케이프는 못 봅니다. `navigator.language` 는 이 저장소의 `detectLocale` 이 쓰는 바로 그 값이라 가장 그럴듯한 형태이고, 두 검사가 동시에 눈이 멉니다.

## 5. packages/shell/src/lib/__tests__/i18n-user-facing.test.ts:70 — 로케일의 절반 이상이 영어여도 초록

짝 비교 한계가 0.6 입니다. 현재 상태를 재 보니 ko 를 뺀 열두 로케일이 **이미 32~35% 가 영어와 글자까지 같습니다**. vi.ts 의 값 270개를 영어로 되돌려 55.9% 로 만들었더니 4/4 통과(exit 0). 70.6% 로 올려서야 붉어졌습니다. "각 로케일이 서로 다른 문구를 낸다"는 단정이 실제로 보증하는 것은 "41% 이상은 다르다" 뿐입니다.

부수 관찰: "모든 로케일이 같은 키 집합을 갖는다"의 키 비교는 항상 `ko` 의 키 배열로 표를 만들어 그 배열과 견주므로 **원리적으로 실패할 수 없습니다**. 다만 키를 300개 지우는 변이는 같은 테스트의 빈 문자열 검사가 잡았으므로(exit 1) 실질 결함은 덮여 있습니다.

## 6. src/test/wdio-node26-request.contract.test.ts:30 — 주석 한 줄이면 계약이 만족된다

`source.includes("transformRequest")` 문자열 검사입니다. wdio.conf.chat.ts 에서 `import { transformRequest }` 와 `transformRequest,` 배선을 지우고 그 자리에 `// Node 26 대응(transformRequest)은 이제 필요 없다고 판단해 뺐다` 주석만 남기니 16/16 통과(exit 0). 주석까지 지우면 exit 1. 이 테스트가 막겠다고 적어 둔 사고(전용 설정 열 개가 세션 생성에서 `UND_ERR_INVALID_ARG` 로 죽음)를 그대로 다시 만들 수 있고, 배선을 뺀 사람이 이유를 주석으로 남기는 것이 가장 자연스러운 경로입니다.

## 7. packages/shell/e2e/900-startup-latency.spec.ts:95 — 측정 지점이 아직 부팅 앞에서 멈춘다

`data-app-ready` 는 `useAppReady`(hooks/useAppPresentation.ts:30)가 계산하고, 그것은 **설정·로케일 하이드레이션과 아바타**만 기다립니다. 경계를 실측했습니다.

- `readNaiaConfig` 에 3초 → 콜드 4,515ms / 웜 중앙값 3,596ms, exit 1 (잡힘)
- `app-loader.ts` 의 설치된 앱 목록 로딩에 3초 → 콜드 807ms / 웜 219ms, exit 0 (기준선 1,072ms/167ms 와 구별 불가)

즉 5회차 지적은 하이드레이션 한 구간만 열었고, 부팅의 나머지(App.tsx 의 서른 개 남짓한 useEffect — 앱 목록, 참조 음성, 에이전트 기동 등)는 여전히 측정 밖입니다. 앱바가 3초 동안 비어 있어도 성능 축은 아무 말을 하지 않습니다.

## 8. packages/shell/src-tauri/src/app_sandbox.rs:64,70 — 경로 가드 셋 중 둘이 어느 테스트에도 고정돼 있지 않다

`file()` 의 첫 검사(상대경로·Normal 구성요소 강제)가 `../` 형태를 먼저 걷어내기 때문에, 그 뒤의 `lexically_inside` 와 부모 `canonicalize` 검사는 기존 테스트가 한 번도 지나가지 않습니다. 두 검사를 통째로 지우고 `cargo test --lib app_sandbox` 를 돌리니 **7 passed, exit 0**.

그 상태가 실제 탈출인지도 확인했습니다. 샌드박스 안에 바깥(`/tmp/naia-audit-outside`)을 가리키는 **디렉터리 symlink** 를 심고 `file(&r, "linked/pwned.txt")` 를 부르니 가드를 지운 코드는 경로를 승인했고 파일이 샌드박스 밖에 실제로 생겼습니다(`PROBE: file outside exists = true`). 원본 코드에서는 같은 호출이 `sandbox path escape rejected` 로 거부됩니다. 즉 가드는 살아 있고 일하고 있는데, 그것을 지켜 주는 테스트가 없습니다 — 5회차의 "가드를 지워도 전부 통과" 는 첫 검사에 대해서만 닫혔습니다.

## 9. scripts/check-uc-traceability.mjs:96 — 표제 깊이 우회가 절반만 닫혔다

커버리지 행 검사는 `#{2,6}` 으로 깊이를 가리지 않게 고쳤지만, **벤치 등록 검사(96행)는 여전히 `^###` 만** 봅니다. `### UC-PROBE-NOTHING` 은 "벤치 하네스가 모르는 UC" 로 exit 1, `####` 로 한 단만 내리면 exit 0 입니다. 같은 파일 안에서 고친 우회가 열 줄 아래에 그대로 남아 있습니다.

추적 인정 조건도 느슨합니다. UC 표제와 아무 관계 없는 위치(문서 맨 끝, Test Coverage Map 은 344행)에 `| UC-PROBE-NOTHING | `scripts/check-vacuous-tests.mjs` | 없음 |` 한 줄을 붙이자 exit 0 이 되었습니다 — 실재하는 파일을 백틱으로 감싸기만 하면 되고, 그 파일이 그 UC 와 관계있는지는 보지 않습니다.

## 10. scripts/build-e2e-inventory.mjs:54 — 등급이 수기 헬퍼 목록에 걸려 있다

`CHAT_HELPERS` 는 `sendMessage|waitForToolSuccess|getLastAssistantMessage|judge*` 넷뿐입니다. 같은 helpers/chat.ts 에 있는 `verifyWithSubAgent`(부심판 모델을 실제로 부릅니다)는 빠져 있습니다. 그 헬퍼만 쓰는 스펙을 만들어 인벤토리를 재생성하니 `tier: deterministic_ci` 로 분류됐습니다 — 자격증명 없는 기계로 배정되어 실패하는, 이미 두 번 겪은 그 오분류입니다. `--check` 는 목록이 스펙과 일치하는지만 보므로 틀린 분류를 "일치함"으로 보증합니다.

## 11. scripts/check-vacuous-tests.mjs:109 — 이름이 `verify*` 면 단정이 없어도 단정으로 센다

`ASSERTS` 가 `\bverify\w*\s*\(` 를 단정으로 인정합니다. 본문이 아무 일도 하지 않는 헬퍼 호출 하나뿐인 테스트(`verifySoldOutBanner("anything")`)는 32/32 로 exit 0, 같은 헬퍼를 `renderSoldOutBanner` 로 이름만 바꾸면 33 > 32 로 exit 1. 이 게이트가 예로 든 96-w5-sold-out-ux.spec.ts 와 정확히 같은 형태를, 헬퍼 이름만 골라 다시 만들 수 있습니다.

## 감사 중에 닫힌 것 (참고)

`scripts/check-regression-complete.mjs` 의 지문 면제는 감사 시작 시점 코드에서 **살아 있었습니다**. 기계 셋의 기록을 "123/123 실행·passed" 로 적고 `ranOn.inventorySha256` 을 **틀린 값**으로 넣으면 거부(exit 1, 실제 상태 14/123·기계 둘 실패)인데, **같은 파일에서 `ranOn` 필드만 지우면** exit 0 · "모든 스펙이 어느 기계엔가 배정되었고 건너뛴 것이 없다" 로 뒤집혔습니다. 옛 형식 호환이 낡은·다른 목록에서 돈 기록의 통행증이었던 셈입니다. 이 자리는 작성자가 감사 도중 커밋 `33e2b5cd` 로 닫았고, 재실험에서 지문 없는 기록은 거부됩니다.

## CI 배선 확인

대상 열 개 스크립트는 모두 워크플로에 걸려 있습니다. `check-regression-complete` 만 `build-installers.yml` 의 `if: startsWith(github.ref,'refs/tags/') || workflow_dispatch` 아래라 평소 푸시에서는 돌지 않는데, 이것은 문서가 밝힌 의도이고 `build` 잡이 `result != 'failure'` 로 건너뜀을 통과시키는 것도 명시돼 있습니다. 나머지는 `code-gates` 잡에 조건 없이 있어 PR 과 main 푸시에서 실행됩니다. 다만 PR 없이 기능 브랜치에만 푸시하면 어느 잡도 돌지 않습니다.

## 붉어짐을 확인한(=제대로 작동하는) 변이

- `if (el) el.click()` 동기 형태 → silent-clicks exit 1
- 존재하지 않는 `data-testid` 앵커(주석·`.not.` 없이) → dead-ui exit 1
- 확인 없는 `memory_delete_fact` 호출(리터럴·confirm 식별자 없음) → destructive exit 1
- `getLocale()` 기반 ko/en 표 → untranslated-ui exit 1
- 로케일 값 300개 삭제, 로케일 70% 영어화 → i18n 테스트 exit 1
- wdio 설정에서 `transformRequest` 를 흔적 없이 제거 → 계약 테스트 exit 1
- `readNaiaConfig` 에 3초 지연 → 시작 지연 스펙 exit 1
- `role="alert"` 막다른 화면에 행동 없음 → recovery exit 1 (다만 같은 화면에 "Start-up failed" 라고 적거나 `role="alert"` 를 빼면 exit 0 — `RECOVERY` 가 `Start` 부분문자열을 행동으로 인정하고, 알림 표지가 없는 오류 화면은 애초에 세지 않습니다)
- 지문이 틀린 회귀 기록 → regression-complete exit 1
- 커버리지 행 없는 새 UC → uc-trace exit 1
- 새 스펙 추가 후 인벤토리 미갱신 → `--check` exit 1