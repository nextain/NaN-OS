# Naia Shell 음성·NVA·라디오 핸드오프

- 작성일: 2026-08-07
- 범위: `projects/naia-shell`
- 상태: 조사·요구사항 정리 완료, 구현 대기
- 이번 단계: 이 문서만 추가. 코드·설정·테스트는 변경하지 않음

## 1. 실측 현상

### NVA

- 로그인 후 메인 왼쪽에는 NVA가 정상 표시된다.
- 설정 목록에는 NVA가 보이지만 선택 후 상세 영역은 3D VRM으로 남는다.
- 답변 시 입은 움직이나 발화 영상의 마스크/알파 합성이 없어 배경이 검게 노출된다.
- 프로파일의 `Avatar: 대기 중`은 실제 상태와 모순된다.

### TTS

- 프로파일에는 `Voice: vos`, `음성 합성: nextain`이 표시된다.
- 로컬 GPU 음성을 선택해도 상태는 `대기 중`에 머문다.
- 그 상태에서도 실제 음성은 Naia Cloud TTS나 VoxCPM2가 아닌 브라우저 Web TTS다.
- 즉 선택한 엔진과 실제 재생 엔진이 불일치한다.

### YouTube/BGM/라디오 DJ

- 플레이 버튼을 눌러도 정지/일시정지가 되지 않는다.
- 음악이 끝나기 전에 다음 곡으로 넘어가는 현상이 있다.
- 원래 의도는 YouTube 플레이어의 `ENDED` 시그널 이후 다음 곡으로 전환하는 것이다.
- `조건에 맞는 음악을 재생하지 못했어요`가 자주 표시되지만 실패 단계가 드러나지 않는다.
- 유휴 대기시간이 곡 전환 명령과 잘못 연결됐을 가능성이 있다.

### Discord 하단 탭

- 대화창 아래 지구본/Discord 영역에 연결 안내가 표시된다.
- 탭 내용 전체가 `준비 중`이라 실제 연결 상태·서버·채널 허용을 확인할 수 없다.

## 2. 확인된 원인

### 2.1 SettingsTab 아바타 상태 이원화

`SettingsTab`은 초기 `loadConfig()`로 아바타 state를 만들고, `naia-config-changed`에서 메인 앱처럼 `avatarProvider/nvaModel`을 재동기화하지 않는다. 로그인 또는 원격 설정 hydration 후 메인은 NVA로 전환되지만 설정 화면은 VRM 상태를 유지할 수 있다.

### 2.2 NVA renderer가 Shell TTS를 가로챔

`VideoAvatarCanvas`가 `PrebakedAvatarRenderer`를 등록하고, `ChatArea.sendSentenceToTts`는 일반 `synthesizeTts`보다 먼저 `cascadeAvatar.speak(...)`를 호출한다. renderer는 WAV가 없으면 `window.speechSynthesis` 기반 `browserSpeech`를 실행한다. 따라서 VoxCPM2가 `대기 중`이어도 Web TTS가 나온다.

NVA는 오디오 소유자가 아니라 Shell TTS가 생성·재생하는 음성의 시각적 소비자여야 한다.

### 2.3 발화 영상의 투명 합성 누락

현재 NVA 경로는 `<video>`에 clip source를 직접 설정하고 manifest의 transparent/mask/chroma 정보를 해석하지 않는다. 기존 chromakey/layered player 경로도 현재 `VideoAvatarCanvas`에 연결되지 않았다. 알파가 없는 발화 clip은 검은 픽셀로 Shell 배경을 덮는다.

## 3. 결정된 제품 정책

### 3.1 온보딩/음성

순서는 `로그인 → GPU/VRAM 감지 → 음성 설정 → 아바타/배경`이다.

- 미로그인: TTS 제공 안 함
- 로그인 기본값: 무료 Web TTS
- 온보딩에서 기본 목소리 목록 선택 및 미리듣기
- 음성 끄기 선택 가능
- VoxCPM2 조건을 충족하는 GPU/VRAM을 가진 로그인 사용자에게만 로컬 음성 설정 표시
- 로컬 설정: 기준 음성 선택 또는 음성 파일 업로드
- VoxCPM2 준비 전에는 선택한 Web TTS 유지
- VoxCPM2 실패 시 Web TTS로 몰래 전환하지 않고 오류와 명시적 전환 선택 표시
- GPU는 별도 `Windows NVIDIA GPU` 프로파일을 만드는 용도가 아님

### 3.2 Shell TTS와 NVA 경계

