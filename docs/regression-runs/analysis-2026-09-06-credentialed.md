# 자격증명 등급 32개 안정 실패의 가족 분류 (naia-os-3090, 2026-09-06)

기록: `docs/regression-runs/naia-os-3090-2026-09-05T20-07-14-552Z.json`
(40개 배정 · 6 통과 · 안정 실패 32 · flaky 2 · 40분 33초)

#547 의 `provider error: fetch failed` 는 0회다. 벽은 걷혔다. 그런데 이 실행의
실패는 win-rtx4060 과 가족이 다르고, 그 차이 자체가 원인을 가리켰다.

## 한 줄이 이백 몇 개로 번졌다

지배적 실패는 `skill_youtube_bgm_registration_failed` 120회다. 이 문자열은
모델이 만든 답이 아니다. 화면이 매 대화 턴 앞에서 앱 스킬을 다시 등록하는데
(`ChatArea.tsx`), 그 등록이 실패하면 던지는 예외이고 그것이 그대로 대화 답변
자리에 찍힌다. 등록은 `send_to_agent_command` 로 나가므로, 실패의 뜻은 하나다 —
**에이전트가 없다.**

로그가 그것을 그대로 적고 있었다.

```
[Naia] agent-core not available: agent_lease_live_blocked
[Naia] Running without agent (chat will be unavailable)
```

`agent_lease_live_blocked` 37회, `agent-core started` 3회. 서른여덟 스펙 중
**첫 스펙만 뇌를 가졌고 나머지 서른일곱이 뇌 없이 돌았다.** 앱은 멀쩡히 떠서
스펙은 계속 진행했고, 실패는 저마다 다른 자리에서 났다.

원인은 리스다. 네이티브는 기동할 때 실행 자리의 `agent-child-lease.json` 을 보고
그 PID 가 아직 살아 있으면 agent 를 아예 띄우지 않는다
(`lib.rs` 의 `reconcile_agent_child_lease_with`). 그런데 하네스는 세션이 끝날 때
앱(`naia-shell`)만 죽였다. 그 앱이 띄운 agent 자식은 `node` 라는 이름으로 남는데,
하네스가 부르던 `pkill -x naia-node` 는 그 이름과 맞지 않아 **한 번도 아무것도
죽이지 않았다.** 고아가 리스를 쥔 채 남고, 다음 스펙은 그 리스에 막힌다.
회수 코드는 있었지만 `onPrepare` 에서 실행당 한 번만 돌아 스펙 사이를 막지 못했다.

그 뒤는 도미노다. 등록 실패 120회 → 그 문자열이 답변이 되고 → 판정 모델이 그것을
"AI 가 도구를 못 쓴다" 로 읽어 `Semantic FAIL` 99회. 판정 실패의 **답변 문자열
99개가 전부 같은 한 줄**이었다 — 모델 품질 문제가 아니다.
`creds_update failed: agent-core restart debounced` 36회도 같은 뿌리다. 뇌가 없으니
키를 실을 wire 가 없고, 재시작마저 5초 억제에 걸린다(`restart debounced` 1470회).

## 가족별 표

