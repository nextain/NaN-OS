# Radio DJ 통합 UC와 단계별 연동

> 작성일: 2026-08-04
> 관련 실기 시나리오: [radio-dj-practical-test-scenarios.md](radio-dj-practical-test-scenarios.md)

## 통합 UC

| 통합 UC | 한 흐름으로 검증할 내용 | 현재 자동화 상태 |
|---|---|---|
| **IUC-1 연속 DJ** | 곡 A 실제 재생 → 종료 → 짧은 멘트 → 새 곡 B 탐색 → B의 실제 `playing` 뒤 소개 | 완료. paired Agent가 상관된 `ended`를 받은 뒤 전환 멘트를 끝내고 새 `radio_dj` 선곡을 요청하며, B의 상관된 `playing` 뒤에만 소개한다. 실제 controller↔Shell adapter 통합 테스트와 Linux Tauri queue E2E로 검증했다. 종료 전 prefetch는 별도 개선 범위다. |
| **IUC-2 사용자 개입** | A 재생 중 일반 대화는 음악 유지 → “다른 곡”은 즉시 교체 → DJ 발화 중 끼어들기는 TTS만 취소 | 일반 대화 유지, 명시적 교체, 정지 뒤 늦은 전환 금지를 Playwright로 자동화. 네이티브 TTS 끼어들기는 paired Agent 빌드 smoke 필요. |
| **IUC-3 취향과 반복 회피** | 명시적 좋아요 저장 → 다음 세션 추천 반영 → 최근 20곡/동일 곡 다른 업로드 제외 → 명시적 재요청은 허용 | 완료된 계약 범위. Agent는 태그된 사용자 명시 취향만 naia-memory에서 능동 recall하고 로컬 tombstone을 우선한다. Shell의 bounded 최근 20곡·즐겨찾기와 결합해 새 후보를 고르며, malformed/assistant 기억과 최근 동일 음원은 배제하고 기억 장애 시 로컬 세션 정보로 축소한다. |
| **IUC-4 즐겨찾기** | 현재 곡 등록 → 다른 곡 재생 → “즐겨찾기 틀어줘” → 저장 곡 복귀 → 빈 목록과 삭제 처리 | Shell 도구·UI·localStorage 경로에서 등록·재생·삭제·빈 목록을 Playwright로 자동화. |
| **IUC-5 재생 불가 복구** | 첫 iframe `onError` → 성공 소개 금지 → 준비된 다음 후보 자동 전환 → 실제 `playing` 확인 | 완료된 자동화 범위. 오류와 15초 로딩 시간초과는 준비 후보로 전환하고, Agent controller도 첫 재생 실패 뒤 새 후보를 한 번 선곡한다. 모든 Agent play는 `mode=radio_dj`이며 최근곡·실패곡·정규화 중복을 제외한다. 연속 실패는 안내 한 번 뒤 멈추고 정지·새 교체·오래된 이벤트는 늦은 복구를 취소한다. |
| **IUC-6 화면 관찰** | 이미지 가능 모델 확인 → 음악 표면만 캡처 → 이미지 블록 전달 → 실제 보이는 내용만 언급 | 부분 완료. bounded PNG/JPEG/WebP data URI를 문자열 결과에서 제거해 inline image로 상관시키고 OpenAI·Anthropic·Ollama provider의 네이티브 이미지 입력까지 전달하는 계약은 구현·검증했다. 현재 YouTube는 cross-origin 배경 iframe이라 브라우저 픽셀 추출이 차단되고, 기존 OS 영역 캡처는 그 위의 채팅·설정까지 포함할 수 있다. 개인정보 경계를 깨는 재사용은 하지 않았으며 음악 표면 전용 producer와 capability 기반 호출 전에는 실제 화면을 보았다고 주장하지 않는다. |

## 메모리 연동 단계

