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

---

# 재실행 (2026-09-06 00:21, 회수 배선을 세운 뒤)

기록: `docs/regression-runs/naia-os-3090-2026-09-06T00-21-34-265Z.json`
(40 실행 · 7 통과 · 안정 실패 32 · flaky 1 · 58분 10초)

## 전제는 성립한다

옛 러너가 만든 기록이라 전제 칸이 없어, 로그를 `scripts/lib/run-premise.mjs` 의
`countPremiseSignals`/`judgePremise` 로 다시 판정해 기록에 채워 넣었다
(`premiseSource: "post-hoc from log"` 로 러너가 쓴 것과 구분한다).

| 지표 | 값 |
|---|---|
| `agentStarts` | 40 |
| `leaseBlocked` | 0 |
| `executed` | 40 |
| 판정 | **ok** |

스펙 마흔 개가 저마다 뇌를 갖고 돌았다. 등록 실패·creds 거부·`fetch failed` 모두
0회다. 그러니 이 실행의 실패는 **읽을 값이 있다.**

## 둘째 표 — 32개 안정 실패

| 스펙 | 첫 실패 | 가족 | 판정 |
|---|---|---|---|
| 05-skill-system | 도구 후속 답 없음 | C | #561 |
| 07-cleanup | "메모 삭제 도구가 없다" | 제품/스펙 | #565 |
| 09-onboarding | `.onboarding-overlay` 미표시 | 하이드레이션 | #564 |
| 11-cost-dashboard | cost-badge 누를 수 없음 | D | 새 이슈 |
| 13-lab-login | `.onboarding-overlay` 미표시 | 하이드레이션 | #564 |
| 15-skill-manager-ai | chat-tab 누를 수 없음 | D | 새 이슈 |
| 17-skill-notify | 허용 도구 단정 false | A | 스펙 정리 후보 |
| 19-skills-bulk | 스킬 카드 7개 기대, 0개 | G | 새 이슈(설정·목록 빔) |
| 21-cron-recurring | 도구 후속 답 없음 → `reasoning without a final answer` | B·C | #561 |
| 29-cron-gateway | "skill_cron 이라는 도구는 없습니다" | A | 스펙 정리 후보 |
| 37-execute-command | 도구 후속 답 없음 | C | #561 |
| 39-web-tools | "web_search 라는 이름의 도구는 없습니다" | A | 스펙 정리 후보 |
| 41-agents-crud | 도구 후속 답 없음 → "skill_agents 없음" | C·A | #561 · 스펙 정리 |
| 43-device-management | "skill_device 는 도구 목록에 없습니다" | A | 스펙 정리 후보 |
| 45-cron-gateway-full | 도구 후속 답 없음 | C | #561 |
| 47-tts-full | "skill_tts 는 포함되어 있지 않습니다" | A | 스펙 정리 후보 |
| 49-approvals-full | "skill_approvals 는 목록에 없습니다" | A | 스펙 정리 후보 |
| 51-skills-advanced | 도구 후속 답 없음 | C | #561 |
| 54b-settings-locale-prompt | locale 'en' 기대 'ko' · `toBeDefined` 24회 | G | 새 이슈 |
| 56-settings-voice | TTS 토글 없음 | G | 새 이슈 |
| 67-onboarding-config-save | `.onboarding-overlay` 미표시 | 하이드레이션 | #564 |
| 71-proactive-speech-profiles | `[data-testid="proactive-speech-profile"]` 없음 | G | 새 이슈 |
| 73-tts-edge-preview | 한국어 음성 0개 | G | 새 이슈 |
| 75-app-position | `.side-app` 미표시 → 클릭 가로채기 3 | D | 새 이슈 |
| 77-stt-provider-switching | 공급자 목록 `[]` | G | 새 이슈 |
| 79-pipeline-voice-activation | TTS 켜기 false | G | 새 이슈 |
| 81-chat-tts-response | ttsProvider `edge` 기대, `nextain` | G | 새 이슈 (시딩이 화면 기본값을 바꿈) |
| 90-app-system | `/tmp/app-system-screenshots` 없음 | 스펙 자체 | 스펙 정리 후보 |
| 99-launch-f4-skill-usage | 넷째 chat-tab 미표시 | D | 새 이슈 |
| 99-store-certification | 설정 버튼 누를 수 없음 | D | 새 이슈 |
| 90-glm-newcore-chat | 두 인자 `expect` | 스펙 | #566 |
| 98-codex-chat-delegation | `delegate_agent` 종료 상태 미도달 | 미상 | 별도 추적 |

