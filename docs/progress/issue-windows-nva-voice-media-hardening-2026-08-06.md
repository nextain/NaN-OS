# Windows NVA·Voice·Media 정상화 — 단일 이슈 정본

- Work ID: `ISSUE-WINDOWS-NVA-VOICE-MEDIA-2026-08-06`
- Process: `issue-driven-development` (13 phases, single-issue trace)

## Current BUILD evidence (2026-08-06)

- B1: legacy GPU profile authority and boot-time local runtime start removed; legacy configuration migrates to local voice OFF.
- B2: local voice is an explicit 6GB+ no-login toggle under Voice. Installation readiness is checked before start and the exact missing-runtime summary is shown instead of a false waiting state.
- B4: persisted BGM state no longer resumes playback; proactive speech requires explicit persisted permission and uses an icon with localized hover/focus help.
- B5: legacy `home` chat placement migrates to left compact `app`; onboarding NVA entries render a captured idle-video frame; onboarding test fixtures use a generic name.
- B6: Windows Discord tests isolate files asynchronously, kill a timed-out process tree, bound PowerShell ACL calls, and batch child-home ACL protection. Run the full suite once in B7.
- Build evidence: Shell production build passed after B2, B4, and B5.
- Rust evidence gap: Cargo stops in `build.rs` because `NAIA_AGENT_SCRIPT` is absent, before Rust tests compile.
- B3: the refreshed `naia-adk` already ships six NVA v0.2 bundles (`jina`, `minho`, `naia` and anime variants) with authored talking/speech clips. Shell defaults to `naia` and its pre-baked player now accepts both the newer `vrm_slots` schema and the ADK `speech_clips` compatibility schema.

## REVIEW and regression evidence (Windows, 2026-08-06)

- Shell production build: PASS.
- Shell Vitest: PASS, 135 files passed / 2 skipped; 1,448 tests passed / 22 skipped; 0 failed; 163.37 seconds.
- The first Shell regression exposed three stale `localGpuTier` expectations. They were migrated to the explicit `localVoiceEnabled` contract and the full suite then passed.
- Windows Discord runner now uses asynchronous isolated children, bounded process-tree termination, a 300-second per-file ceiling, and end-of-suite failure aggregation.
- Windows Discord evidence obtained before the full-suite ceiling:
  - `agent-context.test.mjs`: PASS.
  - `backend-adapter-environment.test.mjs`: PASS with real Windows ACL checks.
  - `backend-runner.test.mjs`: PASS, 35 passed / 2 POSIX-only skipped / 0 failed in about 7 seconds after isolating duplicate ACL and ownership probes.
  - `discord-config-projection.test.mjs`: PASS with real Windows ACL checks.
  - `discord-cutover-rollback.test.mjs`: Windows defects found and repaired: committed Git blob byte materialization, config-probe timeout/environment, fixture ACL setup, and escaped path assertions. A final isolated pass was not obtained before the 30-minute aggregate run ceiling.
- Windows ACL calls on this PC take roughly 14-18 seconds each. The production ACL and config-probe ceilings were raised to 30 seconds to avoid false failures.
- The final aggregate Discord run reached the 30-minute command ceiling. Therefore B6 is **not yet a full-suite pass** and E2E/POST-TEST gates remain closed.
- Cleanup debt found in REVIEW: the retired Settings GPU-profile UI is unreachable and its runtime authority is forced OFF, but dead compatibility helpers and translations remain in `SettingsTab.tsx`; physical removal is still required before completion.
- B3 is closed without copying binary assets: the upstream ADK bundle refresh is present locally, and a regression test proves the shipped `speech_clips` manifest shape is accepted and resolves its localized authored clip.
- Final Shell verification after the compatibility repair: production build PASS; Vitest PASS, 135 files passed / 2 skipped and 1,449 tests passed / 22 skipped in 149.14 seconds.

## 0. 개발 프로세스 상태

이 문서는 이번 작업의 단일 Issue/진행/결정 정본이다. 별도 이슈 문서에서 범위를
늘리지 않는다.

