# 4060 멀티모달 경로 적대 재검토 — 2026-07-21

## 판정

기존의 `4060 프로파일 완료` 판정은 철회한다. 단위·모의 UI 테스트는 일부
계약을 확인했지만, 사용자가 실제로 겪은 다음 하나의 경로를 증명하지 않았다.

`프로파일 선택 → 로더/모델 준비 표시 → 두 턴 대화 → VoxCPM2 음성 재생 →
동일 WAV의 Ditto 립싱크`

목표 토폴로지는 명시적으로 다음과 같다.

| 자원 | 담당 | 제약 |
|---|---|---|
| Ryzen 8645H CPU/NPU | `dna3:latest` 메인 LLM | `ollamaNumGpu=0`; 4060 VRAM을 쓰지 않음 |
| RTX 4060 8GB VRAM | VoxCPM2 int8 TTS + Ditto | half-duplex; 동시 실시간 처리 주장을 하지 않음 |

## 확인한 증거

1. `vram-tiers.ts`의 `laptop-4060-8g`는 위 토폴로지를 표현한다. `llm`의 GPU
   비용은 0이고 loader profile은 `laptop_4060_8g`이며 capability는 LLM/TTS/avatar다.
2. `reconcileExplicitLocalProfile()`은 이 프로파일에 `ollama/dna3:latest`,
   `ollamaNumGpu=0`, `naia-local-voice`, `http://localhost:8910`, Ditto를 설정한다.
3. 이 PC에서 façade `:8910` health, VoxCPM2 `:8901`, Ditto `:8902` ready를
   확인했고, `POST /v1/audio/speech`(model=`voxcpm2`)는 WAV를 반환했다. 그 WAV를
   `/stream`에 전달하면 Ditto MP4도 반환했다. 즉 4060의 서비스 자체가 실패한 것은 아니다.
4. 반면 사용자가 Gemini 답변을 받은 최신 세션 로그에는 Shell의
   `POST /v1/audio/speech` 및 Ditto `/stream` 요청이 없다. 음성과 립싱크가 없는
   직접 원인은 서비스 준비 실패가 아니라 Shell 표현 경로가 시작되지 않은 것이다.

## 적대 발견 사항

### A. 요구사항과 설정 모델이 서로 충돌한다 (차단)

- `vram-tiers.ts`에는 4060 전용 CPU/NPU LLM + GPU TTS/avatar 계약이 있다.
- 그러나 일반 8GB `Local8gFocus`와 Settings UI 주석은 “음성은 클라우드”라고
  여전히 선언한다. `docs/requirements.md`와 `docs/user-scenarios.md`도
  “8G 로컬 음성 없음”을 남긴다.
- 따라서 같은 8GB라는 UI 언어로 서로 반대인 배선이 노출된다. 사용자가 `llm` focus를
  선택한 상태에서 4060 전용 프로파일을 기대해도, 무엇이 최종 서비스 계획인지 알 수 없다.

해결 방향: `laptop-4060-8g`을 일반 8GB focus와 별개인 named topology로 만들고,
UI·manifest·문서·로더가 같은 `cpu_npu_llm + gpu_tts_avatar + half_duplex` 값을
소비하게 한다. `local8gFocus`는 이 프로파일에서 숨기거나 무시 사실을 명시해야 한다.

### B. 프로파일 준비 상태와 실제 표현 준비 상태가 분리돼 있다 (차단)

- agent용 `config.json`과 Shell 전용 `ui-config.json`으로 TTS/avatar 값이 분리된다.
  `ttsEnabled`, TTS host/provider, avatar provider는 UI 파일에만 있다.
- `ChatArea`는 전송 순간 localStorage의 `config.ttsEnabled === true`일 때만
  SentenceChunker/TTS를 초기화한다. 값이 부트/프로파일 전환에서 아직 합쳐지지 않으면
  답변은 오지만 TTS 요청 자체가 발생하지 않는다.
- 현재 관측(답변은 있으나 TTS와 `/stream` 로그 없음)이 정확히 이 실패 형태다.

해결 방향: 프로파일 적용은 한 개의 원자적 `AppliedMultimodalProfile` 상태로 완료되어야
한다. 채팅 입력은 그 상태가 `ready`가 되기 전 비활성 또는 “준비 중”으로 남겨야 하며,
응답 후 `tts-requested → audio-playback-started → ditto-stream-requested → video-frame`
상태를 UI와 진단 로그에서 같은 request id로 보인다.

### C. 음색 선택이 façade 음색 선택으로 증명되지 않았다 (차단)

- local provider는 `ttsVoice`가 아니라 `voiceRefUrl`의 WAV basename만 façade `voice`
  값으로 전달한다. `voiceRefUrl`가 없으면 `naia-default`다.
- 실제 UI 설정에는 Chirp 음성 식별자가 `ttsVoice`에 남고 `voiceRefUrl`는 비어 있었다.
  그러므로 Shell에 보이는 남녀 프리셋 선택이 VoxCPM2의 `/ref/voices` palette로 전달됐다는
  증거가 없다. 기본 음색 또는 뜻밖의 음색이 나오는 이유와도 일치한다.