## A — 스펙이 부르는 도구가 에이전트에 없다 (스펙 드리프트)

에이전트가 스스로 자기 도구를 열거했다.

```
get_time, get_weather / memo_list, memo_get, memo_save / list_dir, read_file
skill_knowledge_search, skill_knowledge_ask, skill_knowledge_graph
skill_youtube_bgm / skill_browser_* / skill_tab_screenshot / skill_workspace_*
skill_environment / delegate_agent, continue_speaking
```

에이전트 소스의 등록부와 정확히 같다(`naia-agent` 의 `builtin-skills.ts` 외).
반면 스펙들이 부르는 `skill_cron`·`skill_tts`·`skill_approvals`·`skill_device`·
`skill_agents`·`skill_notify_*`·`skill_skill_manager`·`skill_system_status`·
`web_search` 는 **하나도 등록되어 있지 않다.**

드리프트인지 회귀인지는 요구사항이 가른다. 그래서 대조했다.

- `docs/requirements.md`·`docs/user-scenarios.md` 에 저 도구 **이름**은 한 번도
  나오지 않는다(`web_search` 만 한 번, 그것도 아래 뜻으로).
- `S43 cron 작업 생성/실행` 의 상태 칸은 `✓루크확인: 미배선(만들기로 함)·gateway 의존`.
- `S55` 는 `web_search·x·discord` 를 **gateway 스킬(gateway-tier)** 로 적는다.
  그 게이트웨이는 제품이 없앴다 — `FR-SHELL-ISO.1` 이 "게이트웨이 :18789 는
  spawn_gateway 가 제거된 스텁(레거시)" 이라고 적고, 앱 로그도 매번
  `Gateway removed: naia-agent handles all tools directly` 를 남긴다.
- `skill_sessions` 는 셸이 스스로 "new-core 는 standalone tool 미지원" 이라고
  적고 그 자리에서 막는다(`chat-service.ts`).

즉 이 도구들은 **게이트웨이 시대의 이름**이고, 게이트웨이를 걷어 낼 때 그 스펙들이
같이 정리되지 않았다. 요구사항이 그 이름을 요구하지 않으므로 제품 결함이 아니다.
`docs/user-scenarios.md` 가 이미 그 처리 규칙을 적어 두었다 — 미배선·비지원은
"기능 격리/면제 목록" 으로 라벨하되(`unwired · disabled-by-design`), **옛 baseline
에서 작동하던 것의 상실은 격리 불가**다. 게이트웨이 제거는 의도된 구조 변경이므로
격리 쪽이다. 지금처럼 두면 열두 스펙이 영원히 붉고, 그 붉음이 진짜 회귀를 덮는다.

## B·C — 같은 뿌리, 두 얼굴

`provider returned reasoning without a final answer` 는 에이전트가 스스로 낸
말이다. 도구 라운드가 끝나고 최종 텍스트가 비면 한 번 되묻고(`Return the final
answer now …`), 그래도 비면 이 문장으로 정직하게 끝낸다. deepseek-v4-flash 전용
"끊긴 답 이어 쓰기" 복구까지 이미 들어 있다 — 제품이 이 모델의 성질을 알고 있다.

