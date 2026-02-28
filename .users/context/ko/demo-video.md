# 데모 영상 파이프라인

Naia OS 홍보/문서용 ~3분 데모 영상을 제작하는 파이프라인입니다.

## 개요

Playwright E2E로 브라우저 녹화 → Google Cloud TTS로 한국어 나레이션 생성 → ffmpeg로 합성하는 3단계 파이프라인.

```
demo-script.ts (씬 정의)
       ↓
demo-video.spec.ts (Playwright 녹화 → WebM + timeline.json)
       ↓
demo-tts.ts (Google Cloud TTS → MP3 × 25개)
       ↓
demo-merge.sh (ffmpeg → naia-demo.mp4)
```

## 파일 구조

| 파일 | 용도 |
|------|------|
| `shell/e2e/demo-script.ts` | 씬 정의 (ID, 나레이션 텍스트, 예상 시간, 페이즈) |
| `shell/e2e/demo-video.spec.ts` | Playwright 녹화 스펙 (Mock Tauri IPC) |
| `shell/e2e/demo-tts.ts` | Google Cloud TTS 나레이션 MP3 생성 |
| `shell/e2e/demo-merge.sh` | ffmpeg로 영상+오디오 합성 |
| `shell/e2e/demo-output/` | 출력 디렉토리 (WebM, timeline.json, TTS, MP4) |

## 씬 구성 (25개, ~183초)

### Phase 1: 온보딩 (~55초)
intro → provider → apikey → agent-name → user-name → character → personality → messenger → complete

### Phase 2: 메인 앱 순회 (~128초)
chat-hello → chat-response → chat-weather → chat-tool-result → chat-time → history-tab → skills-list → skills-detail → channels-tab → agents-tab → diagnostics-tab → settings-ai → settings-voice → settings-memory → progress-tab → outro

## 실행 방법

### 사전 요구사항
- gcloud CLI 인증됨 (TTS 접근 가능한 서비스 계정)
- ffmpeg, python3 설치됨
- Playwright: `cd shell && pnpm exec playwright install chromium`

### 실행 명령
```bash
# 1단계: Playwright 녹화 (WebM + timeline.json 생성)
cd naia-os/shell && pnpm test:e2e -- demo-video.spec.ts

# 2단계: TTS 나레이션 생성 (25개 MP3)
cd naia-os/shell && npx tsx e2e/demo-tts.ts

# 3단계: ffmpeg 합성 (최종 MP4)
cd naia-os/shell && bash e2e/demo-merge.sh
```

## 타이밍 동기화

핵심 기술: **SceneTimeline 클래스**

Playwright 테스트 실행 중 `SceneTimeline`이 각 씬 전환 시점의 실제 `Date.now()` 오프셋을 기록합니다.
이 데이터가 `timeline.json`에 저장되고, `demo-merge.sh`가 이를 읽어 각 TTS MP3를 정확한 밀리초 위치에 배치합니다.

→ 녹화 속도가 달라져도 나레이션이 항상 영상과 동기화됩니다.

## Mock Tauri IPC

`buildDemoMockScript()`가 `window.__TAURI_INTERNALS__`를 주입하여 실제 Tauri 없이 브라우저에서 앱을 구동합니다.

포함된 Mock 데이터:
- 스킬 12개, 세션 3개, 감사 로그 5개
- 채널 상태 (Discord 등)
- 에이전트 목록, 진단 정보
- 채팅 스트리밍 시뮬레이션 (SSE 방식 지연 응답)

## TTS 설정

| 항목 | 값 |
|------|-----|
| 제공자 | Google Cloud TTS REST API |
| 음성 | `ko-KR-Neural2-A` (한국어 여성) |
| 말하기 속도 | 0.95 (약간 느리게) |
| GCP 프로젝트 | `project-a8b18af5-b980-43e7-8ec` |
| 인증 | gcloud 서비스 계정 토큰 + `x-goog-user-project` 헤더 |

## 재녹화 가이드

| 변경 사항 | 실행할 단계 |
|-----------|------------|
| 영상만 재녹화 | 1단계 → 3단계 (TTS 캐시됨) |
| TTS 재생성 | `tts/*.mp3` 삭제 → 2단계 → 3단계 |
| 씬 변경 | `demo-script.ts` 수정 → 1~3단계 모두 |
| 씬 추가/삭제 | `demo-script.ts` + `demo-merge.sh` SCENE_TTS 맵 수정 → 1~3단계 모두 |

## 알려진 이슈

- Mock 응답 형식 불일치 시 채팅 에러 → `buildDemoMockScript()` invoke 핸들러 확인
- CI 환경에서 Playwright 느릴 경우 타이밍 드리프트 → timeline.json이 보상
- TTS 503 에러는 일시적 → 자동 재시도 처리됨