해결 방향: 로컬 프리셋은 façade가 제공한 palette id와 한 모델로 관리한다. 저장 시
선택한 preset id, 요청의 `voice`, façade가 수락한 voice id를 모두 표시하고, 업로드/녹음은
지원하지 않는 한 선택 불가 사유를 사전에 표시한다. 임의 WAV 경로를 요구하는 오류도 제거한다.

### D. 반쪽짜리 테스트가 “완료”로 승격됐다 (차단)

| 기존 통과 | 실제로 증명한 것 | 증명하지 못한 것 |
|---|---|---|
| `config.test.ts` 4060 복원 | config 함수 반환값 | UI 저장→manifest→로더→재기동과 TTS 실행 |
| `synthesize.test.ts` | `/v1/audio/speech` 요청 body/응답 모의 계약 | 실 façade WAV, speaker `play()`, Ditto `/stream`, 영상 프레임 |
| `ChatArea.test.tsx` 두 번째 턴 | 모의 `sendChatMessage`의 history 배열 | Tauri gRPC agent + Ollama/Naia 실제 두 턴 및 오류 없음 |
| 기존 Playwright | 브라우저 DOM과 모의 IPC | Windows Tauri, 실제 4060 서비스, 오디오 출력/립싱크 |

이 때문에 “두 번째 요청 형식 오류”, “응답은 오지만 무음/무립싱크”, “아바타가 늦게
나타남”은 통과 기준 밖에 있었다.

## 재구현 전 UC와 테스트 계획

### UC-4060-01: 단독 설치 및 준비

사용자가 4060 프로파일을 적용하면 Shell이 필요한 DNA3, VoxCPM2, Ditto 구성요소의
다운로드/검증/기동 단계를 표시한다. Ollama·Ditto·VoxCPM2를 별도 설치했다고 가정하지 않는다.
ready 전에는 채팅 실행을 막고 실패 서비스·복구 행동을 표시한다.

수락 기준: 새 사용자 데이터 디렉터리에서 모델 미보유부터 시작해 다운로드 진행률,
checksum/ready 상태, 8910 health의 `tts/avatar`, `duplex_mode=half`를 Tauri E2E와
실제 loader smoke로 확인한다.

### UC-4060-02: 두 턴 텍스트 대화

`안녕` → 완료 → `두 번째 질문`이 동일 세션에서 Naia와 Ollama 각각에 성공한다.

수락 기준: native gRPC trace마다 user/assistant 역할 순서, provider/model, request id,
두 번째 `finish`를 대조한다. 400/`[오류] 요청 형식을 확인해 주세요.`가 없음을 검사한다.

### UC-4060-03: 로컬 음성 및 Ditto 립싱크

텍스트 LLM의 첫 완결 문장이 façade로 전달되고, 반환 WAV는 실제 출력 장치에서 재생되며
동일 바이트가 Ditto `/stream`으로 전달되어 MP4 첫 프레임을 표시한다.

수락 기준: 한 request id에서 (1) `POST /v1/audio/speech` 200과 voice palette id,
(2) `Audio.play()` 성공 이벤트, (3) `/stream` 200, (4) video `loadeddata` 또는 첫 프레임,
(5) 음성/영상 지연 측정값을 수집한다. audio 또는 video가 실패하면 “작동 중”으로 표시하지
않고 어느 단계가 실패했는지 UI에 남긴다.

### UC-4060-04: half-duplex 상호작용

TTS 재생 중에는 STT 전송을 일시 중지하고, 사용자가 말하기를 다시 시작하면 재생을 취소한
뒤 다음 턴을 보낸다. full-duplex를 요구하거나 표기하지 않는다.

수락 기준: 재생 중 STT 억제, 취소 후 queue reset, 다음 턴 응답 및 새 TTS/MP4까지 native
trace로 확인한다.

## 구현 순서와 완료 게이트

1. **계약 정리**: 일반 8GB focus 문서/UI/manifest에서 4060 named topology를 분리하고
   기존의 “8G 음성은 클라우드” 문구를 제거 또는 범위 한정한다.
2. **단일 적용 상태**: config/ui-config 분리 저장은 유지하되, profile apply/readiness를
   원자적으로 만들고 startup race를 차단한다.
3. **표현 관측성**: TTS·AudioQueue·Ditto renderer를 하나의 request trace로 연결하고
   사용자용 상태와 로그를 같은 사실에서 만든다.
4. **음색 계약**: UI 프리셋과 `/ref/voices` palette를 연결하고 부정 경로를 fail-closed로 만든다.
5. **테스트 우선**: 위 UC별 unit + Playwright + Windows Tauri + 실제 façade/loader smoke를
   추가한다. mock만 통과하면 P04를 통과시키지 않는다.
6. **인수**: 이 4060에서 새 데이터 디렉터리로 UC-01~04를 순서대로 실행해 로그·스크린샷·
   결과 산출물을 남긴 뒤에만 완료 처리한다.

## 관련 작업 재오픈 범위

- FR-VOICE.5~7 / S-VOICE-AVATAR
- FR-CASCADE 및 UC-AV.5
- 4060 profile/slots-manifest/loader 연결
- ChatArea의 chat-mode TTS 초기화와 두 번째 턴 native trace

이 보고서는 구현 완료 보고가 아니라 재오픈 근거다. 상기 수락 기준이 충족되기 전에는
4060 음성·Ditto·두 턴 대화를 `완료` 또는 `테스트됨`으로 표기하지 않는다.
