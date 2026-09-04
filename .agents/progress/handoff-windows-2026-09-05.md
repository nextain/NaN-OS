# Windows 에서 이어갈 것 (2026-09-05 새벽, 리눅스에서 넘김)

리눅스(Bazzite, RTX 3090 ×2)에서 밤새 한 작업을 `main` 에 올렸다
(`bb6340a2..21be6e2f`, 커밋 여덟 개). 여기서 막힌 것과 Windows 에서 해야 할
것을 적는다.

## 먼저 올려 주셔야 하는 파일 셋

`wip/bgm-youtube-dnd-hold-20260904` 커밋에 신규 파일 셋이 빠졌다. `git add`
가 안 된 채 커밋된 것으로 보인다. 저장소의 모든 가지와 임시 보관함 열 개를
뒤졌지만 어디에도 없다.

| 파일 | 부르는 쪽이 기대하는 것 |
|---|---|
| `packages/shell/src/lib/app-sandbox.ts` | `getAppSandboxRoot`, `writeAppSandboxFile`, `openAppSandboxFileInWorkspace`, `startSlidesRecording`, `stopSlidesRecording` |
| `packages/shell/src/lib/bgm-library.ts` | `loadBgmLibrary`, `createPlaylist`, `addTrackToPlaylist`, `removeTrackFromPlaylist`, `movePlaylistTrack`, `nextPlaylistIndex`, `toggleBgmLike`, `trackIdentity`, 타입 `BgmLibraryState`·`BgmLibraryTrack` |
| `packages/shell/src/lib/bgm-library-store.ts` | `bgmLibraryCache`, `loadBgmLibraryFromSandbox`, `persistBgmLibrary` |

올릴 자리는 `integrate/bgm-wip-20260904` 가지가 낫다. 이미 `main` 위로
리베이스해 두었고 충돌 열네 곳을 풀어 놓았으므로, 파일만 얹으면 그대로 이어진다.

셋이 오면 함께 풀리는 것이 많다.

- 타입 오류 31건이 정리된다(전부 이 셋에서 나온다)
- **앱 샌드박스 추상화가 바로 `app-sandbox.ts` 다.** 지금 Rust 쪽에는 샌드박스
  개념이 없고 TypeScript 쪽은 부르는 곳만 있다. 이 파일이 있어야 "앱 설치와
  앱 파일 경로가 한 추상화를 지나는가" 를 판정할 수 있다
- 슬라이드 앱이 그 추상화를 지키는지도 같이 판정된다

## 리눅스에서 확인한 것과 못 한 것

**확인했다.** 설치 스크립트가 호스트 것으로 놓인다 — 일부러 지운 `.sh` 가
재빌드로 다시 놓이는 것을 실측했다. vitest 969건 실패 0(손대기 전 main 은
4건 실패였다). Windows 경로는 등록부의 `win32` 값이 기존 리터럴과 문자 그대로
같아 결과가 바뀌지 않는다.

**못 했다.** 소리가 나는지는 확인하지 못했다. 96번 스펙(설치 → 기동 → 발화)을
돌리려고 키·워크스페이스·격리 저장소·매니페스트·설치 스크립트 자리·페어드
agent 빌드까지 하나씩 풀었지만, 앱이 뜬 뒤 `ensureAppReady` 에서 36분을
넘기지 못했다. 원인은 코드에 이미 적혀 있다 — `helpers/settings.ts` 주석이
"Bazzite + WebKitWebDriver 환경에서도 일부 spec 통과 못함, 윈도우 환경에서
통과 가능성 높음(2026-05-29)" 이라고 말한다.

그래서 **음성 실기 확인은 Windows 가 맞다.** 96번과 95번 스펙을 그쪽에서
돌려 주시면 리눅스에서 못 채운 수용 조건이 채워진다.

## 이번에 고친 것 — 왜 그랬는지

리눅스 로컬 음성이 서지 않던 이유는 하나였다. **운영체제라는 사실이 등록부
밖에 또 적혀 있었다.** 같은 모양으로 세 군데에 나타났다.

1. dev 스테이징이 어느 OS 에서든 `prepare-voxcpm2-model.ps1` 을 리소스 자리에
   놓았다. Rust 쪽은 호스트에 맞는 스크립트와 활성화 계약이 같은 자리에 둘 다
   있어야 경로를 내주므로, 설치가 아카이브를 받아 풀고도 승격 직전에 죽고
   셸은 그것을 조용히 브라우저 음성으로 되돌렸다
2. 내려받기 매니페스트도 `windows_trt_6g` 를 리눅스에 놓았다
3. **테스트가 그 결함을 고정하고 있었다** — 스테이징 단정이 스크립트 이름까지
   `.ps1` 로 못박아, 리눅스가 어긋나도 초록이었다

셋 다 `VOXCPM2_PROFILES` 등록부를 지나게 고쳤고, 스테이징 스크립트가 이름을
다시 적으면 실패하는 회귀 테스트를 달았다. 요구사항 FR-V017.39 에도 "놓는
쪽" 이 빠져 있어 그 자리를 채웠다.

## Windows 에서 확인하실 것

- 로컬 음성 설치·기동·발화(96번 스펙)
- LLM 답변을 문장별로 말하는 경로(95번 스펙)
- 슬라이드 발표 모드가 로컬 음성으로 말하는지
- Windows 설치 경로가 이전과 같은지 — 바뀌지 않아야 한다

## 곁다리 하나

`packages/shell/src-tauri/src/platform/linux.rs:277` 의 `pkill -f
voxcpm2_service` 는 셸 자기 것만이 아니라 그 기계에 떠 있는 남의 서비스까지
죽인다. 리눅스에서는 지금 밋업 GPU1 서비스가 사정권에 있다. 이번 작업 범위가
아니라 손대지 않았다.

## 함께 볼 것

- `docs/storage-locations.md` — 셸이 무엇을 어디에 저장하는지 실측
- `.agents/progress/naia-shell-linux-voice-night-2026-09-05.md`(alpha-adk) — 밤 작업 전체 기록