| IDD 단계 | 상태 | 이 문서의 근거/산출물 |
|---|---|---|
| ISSUE | Done | Work ID와 단일 정본 선언 |
| UNDERSTAND | Done | 1~2절 목표, 제약, 완료 기준 |
| SCOPE | Done | `naia-shell`, `naia-video-avatar`, `naia-adk`; 운영 Linux 에이전트 제외 |
| INVESTIGATE | Done | 11절 코드 근거와 2회 범위 재검사 |
| PLAN | Done | 12절 추적 ID, 단계별 검증, 복구표, pre-mortem의 2회 대조 |
| BUILD | In progress | WNV-02~WNV-12를 B1~B6 순서대로 구현 |
| REVIEW | Pending | 단계별 review-pass와 verify-implementation |
| E2E TEST | Pending | 변경 범위 집중 테스트 후 전체 E2E 1회 |
| POST-TEST REVIEW | Pending | test/integration review-pass와 검증 스킬 |
| SYNC | Pending | 요구사항·사용자 문서·컨텍스트 동기화 |
| SYNC VERIFY | Pending | 문서/코드/미러 2회 clean pass |
| REPORT | Pending | 결과와 미완료 운영 검증을 분리 보고 |
| COMMIT | Pending | 앞 단계가 모두 끝난 뒤 관련 파일만 커밋 |

### 이해 게이트

- Goal: 사용자가 선택하지 않은 로컬 엔진·NVA·BGM·Radio DJ·Proactive가 시작되지
  않고, 선택한 기능은 Windows에서 실제로 준비 완료와 재생까지 동작한다.
- Constraints: 운영 중인 Linux alpha/naia/onmam.com/aipol 에이전트와 배포 환경은
  변경·재시작하지 않는다. NVA를 Ditto/TRT/Cascade로 되돌리지 않는다.
- Criteria: 7절의 관찰 가능한 완료 기준과 REQ/UC/SPEC/TEST 추적이 모두 통과한다.

### 범위 게이트

- 유형/모드: `EXPANSION` / `EXPANSION` scope mode.
- L1: Shell 설정·온보딩·NVA player·voice lifecycle·BGM/Radio/Proactive·layout,
  Naia ADK NVA 기본 자산, Windows Discord harness.
- L2: config migration, Rust IPC/child lifecycle, i18n, persisted state, 직접 호출자와
  테스트.
- L3: `projects/naia-video-avatar`의 현재 web-player와 자산 계약. 서버 렌더링
  역사 구현은 이식 원본이 아니다.
- 조사 깊이: UI는 flow, voice/NVA/media lifecycle은 internal, Discord는 Windows
  child-process flow. happy/error/edge/security 경로를 모두 조사한다.

### 테스트 실행 원칙

각 BUILD 단계는 먼저 실패하는 집중 테스트를 고정하고 구현 후 그 테스트와 build를
통과한다. 전체 Playwright/회귀 세트는 모든 집중 테스트가 통과한 마지막 E2E 단계에서
한 번만 실행한다.
- 상태: Active — 이 문서 승인 범위 안에서 요구사항 정본부터 순차 수정
- 대상: `projects/naia-shell`, `projects/naia-video-avatar`, `projects/naia-adk`
- 기준일: 2026-08-06
- 독자: 제품 소유자, Shell·NVA·ADK 유지보수자, Windows 검증 담당자

## 1. 문제와 목표

현재 Shell에는 서로 다른 세대의 설계가 섞여 있다. 미리 제작된 NVA 웹
플레이어와 폐기된 Ditto/TensorRT/Cascade 실시간 비디오 생성기가 같은
`Video avatar` 개념으로 표시되고, GPU 프로파일이 LLM·음성·아바타를 함께
변경한다. 저장된 Radio DJ·Proactive 설정은 사용자 명시 요청 없이 미디어가
동작하는 것처럼 보이게 하며, Windows 로컬 음성은 선택돼도 실제 엔진 준비에
실패한다.

이 이슈의 목표는 다음 하나다.

