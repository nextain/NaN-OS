# 설정·연결 적대 검토 — 2026-07-21

## 판정

**NOT READY.** 이전 검증은 Discord가 이미 연결됐다는 mock 상태와 설정의
정적 계약만 확인했다. 사용자가 실제 Windows Shell에서 수행하는
`보안 입력 → 토큰 보관 → 봇 발견 → 권한 선택 → Gateway 가동` 경로와,
`기본 두뇌 → 보조 두뇌/기억 두뇌` 역할 설정 경로는 완성 또는 검증됐다고
말할 수 없다.

## 관찰한 사실

### A. LLM 역할 설정

1. 역할 데이터 모델은 존재한다. `packages/shell/src/lib/config.ts`에는
   `llmRoles.{main,sub,memory}`와 provider/model/baseUrl/credentialRef/inherit가
   있고, `packages/shell/src/lib/llm/roles.ts`는 상속·순환·지원되지 않는
   provider를 판정한다.
2. 그러나 실제 `SettingsTab`의 두뇌 화면은 이 역할 모델을 소비하지
   않는다. `packages/shell/src/components/SettingsTab.tsx`의 보조두뇌는
   legacy `memoryLlmProvider` 라디오(`none/naia/vllm/ollama`)와 일부 raw
   input만 렌더링한다. main과 동등한 provider/model catalog, 모델 선택,
   credential 상태, inherit/override, 유효성/저장 결과가 없다.
3. 기억 탭은 embedding 선택만 제공한다. `memoryLlm`은 기억 탭이 아니라
   두뇌 탭의 축약된 legacy UI에 남아 있다. 따라서 "naia-memory 전용 LLM"을
   역할로 명시하고 main/sub와 구분해 설정·복원하는 사용자 흐름이 없다.
4. `buildNaiaConfigEnv()`는 legacy `memoryLlm*`만 `NAIA_LLM_*`로 내보낸다.
   구조화한 `llmRoles`가 Agent runtime의 main/sub/memory 역할로 실제
   전달되는지 Shell에서 보장하지 않는다. 역할 설정 모델과 runtime 배선이
   분리된 상태다.

### B. Discord 연결

1. 기존 정책 문서 `docs/progress/99.dev-comm/discord-wizard-prefreeze-policy-2026-07-19.md`는
   production wizard를 **native secret backend와 preflight facts가 연결될 때까지
   숨겨야 한다**고 명시한다. 반면 `ConnectionsSettingsTab`은 현재 노출되고,
   Connect 버튼이 `discord_capture_bot_token`을 호출한다. 정책과 노출 상태가
   모순된다.
2. UI는 bot token 텍스트 입력을 의도적으로 제공하지 않는다. 보안상 raw
   token이 WebView/일반 IPC/localStorage에 있어서는 안 되기 때문에 이는 맞다.
   대신 Windows Rust 구현은 PowerShell/WPF `PasswordBox`를 별도 프로세스로
   열도록 시도한다(`src-tauri/src/lib.rs`, `capture_discord_token_native`).
3. 이 native 입력 창이 실제 Windows Tauri dev/installed app에서 열리고,
   취소·invalid·저장·재시작 후 상태가 화면에 보이는지를 검증한 테스트는
   없다. 현재 Playwright는 토큰이 이미 저장된 mock만 주입한다.
4. 더 나쁜 점은 `jeonju-course-codex-readiness.spec.ts`가 연결 화면에
   `input[type=password]`가 0개임을 성공 조건으로 삼는다. 이는 "비밀을
   WebView에 노출하지 않음"만 검증하며, 사용자에게 보이는 전용 보안 입력
   흐름의 존재를 검증하지 않는다.
5. `discord-channel-agent.spec.ts`도 연결된 봇/발견된 채널을 mock으로
   주입한다. Connect 클릭, native capture 결과, 토큰 없는 상태의 안내,
   install URL, preflight 실패 분류, Windows native dialog는 다루지 않는다.

## 실제 사용자 시나리오와 누락된 인수 조건