| 스펙 | 첫 실패 | 가족 | 근거 |
|---|---|---|---|
| 05-skill-system | `[오류] Error: skill_youtube_bgm_registration_failed` | 하네스 H1 | 그 세션에 `agent_lease_live_blocked` |
| 07-cleanup | 같은 문자열 (tool success 없음) | 하네스 H1 → 이후 제품 | 회수 후 재실행하니 "메모 삭제 도구가 없다" 로 바뀜 |
| 11-cost-dashboard | Semantic FAIL(위 문자열) | 하네스 H1 → 이후 UI | 회수 후 대화는 통과, cost-badge 클릭 불가만 남음 |
| 21-cron-recurring | `Streaming did not start (cursor-blink)` | 하네스 H1 | 뇌가 없으면 스트림이 시작되지 않는다 |
| 37-execute-command | Semantic FAIL(위 문자열) | 하네스 H1 | 답변 = 등록 실패 문자열 |
| 39-web-tools | Semantic FAIL(위 문자열) | 하네스 H1 | 〃 |
| 41-agents-crud | Semantic FAIL(위 문자열) | 하네스 H1 | 〃 |
| 43-device-management | Semantic FAIL(위 문자열) | 하네스 H1 | 〃 |
| 45-cron-gateway-full | Semantic FAIL(위 문자열) | 하네스 H1 | 〃 |
| 47-tts-full | Semantic FAIL(위 문자열) | 하네스 H1 | 〃 |
| 49-approvals-full | Semantic FAIL(위 문자열) | 하네스 H1 | 〃 |
| 51-skills-advanced | Semantic FAIL(위 문자열) | 하네스 H1 | 〃 |
| 19-skills-bulk | 내장 스킬 7개 기대, 0개 | 하네스 H1 | 스킬 목록은 에이전트가 준다 |
| 99-launch-f4-skill-usage | Skills 탭 항목 없음 | 하네스 H1 | 〃 |
| 71-proactive-speech-profiles | 프로필 문구가 소비되지 않음 | 하네스 H1 | 프로액티브 활동은 에이전트가 낸다 |
| 90-app-system | AppBar/샘플 노트 AI 쓰기 실패 | 하네스 H1 | "AI 가 앱에 쓴다" 단정이 에이전트 경유 |
| 90-glm-newcore-chat | `provider error: … failed: 401` | 하네스 H2 | 상속 설정이 키 전달을 잃음(아래) |
| 09-onboarding | `.onboarding-overlay` 30초 미표시 | 하네스/스펙 경계 H3 | 워크스페이스 config 하이드레이션(아래) |
| 13-lab-login | 〃 | H3 | 〃 |
| 67-onboarding-config-save | 〃 | H3 | 〃 |
| 15-skill-manager-ai | `before all` 훅에서 WebDriver POST /element 타임아웃 | 환경(드라이버) | 세션 경계 실패, 단정 이전 |
| 29-cron-gateway | 〃 | 환경(드라이버) | 〃 |
| 75-app-position | `element click intercepted` 6건 | 환경/UI | 요소는 있는데 가려짐 |
| 99-store-certification | 설정 버튼 클릭 불가 | 환경/UI | 〃 |
| 17-skill-notify | 허용 도구 설정 단정 false | 재실행 필요 | 뇌 없는 상태의 영향 배제 못 함 |
| 54b-settings-locale-prompt | locale 'en' 기대, 'ko' | 재실행 필요 | 워크스페이스 config 하이드레이션 의심 |
| 56-settings-voice | TTS 토글 없음(일부 단정은 통과) | 스펙 드리프트 의심 | 같은 탭의 다른 단정은 통과 |
| 73-tts-edge-preview | 한국어 음성 목록 0 | 스펙 드리프트 의심 | 미리듣기 자체는 통과 |
| 77-stt-provider-switching | 공급자 목록 비어 있음(일부 통과) | 스펙 드리프트 의심 | 〃 |
| 79-pipeline-voice-activation | TTS 켜기 단정 false | 재실행 필요 | 〃 |
| 81-chat-tts-response | ttsProvider 'edge' 기대, 'nextain' | 재실행 필요 | 시딩이 심은 공급자와의 상호작용 의심 |
| 98-codex-chat-delegation | `delegate_agent` 가 종료 상태에 못 감 | 제품 후보 | 그 묶음은 에이전트가 정상 기동(리스 막힘 0) |

`Load failed` 9회는 실패가 아니다 — 공지 가져오기가 건너뛴 INFO 로그다.

## 고친 것