> NVA, LLM, 로컬 음성, BGM을 독립적인 사용자 선택으로 복원하고, 폐기된
> Ditto/TRT/Cascade 비디오 아바타 경로를 제거한 뒤 Windows에서 실제 동작을
> 짧고 재현 가능한 테스트로 증명한다.

## 2. 고정된 제품 결정

이 절은 하위 구현과 기존 문서보다 우선하는 이 이슈의 결정 사항이다.

1. **NVA 정의**
   - NVA는 `projects/naia-video-avatar`의 웹 플레이어로 재생하는 미리 제작된
     아바타 자산이다.
   - NVA는 Ditto, TensorRT, Cascade, 실시간 얼굴 생성 서버가 아니다.
   - NVA 사용에는 GPU 프로파일, Naia 로그인, 로컬 음성 서버가 필요하지 않다.
   - Shell은 NVA의 idle·speaking·gesture 자산과 새 발화 자산을 실제로 재생해야
     한다. 설정 경로만 저장하거나 정적 썸네일만 보여 주는 것은 완료가 아니다.

2. **NVA 자산 정본**
   - `naia-adk`의 기본 NVA는 새 발화 자산을 포함한 버전으로 교체한다.
   - Shell 기본 선택과 온보딩 목록은 교체된 자산을 가리킨다.
   - `alpha-yang` 등 기존 경로는 설치 여부를 검증한 뒤 호환 또는 명시적
     마이그레이션 대상으로 처리한다. 존재하지 않는 경로를 조용히 유지하지 않는다.

3. **로컬 음성**
   - 별도 `로컬 GPU 프로파일` 선택 UI를 제거한다.
   - 감지 VRAM이 6GB 이상이면 Voice 설정에서 `voxCPM 2 로컬 음성`을 켜고
     끄는 단일 제어만 제공한다.
   - 로컬 음성 토글은 Naia 로그인이나 NVA/VRM 선택을 요구하지 않는다.
   - 감지만으로 자동 활성화하지 않는다. 사용자가 켰을 때만 엔진을 시작한다.
   - ON 성공은 음성 façade `http://localhost:8910`의 준비 확인까지 포함한다.
   - 레퍼런스 음성 선택·녹음·파일 업로드는 Voice 설정이 소유한다.

4. **LLM·음성·아바타 독립성**
   - 로컬 음성 ON/OFF는 LLM provider/model을 변경하지 않는다.
   - VRM/NVA 선택은 LLM과 TTS provider를 변경하지 않는다.
   - Profile 요약에서 폐기된 `Video avatar` 슬롯을 제거한다.
   - LLM, 음성, 외모가 각각 설정되고 앱 부팅 후 각각 복원돼야 한다.

5. **BGM과 Radio DJ**
   - 일반 BGM은 사용자가 직접 재생하거나 LLM이 `skill_youtube_bgm`을 호출한
     경우에만 시작한다.
   - Radio DJ는 LLM이 `action=play, mode=radio_dj`를 명시한 경우에만 활성화한다.
   - 앱 부팅, 저장 곡 복원, Proactive 허용, 프로파일 복원은 재생 권한이 아니다.
   - Radio DJ의 다음 곡·실패 복구는 명시적으로 시작된 DJ 세션 안에서만 동작한다.
   - 재생 중 같은 재생 버튼을 누르면 즉시 일시정지한다.

6. **Proactive 제어**
   - `AI`, `TTS` 옆 제어는 한글 `능동` 텍스트를 표시하지 않는다.
   - 공간을 적게 차지하는 SVG 아이콘을 사용하고 hover/focus 툴팁과
     `aria-label`에서 `Proactive`의 의미와 현재 상태를 설명한다.
   - 기본값은 OFF다. 과거 저장값을 이유로 앱 부팅 시 자동 허용하지 않는다.
   - Proactive 허용은 Radio DJ 재생 권한과 분리한다.

7. **온보딩·배경·대화창**
   - 온보딩 외모 선택에 설치된 VRM과 NVA를 함께 표시한다.
   - 사용자 이름 placeholder에 특정 개인 이름을 사용하지 않는다.
   - 비디오 배경 카드는 재생 기호 대신 실제 캡처 프레임 썸네일을 표시한다.
   - 대화창 위치는 `왼쪽 소형`, `왼쪽 채움`만 제공한다. 과거 중앙 값은
     `왼쪽 소형`으로 마이그레이션한다.