| UC | 필요한 사용자 결과 | 현재 갭 |
|---|---|---|
| UC-LLM-ROLE-01 | 기본 두뇌와 같은 provider/model/credential UX로 보조두뇌를 `기본 두뇌 상속` 또는 독립 override한다. | 역할 resolver만 있고 UI가 legacy memory 라디오다. |
| UC-LLM-ROLE-02 | 기억(naia-memory)은 embedding과 별도로 전용 LLM을 상속/선택하고, Agent가 해당 역할을 받았다는 상태를 본다. | memory LLM이 기억 탭에 없고 role→Agent runtime 계약이 미검증이다. |
| UC-DISCORD-SETUP-01 | 연결 화면에서 bot 만들기·초대 링크·필요 intent를 보고 `보안 입력`을 누르면 OS 소유의 비밀 입력 창이 확실히 표시된다. | 화면 안내/입력 창 실동작 e2e 부재; 현재 사용자가 "아무것도 안 나옴"을 재현했다. |
| UC-DISCORD-SETUP-02 | 저장 뒤 토큰 원문 없이 봇/서버/채널 권한과 preflight 오류를 확인하고 허용 채널만 저장한다. | 발견/채널 UI는 있으나 live preflight fact와 full flow가 mock뿐이다. |
| UC-DISCORD-SETUP-03 | 토큰은 OS secure store 외로 새지 않고 취소/오류는 행동 가능한 화면 상태가 된다. | source/contract 일부만 있으며 native dialog–secret store–restart 원자성의 실제 확인 부재. |

## 다시 열 이슈

### P0 — `fix(shell): make Discord secure setup observable and executable on Windows`

**범위:** Connections UI, native secure capture, native preflight/status bridge.

**인수 조건:**

1. 토큰 raw value는 WebView, config JSON, agent chat wire, logs에 한 번도
   나타나지 않는다.
2. `보안 입력으로 연결` 클릭은 Windows에서 소유자 창을 가진 password dialog를
   표시하고, 열기/취소/invalid/store/activation 실패를 stable UI state와
   recovery action으로 보인다. 창이 열리지 않으면 silent failure가 아니라
   명시 오류와 진단 ID를 보인다.
3. 연결 전에는 Developer Portal·install URL·Message Content Intent·최소 권한을
   안내하고, 저장 뒤에는 native preflight 결과(토큰, intent, guild, channel,
   send/history 권한, Agent readiness)를 stable code로 표면화한다.
4. native secret capture가 준비되기 전 빌드에서는 wizard를 숨기거나 명시적으로
   "준비 안 됨"으로 fail-closed 한다. policy 문서와 실제 노출을 일치시킨다.
5. 단위/계약: secret boundary, capture result state machine, preflight code
   mapping. Playwright: token-absent start, Connect progress/return status,
   recovery UI. Windows Tauri E2E: native dialog invocation/secret-store
   roundtrip/restart/discovery; 실제 Discord sandbox E2E는 별도 credential
   harness에서 gateway receive까지 증명한다.

### P0 — `feat(shell): replace legacy sub-brain form with role-based LLM settings`

**범위:** Settings 두뇌·기억 UX, `llmRoles` persistence/legacy migration,
Shell→Agent role contract.

**인수 조건:**

1. main, sub, memory 각각이 같은 provider/model selector와 credential
   reference 상태를 갖고, sub/memory는 `기본 두뇌 상속`을 기본값으로 제공한다.
   상속 중에는 중복 설정이 보이지 않으며 override하면 main과 동등한 편집 UI가
   나타난다.
2. memory 역할은 embedding과 명확히 분리하되 기억 탭에서 함께 발견 가능하다.
   사용자는 naia-memory 전용 LLM을 main/sub와 독립 선택하거나 상속할 수 있다.
3. `llmRoles`가 SoT가 되고 `memoryLlm*`/`subLlm*`는 호환 기간에만 deterministic
   dual-read/write 한다. 순환·미완성·지원 불가 provider는 저장/적용 전에
   차단한다.
4. Agent가 main/sub/memory의 effective provider/model/base URL과 opaque
   credentialRef를 받는다는 paired proto/runtime contract가 있어야 한다.
   raw credential는 어느 경계에도 직렬화하지 않는다.
5. unit: resolver/migration/persistence/env-or-wire mapping. Playwright:
   main→sub inherit, override, reload roundtrip, memory-exclusive LLM,
   invalid/cycle state. Tauri paired E2E: Agent effective role status를
   확인하되 secret 원문은 검사 대상에 나오지 않는다.

### P1 — `test(shell): replace preconfigured Discord mocks with user-journey acceptance`

**범위:** 위 P0 구현 후 test fixture와 acceptance evidence를 재구성.

**인수 조건:** 현재 `discord-channel-agent.spec.ts`의 connected mock은
채널 UI 회귀 테스트로만 남기고, setup 전 상태부터 시작하는 별도 E2E와 Windows
native acceptance를 추가한다. mock 통과를 live setup 완료로 보고하는 문구를
제거한다.

## 권장 구현 순서

