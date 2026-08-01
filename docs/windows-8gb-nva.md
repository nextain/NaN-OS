# Windows 8GB NVA 운영 가이드

이 문서는 Windows에서 Naia 계정 또는 다른 외부 LLM과 로컬 NVA 표현 계층을 함께 사용하는 현재 지원 계약의 기준 문서다. 관련 요구사항은 `FR-CASCADE.9~14`, 사용자 시나리오는 `UC-WIN-NVA-8G`이다.

## 지원 범위

| 항목 | 현재 계약 |
|---|---|
| 운영체제 | Windows |
| GPU | 실측: RTX 4060 Laptop, RTX 4070. RTX 30/40은 목표 지원 범위이며 모델별 Ditto 엔진 호환 확인 필요 |
| 최소 VRAM | 감지 가능한 8GB 이상 |
| 로컬 TTS | VoxCPM2 W8A16 host + FP16 TensorRT LocDiT (`tts_server.py`) |
| 로컬 아바타 | TensorRT-native Ditto + NVA Player |
| LLM | Naia 계정, 원격 Ollama 또는 외부 API |
| 실시간 성능 | 지원 조건이 아님. 응답이 느려도 기능이 완료되면 정상 |
| RTX 50 | 현재 미검증. 로더의 compute-capability 차단도 후속 필요 |
| 클라우드 cascade | 향후 별도 서비스로 제공 예정. 현재 릴리스의 자동 폴백이나 제공 약속이 아님 |

“8GB 이상”은 Shell의 NVA 활성화 최소 VRAM 조건이며 모든 RTX 모델의 엔진 호환성을 뜻하지 않는다. 전체 경로는 RTX 4060 Laptop 8188MiB에서, manager의 기존 native core는 RTX 4070에서 실측했다. 그 밖의 RTX 30/40 모델은 목표 지원 범위이며 배포 전 모델별 Ditto TensorRT 엔진 확인이 필요하다.

> **백엔드 정직성:** VoxCPM2 전체가 하나의 TensorRT 엔진인 것은 아니다. 8GB 경로는 BaseLM·ResidualLM·LocEnc·AudioVAE와 생성 제어를 PyTorch W8A16으로 유지하고, 고정 형상의 LocDiT estimator만 FP16 TensorRT로 실행한다. Ditto는 별도 TensorRT 8.6 프로세스에서 실행하며 두 TensorRT 세대의 DLL을 한 프로세스에 섞지 않는다.

## 구성 경계

```text
Naia account / remote Ollama / external API
                    │ external LLM response
                    ▼
               naia-shell
                    │ text
                    ▼
      output cascade facade :8910
             ├─ VoxCPM2 TRT LocDiT :8901 ── WAV/PCM
             └─ Ditto TRT    :8902 ◀── same synthesized audio
                    │
                    ▼
             NVA video avatar
```

정식 loader 프로파일 이름은 `windows_trt_8g`이다. `laptop-4060-8g`과 과거 `kiosk_8g`은 기존 설정과 UI를 위한 호환 ID이며 같은 TRT 프로파일로 정규화된다. 세 ID 모두 `tts_voxcpm2_trt + avatar_ditto_trt + cascade_facade`를 실행한다. 로컬 GPU에는 VoxCPM2 W8A16 + TensorRT LocDiT 계획 비용 3.70GB와 Ditto TensorRT 2.6GB, 합계 6.30GB를 배정한다. RTX 4060 Laptop 실기동에서는 데스크톱 부하를 제외한 결합 스택이 약 6.56GB로 관측됐다.

이 프로파일은 다음을 설치하거나 실행하지 않는다.

- 로컬 LLM
- 로컬 Ollama
- NPU 런타임

프로파일 선택과 복원은 기존 LLM provider, model, Naia 계정/API 경로와 사용자가 지정한 원격 Ollama host를 보존한다.

### TalkingKiosk와 다른 지연 최적화 경계

Naia Shell과 이 cascade 프로파일에는 완성된 음성·영상 응답 캐시를 넣지 않는다. Shell은 외부 LLM과 자유롭게 대화하므로 동일한 완성 응답이 재사용될 가능성이 낮고, 음성지문·아바타·모델이 바뀔 때 캐시를 정확히 폐기하는 비용이 기대 효과보다 크다. 반복 안내 문구의 재사용률이 높은 TalkingKiosk의 완성 응답 캐시는 해당 제품에만 둔다.