8. **Windows Discord**
   - 업데이트된 Discord Gateway의 Windows 시작·중지·재연결·재부팅 복구와
     자식 프로세스 정리를 검증한다.
   - Linux 3090에서 운영 중인 alpha, naia, 온맘닷컴, 아이폴 에이전트는 이
     이슈의 대상이 아니며 접근하거나 재시작하지 않는다.

## 3. 현재 상태 감사

| 항목 | 현재 상태 | 판정 |
|---|---|---|
| 일반 사용자명 placeholder | 코드 수정 및 단위 테스트 존재 | 재검증 필요 |
| NVA 온보딩 노출 | 목록·저장 코드 일부 추가 | 플레이어 통합과 자산 교체가 없어 미완료 |
| 비디오 배경 프레임 | 캔버스 캡처 코드 추가 | 실제 PNG 증적 미생성, 미완료 |
| 대화창 중앙 옵션 | UI 제거 및 구 값 마이그레이션 | 집중 UI 테스트 필요 |
| BGM 재클릭 정지 | pause 명령과 낙관적 상태 전환 추가 | 집중 테스트 필요 |
| NVA 웹 플레이어 | 기존 Shell NVA 코드와 별도 프로젝트가 공존 | 정본 비교·실통합 미완료 |
| `naia-adk` 새 발화 NVA | 교체하지 않음 | 미착수 |
| Ditto/TRT/Cascade 제거 | 문서·UI·store·오류문구에 잔존 | 미착수 |
| 로컬 GPU 프로파일 제거 | 여전히 Profile 탭에 존재 | 미착수 |
| voxCPM2 음성 토글·기동 | 구 tier가 `naia-local-voice`를 선택하나 8910 준비 실패 | 미완료 |
| LLM 표시·복원 | dev 화면에서 표시되지 않는 증상 보고 | 원인 미확정 |
| Radio DJ 자동 재생 | 저장 곡과 DJ 자동재생 설정이 남음 | 명시 권한 경계 미완료 |
| Proactive 아이콘 | `능동` 텍스트와 저장 허용 복원 존재 | 미착수 |
| Windows Discord | 테스트 프로세스 비종료와 플랫폼 실패 확인 | 미완료 |

현재 `docs/requirements.md`, `docs/windows-8gb-nva.md`,
`docs/windows-6gb-voice.md`, V모델 registry, 일부 UC/FE 테스트는 위 결정과
충돌한다. 기존 Pass 표시는 새 계약으로 다시 검증하기 전에는 완료 증거가 아니다.

## 4. 하위 이슈 목록

모든 하위 이슈는 이 문서를 정본으로 사용하며 독립적인 제품 결정을 추가하지 않는다.