- Shell 선택 provider가 오디오 생성·재생의 단일 소유자
- NVA는 영상·표정·입 모양과 playback start/end만 소비
- 웹 예제의 Web TTS와 자체 배경 렌더링은 Shell에서 제거
- 선택 엔진 실패 시 자동 폴백 금지
- TTS off면 소리와 립싱크 없음. 필요하면 별도 무음 응답 애니메이션만 제공

### 3.3 아바타 선택 UI

- VRM/NVA 공통 썸네일 카드 그리드 권장
- 카드: 미리보기, 이름, `3D VRM`/`영상 NVA` 배지, 선택 표시
- NVA 선택 즉시 상세 미리보기도 NVA로 변경
- NVA 미리보기 실패 시 VRM으로 대체하지 않고 오류/재시도 표시
- 배경 선택 UI는 현재 방향 유지

### 3.4 프로파일

- `Avatar: 대기 중` 제거
- 실제 상태를 `아바타: 이름 · NVA`, `불러오는 중`, `불러오지 못함` 등으로 표시
- `Voice: vos`와 `음성 합성: nextain`은 사용자용 설정에서 `음성 입력`/`음성 출력`으로 분리
- 내부 provider명은 고급/진단에만 표시

### 3.5 YouTube/라디오 DJ

- 곡 전환의 정식 트리거는 YouTube `ENDED`뿐
- `PLAYING` 유지, `PAUSED` 대기, 플레이 버튼은 재생/일시정지 토글
- 유휴 대기시간은 DJ 개입 가능 조건이지 강제 곡 전환 시간이 아님
- DJ 멘트 간격은 멘트 사이 최소 간격
- 현재 곡 종료 전 skip은 사용자 요청 또는 명시적 편성 규칙에서만 허용
- 사용자 일시정지 후 자동 재생 복구 금지
- 검색 → 후보 → 임베드 가능 → 플레이어 로드 → 실제 `PLAYING` 확인을 단계별 기록
- 임베드 불가·삭제·비공개·지역/연령 제한 영상은 사전 제외
- 최종 실패에는 원인과 재시도 버튼 표시

### 3.6 Discord 하단 탭

- 미연결: 연결 버튼/설명
- 연결 중: 진행 상태
- 연결 완료: 서버·채널 목록과 대화 허용 토글
- 권한 부족: 필요한 권한과 해결 방법
- 조회 실패: 구체적 오류와 재시도
- 연결 완료 후 전체 탭이 `준비 중`으로 남지 않음

## 4. 권장 구현 순서

1. TTS 단일 소유권 정리: `browserSpeech` 자동 폴백 제거, Shell audio와 NVA playback state 연결
2. VoxCPM2 readiness/startup 상태를 실제로 표시하고 Web TTS 자동 우회 차단
3. NVA alpha/mask/chroma 합성 연결 및 idle/speech 전환 검증
4. SettingsTab avatar hydration 동기화 및 NVA 전용 상세/미리보기 연결
5. 프로파일 Avatar/Voice 표시 정리
6. YouTube `ENDED` 기반 전환 및 재생/일시정지 토글 수정
7. 라디오 DJ idle timer와 track transition 분리, 음악 실패 단계 진단
8. 로그인 후 GPU 감지 기반 음성 온보딩 추가
9. Discord 탭을 실제 연결 상태·채널 허용 데이터에 연결

## 5. 수용 기준

- NVA 선택 후 VRM 상세가 잔류하지 않음
- NVA idle/talking/idle 동안 Shell 배경 유지, 검은 플래시 없음
- 실제 선택된 TTS 엔진만 재생
- 로컬 엔진이 대기/실패면 음성 미재생 및 명확한 상태 표시
- NVA 립싱크는 Shell TTS 실제 재생에만 연결
- 음악은 YouTube `ENDED` 이후에만 다음 곡으로 이동
- 플레이 버튼 상태가 pause/resume과 동기화
- 유휴 타이머만으로 곡이 잘리지 않음
- 음악 실패 원인을 검색/후보/임베드/플레이어 단계로 구분
- 로그인 사용자는 기본 Web TTS 목소리를 온보딩에서 선택·미리듣기
- 지원 GPU 로그인 사용자는 온보딩에서 VoxCPM2를 선택적으로 설정
- Discord 연결 상태에 따라 실제 채널 허용 UI 표시

## 6. 보류·주의

- 이 문서는 구현 완료 보고서가 아니라 조사 결과와 작업 인계 문서다.
- 이 범위의 전체 Playwright/Tauri 회귀는 아직 완료되지 않았다.
- NVA 발화 clip의 실제 alpha 지원은 자산별 확인이 필요하다.
- VoxCPM2의 정확한 Windows GPU/VRAM 하한과 runtime contract는 구현 전에 확정한다.
- Linux 3090에서 운영 중인 alpha, naia, onmam.com, aipol 에이전트는 범위 밖이다.