1. P0 Discord의 native capture/preflight capability를 먼저 진단하고 실제
   Windows에서 재현 가능한 Tauri test harness를 만든다. 이 전에는 Connect UI를
   완료로 표기하지 않는다.
2. P0 LLM role contract를 Shell–Agent 사이에서 동결한 뒤, Settings UI를
   role-based form으로 교체하고 legacy migration을 추가한다.
3. 두 P0의 UC·FR·test coverage map을 `docs/user-scenarios.md`와
   `docs/requirements.md`에 등록한다.
4. Playwright + Windows Tauri E2E + paired Agent contract를 모두 통과시킨 뒤에만
   P1의 mock/evidence 정리를 수행한다.

## 검증 한계

이번 검토는 source, existing tests, policy/requirements를 대조한 것이다.
현재 실행 중인 native Shell을 조작하거나 실제 Discord credential을 입력하지
않았으므로, native dialog가 왜 보이지 않았는지(프로세스 시작 실패, 포커스,
WPF runtime, Tauri ownership 등)는 아직 사실로 확정하지 않았다. 다만 그 경로를
검증하지 않은 채 테스트 통과를 완료 근거로 삼은 것은 확인했다.

---

## 추가 적대 검토: 개인 라디오 DJ·연속 발화 (UC17)

### 판정

**연속 발화 transport와 설정은 부분 구현, 라디오 DJ 제품 경로는 NOT READY.**
현재 Shell에는 `ConfigureSpeechProfile`, activity subscription, yield/stop/control,
텍스트와 TTS 취소 순서가 있다. 그러나 라디오 요구의 핵심인 실제 BGM 관측,
관측 기반 발화 허가(`speakPermit`), TTS 직전의 원자적 재검증, `skill_radio_dj`는
Shell에 구현되어 있지 않다.

### 확인한 사실

1. `ChatArea.tsx`는 mount 후 저장된 profile을 Agent에 configure하고,
   `agent_response`의 activity text/panel tool/finish/error를 수신한다. epoch,
   profile generation, retired activity ID로 오래된 event를 버리고, ordinary chat은
   `interruptTts → YieldSpeechActivity → chat` 순서로 처리하려 한다.
2. Shell gRPC client는 `configure_speech_profile`, `subscribe_speech_activities`,
   `yield_speech_activity`, `stop_speech_activity`, `control_speech_activity`만
   표현한다(`packages/shell/src-tauri/src/agent_grpc.rs`). 이것은 activity transport
   계약이지 재생 관측/허가 계약은 아니다.
3. 일반 설정에는 disabled/personal_radio_dj/exhibition_intro, 시간대, idle,
   간격, BGM opt-in, 날씨 동의/위치, knowledge scope가 있으며 file-backed UI
   config로 저장한다. `ProactiveSpeechSettingsSection`과
   `proactive-speech-settings.ts`가 그 정규화 책임을 가진다.
4. 실제 등록된 BGM 도구는 `skill_youtube_bgm` 하나다
   (`packages/shell/src/lib/bgm-skill.ts`). `play`은 sidecar 검색 또는 video ID로
   `bgm_youtube_play` event를 발행한 뒤 곧바로 `{ok:true}`를 반환한다. 이는
   iframe의 ready/playing/duration/currentTime/error를 관측한 결과가 아니다.
5. Shell source에는 `skill_radio_dj`, `speakPermit`, `playbackId`,
   `observationSequence`, `freshUntil` 구현이 없다. 따라서
   `FR-RADIO-DJ.1~7`과 `S-RADIO-DJ-1~6`은 요구 문서의 **계획**일 뿐 현재 구현이
   아니다. BGM skill이 존재하거나 native test가 BGM 시작을 관찰한 사실로
   DJ 제품 계약을 충족했다고 볼 수 없다.

### 현재 테스트가 가리는 것

1. `packages/shell/e2e/121-proactive-speech-product-acceptance.spec.ts`는
   `agent_response`, `configure_speech_profile` ACK, browser `speechSynthesis`,
   `Audio.play`, synthesized-audio HTTP 모두를 page mock으로 교체한다. 그러므로
   7/7은 renderer의 event-order 회귀 신호이지 Agent activity stream, 실제 TTS,
   local façade/Ditto, browser autoplay/오디오 장치의 인수 증거가 아니다.
2. `packages/shell/e2e-tauri/specs/71-proactive-speech-profiles.spec.ts`는 실제
   Tauri IPC에서 profile persistence, DJ 첫 text와 `bgmPlaying`, 전시 greeting,
   stop을 본다. 그러나 setup이 `ttsEnabled:false`로 강제된다. 따라서 audible
   proactive TTS, Ditto lipsync, 두 번째 DJ 멘트, chat barge-in 뒤 Agent resume,
   stale audio drop, 제어 전체는 native로 검증하지 않는다. 이는 requirements와
   UC17 문서에도 스스로 명시돼 있다.