| ID | 우선순위 | 작업 | 주요 대상 | 완료 조건 |
|---|---:|---|---|---|
| WNV-01 | P0 | 요구사항 정본 교정 | `requirements.md`, P01~P05 registry, 관련 NVA/voice/Radio DJ 문서 | Ditto/TRT NVA와 GPU 프로파일을 정본으로 말하는 활성 문서 0건; 새 REQ→UC→SPEC→TEST 추적 완결 |
| WNV-02 | P0 | NVA 웹 플레이어 정본 비교·Shell 통합 | `naia-video-avatar`, `VideoAvatarCanvas`, NVA core/store | Shell에서 실제 idle→speaking→idle 및 gesture 재생 |
| WNV-03 | P0 | 새 발화 NVA 자산 교체 | `naia-adk/naia-settings/nva-files` 또는 배포 정본, Shell 기본값 | 새 자산 manifest·클립 검증, 기본 선택·마이그레이션 통과 |
| WNV-04 | P0 | Ditto/TRT/Cascade 비디오 아바타 제거 | Shell config/UI/store/Rust loader/문구/테스트 | NVA 경로에서 Ditto·TRT·Cascade 서버 시작·상태·오류 참조 0건 |
| WNV-05 | P0 | 로컬 GPU 프로파일 제거 및 음성 토글 도입 | Profile/Voice 설정, config migration | Profile tier UI 없음; 로그인과 무관하게 VRAM 6GB+에서 voxCPM2 ON/OFF 노출; 선택 전 자동 시작 없음 |
| WNV-06 | P0 | Windows voxCPM2 엔진 기동 복구 | Tauri loader, façade 8910, health/status | ON→프로세스 시작→8910 ready→실제 합성; 실패 시 원인·재시도 표시 |
| WNV-07 | P0 | LLM·Voice·NVA 독립 복원 | config SoT/boot merge/Settings summary | 각 설정을 바꿔도 나머지 값 불변; 재시작 후 LLM과 선택 아바타 표시 |
| WNV-08 | P0 | Radio DJ 명시 호출 경계 | BGM skill/player, ChatArea, 저장 복원 | 부팅 무음; 일반 재생과 `mode=radio_dj` 호출만 시작; DJ 종료 후 복구 중단 |
| WNV-09 | P1 | Proactive 아이콘·권한 정상화 | `AiControlBar`, i18n, config migration | 아이콘+툴팁+aria; 기본 OFF; BGM과 독립 |
| WNV-10 | P1 | 온보딩·배경·대화창 마감 | onboarding/App/CSS | NVA 선택, 일반 placeholder, 실제 영상 썸네일, 2-way 배치 |
| WNV-11 | P1 | BGM 재생 버튼 토글 마감 | `BgmPlayer` | playing 상태에서 클릭 시 pause 관측 및 UI 복귀 |
| WNV-12 | P1 | Windows Discord Gateway 하드닝 | `naia-adk/manage-discord-sessions` | 격리 테스트가 bounded 종료; Windows 서비스 lifecycle 통과 |
| WNV-13 | P1 | 실제 Windows 집중 검증·증적 | Vitest/Playwright/Tauri, project-local `tmp` | 핵심 여정별 로그·스크린샷; 마지막에만 전체 회귀 1회 |

## 5. 요구사항 추적 계획

WNV-01에서 아래 ID를 V모델 registry에 추가하거나 기존 항목을 분리한다.

| 계층 | ID | 내용 |
|---|---|---|
| REQ | REQ-016 | GPU·Ditto 비의존 NVA 웹 플레이어와 새 발화 자산 |
| REQ | REQ-017 | 6GB+ voxCPM2 명시 ON/OFF와 실제 준비 확인 |
| REQ | REQ-018 | 명시 호출 전용 BGM/Radio DJ와 Proactive 독립 권한 |
| REQ | REQ-019 | 온보딩 외모·배경 썸네일·대화창 2-way UI |
| UC | UC-020 | 사용자가 NVA를 골라 실제 발화 애니메이션으로 대화 |
| UC | UC-021 | 사용자가 Voice에서 로컬 음성을 켜고 준비·합성을 확인 |
| UC | UC-022 | 사용자 또는 LLM이 명시적으로 BGM/Radio DJ를 시작·중지 |
| UC | UC-023 | 사용자가 간결한 Proactive 아이콘으로 선제 발화 권한만 제어 |
| SPEC | SPEC-014 | NVA web-player adapter와 자산 resolver |
| SPEC | SPEC-015 | Windows voxCPM2 lifecycle과 Voice toggle adapter |
| SPEC | SPEC-016 | BGM/Radio DJ explicit-activation state machine |
| SPEC | SPEC-017 | Proactive icon/permission 및 onboarding/layout UI |
| TEST-S | TEST-S-019 | NVA 선택→부팅→발화→gesture 실제 UI 여정 |
| TEST-S | TEST-S-020 | 로컬 음성 OFF→ON→8910 ready→합성→OFF |
| TEST-S | TEST-S-021 | 부팅 무재생·일반 BGM·LLM Radio DJ·중지 경계 |
| TEST-S | TEST-S-022 | 온보딩·비디오 썸네일·2-way 배치·Proactive 접근성 |
| TEST-F | TEST-F-014 | NVA manifest/asset/player 상태 전이 계약 |
| TEST-F | TEST-F-015 | VRAM gate·voice lifecycle·config 독립성 계약 |
| TEST-F | TEST-F-016 | Radio DJ activation/recovery ownership 계약 |
| TEST-F | TEST-F-017 | Proactive 기본 OFF·아이콘 상태·UI migration 계약 |

