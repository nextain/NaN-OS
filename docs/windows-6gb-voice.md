# Windows 6GB VoxCPM2 음성 프로파일

## 지원 계약

`windows-voice-6g`는 NVIDIA RTX GPU의 물리 VRAM이 6GB 이상인 Windows PC를 위한 음성 전용 하드웨어 프로파일이다. Shell이 manager에 전달하는 loader 프로파일은 `windows_trt_6g`이다.

- LLM: 기존 외부 경로를 그대로 유지한다. Naia 계정 LLM, 원격 Ollama, 외부 API를 모두 허용한다.
- 로컬 GPU: VoxCPM2 W8A16과 고정 형상 LocDiT TensorRT 경로만 실행한다.
- 아바타: Shell의 3D VRM을 사용한다.
- 제외: Ditto, NVA, 로컬 LLM, 로컬 Ollama, NPU, STT를 설치하거나 시작하지 않는다.
- 포트: VoxCPM2 `:8901`, 음성 전용 cascade façade `:8910`. Ditto `:8902`는 열지 않는다.
- 캐시: 완성 음성 응답 캐시는 두지 않는다. 모델/엔진 캐시는 정상적인 런타임 자산으로 유지한다.

이 프로파일을 포함한 하드웨어 프로파일은 회원가입 후 Naia 계정으로 로그인한 사용자만 선택하고 실행할 수 있다. 로그아웃하면 실행 중인 cascade를 중지하고, 다음 매니페스트에서 tier와 loader profile을 제거한다. 프런트엔드 상태를 우회해 `start_cascade` IPC를 직접 호출해도 `gate.naiaAccount=true`가 아니면 거부한다.

## VRAM과 성능 근거

현재 RTX 4060 Laptop 8GB 장비에서 VoxCPM2 W8A16 + LocDiT TensorRT 프로세스는 warm 추론 peak 약 3.764GiB로 측정됐다. 물리 6GB의 보수적 85% 예산 5.10GiB 안에는 들어가지만, 기존의 “전체 BF16 모델을 GPU에 올린 뒤 양자화” 순서는 콜드 스타트 순간 6GB를 넘을 수 있었다. `VOXCPM_CPU_QUANTIZE=1` 경로는 CPU에서 W8A16으로 바꾼 뒤 양자화된 런타임과 KV cache만 CUDA로 이동해 이 순간 peak를 제거한다.

이 수치는 현재 노트북의 구현 검증 근거이지 모든 6GB RTX에서 실시간을 보장하는 수치가 아니다. 실제 6GB 카드의 콜드 부트, 첫 발화, 반복 발화와 드라이버별 TensorRT 호환성은 배포 전 별도 실측 게이트다. 실시간이 아니어도 기능 지원 대상이지만, 측정하지 않은 속도를 지원 수치로 표기하지 않는다.

Ditto까지 결합한 관측치는 약 6.50GiB이므로 6GB 프로파일에는 넣지 않는다. NVA가 필요하면 물리 VRAM 8GB 이상의 [`windows_trt_8g`](windows-8gb-nva.md) 프로파일을 사용한다.

## Shell 시나리오

1. 사용자가 Naia 회원가입 또는 로그인을 완료한다.
2. Shell이 물리 VRAM 6GB 이상을 감지하고 `windows-voice-6g`를 제안한다.
3. 선택해도 현재 외부 LLM provider, model, API host 또는 원격 Ollama host는 바뀌지 않는다.
4. Shell은 TTS를 `naia-local-voice`, host를 `http://localhost:8910`, avatar를 `vrm`으로 설정한다.
5. manager는 VoxCPM2와 음성 전용 façade만 시작한다.
6. 채팅 답변은 기존 외부 LLM에서 오고, 같은 답변을 로컬 VoxCPM2가 합성한다. VRM은 Shell의 오디오 분석으로 움직인다.
7. 사용자가 로그아웃하면 cascade가 중지되고 하드웨어 프로파일은 dormant 상태가 된다.

## 배포 경계

향후 cloud cascade 서비스는 별도 서비스로 제공할 예정이다. 현재 로컬 프로파일의 자동 폴백, 무료 제공, 현재 entitlement 또는 확정된 endpoint를 의미하지 않는다.

현재 Windows 설치 파일은 Shell 핵심 런타임을 포함하지만 VoxCPM2 모델, Python/TensorRT 런타임, 엔진과 NVIDIA 드라이버를 새 PC에 완전 자동 설치하는 독립 패키지는 아직 아니다. Steam 배포 전에는 깨끗한 Windows VM에서 설치, 자산 다운로드·해시 검증, 첫 기동 warm-up, 제거와 업데이트를 별도로 통과해야 한다.

## 검증 기준

- 계약: tier/manifest/login fail-closed, 정확한 서비스 집합, VRAM 예산
- 런타임: CPU 선양자화 단위 테스트, Python import/compile, 실제 cold start와 `/v1/audio/speech`
- Shell: TypeScript/Rust 단위 테스트, 설정 Playwright, 실제 Tauri에서 프로파일 선택·cascade 시작·음성 재생·VRM 화면
- 실제 화면 기준 자산: `naia-settings/vrm-files/03-OL_Woman.vrm`. 6GB Tauri E2E는 SHA-256으로 자산 동일성을 고정하고, 로드 경로·표정 세트·발화 후 화면 유지까지 확인한다.
- 반복성: 연속 발화 시 VRAM 증가, 오류 누적, 무응답과 잡음 여부 확인

## 2026-08-01 통합 검증 기록

현재 RTX 4060 Laptop 8GB에서 manager를 `windows_trt_6g --gpu 5.1`로 콜드 시작해 약 33초 뒤 준비 상태에 도달했다. 실행 서비스는 VoxCPM2 `:8901`과 음성 전용 façade `:8910`뿐이었고 Ditto `:8902`는 열리지 않았다. façade health는 `tts_enabled=true`, `avatar_enabled=false`, `mode=tts_only`를 보고했고 TTS는 TensorRT LocDiT FP16 엔진을 사용했다.

- 서로 다른 문장 5회와 같은 문장 10회, 합계 15회의 `/v1/audio/speech` 요청이 모두 재생 가능한 48kHz mono RIFF WAV를 반환했다.
- 같은 문장 warm 반복 10회의 처리 시간은 2.736~2.997초였고 결과 크기는 모두 259,244 bytes였다.
- 반복 후 시스템 전체 GPU 사용량은 5,672MiB에서 안정적으로 유지됐다. 이 수치는 데스크톱 등 다른 GPU 사용자를 포함하므로 프로세스 단독 VRAM으로 해석하지 않는다.
- 파형 검사에서 clipping 0%, 유의미한 DC offset 없음이 확인됐다. 자동 파형 검사만으로 실제 청감 잡음 부재를 단정하지는 않는다.
- 실제 Tauri Shell E2E 1건이 통과했다. 격리된 회원 manifest에서 `03-OL_Woman.vrm`을 표시하고, Rust IPC로 cascade를 시작한 뒤 외부 LLM 답변을 받아 `naia-local-voice` TTS를 호출했다. 로그에서 14개 VRM 표정과 idle 애니메이션을 확인했으며 `/stream`과 Ditto/NVA는 사용하지 않았고 발화 후에도 VRM 화면을 유지했다.

이는 6GB **예산 경로와 Shell 종단 계약**의 증거다. 물리 VRAM 6GB 카드에서의 초기화 peak와 장시간 안정성은 아직 검증하지 않았으므로 하드웨어 지원 표시는 계속 experimental/measurement-gated로 유지한다.