3. native DJ assertion은 `bgmPlaying` local config와 video ID를 본다. 실제
   iframe `playing` 이벤트·재생 시간·A→B 뒤 늦은 A 오류·embed restriction·timeout
   을 확인하지 않는다.
4. 현재 continuous speech 테스트는 activity ID/epoch 및 TTS 취소를 mock event로
   확인하지만, Agent가 어느 profile에서 어떤 근거로 activity를 만들었는지,
   Shell이 BGM 상태 변경 뒤 TTS를 막는지, stop 뒤 background stream이 실제
   종료됐는지는 증명하지 않는다.

### 다시 열 이슈

### P0 — `feat(shell): implement observed-playback permit boundary for personal radio DJ`

**범위:** `skill_radio_dj` Shell panel contract, BgmPlayer observation adapter,
Agent↔Shell permit/provenance wire.

**인수 조건:**

1. playback snapshot은 `playbackId`, `commandId`, monotonic sequence,
   `updatedAt`, `freshUntil`, requested/loading/playing/paused/ended/error/timeout,
   title/duration/currentTime을 구분한다. 명령 접수(`ok:true`)만으로는 playing이나
   DJ 멘트를 선언하지 않는다.
2. Agent는 Shell snapshot을 근거로 발화를 요청하고, Shell은 single-use
   `speakPermit`을 발급한다. TTS 직전에 user chat/STT, active TTS,
   playback ID/sequence/freshness를 재검증하여 하나라도 변하면 audio 0회로
   폐기하고 Agent가 재평가하도록 한다.
3. `skill_radio_dj`는 `skill_youtube_bgm`을 저수준 도구로 조합하되, panel skill
   registration/clear, `panel_tool_call`, `panel_tool_result`, activity ID와
   restart에서 동일한 계약을 보장한다.
4. Agent profile/LLM이 임의 문구를 반복하지 않도록 cooldown, silence,
   user/microphone priority, fallback 한 번의 소유권을 Agent가 갖고 Shell은
   observation/expression만 맡는다.
5. unit/contract: snapshot ordering, A→B→late-A error, timeout/freshness,
   permit consume/invalidations. Playwright local iframe fixture: ready/playing/error/
   ended와 tool result/permit no-TTS. paired native contract: required observation and
   permit fields. Windows Tauri: actual BGM state and local voice/avatar TTS path.

### P0 — `test(shell): prove continuous speech on native audio/avatar rather than mocks`

**범위:** UC17 product acceptance and 4060 local cascade acceptance.

**인수 조건:**

1. real Tauri with `ttsEnabled:true` verifies an activity produces playable
   local façade audio and avatar lipsync, with request/activity/sequence
   correlation in logs; no browser `speechSynthesis`, `Audio`, Agent event or
   TTS HTTP mock is permitted in this acceptance.
2. ordinary typed chat and STT barge-in interrupt active proactive audio before
   Yield RPC, normal chat finishes, then only the valid resume token can resume.
   quiet/stop are terminal; stale event and stale audio after generation/epoch
   change produce neither transcript nor playback.
3. profile disabled/restart leaves zero active activity subscriber and no further
   TTS/BGM calls. Test setup/teardown snapshots and restores both config and
   profile-owned processes.
4. 4060 half-duplex acceptance explicitly records that user input cancels voice
   before next turn; it must not claim full duplex.

### P1 — `docs(shell): correct UC17 and radio status labels`

`FR-CONT-SHELL.9 Done`은 mock renderer coverage와 설정 persistence의 범위로
축소하고, radio requirements를 Implemented로 읽히게 만드는 문구를 제거한다.
`FR-RADIO-DJ.*`와 native audible/live barge-in은 위 P0 인수 증거가 있을 때까지
Pending/Partial로 유지한다.

### 권장 순서

1. 기존 UC17 transport의 native teardown/subscription leak test를 먼저 보강한다.
2. BgmPlayer에 관측 snapshot을 추가하고 deterministic iframe fixture로 상태
   계약을 고정한다.
3. paired Agent와 observation/permit contract를 동결한 뒤 `skill_radio_dj`를
   등록·배선한다.
4. 마지막에 실제 Windows Tauri에서 local VoxCPM2→Ditto를 포함한 half-duplex
   barge-in acceptance를 실행한다.