기존 `REQ-013/UC-017/SPEC-011/TEST-S-016/TEST-F-011`의 선제 발화 계약은
Radio DJ 자동 시작을 허용하지 않도록 축소·교정한다. 기존 `REQ-011/UC-008`은
일반 BGM과 LLM 도구 호출의 명시 시작 계약으로 갱신한다. 기존 `REQ-008/UC-002`
음성 계약에는 voxCPM2가 독립 TTS provider임을 연결한다.

## 6. 실행 순서

1. **정본 먼저**: WNV-01로 P01~P05와 상세 요구사항을 수정한다.
2. **폐기 경로 제거**: WNV-04를 완료해 새 구현이 구 Cascade 경로를 재사용하지
   못하게 한다.
3. **NVA 자산과 플레이어**: WNV-03 후 WNV-02 순서로 자산 정본과 Shell 소비자를
   연결한다.
4. **음성 단순화·기동**: WNV-05 후 WNV-06으로 UI와 실제 lifecycle을 맞춘다.
5. **독립 설정 복원**: WNV-07로 LLM·Voice·NVA 부팅 roundtrip을 고정한다.
6. **미디어 권한**: WNV-08, WNV-09, WNV-11로 Radio DJ·Proactive·player를 분리한다.
7. **온보딩 마감**: WNV-10을 새 NVA/Voice 계약에 연결한다.
8. **Windows 운영 경계**: WNV-12를 운영 Linux와 분리해 검증한다.
9. **증적**: WNV-13에서 관련 테스트를 먼저 실행하고, 모두 통과한 뒤 전체 회귀를
   한 번만 실행한다.

각 단계는 구현 전에 대응 테스트의 실패 기대값을 먼저 고치고, 구현 후 그
집중 테스트가 통과해야 다음 단계로 넘어간다.

## 7. 완료 기준

- Shell Profile에 `Video avatar`와 `로컬 GPU 프로파일`이 보이지 않는다.
- NVA 선택 시 Ditto/TRT/Cascade 프로세스나 포트를 요구하지 않고 실제 웹
  플레이어가 새 발화 자산을 재생한다.
- VRAM 6GB+ Windows에서 로컬 음성 토글 ON 후 8910 준비와 실제 합성이
  확인되며, OFF 시 프로세스와 상태가 정리된다.
- LLM provider/model, TTS provider, NVA/VRM 선택이 서로 덮어쓰지 않고 재시작
  후 복원된다.
- 앱을 새로 시작했을 때 BGM과 Radio DJ는 정지 상태다.
- Radio DJ는 LLM의 구조화된 `skill_youtube_bgm` 호출 이후에만 연속 재생한다.
- Proactive 제어는 아이콘으로 표시되고 tooltip·keyboard focus·`aria-label`을
  제공하며 기본 OFF다.
- 온보딩에서 특정 개인 이름이 없고, NVA와 실제 비디오 프레임 썸네일이 보인다.
- 대화창은 왼쪽 소형/채움만 제공하고, BGM 재생 버튼은 pause toggle로 동작한다.
- Windows Discord 검증은 bounded 종료하며 운영 Linux 네 에이전트에 영향이 없다.
- REQ→UC→SPEC→TEST-S/TEST-F 추적표에 orphan과 폐기 계약의 활성 참조가 없다.

## 8. 검증 정책

- 구현 중에는 관련 Vitest/Playwright/Tauri 테스트만 실행한다.
- 실제 영상 썸네일과 NVA 발화 화면은 project-local `tmp/`에 캡처한다.
- 전체 208개 Playwright 회귀는 모든 집중 테스트가 통과한 마지막 단계에 1회만
  실행한다.