**H1 — 고아 agent 자식 회수를 세션 경계에 세웠다.** 회수는 리스가 가리키고
명령줄 표식까지 맞는 프로세스 하나만 끝내고, **정말 사라질 때까지 기다린다.**
기다리는 것이 핵심이다 — 신호를 보냈다는 것과 자리가 비었다는 것은 다르고,
네이티브는 후자만 본다. 살아 있는지 판정하는 기준도 네이티브와 맞췄다
(`/proc/<pid>/cmdline` 의 표식). 신호 0 으로만 보면 좀비를 살아 있다고 읽어
헛되이 기다린다.

실측(같은 기계, 스펙 셋을 한 번에):

| | 고치기 전(38 스펙) | 고친 뒤(3 스펙) |
|---|---|---|
| `agent_lease_live_blocked` | 37 | **0** |
| `agent-core started` | 3 | **3** (스펙당 1) |
| `skill_youtube_bgm_registration_failed` | 120 | **0** |
| `restart debounced` | 1470 | **0** |

남은 실패는 그제야 제 모습이 됐다 — 05 는 #561 의 도구 후속 답 문제, 07 은 메모
삭제 도구 부재, 11 은 대화 통과 후 cost-badge 클릭 불가.

**H2 — 상속 설정이 잃어버린 키 전달을 되돌렸다.** `wdio.conf.chat.ts` 는 기본
설정을 펼쳐 쓰면서 `before()` 만 자기 것으로 바꾼다. 그러면 모듈 최상위의 시딩은
상속되는데 훅 안의 키 전달은 사라진다. 심은 공급자는 쓰면서 키만 빠져, 그 기계
키체인에 남아 있던 옛 키로 게이트웨이를 두드리다 401 을 받았다. 키 전달을
`deliverCredentialedGatewayKey()` 로 빼서 그 설정이 직접 부르게 했다.
재실행에서 401 은 0회가 됐고, 그 스펙은 다음 줄까지 갔다.

계약 셋이 이 배선을 고정한다.

- `src/test/e2e-agent-lease-reclaim.contract.test.ts` — 진짜 프로세스를 띄워
  회수를 잰다. 표식이 다르면 손대지 않는 것까지 함께 잰다.
- `src/test/e2e-inherited-conf-contracts.contract.test.ts` — 기본 설정을 상속하며
  훅을 갈아 끼운 설정이 키 전달·고아 회수를 잃지 않는지 **노드로** 잰다.
- `src/test/credentialed-adk-seed.contract.test.ts` — 시딩 자체(#547).

## 남은 것

**H3 — 온보딩 스펙 셋.** 스펙은 `localStorage` 의 `naia-config` 만 지우고 새로
고친다. 그런데 화면은 워크스페이스의 `naia-settings/config.json` 에서 설정을 다시
채우고(하이드레이션), 그 파일에는 `onboardingComplete: true` 가 있다. 그래서
오버레이가 영영 뜨지 않는다. 시딩이 그 값을 심기는 하지만 원인은 그보다 앞이다 —
`ensureAppReady` 가 매 스펙 앞에서 같은 값을 파일에 밀어 넣기 때문에, 시딩이
없어도 같은 자리에서 막힌다. 스펙이 워크스페이스 설정까지 비워야 한다.

**제품·스펙 후보 넷.** `07-cleanup` 이 요구하는 메모 삭제는 에이전트의 메모
저장소에 아예 없다(`save`/`list`/`get` 뿐). `90-glm-newcore-chat` 은 wdio 의
`expect` 가 받지 않는 두 인자 형태를 써서 그 줄에서 즉시 죽는다.
`98-codex-chat-delegation` 은 뇌가 정상인 묶음에서 실패했으므로 따로 봐야 한다.
`75-app-position`·`99-store-certification` 의 클릭 가로채기는 화면 쪽이다.

**재실행이 있어야 갈리는 일곱.** 표의 "재실행 필요"·"스펙 드리프트 의심" 은
뇌 없는 상태에서 잰 것이라 지금 단정할 수 없다. 회수 배선을 세운 뒤 등급을 한
번 더 돌리면 그 일곱이 갈린다.