`Follow-up message after tool execution did not appear` 14회는 그 반대편이다.
41-agents-crud 이 그것을 그대로 보여 준다 — 첫 단정이 `beforeMsgs=0, beforeTools=0`
으로 120초를 기다리다 끝나는데, **다음 단정은 `beforeMsgs=1, beforeTools=1` 로
시작한다.** 그 사이에 완성된 답이 한 개 생겼다는 뜻이다. 답이 없는 것이 아니라
**늦다.** 둘 다 #561 의 가족이고, 이번 실행이 그 이슈에 두 가지를 보탠다 —
답이 늦게라도 온다는 것, 그리고 에이전트에 이미 복구가 둘 있다는 것.

## D — 요소는 있는데 누를 수 없다 (원인 미상)

`not interactable` 24 · `click intercepted` 33 · `still not displayed` 75.
누를 수 없다고 이름까지 찍힌 요소는 셋이다 — cost-badge(6), chat-tab(4),
app-bar-settings(2). 75 는 `.side-app` 이 아예 안 뜨고 그 뒤 클릭 셋이 가로채인다.

창 크기를 의심했다. 마흔 세션이 전부 `Window centered: 1x1` 을 남긴다 — 네이티브가
기동 직후 `outer_size()` 로 잰 값이 1×1 이고 그만큼으로 다시 맞춘다.
**재 봤고, 아니었다.** 스펙 앞에서 창을 1366×900 으로 키워 두 스펙을 다시 돌렸더니
(`window was 1x1 — resizing to 1366x900`, `window now 1366x900`) `.side-app` 은
여전히 안 떴고 11 도 낫지 않았다. 그래서 그 변경은 되돌렸다 — 검증되지 않은 배선을
남기면 다음 사람이 그것을 이미 해결된 것으로 읽는다.

`unsupported operation when running "actions"` 15회는 WebKitWebDriver 의 Actions
API 미지원이다. 실 클릭 경로가 그것을 타면 그 자리에서 죽는다.

## E — 실패가 아닌 것

`Load failed` 18회는 전부 `[announcements] Fetch skipped {"error":"TypeError: Load
failed"}` — 공지 가져오기를 건너뛴 INFO 로그다. 실패로 세면 안 된다.
`toBeDefined` 24회는 전부 `54b-settings-locale-prompt` 한 스펙 안이다.

## G — 설정·목록 화면이 비어 있다

19(스킬 카드 0) · 54b · 56(TTS 토글 없음) · 71(프로액티브 컨트롤 없음) ·
73(음성 0) · 77(STT 목록 `[]`) · 79 · 81. 같은 탭의 다른 단정은 통과하므로 탭 자체는
그려진다. 섹션과 목록만 비어 있다.

가장 곧은 단서는 81 이다 — `ttsProvider` 가 `edge` 일 것으로 기대했는데 `nextain`
이었다. 그것은 **시딩이 심은 값**이다. 시딩은 에이전트가 읽는 `llmRoles.main` 만
바꾸려던 것인데, 화면이 온보딩을 마친 것으로 보게 하려고 최상위 `provider` 와
`onboardingComplete` 도 같이 적었다. 그러면 `ensureAppReady` 가 건너뛰어지고,
예전에 그것이 세워 주던 화면 기본값(gemini·edge)이 서지 않는다. 공급자에 따라
갈리는 설정 섹션들이 비는 것도 같은 자리에서 설명된다.

고칠 방향은 분명하다 — **에이전트 정본만 심고 화면 기본값은 건드리지 않는다.**
`llmRoles.main` 이 최상위 `provider` 보다 우선하므로, 최상위 거울과
`onboardingComplete` 를 빼도 에이전트는 여전히 게이트웨이를 부른다. 다만 이번에
쓸 수 있는 e2e 재실행 두 번을 창 크기 가설에 썼으므로 **검증 없이 바꾸지 않았다.**
다음 사람이 이 한 줄을 빼고 등급을 한 번 돌리면 여덟 스펙이 한꺼번에 갈린다.