- 자격증명이나 운영 봇이 필요한 검증은 자동화 통과로 가장하지 않고 별도 운영
  인수 항목으로 기록한다.

## 9. 비범위와 안전 경계

- 운영 중인 Linux alpha, naia, 온맘닷컴, 아이폴 에이전트 변경·재시작·배포
- 새로운 실시간 비디오 생성 엔진 도입
- GPU 기반 NVA 생성 또는 Ditto/TRT/Cascade 복구
- LLM provider 자동 변경
- 사용자 승인 없는 프로덕션 배포·외부 메시지·비밀 노출

## 10. 문서 영향

- Repository docs: WNV-01에서 활성 요구사항·UC·SPEC·TEST registry와 Windows
  voice/NVA 문서를 갱신한다.
- User manual: 온보딩, Voice, NVA, BGM/Radio DJ, Proactive 제어 설명을 갱신한다.
- Reusable learning: Windows 테스트 전용 PC와 정기 회귀 운영은 별도 운영 이슈로
  분리하며 이 제품 수정의 완료 조건에 섞지 않는다.

## 11. 코드 조사 결과 (INVESTIGATE)

### Pass 1 — 실행 경로

1. Shell은 로그인 복원 시 저장된 `localGpuTier`를 보고 사용자 입력 없이
   `start_cascade`를 호출한다 (`packages/shell/src/App.tsx:623-638`).
2. Voice 설정 토글은 `naiaKey`와 loader profile이 없으면 시작하지 않고 로그인 필요
   메시지를 낸다 (`packages/shell/src/components/SettingsTab.tsx:826-868`). GPU profile
   selector와 자동 warm도 그대로 남아 있다 (`SettingsTab.tsx:875-1035, 3799-3852`).
3. Rust `start_cascade`는 manifest membership과 native-store Naia credential을 모두
   요구한다 (`packages/shell/src-tauri/src/lib.rs:5221-5257`). 이것이 no-login local
   voice 요구와 충돌하는 직접 원인이다. VRAM 6GB 경계 자체는 이미 구현되어 있다
   (`lib.rs:4589-4604`).
4. BGM player는 `playing=false`로 초기화하면서도 저장된 `bgmPlaying=true` 또는
   pending playback을 mount 시 iframe으로 복원한다
   (`packages/shell/src/components/BgmPlayer.tsx:605-658`). 이것이 앱 시작 직후 음악이
   나오는 직접 경로다.
5. Proactive는 permission 값이 없으면 저장 profile이 disabled가 아닌 것만으로 true로
   해석하고 즉시 profile을 configure한다
   (`AiControlBar.tsx:36-47`, `ChatArea.tsx:1172-1197`).
6. structured BGM skill의 DJ gate는 이미 `action=play && mode=radio_dj`로 분리돼 있다
   (`packages/shell/src/lib/bgm-skill.ts:77-80`). 이 계약을 유지하고 boot/profile 복원
   권한만 제거해야 한다.

### Pass 2 — NVA/자산/오류 경로

1. `VideoAvatarCanvas`는 이미 GPU 없는 `PrebakedAvatarRenderer`를 사용하며 cascade
   endpoint를 호출하지 않는다 (`VideoAvatarCanvas.tsx:48-148`). 이는 유지할 올바른
   실행 경로다.
2. player는 `vrm_slots` 또는 `prebaked_speech`가 있는 manifest만 받는다
   (`packages/shell/src/lib/nva.ts:isPrebakedNvaManifest`). 그러나 현재
   `projects/naia-adk/naia-settings/nva-files/naia/manifest.json`은 구 `speech_clips`
   형식이라 선택 후 player error가 난다.
3. 새 발화·표정·viseme 자산과 올바른 manifest는
   `projects/naia-video-avatar/examples/naia-prebaked.nva/`에 존재한다. ADK 기본
   `naia` bundle은 아직 이것으로 교체되지 않았다.
4. `PrebakedAvatarRenderer`는 exact localized text면 발화 clip을 재생하고, 그렇지 않으면
   talking/viseme loop + 선택된 TTS WAV 또는 browser speech로 이어간다
   (`prebaked-renderer.ts:speakNow`). NVA와 local voice의 독립성을 보존할 수 있는 경계다.