Shell에 적용할 후속 지연 개선은 Ditto 단일 실행과 `429 Retry-After` 역압력, 짧은 GOP의 fragmented MP4 재생, Ditto 네이티브 512×512 렌더 후 Shell 확대·합성, VoxCPM2→Ditto→ffmpeg 취소 전파로 제한한다.

지연 개선 추적의 정본은 [alpha-adk #14](https://github.com/nextain/alpha-adk/issues/14)와 `UC-WIN-NVA-LATENCY`, `FR-CASCADE.15~19`다. 같은 텍스트·음성지문·NVA·warm 상태에서 첫 오디오, 첫 미디어 바이트, 첫 Shell 발화 프레임, 전체 완료, A/V 종료차, 취소 회수 시간을 각각 기록한다. 서비스의 첫 바이트만 빨라지고 Shell 화면이 그대로인 경우에는 사용자 체감 개선으로 판정하지 않는다.

## Shell 동작

1. Shell이 NVIDIA VRAM을 감지한다.
2. 8GB 이상이면 Windows NVA 프로파일과 NVA 선택을 허용한다.
3. 선택된 `.nva` 번들의 manifest와 idle 영상을 먼저 표시한다.
4. VoxCPM2와 Ditto가 준비되는 동안 NVA 화면을 유지하고 초기화 상태를 오버레이로 표시한다.
5. 외부 LLM 응답을 VoxCPM2로 합성하고 같은 오디오를 Ditto `/stream`에 전달한다.
6. 준비 실패 시 NVA idle 화면을 지우지 않고 실패 상태와 재시도를 제공한다.

VoxCPM2 또는 Ditto가 늦게 초기화되거나 실패하더라도 Shell 전체 화면이나 NVA idle 출력이 비어서는 안 된다.

### 느린 응답의 진행 상태와 자막 동기

TTS가 켜진 일반 채팅은 응답을 한꺼번에 먼저 표시하지 않고 다음 세 단계를 현재 Shell 언어로 보여 준다.

1. `생각 중` — 외부 LLM 응답을 기다리거나 수신한다.
2. `음성 처리 중` — 표시할 문장을 VoxCPM2로 합성한다.
3. `렌더 중` — 같은 합성 오디오를 Ditto에 보내 NVA 영상을 준비한다.

완료된 답변의 원문은 canonical 대화 기록에 즉시 보존하지만 화면에서는 실제 재생 전까지 가린다. 브라우저 음성은 `SpeechSynthesis.onstart`, 일반 음성 큐는 오디오 재생 시작, NVA는 뒤쪽 영상 요소의 `playing` 이벤트에서 음소거를 해제하는 시점에 해당 문장을 표시한다. 중단·ESC·새 발화가 발생하면 이전 세대의 합성·렌더·자막 표시를 함께 무효화한다.

2026-08-01 RTX 4060 Laptop 실제 Tauri E2E에서는 `생각 중 7.72초 → 음성 처리 중 15.80초 → 렌더 중 19.53초(자막 없음) → Ditto playing 21.383초 → 자막 21.388초`로 관측됐다. 재생과 자막 차이는 약 4.6ms였고 완료 전환 중 전체 답변이 잠깐 보이는 현상은 0회였다. 이 검증은 한국어를 포함한 14개 Shell 언어의 상태 키 존재 여부도 함께 검사한다.

## 8GB 미만과 감지 실패

VRAM이 8GB 미만이거나 감지되지 않으면 fail-closed로 처리한다.

- NVA 옵션을 disabled로 표시한다.
- 과거 6GB/8GB override로 NVA를 다시 활성화하지 않는다.
- `windows_trt_8g` manifest를 만들거나 cascade를 자동 시작하지 않는다.
- 저장된 NVA 설정이 있어도 VRM으로 안전하게 표시한다.

6GB NVA는 현재 지원 대상이 아니다.

## Windows manager 실행과 확인

```powershell
cd projects/naia-omni-windows-manager
# 권장: --gpu를 생략하면 nvidia-smi 총 VRAM의 85%를 가용 예산으로 사용한다.
python -m loader plan --profile windows_trt_8g --json
python -m loader launch --profile windows_trt_8g --quality low --adk-root D:\alpha-adk --ready-timeout 240

# 수동 진단 예: 8GB 카드의 보수적 가용 예산
python -m loader plan --gpu 7.1 --profile windows_trt_8g --json
```

준비 상태:

- `http://127.0.0.1:8901/health` — VoxCPM2 `backend=tensorrt_locdit`, 엔진 SHA-256, 모델 revision, SM, TensorRT 버전
- `http://127.0.0.1:8902/health` — Ditto `tensorrt-native`
- `http://127.0.0.1:8910/health` — `tts=true`, `avatar=true`, `mode=full`

`--gpu`는 물리 GPU 총 VRAM이 아니라 loader가 사용할 수 있는 VRAM 예산이다. Shell의 8GB 물리 하한은 manifest/Rust 게이트에서 검사하지만, 명시적 CLI `--profile` 경로는 현재 이 물리 하한을 별도로 검사하지 않는다. 따라서 지원 판정에는 Shell에서 감지한 총 VRAM을 사용하고 `--gpu` 값만으로 8GB 하드웨어 지원을 주장하지 않는다.

## 수용 시나리오

1. 외부 LLM을 Naia 계정, 원격 Ollama 또는 외부 API로 설정한다.
2. Windows 8GB NVA 프로파일을 선택한다.
3. NVA 번들을 선택하고 Shell을 재시작한다.
4. 서비스 초기화 전에도 NVA idle 아바타가 표시되는지 확인한다.
5. 메시지를 보내 외부 LLM 응답이 표시되는지 확인한다.
6. VoxCPM2 음성이 재생되고 Ditto가 같은 오디오로 립싱크하는지 확인한다.
7. LLM provider/model/host가 프로파일 선택 전과 같은지 확인한다.

실패 시에는 연결 불가 브라우저 화면이 아니라 Shell UI와 명확한 초기화/실패 상태가 보여야 한다.

## 검증 기준과 실측

- RTX 4060 Laptop GPU, VRAM 8188MiB
- 실제 Tauri Shell에서 NVA idle 및 발화 화면 출력
- 외부 Codex LLM 응답 수신
- VoxCPM2 `/v1/audio/speech` HTTP 200
- Ditto `/stream` HTTP 200 및 발화 상태 전환
- Shell Vitest 1,422 passed, 13 skipped
- FE Playwright 166 passed, 39 조건부/manual skipped
- 실제 4060 Tauri NVA E2E 1 passed: Naia 응답, VoxCPM2 200, Ditto 200, 상태 순서, 재생 동기 자막
- Windows manager pytest 76 passed
- Shell Rust library tests 179 passed
- naia-labs avatar/service GPU 비의존 테스트 22 passed
- output cascade 자원 경계 테스트 4 passed
- 프로덕션 빌드와 TypeScript 검사 통과

정지 화면은 시간축 립싱크 자체를 증명하지 않는다. 립싱크 수용 판정은 동일 합성 오디오가 Ditto `/stream`으로 전달되고 Shell의 발화 상태가 완료되는 네이티브 통합 테스트를 기준으로 한다.

### 속도와 누적 안정성 실측

속도는 텍스트 길이·문장 구조·timesteps에 따라 달라지므로 하나의 “배속”으로 보장하지 않는다.

- 기존 고정 문장: 4.62초 오디오를 평균 9.18초에 합성해 RTF 약 1.99였다. 따라서 과거의 일괄적인 1.6배 표기는 사용하지 않는다.
- `--quality low` 재기동 후 고정 문장: 5.10초 오디오의 첫 요청 9.44초, warm 4회 6.22~6.34초로 RTF 약 1.22~1.24였다.
- Ditto 반복 10회: 4.330~4.439초, 첫 4.380초·마지막 4.395초로 누적 지연 추세가 없었다. 작업 세트 증가는 약 2.6MB였다.
- VoxCPM2·Ditto 각각 동시 요청 2개: 첫 요청 200, 겹친 요청 429와 `Retry-After: 1`로 즉시 거부됐다. GPU 작업을 무한 대기열에 쌓지 않는다.

Ditto 성공·오류·클라이언트 연결 중단 경로는 모두 SDK 세션을 닫는다. 입력은 TTS 64KiB/1,000자, Ditto PCM 16MiB/60초로 제한하며, 잘린 본문과 잘못된 chunk 요청을 거부한다. 프로세스 자체 주기 재시작은 manager가 한 자식 종료를 cascade 전체 장애로 취급하므로 현재 적용하지 않는다.

### 개인 라디오 결합 검증 (#405, 2026-08-01)

외부 LLM과 이 노트북의 Windows TRT cascade를 함께 사용하는 실제 Tauri Shell에서 개인 라디오 흐름을 검증했다. 곡 A의 `playing` 관측, 자동 DJ의 VoxCPM2 `/v1/audio/speech`, 같은 오디오의 Ditto `/stream`, 곡 B로 즉시 교체한 뒤 새 `playing`과 두 번째 발화, 렌더 중 Enter 끼어들기와 BGM 지속을 한 테스트에서 확인했다. 자동 발화 문장은 실제 아바타 재생 전까지 숨기며, producer의 즉시 `finish`가 이미 승인된 TTS를 취소하지 않는다.

- 실제 Tauri NVA E2E: 2/2 통과, 총 51초
- VoxCPM2 순차 10회: 10/10, 평균 2.319초, 누적 증가 없음
- Ditto 순차 10회: 10/10, 중앙값 약 2.789초; 1회 6.384초 변동 뒤 회복
- 결합 `/stream_text` 순차 10회: 10/10, 평균 4.600초, 단조 증가 없음
- 종료 시 GPU 메모리: 7,689/8,188MiB
- 중복 GPU 요청은 무한 대기 대신 429 single-flight로 거절됨

이 결과는 짧은 반복 검증이다. 수백 회 또는 수 시간 운용, stop/quiet/change-vibe/next 전체 조합, 설정 저장·재시작까지 한 번에 잇는 장기 soak를 완료했다는 뜻은 아니다.

## Windows 설치 파일과 Steam 배포 경계

현재 NSIS 산출물은 Shell 핵심 런타임(Node, Agent, BGM, Vosk DLL, MSVC CRT, WebView2 offline)을 포함한다. 그러나 Windows 8GB NVA를 새 PC에서 바로 실행하는 데 필요한 Python 환경, VoxCPM2·Ditto 모델, TensorRT 엔진·플러그인과 NVIDIA 드라이버는 아직 설치 파일에 완전히 포함되지 않는다. `cascade-loader` 소스가 들어 있다는 사실만으로 독립 설치가 완료된 것은 아니다.

따라서 현재 상태는 다음과 같이 판정한다.

- 기존에 TRT 런타임과 모델이 준비된 이 노트북: 지원 및 실측 완료
- 깨끗한 Windows PC의 단일 설치 파일만으로 NVA 실행: 미완료
- Steam depot의 Shell 독립 기동: 가능하지만 NVA TRT 자산 자동 설치·검증과 SteamPipe 배포 자동화는 후속
- 코드 서명: 현재 NSIS는 미서명

Steam 또는 일반 사용자 배포 전에 GPU/드라이버 확인, 서명된 TRT 자산 manifest, 원자적 다운로드와 SHA-256 검증, 디스크 용량 검사, 첫 기동 warm-up, 제거/업데이트 정책, 실제 깨끗한 VM 설치 E2E를 완료해야 한다. 향후 Nextain cloud cascade는 이 로컬 설치의 조용한 폴백이 아니라 별도 유료 서비스로 표시한다.

## 과거 정책과의 관계

다음 항목은 연구·이력 기록이며 Windows `windows_trt_8g`의 현재 동작이 아니다.

- 6GB에서 로컬 NVA를 허용하는 정책
- 8GB에서 로컬 LLM/아바타/both 중 하나를 선택하는 3모드 정책
- 8GB 음성을 항상 클라우드로 제한하는 정책
- CPU/NPU Ollama를 Windows 8GB 프로파일의 두뇌로 자동 설정하는 정책

이 문서와 `FR-CASCADE.9~14`, `UC-WIN-NVA-8G`가 위 과거 기록보다 우선한다.