1. **명시적 취향 보존:** naia-agent의 workspace-local preference index가 사용자의 명시적 좋아요·싫어요·삭제만 저장하고 `MemoryPort.save` outbox로 naia-memory에 영속 전달한다. 암묵적 감정 추론은 저장하지 않는다.
2. **세션 사실 결합:** Shell이 iframe의 실제 `playing` 뒤에만 최근 재생 이력을 기록한다. 추천기는 명시적 취향, 최근 이력, 즐겨찾기를 서로 다른 근거로 받아 반복을 피한다.
3. **나이아 메모리 조회:** 태그된 사용자 취향만 능동 조회하고 local exact state와 tombstone을 최종 권위로 사용한다. malformed·assistant 항목을 무시하며 recall 장애 시 Shell의 최근곡·즐겨찾기와 로컬 취향만 쓰는 축소 동작을 검증했다.
4. **멀티모달 전달:** provider adapter의 bounded image block 전송 계약은 완료했다. 다음 단계는 capability가 확인된 호출에서 Shell 음악 표면만 캡처해 연결하는 것이며, 그 전에는 시각 설명을 생성하지 않는다.

장기 취향과 최근 재생 이력은 목적이 다르다. 장기 취향은 사용자가 명시한 표현이며, 최근 이력은 반복 방지용 재생 사실이다. 최근 이력을 장기 취향으로 승격하지 않는다.

## 현재 Playwright 묶음

`packages/shell/e2e/bgm-skill.spec.ts`는 다음을 실제 Shell UI 경로로 검증한다.

- 앱 도구 등록과 채팅 턴 도구 실행
- 요청과 실제 `playing` 구분, 종료 뒤 대기 곡 전환
- 재생 불가·로딩 시간초과 뒤 준비된 후보 자동 전환과 후보 고갈 정지
- 음악 재생 중 일반 대화 유지, 명시적 곡 교체, 정지 뒤 늦은 전환 차단
- 즐겨찾기 등록·재생·삭제와 빈 목록 결과
- 가변 길이 10곡 연속 전환, 중복 종료 방어와 장곡 진행 관측
- queue 고갈 뒤 제한된 동적 재검색, 중복 후보 제외와 정지 시 늦은 검색 취소
- 60곡·곡당 논리 8분의 8시간 가속 soak, 15곡의 2시간 체크포인트, 고유 playback 60개와 최근 이력 20개 상한

가변 길이 항목은 기본 실행에서 `duration=3600` 메타데이터를 사용하는 시간 압축 테스트다. 추가로 `RADIO_DJ_LONG_TRACK_MS=3600000`을 적용해 첫 로컬 fixture를 실제 벽시계 60분 동안 유지한 뒤 나머지 9곡까지 순서대로 전환하는 실행을 2026-08-05에 통과했다. 이는 실제 시간 수명과 전환 증거이지만 외부 YouTube 60분 실행으로 기록하지 않는다. 60곡 soak는 약 13초 동안 28,800초의 논리 media clock을 진행하는 결정론적 L4 가속 fixture다.

실제 YouTube 경계는 `packages/shell/e2e/bgm-youtube-live-smoke.spec.ts`로 분리했다. 기본 CI에서는 skip하며, `RADIO_DJ_LIVE_YOUTUBE=1 RADIO_DJ_LIVE_WALL_MS=600000`으로 실행하면 소유 sidecar를 격리 포트에 띄워 실제 장곡을 검색하고 Shell과 같은 origin/referrer로 실제 embed의 media clock을 관측한다. 2026-08-04~05에는 검색된 11:58:09 영상 `lh4JdZTJe7k`를 대상으로 10분 관측에 이어 실제 벽시계 8시간 soak를 통과했다. 2시간 체크포인트의 media clock은 7,203.0초, 최종값은 28,800.6초였고 페이지·미디어 오류는 없었다. 이는 한 실제 장곡의 수명 증거이며 실제 길이 혼합 20곡 세션을 대신 주장하지 않는다.

> **Activation contract (2026-08-06):** Radio DJ is inactive after cold boot,
> config restore, or Proactive restore. A session starts only from an explicit
> user play action or an LLM `skill_youtube_bgm` call with `action=play` and
> `mode=radio_dj`. Automatic transitions described below are permitted only
> inside that already-authorized active session. Proactive is not media consent.