5. 채팅 오류 메시지는 합성 실패 뒤 `cascade_runtime_status`만 보고 starting/unavailable로
   축약한다 (`ChatArea.tsx:2480-2508`). spawn/로그인 gate/manifest/ready timeout을
   구분하지 못해 사용자가 원인을 알 수 없다.

두 번째 재검사에서 제품 결정을 바꾸는 새 범위는 발견되지 않았다. 발견 사항은 모두
WNV-02~WNV-12와 REQ-016~019에 매핑됐다.

## 12. 안정화된 구현 계획 (PLAN)

Scope mode는 `EXPANSION`이다. 각 단계는 실패 테스트 → 최소 구현 → 집중 검증 → build
순서로 닫고 다음 단계로 이동한다.

| Build phase | Work | REQ | Verification |
|---|---|---|---|
| B1 | stale GPU/profile/cascade avatar UI와 boot auto-start 제거; 새 localVoice schema/마이그레이션 | REQ-017 | config/Settings/App focused unit + build |
| B2 | no-login voice IPC, :8910 ready/error/stop lifecycle, ref voice 설정 | REQ-017 | Rust focused + Settings/voice focused + build |
| B3 | naia-adk NVA bundle 교체와 Shell player asset/state integration | REQ-016 | manifest/player unit + focused NVA UI/native capture + build |
| B4 | boot BGM restore 차단, Radio authority와 Proactive default-off/icon 분리, pause toggle | REQ-018, REQ-019 | BGM/Radio/AiControlBar focused + build |
| B5 | onboarding name/NVA/background frame와 left-only layout 마감 | REQ-019 | onboarding/layout focused Playwright + screenshot + build |
| B6 | Windows Discord isolated lifecycle hardening | REQ-019 | isolated Discord session tests + shell/agent build |
| B7 | integration roundtrip, native Windows smoke, final full regression | REQ-016~019 | targeted → full Playwright/unit/Rust once |

### Cross-repository contract

`naia-video-avatar` manifest/assets → `naia-adk` default bundle → Shell parser/player가 한
계약이다. Voice config → Rust IPC → packaged manager/:8910 health가 두 번째 계약이다.
Discord는 `naia-shell`과 `naia-adk` 양쪽을 검증한다.

### Error rescue map

| Phase/method | Failure mode | Recovery action | User visible? |
|---|---|---|:---:|
| B1 config migration | legacy config re-enables engine or changes LLM/avatar | preserve independent fields; ambiguous authority becomes explicit voice OFF | YES |
| B2 process/health I/O | spawn, early exit, timeout, or stop leaves child | map exact reason, reap owned tree, report OFF/error; never claim ready | YES |
| B3 asset file I/O | manifest/clip missing or schema mismatch | localized asset error and VRM fallback; never static-success | YES |
| B4 YouTube/player I/O | restored or stale event starts media | reject without active authority; clear persisted playing/session | YES |
| B5 canvas capture | video frame cannot be captured | explicit neutral video placeholder, not false thumbnail | YES |
| B6 Gateway child | test hangs or ignores graceful exit | per-file timeout, force only isolated test child, record file | NO |
| B7 native test | environment/model asset unavailable | separate automation from operational evidence; no completion claim | YES |

### Alternatives rejected

- Keep GPU profiles but rename them: detection must expose only Voice capability.
- Reuse Ditto/Cascade for NVA: NVA is pre-authored web playback.
- Treat saved BGM/profile as consent: restart is not a play action.
- Couple local voice to login: local hardware capability is account-independent.

### Adversarial pre-mortem

1. Old config silently starts a child on boot: explicit enabled-state migration + cold negative.
2. UI says ready while :8910/child is dead: health-confirmed ready + process-tree stop test.
3. NVA is selectable but idle/static only: asset identity + utterance playback + frame capture.

두 차례 계획 대조에서 모든 finding과 REQ-016~019가 B1~B7에 포함됐고 새로운 제품
선택은 필요하지 않았다. INVESTIGATE와 PLAN은 stable이다.
