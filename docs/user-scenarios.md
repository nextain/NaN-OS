# 사용자 시나리오 (P01) + 테스트 커버리지 맵 — 2단계 산출물

> **현재 Windows 로컬 표현 시나리오:** GPU 감지는 온보딩에서 로컬 음성 사용 가능성만 안내하며 프로파일을 자동 활성화하지 않는다. 사용자는 이후 음성 설정에서 로컬 음성과 레퍼런스 음성을 선택한다. 사전 생성 NVA 외모는 GPU 프로파일과 독립적으로 선택한다. 과거 8GB 서버 렌더링 NVA 기록은 [`windows-8gb-nva.md`](windows-8gb-nva.md)에 보존한다.

`[Phase 03·04 (P01 시나리오 + P02 테스트맵)]`

> 추적: 1단계 `STRUCTURE.md` v5 → 2단계 P01. **상태: 완전성 수렴(13R, 3연속 NONE). foundation tranche 순서 = 아이디어 수준 잠정안(F0→…→V2, 실행 시 재검토). G1 게이트 아님.**
> 완전성 추이: 초안 46 → 누락 발견·추가 R1~R10(ADK부트스트랩·비용·업데이트·공지·비전캡처·@멘션·Issues·AppBar·botmadang·ref오디오·Lab동기화·deeplink·**default-skills 60+ 컬렉션**·메모리백업) → R11~R13 3연속 NONE. 앱 표면 ≈ S01~S71(+S52b) + 브라우저/워크스페이스/default-skills 그룹. 분포/OS(S68/69)=범위 밖.
> 원칙: 시나리오는 *발명*이 아니라 old-naia-os **실제 기능**에서 도출(built-in skills 25·패널 6·멀티채널). 각 UC = 인지흐름 경로 + 관통 슬라이스/포트.
> 용어 = `glossary.md`.

## 분류축 — 인지흐름 관통 (감각→지각→경험→사고→표현/행위)

UC 를 인지흐름이 *어디까지 도는가*로 묶는다(기능 나열 ❌). vertical(5단계) 후보 = 흐름을 가장 많이 관통하는 UC.

| UC | 시나리오 (실제 기능) | 인지흐름 경로 | 관통 슬라이스/포트 |
|---|---|---|---|
| **UC1 텍스트 대화** | ChatPanel 에 입력→응답 | Chat(ingress) → 사고(llm) → 표현(speech-intent) | ChatPort·llm·ExpressionPort |
| **UC2 음성 대화** | wake→말하기→음성응답+아바타 | 감각(audio→STT) → 지각 → 사고 → 표현(음성+emote) | SensoryPort·voice(provider)·affect·ExpressionPort(avatar) |
| **UC3 기억하는 대화** ★ | "지난번 그거 기억해?" | 감각/Chat → 지각 → **장기기억 recall** → 사고 → 표현 | memory(naia-memory)·conversation·llm |
| **UC4 경험→능동 회상** ★ | 기념일·시간 앵커에 naia가 *먼저* 말 검 | (시간 trigger) → 장기기억 → 동기 → 표현 | temporal(cron)·memory·motivation·ExpressionPort |
| **UC5 도구 사용** | 날씨·시간·웹검색·github | Chat → 사고(의도) → 능력·도구(skill/mcp) → 표현 | ChatPort·skill·mcp/gateway·ExpressionPort |
| **UC6 환경 조작-브라우저** | "이거 찾아서 눌러줘" | Chat → 사고 → **환경 행위**(browser navigate/click) + 관측 | EnvironmentPort(app-surface)·skill |
| **UC7a 시스템 관측(read-only)** | 파일/프로세스 *상태 조회*(변경 X) | Chat → 사고 → 환경 관측 | EnvironmentPort(host-system) observe |
| **UC7 시스템 조작(mutating)** | 파일 편집·명령 실행 + **결과 관측**(reafference) | Chat → 사고 → 환경 행위 → observed→mismatch | EnvironmentPort(host-system) + reafference |
| **UC8 공간 분위기** | "음악 틀어줘"(BGM) | Chat → 사고 → 환경 변경(space) + 관측(BGM context) | EnvironmentPort(space)·youtube-bgm skill |
| **UC9 앱** | 앱 설치→그 앱 스킬 사용 | Chat → 능력(panel install) → 환경(app-surface tool) | skill(panel)·EnvironmentPort.app-surface |
| **UC10 멀티 채널(기본)** | discord/slack 에서 naia 응답 — **단일 active owner(동시 점유 없음)**. 동시성·충돌 중재 = UC10a | (채널 ingress) → 사고 → 표현(채널) | gateway·channels |
| **UC11 자기상태 인지** | "너 지금 상태 어때?"(system-status/진단) | **내수용**(시스템 상태) → 지각 → 표현 | InteroceptivePort·system-status·ExpressionPort |
| **UC12-min 최소 부팅 설정** | naia-adk workspace init(**외부 키 없이** 부팅 가능분) | (control-plane init) | control-plane·config |
| **UC12 전체 온보딩/설정** | wizard + 모델/provider + naia 계정/api key | (control-plane: 설정·신원·외부 auth) | control-plane(session)·config |
| **UC13 승인 게이트** | 위험 행위 전 사용자 승인 | 사고 → **승인**(규범) → 행위 | ApprovalPort·control-plane |
| **UC13a 실행 중 중단/취소/e-stop** (신규) | 돌아가는 browser/pty/system 작업을 끊음·회수 | (저지연) 중단·lease revoke·강등 | **SafetyPort**(≠Approval)·reactive path |
| **UC10a 다중 클라이언트 점유 충돌** (신규) | Discord·로컬 UI 동시 명령 → owner·lease·handoff·revoke | (control-plane 중재) | ClientSessionPort(lease/arbitration) |
| **UC12a 설정 검증** (UC11/14 **facet, 독립 UC 아님** — F1 흡수) | "키 저장됨"이 아니라 *provider/계정 연결 상태를 자기상태에서 관측* | 내수용 → 진단 | InteroceptivePort·system-status |
| **UC14 graceful degradation** (신규) ★ | **현 설정된 것의 degradation 감지·보고**(read-only) — F1=미설정·시스템 이상, *UC12 후 자동 확장*=외부 인증/키 깨짐(Discord). *대체(fallback)=후속 tranche*(행위라 밖) | 내수용(실패 감지)→지각→표현(정직 보고) | InteroceptivePort·ExpressionPort |
| **UC17 자유·연속 발화 전달** | agent가 사용자 요청 또는 내부 trigger로 여러 발화를 이어 보내면 셸이 session stream을 구독해 기존 채팅·TTS·취소 경로로 표현 | 사고(agent activity) → gRPC stream → 표현(text/TTS/avatar) → 끼어들기 | Agent gRPC client·ExpressionPort·SafetyPort(cancel) |

UC15 제품 수용 확장(#84):

- DJ 사용자는 설정에서 profile·간격·날씨 위치/동의와 전시 knowledgeScope를 관리한다. 잘못된 timezone,
  부분/범위 밖 좌표, 빈 전시 scope는 시작하지 않으며 동의 철회 뒤 좌표를 보내지 않는다(PA-DJ-04).
- `DJ 좋아요/싫어요/취향 삭제:`는 다음 런타임까지 명시 취향으로 남고, `DJ 상태:`는 같은 세션 6시간만
  추천에 쓰인다. 일반 대화나 청취 시간으로 취향·기분을 추론하지 않는다(PA-DJ-01/02).
- 선제 DJ 텍스트는 지원 TTS 경로별로 실제 재생을 시작한다. 8개 멘트가 반복되지 않고, 5개 제어와 ordinary
  chat 끼어들기는 현재 음성을 먼저 끊고 이전 generation의 늦은 출력을 버린다(PA-DJ-03/05).
- 8시간 상당 운용에도 BGM/controller 하나와 bounded lease를 유지하고 stop 경계 뒤 추가 호출이 없다(PA-DJ-06).
- 전시는 유효 KB scope로만 시작한다. 질문이 소개를 중단하고 source 답변 뒤 미소개 항목으로 복귀하며,
  quiet/restart/stop을 지킨다. memory/transcript/raw-content log는 남기지 않는다(PA-EX-01/02).

★ = naia 차별점(기억·경험·능동) — *기반 성숙 후* 별도 트랙(아래 순서 SoT).

> **우선순위 SoT = 아래 "Foundation tranche + vertical 순서"** (F0→F1→F2→F3 → V1·V2). UC3(기억)은 baseline 부재로 deferred. (인지흐름 관통 깊이는 *분류* 기준일 뿐, 착수 우선순위는 *기반 성숙도*가 결정.)

## Granular 시나리오 카탈로그 (전수 — 검증 여부 무관, 누락 금지)

> 원칙(루크 2026-06-08): **개발된 기능은 검증 여부와 무관하게 전부 시나리오로 enumerate.** 동작 여부(검증)는 *진행 중 Old-Baseline 측정* 또는 *루크 확인*으로 확정 — 내 추측으로 빼거나 deferred 안 함. "검증" 열 = **미측정**(측정/확인 예정)이 기본, 알려진 플래그만 표기(제외 아님).
> 13 UC = 인지흐름 분류 맵 / 아래 = 그 아래 실제 기능 단위(소스: 25 built-in skill + 6 패널 + provider/voice/채널). 각 행 = Old-Baseline 측정·이식·검증 단위.

| # | granular 시나리오 (소스) | UC 분류 | 슬라이스/포트 | 검증(측정/확인 예정) |
|---|---|---|---|---|
| S01 | 온보딩/welcome | UC12 | control-plane·config | 측정 |
| S02 | 설정 config / settings 패널 | UC12 | control-plane·config | 측정 |
| S03 | provider 설정(anthropic·openai·gemini·ollama·xai·zai·claude-code-cli·lab-proxy 각각) — **계정+비용 얽힘(복잡)** | UC12·UC1 | providers·control-plane | 측정(복잡) |
| S04 | naia 계정 / api key 설정 | UC12 | control-plane(entitlement·naia-token) | 측정 |
| S05 | sessions 관리 — **대화 transcript 영속/로드**(S05a write·S05b read, ↓note) | UC12·UC1 | session(control-plane)·ConversationLogPort·EnvironmentPort(storage) | ⚠️ **현 게이트웨이 directToolCall = new-core 死 → 재구현**(2026-06-18 transcript 트랙) |
| S06 | agents 관리 | UC12 | control-plane·skill | 측정 |
| S07 | skill-manager(스킬 설치·관리) | UC12·skill | skill | 측정 |
| S08 | notify-config(알림 설정) | UC12 | control-plane | 측정 |
| S09 | system-status(자기 상태) | UC11 | InteroceptivePort | 측정 |
| S10 | diagnostics(진단) | UC11 | InteroceptivePort | 측정 |
| S11 | device(디바이스 상태/제어) | UC11·UC7 | 로컬 | 측정 |
| S12 | approvals(승인 게이트) | UC13 | ApprovalPort | 측정 |
| S13 | 텍스트 대화(ChatPanel) | UC1 | ChatPort·llm·ExpressionPort | 측정 |
| S14 | omni 음성(naia-omni realtime) | UC2 | voice provider·ws | 측정(키/서버) |
| S15 | gemini-live 음성 | UC2 | voice provider·ws | 측정 |
| S16 | openai-realtime 음성 | UC2 | voice provider·ws | 측정 |
| S17 | tts | UC2 | ExpressionPort(speech) | 측정 |
| S18 | **voicewake(이름 불러 활성화)** | UC2 | SensoryPort·wake | ✓루크확인: OpenClaw 잔재·미검증(개발검증 X) |
| S19 | avatar 표현(VRM, AvatarCanvas) | UC2 | ExpressionPort | 측정 |
| S20 | time | UC5 | skill(temporal) | 측정 |
| S21 | weather | UC5 | skill(외부) | 측정 |
| S22 | memo(로컬 노트) | UC5 | skill(로컬 fs) | 측정 |
| S23 | github(skill_github) | UC5 | skill·mcp(외부 auth) | 측정 |
| S24 | obsidian(skill_obsidian) | UC5 | skill(로컬/외부) | 측정 |
| S25 | mcp 연결 | UC5 | mcp | 측정 |
| S26 | agent-browser(브라우저 조작) | UC6 | EnvironmentPort.app-surface | 측정 |
| S27 | browser 패널 | UC6 | EnvironmentPort.app-surface | 측정 |
| S28 | panel 설치(panel) | UC9 | skill·EnvironmentPort.app-surface | 측정 |
| S29 | generic-installed 패널 | UC9 | EnvironmentPort.app-surface | 측정 |
| S30 | sample-note 패널 | UC9 | EnvironmentPort.app-surface | ⚠️ App.tsx 에서 제거/미배선(완전성R12) — rejected 후보 |
| S31 | youtube-bgm | UC8 | EnvironmentPort.space | 측정(YouTube 변동) |
| S32 | 배경화면/scene | UC8 | EnvironmentPort.space | 측정 |
| S33 | workspace(fs·editor·filetree) | UC7 | EnvironmentPort.host-system | 측정 |
| S34 | terminal(pty) | UC7 | EnvironmentPort.host-system | 측정 |
| S35 | channels(채널 일반) | UC10 | gateway·channels | 측정 |
| S36 | naia-discord | UC10 | gateway·channels | ✓루크확인: 안 됨(앱 인증 만료 추정) |
| S37 | notify-discord | UC10 | channels | 측정(인증) |
| S38 | notify-google-chat | UC10 | channels | 측정(인증) |
| S39 | notify-slack | UC10 | channels | 측정(인증) |
| S41 | 기억 recall/주입(`<recalled_memories>`) | UC3 | memory·scrubber | ✓루크확인: store/recall 미배선(scrubber만) — 검증 필요·naia-memory 트랙 |
| S42 | 능동 회상(기념일/시간 앵커) | UC4 | memory·cron·motivation | ⚠️ **미배선(memory+cron) — 트랙 후** |
| S43 | **cron 작업 생성/실행** | (temporal) | cron·CronPort | ✓루크확인: 미배선(만들기로 함)·gateway 의존 |
| S44 | graceful degradation(설정 degradation 감지·보고) | UC14 | InteroceptivePort·ExpressionPort | 신설(F1) |
| S45 | 실행 중 중단/e-stop | UC13a | SafetyPort | 신설 |
| S46 | 다중 클라이언트 점유 충돌 | UC10a | ClientSessionPort | 신설 |
| S47 | **페르소나/personality**(config.persona·OnboardingWizard·system-prompt buildSystemPrompt) | UC12·표현 | control-plane·ExpressionPort | 측정 |
| S48 | **naia-adk 로컬 스킬 로딩·확장**(workspace_discover_skills·SKILL.md·gateway agent 실행) — *배선 시 로컬에서 가져와 확장* | skill | skill·EnvironmentPort | ⚠️ **배선 의존 — 확인** |
| S49 | STT 모델 관리(download/delete/list stt models) | UC2(음성 입력) | SensoryPort·adapter | 측정 |
| S50 | 오디오 출력 장치(list_audio_output_devices) | UC2 | 효과기(audio) | 측정 |
| S51 | gateway 운영(health·restart·reset·sync) | (control-plane) | control-plane·gateway | 측정 |
| S52 | memory facts CRUD(get_all/delete — tauri) | UC3 | memory(facts 표면) | ⚠️ facts 표면 존재 / recall 주입 미배선(S41) |
| S52b | 메모리 **백업/복원**(암호화 export/import, Settings 메모리 탭 Backup UI) | UC3 | memory | ⚠️ **UI disabled/ComingSoon**(완전성R7) |
| S53 | audit log(get_audit_log·stats) | (control-plane) | 메타인지·감사 | 측정 |
| S54 | OAuth/로그인·api key 검증(oauth_state·open_login·validate_api_key·write_agent_key) | UC12 | control-plane auth | 측정 |
| S55 | gateway 스킬: **web_search · x(트위터) · discord**(gateway-tier, gateway LLM agent 실행) | UC5·UC10 | gateway·tool-tiers | 측정 |
| S56 | (external 광고 tool: github·obsidian·notion·slack·spotify·trello·canvas·code_review 등 — gateway/mcp 경유) | UC5 | gateway·mcp | ⚠️ **실재 vs 광고-only 구분 = 측정** |
| S57 | **ADK 부트스트랩**(AdkSetupScreen: 기존 ADK 로드/clone·init/재생성/로그인 — inspect_adk_dir·clone_naia_adk·init_naia_settings·delete_naia_adk) | UC12 | control-plane·config | 측정 (완전성R1) |
| S58 | **비용 대시보드 + Naia Lab 잔액·충전**(CostDashboard `/v1/profile/balance`·billing 링크, ChatPanel 비용 배지) | UC12 | control-plane(billing/cost) | 측정 (완전성R1, 루크 "비용 관련") |
| S59 | **앱 업데이트 알림·설치**(UpdateBanner: checkForUpdate·install·다운로드) | (control-plane) | control-plane(updater) | 측정 (완전성R1) |
| S60 | **원격 공지 배너**(AnnouncementBanner: fetchUnreadAnnouncements·read/dismiss/details) | (control-plane/notify) | control-plane·gateway | 측정 (완전성R1) |
| S61 | **화면/패널 비전 캡처**(skill_tab_screenshot·capture.rs — 패널 viewport→PNG) = naia 시각 | UC11/UC6 | **SensoryPort(vision)** | 측정 (완전성R2) |
| S62 | 채팅 **@ 멘션** 파일/폴더 선택기(AtMentionPopover, workspace fuzzy 검색→삽입) | UC1 | ChatPort·workspace | 측정 (완전성R2) |
| S63 | 워크스페이스 **GitHub Issues 패널**(IssuesPanel, `gh issue list`) | UC5/UC7 | workspace group·skill(github) | 측정 (완전성R2) |
| S64 | **AppBar 브라우저 바로가기 관리**(URL shortcut 추가/삭제/재정렬/아이콘) | UC6 | browser group·UI | 측정 (완전성R2) |
| S65 | **botmadang 커뮤니티 연동**(botmadang.org: register·post_article·comment) — 기본 스킬·skill.json 매니페스트 | UC10/UC5 | skill·channels | **rejected(루크 결정 2026-06-09: 이식 제외)** — voice-server류, 카탈로그엔 rejected로 명시 |
| S66 | **참조 오디오 / voice clone**(RefAudioSection: 미리듣기·녹음/업로드·preset·삭제, `/v1/ref-audio`, mid-session 반영) = naia 음색 | UC2 | voice·ExpressionPort(timbre) | 측정 (완전성R4) |
| S67 | **Naia Lab 설정 동기화**(lab-sync: pull/push + 충돌 선택 다이얼로그, 로컬변경 자동 push) — 계정/비용과 별개 | UC12 | control-plane(settings sync) | 측정 (완전성R5) |
| S70 | 채팅 **절대경로 파일 deeplink**(chat-file-deeplink 버튼 → workspace 패널 openFile + 전환) | UC1/UC7 | ChatPort·workspace | 측정 (완전성R9) |
| **S71 번들 default-skills 컬렉션 (~60+, OpenClaw 출처)** = command-group (preload + SkillsTab 노출 + tool-bridge) | UC5 | skill·gateway | 측정 (완전성R10, **개별 스킬 per-skill 검증**) |

> **브라우저(S26/27) = command-group(~50)**: embed lifecycle·webview·navigate/click/fill/get_text/snapshot/screenshot/eval/press/scroll/forward-back/resize/show-hide/login/permission. **워크스페이스(S33) = command-group(~25)**: adk-server discover·skills discover·sessions·git·progress·file read/write·watch·classify·set-root·project-index. (이식 시 sub-capability 별 분해.)
> **S71 default-skills 전 목록 (~60+, OpenClaw 출처 — 누락 0, per-skill 검증)**: 1password·blogwatcher·blucli·bluebubbles·camsnap·clawhub·coding-agent·eightctl·food-order(json-only)·gemini·gh-issues·gifgrep·gog·goplaces·healthcheck·himalaya·mcporter·nano-banana-pro·nano-pdf·openai-image-gen·openai-whisper·openai-whisper-api·openhue·oracle·ordercli·sag·session-logs·sherpa-onnx-tts·skill-creator·songsee·sonoscli·summarize·tmux·video-frames·wacli·xurl. **darwin-only**: apple-notes·apple-reminders·bear-notes·imsg·model-usage·peekaboo·things-mac. (이식 단위 = default-skills preload/loader + 번들; 동작은 per-skill Old-Baseline 측정.)
> **분포/OS 레벨 (P01 앱 시나리오 범위 *밖* — 별도 배포 트랙, 완전성 기록용, 완전성R8)**: S68 Naia OS ISO 설치(라이브 USB→HD) · S69 persistent USB writer/update/status(naia-usb). = recipes/installer/os 패키징 레이어, 헥사고날 이식 슬라이스(agent+core+shell 앱) 밖. (앱 표면 자체는 R8=NONE.)
> 누락 0 목표. **검증 열 = 측정/루크 확인으로만**(추측 ✅ 금지). 우선 확인: S18(잔재✓)·S36(깨짐✓)·S41/43(미배선✓)·S42·S48·S52·S56.

> **S05 대화 transcript 영속/로드 (2026-06-18 transcript 트랙, V1-선행)**: 현 S05 = 죽은 게이트웨이 directToolCall(new-core fail-fast)에 의존 → verbatim 대화록 영속/로드 재구현.
> - **S05a WRITE(전두엽=agent)**: agent 가 각 turn 을 `{adkPath}/conversations/{sessionId}.jsonl` append(`ConversationLogPort`). 인지흐름 = 사고→표현 후 *경험 외재화/기록*. sessionId 배선(proto+domain+codec). (Phase2: 음성 turn = agent 경유 동일 기록.)
> - **S05b READ(shell, agent 독립 E1)**: HistoryTab 이 Rust IPC 로 conversations 직접 list/read/delete(**write 없음**). 죽은 directToolCall 대체.
> - **S05c 관계(비구현)**: transcript = UC3/S41 memory recall 원재료 + 멀티모달 잠재기억 substrate(`audioRef` 예약).
> - **검증(P02)**: agent write 계약(`conversation-log.contract.test.ts`: jsonl append·sessionId 격리·no-throw·CRLF) / shell read 계약(`conversation-store.test.ts`: 경계 가드·agent-down 빈목록) / 통합(`conversation-persistence.integration.test.ts`: 대화→재시작→복원 golden) + Playwright e2e(HistoryTab 복원)·e2e-tauri(Rust IPC adkPath 경계).

> **S72 워크스페이스 전환 설정 복원 (2026-06-24, 셸 feature)**: 워크스페이스(ADK path) 전환 시 그 워크스페이스의 정체성 설정(페르소나·이름·말투·locale·VRM·배경·BGM)이 복원돼야 한다. 현 버그 = 전환 핸들러(SettingsTab/WorkspaceCenterPanel)가 ADK 포인터(localStorage `naia-adk-path`)만 바꾸고 기존 localStorage `naia-config` 를 유지 → 페르소나/VRM 안 바뀜. 초기 설정(AdkSetupScreen)은 `readNaiaConfig` 로 복원하나 전환 경로만 누락(비대칭).
> - **S72a 복원(전환 핸들러)**: `setAdkPath` 후 config.json(persona/이름/말투/locale via `readNaiaConfig`) + ui-config.json(VRM/배경/BGM via `readNaiaUiConfig`) → localStorage `naia-config` 로 병합 복원 → reload. AdkSetupScreen 과 동형(비대칭 해소).
> - **S72b 저장 분리**: UI 정체성(vrmModel·backgroundImage·backgroundVideo·bgmTrack·customVrms·customBgs)을 워크스페이스별 `{adkPath}/naia-settings/ui-config.json` 에 저장. agent config.json 은 `stripForAgent` 유지(env 오염 방지) — UI키는 ui-config.json 으로만. persona/이름/말투/locale 은 기존 config.json(agent 도 소비).
> - **검증(P02)**: adk-store 계약(`writeNaiaUiConfig`/`readNaiaUiConfig` 분리·경계) + 복원 병합 계약(`applyWorkspaceConfigToLocal`: config.json+ui-config.json → naia-config) + e2e(워크스페이스 A→B 전환 시 VRM·persona 변경).

> **UC-CONFIG-SOT localStorage 는 adkPath 뿐, 설정 SoT = naia-settings/ (2026-07-15, 루크 원칙)**: 앱이 켜질 때 사용자가 보는 설정(페르소나·이름·말투·locale·모델·VRM·배경)은 **`naia-settings/config.json`·`ui-config.json` 이 유일한 진실(SoT)**이어야 한다. localStorage 는 오직 `naia-adk-path`(어느 ADK 를 볼지 = 부트스트랩 포인터)만 **권위**로 갖고, `naia-config` 는 파일에서 하이드레이트되는 **순수 렌더 캐시**(107곳 동기 `loadConfig()` 리더용, 권위 없음)일 뿐이다.
> - **현 버그(재현 100%)**: `naia-settings/config.json` 을 바꿔도 재기동마다 **스테일 localStorage 값이 이겨** 파일을 덮는다. 원인 = 부팅 병합 `App.tsx:367` 만 유일하게 `merged = { ...local, ...fileConfig, ...uiConfig }` 로 **local 을 base** 로 쓴다(워크스페이스 전환 `adk-store.ts:413` 은 이미 파일만 base = 정답). ① `readNaiaConfig()` 가 null/부분 config 면 `fileConfig.persona` 부재 → 스테일 `local.persona` 가 스프레드에서 살아남음. ② `App.tsx:457` `syncConfigToFile()` 이 하이드레이션 전 스테일 localStorage 를 800ms 디바운스로 **config.json 에 되씀**(persona 는 strip 대상 아님) → 영구화.
> - **S-CONFIG-SOT-1 부팅 병합 = 파일 우선**: 부팅 병합에서 `...local` 제거 → `merged = { ...(fileConfig ?? {}), ...(uiConfig ?? {}) }`. 부트스트랩 키(`workspaceRoot`/adkPath·`onboardingComplete`)만 명시 보존. `if(!fileConfig && !uiConfig) return`(read 실패 시 캐시 wipe 방지). `applyWorkspaceConfigToLocal`(전환)과 **동형**(부팅↔전환 비대칭 해소).
> - **S-CONFIG-SOT-2 되쓰기 순서(레이스 차단)**: `syncConfigToFile()` 은 파일→localStorage 하이드레이션 **완료 후에만** 실행(hydrated 플래그 게이트). 하이드레이션 전 스테일 되쓰기 금지. stale-URL 대비 sync 는 하이드레이트 **후** 재실행으로 충족. **AdkSetup 화면 분기에서도 게이트 선개방 금지**(FR-CONFIG-SOT.5, 2026-07-16 실측 클로버). 실 UI 검증 = `e2e/config-sot-boot.spec.ts`(하이드레이션·무클로버·읽기지연 경쟁 3계약).
> - **S-CONFIG-SOT-3 무회귀**: `stripForAgent`·키체인 **무변경**. 107곳 동기 `loadConfig()` 리더 **무변경**(캐시는 유지, 권위만 박탈).
> - **S-CONFIG-SOT-4 UI 설정 SoT 완성 (2026-07-15 회귀 대응)**: 부팅 병합이 파일 우선(`...local` 제거)이 되면, **파일에 SoT 가 없는 키는 매 부팅 기본값으로 리셋된다.** 실제 회귀: 로컬 보이스 호스트(`vllmTtsHost`)가 저장 안 됨 — `UI_ONLY_CONFIG_KEYS`(config.json 에서 strip)이면서 `UI_IDENTITY_KEYS`(ui-config.json 저장 대상, 9개뿐)에 없어 **어느 파일에도 SoT 가 없었다**(localStorage 가 유일 저장소였는데 S-CONFIG-SOT-1 이 그걸 무력화). 따라서 **config.json 에서 빼는 UI 키 = ui-config.json 에 넣는 키**가 정확히 일치해야 한다. `extractUiConfig` 가 `UI_IDENTITY_KEYS`(9개) 대신 `UI_ONLY_CONFIG_KEYS`(전체: theme·panelPosition·vllmTtsHost·ttsProvider·liveProvider·bgmVolume 등)를 뽑도록 확장 → 모든 UI 설정이 ui-config.json 에 저장/로딩. read(`readNaiaUiConfig`)·병합(`mergeBootConfig`/`applyWorkspaceConfigToLocal` 의 `{...file, ...ui}`)은 이미 통짜라 대칭 자동 완성.
> - **S-CONFIG-SOT-5 중단 안전 저장 (2026-07-31 재부팅 조사)**: Shell이 `config.json`을 저장하는 도중 프로세스 종료·재부팅·동시 저장이 발생해도 독자는 이전 JSON 또는 새 JSON 중 하나만 읽어야 한다. 저장 전 JSON 객체를 검증하고, 같은 디렉터리의 임시 파일에 UTF-8 전체를 기록·동기화한 뒤 원자적으로 교체한다. 잘못된 JSON이나 기록 실패는 기존 파일을 보존한다.
> - **검증(P02)**: 부팅 병합 계약(스테일 localStorage persona 를 config.json 이 덮는가) + 되쓰기 게이트 계약(하이드레이션 전 `writeNaiaConfig` 호출 없음) + Rust 원자 저장 계약(UTF-8 한국어 왕복·기존 파일 교체·잘못된 JSON 입력 시 기존 파일 보존) + e2e-tauri(config.json=나이아 / localStorage=알파 → 부팅 → 나이아 유지, config.json 미오염).

### 왜 전수인가 — fault isolation (루크 2026-06-09)

혼자 개발 → **다 작동한다는 보장 없음.** 목표는 "전부 검증"이 아니라 **구조적 이식으로 고장을 가두는 것**: 각 기능이 자기 slice/port 경계에 들어가면, 깨진 기능(Discord·cron·memory recall…)이 *그 슬라이스에 격리*되어 다른 영역으로 안 번진다. 전수 enumerate = 각 기능에 구조적 슬롯을 줘 *고장 전파 차단* + UC11 자기상태가 *어디가 깨졌는지 표면화*. (검증은 그 위에서 점진.)

## 셸 feature 시나리오 (V-tranche 외 · 사용자 우선순위 — 2026-06)

foundation UC 카탈로그와 직교하는 셸 feature(S72 선례). 각 시나리오는 **계약(단위) + 통합(셸 vitest)** 으로 검증, 라이브 네트워크/하드웨어 왕복은 검증 천장(실 앱·GPU) 명시.

| 시나리오 | 사용자 경험 | 인지/레이어 | 검증(P02) |
|---|---|---|---|
| **S-TTS** (#363) | omni 아닌 모델로 음성 대화 시 **소리가 난다**(edge/google/nextain/openai/elevenlabs). 기본 edge 가 무음이면 browser 폴백 | 표현(speech) — 셸이 합성(agent 우회) | `synthesize.test.ts`·`edge-tts.test.ts`·셸 vitest. ⚠️ 라이브 합성=실 앱(naiaKey) |
| **S-CAP** (#365) | 모델을 고르면 그 모델 **능력에 맞춰 설정이 전개**(omni→STT/TTS 슬롯 숨김, 텍스트→노출). gateway 가 능력 선언 | 제어면(설정) — capability manifest 도출 | `test_models.py`·`capability-fetch.test.ts`·`slots.test.ts`. ⚠️ 라이브 /v1/models=게이트웨이 배포 |
| **S-VRAM** (#2) | 내 GPU VRAM 을 감지해 **로컬에서 돌릴 수 있는 tier**(아바타·음성)를 보여주고 선택. opt-in 시 외부 슬롯 대신 로컬 | 제어면(설정) — VRAM→capability 브리지 | `vram-tiers.test.ts`. ⚠️ 실 VRAM 감지=실 GPU, 로컬 serving=windows-manager 로더(DEFER) |
| **S-SLOT** (#gate-slots, 신규 — 2026-06-28) | 설정이 **naia 계정 게이트 → 6 클라우드 슬롯(LLM main·LLM sub·embedding·STT·TTS·video avatar) 각각 독립 설정** 순서로 전개. naia 계정 시 Gemini 기본값 자동 적용. 구 engine/ai/models/memory 분산을 통합해 "설정 헷갈림" 해소. **Naia는 provider가 아닌 접근 유형(게이트)**. local 런타임(cascade)은 별도 "naia-omni local setting" 영역(wm 연동, **DEFER**). legacy 고정 VRAM tier는 R2-3으로 폐기 → capability 토글+VRAM 예산(설계 P1.4) | 제어면(설정) — 게이트+슬롯 모델 | `settings-slots.contract.test.ts`(신규)·`settings-tab.test.ts`·`onboarding-fresh.spec.ts` + Playwright E2E(게이트→클라우드 슬롯 흐름). ⚠️ 로컬 설정 영역(1.2b)·통합 VRAM(1.4)=wm 언블록 후 |
| **S-EMBKO** (한글 오프라인 임베딩, FR-SLOT.6 — 2026-07-15) | 한국어 사용자가 기억(memory) 임베딩을 **CPU 오프라인**으로 돌릴 때, 영어 전용(all-MiniLM/all-mpnet) 대신 **다국어(한국어) 모델을 선택**할 수 있다 — offline 모델 선택지에 `multilingual-e5-large`(1024d) 추가. 백엔드 naia-memory `OfflineEmbeddingProvider` 가 이미 지원(e5 query/passage 프리픽스·`device=cpu` 존중) → **셸이 노출만**(백엔드 무변경, 경계 준수). 기본값 무변경(선택지로만) | 제어면(설정) — 임베딩 슬롯 한글 모델 노출 | `settings-slots.contract.test.ts`(offline 모델 union·roundtrip). ⚠️ 실 다운로드/한글 회상=수동 프리페치 검증(부스 전, 2026-07-16) |
| **S-VREC** (#2 후속, FR-VRAM.4 — 2026-06-30) | GPU 프로파일(VRAM)을 정하면 **그 예산 안에서 각 슬롯에 로컬 추천이 보인다** — 두뇌 탭 GPU 프로파일 아래 추천 요약, 음성/아바타/메인 셀렉터의 추천 옵션 배지, 프로파일 슬롯 개요 배지, 온보딩에도 추천 표시. **외부 슬롯은 숨기지 않고 추천만**(선택·확인은 사용자) | 제어면(설정) — VRAM 예산→슬롯 추천 | `tier-slots.test.ts`(6/6). ⚠️ 실제 로컬 기동=Round 2(wm 로더, DEFER) |
| **S-VOICE** (FR-VOICE — 2026-06-30) | naia-local-voice(로컬 GPU 음성)를 고르면 **로컬 음성 호스트로 합성**(LLM 호스트 오용 수정). 로컬 엔진 미실행/미연결 시 **무료 음성으로 조용히 위장하지 않고** "로컬 음성 미가용"을 1회 명확히 알리고 무음. 음성 picker 채움 | 표현(speech) — 로컬 음성 정직화 | `synthesize.test.ts`(naia-local-voice host 라우팅 3건). ⚠️ 실제 합성 동작=로컬 cascade 기동(Round 2, DEFER) |
| **S-VOICE-MIGRATION** (#419, FR-VOICE.13 — 2026-08-13) | 과거 버전의 로컬 GPU 프로파일 설정(`localGpuTier`)이 남은 채 업그레이드하면 안전 마이그레이션이 로컬 음성 권한을 끄는데, 사용자는 **왜 꺼졌는지 설정 Voice 카드에서 사유를 보고** 같은 자리의 복구 버튼 한 번으로 로컬 음성을 다시 켠다. 사유 없는 침묵 비활성은 없다 — "고장"과 "정당한 꺼짐"이 화면에서 구분된다. | 제어면(설정 Voice 카드) — 마이그레이션 정직화 | `config.test.ts`(마이그레이션→notice 기록·재활성→notice 해제) + `SettingsTab.test.tsx`(notice 표시+복구 버튼) + `e2e/settings-slots.spec.ts`(폐기 필드 시드→사유 실 UI 노출) |
| **S-VOICE-READY** (#418, FR-VOICE.14~15 — 2026-08-13) | 로컬 음성이 선택된 상태에서 사용자는 "포트가 열렸다"가 아니라 **음성 엔진의 준비 신호(façade `/health` 의 TTS ready)** 를 기준으로 상태를 본다: 엔진 미실행이면 Voice Reference 영역이 침묵 대기·일반 네트워크 오류 대신 "엔진 실행 필요"를 명시하고 그 자리에서 시작할 수 있으며, 엔진이 떠 있지만 TTS 미가용이면 준비 중임을 안내한다. e2e/하니스 시드는 제품 config 스키마의 시드 빌더(`config-seed.ts`)에서 생성되어 폐기 필드가 하니스로 재유입되지 않는다(2026-08-11 voice-6g 하니스 사고 재발 방지). | 표현(설정 Voice Reference) + e2e 하니스 | `local-runtime.test.ts`(health 파싱·미도달 null) + `RefAudioSection.test.tsx`(엔진 미실행 명시 상태+시작 액션) + `config-seed.test.ts`(폐기 키 런타임 거부·마이그레이션 폐기 목록 일치) + Tauri 94 실측 `/health` |
| **S-SHELL-ISO** (#425, FR-SHELL-ISO.1 — 2026-08-13) | 개발자는 운영 설치본(Naia)을 켜 둔 채 개발 인스턴스(**Naia Dev**)를 동시에 실행한다. 두 앱은 설정·로그인·로컬 데이터를 서로 침범하지 않으며(별도 identifier + `~/.naia-dev`), 단일 GPU 음성 런타임(VoxCPM2 :8910)은 **공유**한다 — 나중에 뜬 인스턴스가 건강한 엔진을 죽이고 재스폰하는 대신 입양해 그대로 쓴다(상대 인스턴스의 발화 절단·GPU 이중 적재 방지). 뇌(naia-agent)는 인스턴스별 자식 프로세스로 비공유. | 개발 워크플로 + Windows lifecycle + 공유 GPU 표현 | Rust 단위 2건(홈 오버라이드·입양 계약) + `local-runtime.test.ts` 입양 페이로드 핀 + 실기 동시 실행 스모크(운영 발화 중 dev 기동 → 발화 무절단, 수동 1회) |
| **S-VOICE-AVATAR** (FR-VOICE.5 — #397 갱신) | Windows 8GB 프로파일은 LLM을 외부(Naia 계정·원격 Ollama·외부 API)에 유지한다. 로컬 표현은 VoxCPM2 W8A16 + TensorRT LocDiT 음성을 재생하고 **같은 WAV를 Ditto TensorRT-native `/stream`에 직렬 전달**해 립싱크한다. 음성 서버 미가용이면 NVA idle을 유지하고 1회 알림+무음 원칙을 따른다. | 표현(speech+avatar) — 외부 두뇌와 GPU 표현의 half-duplex 결합점 | `synthesize.test.ts` · `cascade-renderer.test.ts` · 실제 :8910→:8901/:8902 façade probe · Tauri 94 NVA 출력/발화 |
| **UC-WIN-NVA-8G** (#397·#413, FR-CASCADE.9~14 — 2026-08-02) | Windows의 **지원되는 NVIDIA GPU, VRAM 8GB 이상** PC에서 Naia 계정의 외부 LLM(원격 Ollama 또는 외부 API)을 그대로 사용하면서 로컬 음성과 NVA 비디오 아바타를 실행한다. 프로파일 UI는 CUDA·INT8·TensorRT·VoxCPM2·Ditto 같은 구현명을 노출하지 않는다. 프로파일은 LLM provider/model/host를 바꾸거나 로컬 Ollama·NPU를 설치/기동하지 않는다. 보안 저장소의 Naia 로그인은 재시작 뒤 NVA 렌더와 회원 manifest에 복원되며, 일반 설정 동기화가 이를 로그아웃으로 덮지 않는다. 8GB 미만 또는 VRAM 미확인 상태에서는 NVA 선택·자동기동·재시작 복원을 모두 막고 VRM으로 안전하게 복귀한다. 초기화가 느리거나 실패해도 NVA Player는 idle 화면을 먼저 표시한다. 실시간 속도는 지원 조건이 아니다. | 제어면(온보딩·프로파일·두뇌·아바타) + 표현(NVA Player) + Windows lifecycle | secure-store App 회귀 · `adk-store.test.ts` manifest 재덮기 회귀 · `VideoAvatarCanvas.test.tsx` · `vram-tiers.test.ts` · `nva-gate.test.ts` · `SettingsTab.test.tsx` · 실제 `tauri:dev` manifest/8910 health/NVA 캡처 |
| **UC-WIN-VOICE-6G** (#406, FR-CASCADE.20~22 — 2026-08-01) | 등록 후 Naia에 로그인한 사용자는 Windows NVIDIA RTX VRAM 6GB 이상 PC에서 기존 Naia 계정 LLM·원격 Ollama·외부 API 설정을 유지하면서 로컬 VoxCPM2 W8A16 + TensorRT LocDiT 음성을 사용한다. Shell은 3D VRM을 유지하며 Ditto/NVA/로컬 LLM/Ollama/NPU/STT를 시작하지 않는다. 로그아웃 또는 VRAM 미달이면 profile/manifest/IPC가 모두 fail-closed다. 첫 기동이 느려도 기능 대상이지만 실시간 속도와 실제 6GB cold boot는 측정 전 보장하지 않는다. 실제 화면 검증 자산은 `naia-settings/vrm-files/01-OL_Woman.vrm`이며 SHA-256으로 동일성을 고정한다. | 설정 프로파일 + 외부 대화 + 로컬 TTS + VRM + Windows lifecycle | `vram-tiers` · `tier-slots` · `config` · `slots-manifest` · Settings Playwright · Rust account/VRAM/install tests · manager profile/manifest/launch tests · labs CPU-quantization tests · 실제 Tauri Shell voice/VRM probe |
| **UC-SHELL-RECOVERY** (#406, FR-RUNTIME.1/FR-VOICE.10/FR-SETTINGS.1 — 2026-08-01) | 통합테스트 뒤 일반 `pnpm run tauri:dev`를 실행해도 Shell은 실제 ADK와 Naia 계정의 외부 LLM을 로드해 대답한다. 로컬 음성 목록은 파일명 대신 사람이 읽을 수 있는 이름을 보이며, 준비되지 않은 Connections 설정에는 들어갈 수 없다. | 일반 개발 실행 + 외부 LLM + 로컬 음성 설정 | 환경 scrub·E2E sentinel·path-cache 격리 단위, Settings/RefAudio FE, 실제 Tauri `SetWorkspace loaded=true`와 채팅 응답 |
| **UC-WIN-VOICE-CONTINUOUS** (FR-VOICE.11~12 — 2026-08-01) | 여러 문장 답변에서 첫 문장만 들리고 나머지가 `429 busy`로 사라지지 않는다. 첫 문장을 생성한 뒤 다음 문장을 한 개씩 준비하며, 생성이 재생보다 느릴 때는 한 문장을 더 버퍼링해 문장 사이의 무음을 줄인다. 사용자가 음성으로 끼어들어 앞 발화를 끊었을 때도 서버에 남은 이전 GPU 작업이 끝날 때까지 새 첫 문장을 제한적으로 재시도해 무음 응답으로 버리지 않는다. | Windows 6GB VoxCPM2 + Shell VRM 연속 발화 | ChatArea/AudioQueue 단위 + synthesize busy retry/abort + 실제 façade 연속·겹침 로그에서 최종 200 |
| **UC-WIN-NVA-LATENCY** ([alpha-adk #14](https://github.com/nextain/alpha-adk/issues/14), REQ-051, FR-CASCADE.15~19 — 2026-07-31) | 같은 외부 LLM 대화 경로에서 사용자는 요청이 겹쳐도 숨은 GPU 대기열 때문에 앞선 발화까지 느려지지 않는다. 사용자가 발화를 중단하면 Shell의 미디어 요청과 Ditto 작업이 종료되고 NVA idle로 돌아간다. 성능 판정은 같은 텍스트·음성지문·NVA·warm 상태에서 요청→첫 오디오, 첫 미디어 바이트, 첫 Shell 발화 프레임, 전체 완료, A/V 종료차, 취소 회수 시간을 전후 비교한다. 완성 A/V 응답 캐시는 사용하지 않는다. | Shell MSE/취소 + cascade 스트림 수명 + Ditto TRT 역압력 + manager 실행 환경 | P02: labs `test_render_admission.py`(첫 요청·동시 429·해제), manager `test_service_plan.py`(렌더 크기), Shell `cascade-renderer` 단위/FE(AbortSignal·MSE 조기 재생), cascade adapter 취소 테스트, Tauri 94 실제 NVA 계측 |
| **UC-WIN-NVA-TTS-SYNC** (FR-VOICE.8~9 — 2026-08-01) | TTS를 켠 사용자가 메시지를 보내면 Shell은 `생각 중 → 음성 처리 중 → 렌더 중`을 현재 언어로 보여 준다. 답변은 대화 기록에는 보존되지만 실제 음성/영상 재생 전에는 화면에 미리 나타나지 않는다. Ditto video가 `playing`에 들어가 음소거가 풀릴 때 해당 문장이 표시되며, ESC·새 발화·합성 실패에서도 이전 답변이나 상태가 늦게 되살아나지 않는다. 느린 처리 중에도 화면이 멈춘 것처럼 보이지 않아야 한다. | ChatArea visual mask + AudioQueue/Cascade playback callback + 14-locale i18n + GPU single-flight | `ChatArea.test.tsx` 완료 전환 flicker/CJK/실패/ESC · `i18n-output-stage.test.ts` · Tauri 94 실제 4060: render 중 텍스트 0, video playing 후 4.6ms reveal, TTS/stream 200 |
| **UC-VRM-EXPRESSION** ([#361](https://github.com/nextain/naia-shell/issues/361)·[#422](https://github.com/nextain/naia-shell/issues/422), FR-AVATAR.1) | Naia 전용 VRM 1.0을 선택한 사용자가 TTS 응답을 들으면 텍스처 전환형 `aa/ih/ou/ee/oh` 입모양이 한 번에 하나씩 모두 나타나고, 발화 종료·중단 시 입이 즉시 닫힌다. 생각 신호에는 외주 모델의 custom `think` 표정을 사용한다. 이 경로는 실제 음소 동기화가 아닌 발화 상태 기반 5모음 시뮬레이션이며, 전신 동작은 별도 VRMA 클립이 제공된 경우에만 가능하다. | UC2/S19 ExpressionPort(VRM) | `mouth.test.ts` 5모음·binary/continuous·VRM 0.0·정지, `expression.test.ts` think 우선·fallback, 외주 VRM 메타데이터 실측 |
| **UC-VRM-ACTIVE-EXPRESSION** ([#423](https://github.com/nextain/naia-shell/issues/423), FR-AVATAR.2) | 사용자가 질문하면 Naia가 대기 중 custom `think` 표정을 보이고, 응답의 명시적 감정 표정과 실제 음성 발화 5모음 입모양을 함께 사용한다. 감정은 마지막 음성이 끝날 때까지 유지되고 취소·중단·오류 시 neutral로 안전하게 돌아온다. 외주 파일의 blink·lookAt·hair springBone과 외부 idle VRMA는 계속 동작하되, 파일에 없는 전신 감정 모션은 실행하지 않는다. | UC2/S19 ExpressionPort(VRM) + audio playback lifecycle | `ChatArea.test.tsx` request/emotion/TTS/interrupt, `pipeline-voice.spec.ts`, `mouth.test.ts`, `expression.test.ts`, `AvatarCanvas.tsx` load-time sync |
| **UC-WIN-NVA-8G evidence correction** | #397 supersedes the CPU/NPU Ollama brain clauses in S-VOICE-AVATAR and S-8G: the LLM remains external and only VoxCPM2 W8A16 + TensorRT LocDiT and TensorRT-native Ditto run locally. | Same surfaces as UC-WIN-NVA-8G. | Implemented automation: `VideoAvatarCanvas.test.tsx` (idle/start failure/retry/<8GB no-start), `capability-settings.spec.ts`, `settings-slots.spec.ts`, Rust `cascade_vram_requires_detected_nvidia_8gb_or_more`, windows-manager profile/manifest tests, and Tauri 94 real 4060 output path. Model-wide VoxCPM2 TensorRT and model-wide RTX compatibility gates remain follow-up work. |
| **S-BGM-SKILL** (UC8/FR-BGM.1 — 2026-07-16, 시연 크리티컬) | 사용자가 나이아에게 **"잔잔한 음악 틀어줘"** 라고 하면 나이아가 `skill_youtube_bgm` 도구로 BGM 위젯을 제어한다 — 검색(사이드카 :18791) 첫 결과 재생·정지·일시정지·재개·다음/이전(즐겨찾기)·볼륨. 구 monolith 의 내장 BGM 스킬이 new-core 이식에서 누락돼(위젯·사이드카·에이전트 UC8 어댑터는 있으나 **도구 등록 배선 0**) 나이아가 BGM 존재 자체를 몰랐던 갭 해소. 배선 = **패널(환경) 도구 경로**(E1 — agent 무변경): 부팅 등록 → `panel_tool_call` → 셸 실행 → 위젯이 이미 듣는 `bgm_youtube_*` 이벤트 | 환경(ambiance) — 위젯 도구화, 뇌 무변경 | `bgm-skill.test.ts`(액션 라우팅·검색→첫결과·볼륨 clamp·인자검증·이벤트 payload 형상) [단위] + **`e2e/bgm-skill.spec.ts`(실 UI 배선 회귀 가드: (A) 부팅 panel_skills 에 skill_youtube_bgm 등록 (B) 채팅 턴 panel_tool_call → BgmPlayer 실제 재생 `.bgm-icon--playing`)** — 단위테스트로 못 잡는 *배선 누락*(이번 회귀 유형)을 실 UI 로 고정. 실 음악 재생=부스 리허설(수동, 2026-07-16) |
| **S-CASCADE-HISTORICAL** (Round 2, 2026-06-30) | 과거 8GB 음성 단독/fp16 가정 기록. **현재 Windows 8GB 실행 계약이 아니다.** 현재는 `windows_trt_8g`가 VoxCPM2 W8A16 + TensorRT LocDiT와 Ditto를 함께 계획한다. | 이력 | 현재 시나리오는 UC-WIN-NVA-8G 참조 |
| **S-8G-HISTORICAL** (2026-07-08) | 과거 로컬 LLM/아바타/both 3모드와 8GB 음성 클라우드 전용 가정. **Windows `windows_trt_8g`에는 적용하지 않는다.** | 이력 | 현재 시나리오는 UC-WIN-NVA-8G 참조 |
| **S-CASCADE-T3** (BYO 원격 cascade, 2026-07-15) | 로그인 사용자가 직접 운영하거나 별도로 제공받은 Host URL을 입력한다. 이는 향후 Nextain cloud cascade와 별개이며 현재 cloud endpoint·entitlement·자동 폴백을 뜻하지 않는다. 명시한 Host가 로컬 façade보다 우선한다. | 제어면(설정) + 표시계면(NVA idle/발화) | `config.test.ts`·`capability-settings.spec.ts`·`nva-remote-idle.live.spec.ts` |
| **S-VN** (#ui-reorg, 신규 — 2026-06-29) | 홈(기본) 화면에서 naia와 **몰입형 VN 대화** — 전체화면 VRM 아바타 + 하단 넓은 대화박스(탭 없는 집중형). 좁게 떠 있던 채팅 패널 제거("대화 집중 안 됨" 해소) | 표현(셸 UI) — 단일 ChatPanel을 CSS로 재배치(variant=vn), 무리마운트 | `119-pty-terminal.spec.ts` T6(VN variant 노출). ⚠️ 미감=실 앱 |
| **S-WS4** (#ui-reorg) | 워크스페이스 진입 시 **4단 관제탑**: 대화창(좌 레일)·워크트리·문서뷰어(상)+터미널(하)·서브에이전트 리스트. 레일 접기·상하 비율 자유 리사이즈·터미널 탭/그리드 | 표현(셸 UI) — App.tsx `data-ui-mode` 파생 + WorkspaceCenterPanel center 상하분할 | T7(레일 variant)·T8(레일 접기 시 ChatPanel 무리마운트)·T9(문서뷰어/터미널 분할) + 91 18/18(무회귀) |
| **S-DOC** (#ui-reorg) | 대량 작업문서를 **탭으로 유지·전환**(문서 탭바)해 "터미널에서 문서 찾기 어려움" 해소. 서브에이전트 클릭 시 그 에이전트 최근문서가 탭으로 surface. Ctrl+P QuickOpen 유지 | 표현(셸 UI) — `openDocs` 상태 + DocTabBar | T10(세션 클릭→문서 탭 surface) + 91 S3/S6(에디터 무회귀) |
| **S-ASK** (#ui-reorg) | 터미널 출력의 파일경로 **클릭=문서뷰어에서 열기 / Alt+클릭=대화창에 AI 질의**. 문서 탭에도 AI 질의(✦) 버튼 | 표현(셸 UI) — Terminal link provider Alt 분기 + 기존 `naia:ask-ai` 재사용 | `Terminal.tsx` activate Alt 분기. ⚠️ xterm 링크 클릭=실 앱 |
| **S-INSTALL** (#377, FR-INSTALL — 2026-07-17) | 사용자가 **설치 파일을 받아 자기 OS(Windows/Linux/macOS)에 설치하고 첫 실행**한다 — Windows 는 NSIS(사용자 권한, 관리자 불요, **WSL 불요**) + MSI(관리자 설치 — WiX 표준), Linux 는 deb/rpm/AppImage, macOS 는 app/dmg(**arm64(Apple Silicon) 전용** · 미서명 — 우클릭 열기). Node 런타임이 3 OS 모두 동봉되어 **Node 미설치 머신에서도 에이전트가 뜬다**. 개발자는 clean checkout 에서 **명령 1개**로 자기 OS 의 설치 파일을 재현 빌드한다(수동 파일 배치 0). 플랫폼 차이(타깃·동봉 리소스·설치자 설정·기대 산출물)는 **매트릭스 데이터 1곳**이 정의하고, 스크립트는 OS 별 분리 없이 1개 | 배포(설치·첫 부팅) — 매트릭스→생성 conf, OS 분기=데이터 | `scripts/__tests__/platform-matrix.test.ts`(매트릭스 스키마 + conf 생성 golden, 3 OS) [단위] · `check-build-contract.mjs` PASS [계약] · **Windows 실측: 실 NSIS 무인 설치(/S) → 설치본 기동 — 핸드셰이크 AND `[Naia] node = ` 포함 줄이 최소 2줄 AND 전부 `$INSTDIR` 하위**(2조건, FR-INSTALL.4 — 빌드 머신엔 시스템 node 가 있어 기동만으론 번들 분기가 증명 안 됨. 개수 단언은 공허참 차단)(e2e-tauri `TAURI_BINARY` 설치 경로 지정) · **Linux: CI ubuntu job 이 deb 설치 → xvfb 기동 스모크 — 마커 `[Naia] agent-core gRPC @` **AND** node 줄 최소 2줄 **AND** 그 경로가 전부 설치본 resource_dir 하위**(R5: "PATH 에서 node 제거" 는 폐기 — 폴백이 PATH 무관하게 nvm 디렉토리를 직접 스캔하므로 번들 node 를 증명하지 못함. mutation probe 로 red 도 확인) — **Windows·Linux 양쪽 모두 판정 범위 = 마지막 `=== Session started ===` 포함 줄 이후**(`naia.log` 는 누적 파일) · macOS 실빌드 = CI(`build-installers.yml`) · **산출물 검증 스크립트 `scripts/verify-artifacts.mjs` 실행(빌드 머신 + CI 3 OS) + 부정(negative) 케이스 단위 테스트**(FR-INSTALL.6). ⚠️ mac = **arm64 전용**(CI `macos-latest` = arm64 러너, Intel 산출물 미제공 — 후속) + 실기기 설치 실측 미보유(정직 표기: 이번 완료선 = arm64 CI 빌드 성공) |

> **S-INSTALL #411·#412 보강(2026-08-02):** paired Agent와 로컬 의존 프로젝트의 pnpm 버전이
> 서로 달라도 스테이징은 각 `package.json#packageManager` 선언을 Corepack으로 실행한다.
> 설치·빌드·deploy는 비대화식 `CI=true`로 수행해 TTY 확인 대기나
> `ERR_PNPM_BAD_PM_VERSION` 없이 clean installer와 `tauri:dev`를 재현한다. 설치 스테이징과
> dev 시작은 하나의 package-manager resolver를 공유한다. 검증은 `package-manager.test.ts`,
> `platform-matrix.test.ts`와 실제 Windows NSIS/MSI 빌드·release/dev 시작 스모크다.

> 격리 라벨: S-VRAM 의 로컬 serving/auto-download = `unimplemented`(loader device RTF gate, private tier manifest). S-TTS/S-CAP 라이브 왕복 = 측정 천장(실 앱), 코드 결함 격리 아님.

> **UC-AV 과거 연구 기록 (2026-07-08~09):** 아래 8GB 3모드·음성 클라우드 전제는 Windows `windows_trt_8g`에 적용하지 않는다. T3 원격 URL 계약 등 독립 기능의 이력은 유지한다. 현재 Windows 시나리오는 UC-WIN-NVA-8G와 [`windows-8gb-nva.md`](windows-8gb-nva.md)를 따른다.
> - **UC-AV.1 8G 로컬 집중 3모드**: 8GB 사용자가 프로파일에서 로컬 집중 택1(로컬 LLM만 / 비디오 아바타만 / 둘 다) — 동시 구동 불가라 배타. 음성(VoxCPM2)은 8G 에선 **항상 클라우드**. 기본=llm(프라이버시). 수용기준: focus 셀렉터 3옵션 노출·resolveLocalCapabilities 배타 해소(llm→[llm]·avatar→[avatar]·both→[llm,avatar])·tts 로컬 제거. 검증(P02): `vram-tiers.test.ts`(resolveLocalCapabilities·normalizeLocal8gFocus)·wm `test_manifest.py`(focus 배타·voice→avatar 마이그레이션·비8G 무시·**tts_ 전체 스트립**)·`capability-settings.spec.ts` FR-5.
> - **UC-AV.2 VRAM 프리플라이트 강등(정직)**: free VRAM 부족 시 로컬 LLM→클라우드 강등 + 명확 경고(무료/로컬 위장 금지). ★실측: 8G both(llm 4.0 + avatar 2.6 = 6.6) > 프로덕션 budget(8 − margin 1.5 = 6.5) → **LLM 강등(아바타만 로컬)**. 수용기준: `llmFallbackToCloud=true` 시 `local-llm-vram-fallback` 배지. 검증: `vram-tiers.test.ts`(fit 폴백 + margin 1.5 fidelity)·`capability-settings.spec.ts`(fallback 배지).
> - **UC-AV.3 아바타 cascade capability 게이트**: 비디오 아바타는 로컬 avatar 제공(또는 naia 로그인) 없으면 선택 불가 + 안내(`avatar-cascade-required`). 검증: `capability-settings.spec.ts` FR-7(게이트·로그아웃 교차).
> - **UC-AV.4 립싱크 노트**: 비디오 아바타 선택 + TTS off → "립싱크엔 TTS 필요" 경고(`nva-lipsync-note`). 8G avatar 모드=음성 클라우드라 TTS 필수 안내. 검증: `capability-settings.spec.ts` FR-6.
> - **UC-AV.5 T1 로컬 네이티브 cascade auto-spawn**: wm `loader launch` → 파사드 :8910 + VRAM 예산 내 서비스(Ditto TRT :8902 / VoxCPM2 :8901) spawn·감독, stdout `CASCADE_READY {json}` 핸드셰이크, 자식 사망 시 teardown. **★실증 2026-07-09 (이 RTX 4060 8GB)**: 3서비스 완전 spawn·`CASCADE_READY`·full 모드 — Ditto TRT SDK ready 7.7s(tensorrt-native)·VoxCPM2 int8 CUDA bfloat16 로드·파사드 `avatar_enabled+tts_enabled`. naia-shell 앱 자체 launch 도 파사드 기동 확인. 검증: wm `test_launcher.py`·`test_service_plan.py`·loader plan/launch 실행·naia-shell Rust `start_cascade`. ⚠️ **얼굴 프레임 렌더 = NVA 캐릭터 번들 로드(/load_nva=추출 dir) 후**(P4 통합, 앱이 캐릭터 config 로 처리) — measurement-gated(F1), 사용자 실기.
> - **UC-AV.6 T3 원격 cascade URL**: 로그인 사용자가 아바타 설정에서 NVA 선택 후 `cascadeRuntimeUrl`을 입력한다. URL은 http/https만 허용하고 정규화한다. 명시한 NVA Host가 로컬 파사드보다 우선하며 원격 장애 시 로컬 Ditto를 암묵 기동하지 않는다. 원격 뷰어는 `GET /health` 후 query 없는 `GET /idle` 전체 응답을 Blob URL로 반복 재생하며, `/load_nva.dir`이 서버 로컬 경로라는 계약 때문에 원격 서버에는 이를 호출하지 않는다.
> - **UC-AV.8 원격 NVA 결합 발화**: 명시한 원격 NVA Host가 있으면 응답 텍스트를 `/stream_text`로 보내고 서버가 mux한 VoxCPM2 음성+아바타 영상을 그대로 재생한다. 이 경로에서는 Shell의 별도 음성 호스트를 호출하거나 음성을 중복 재생하지 않는다. 배경 투명은 원격 cascade의 VP9 알파 출력이 활성일 때만 제공한다.
> - **UC-AV.7 voiceprint 불변(NFR)**: Naia가 VoxCPM2를 사용할 때 **음성지문(ref)은 필수**이며 무지문 합성을 허용하지 않는다. 이 원칙은 Windows 8GB 로컬 VoxCPM2 W8A16 + TensorRT LocDiT에도 적용된다. 검증: voiceprint guard와 façade `/ref/voices` 팔레트.

## S-RADIO-DJ — 개인 라디오 DJ·행사 소개 (Shell 기본 스킬, #362·#405)

| 시나리오 ID | 사용자 흐름 / 완료 조건 | 책임·검증 |
|---|---|---|
| **S-RADIO-DJ-1** | 사용자가 DJ 모드에서 곡을 요청하면 Shell은 `requested → loading → playing`의 실제 관측값, 곡 정보·길이·진행 위치를 반환한다. 곡 A 다음 곡 B로 바꾼 뒤 늦게 도착한 A 오류는 B의 상태나 소개를 바꾸지 않는다. | Shell 관측 사실: FR-RADIO-DJ.1~2. 로컬 fixture E2E: A→B→late A error. |
| **S-RADIO-DJ-2** | YouTube가 재생 불가·임베드 제한·로딩 시간초과이면 DJ는 재생 성공처럼 말하지 않는다. 자동재생 opt-in일 때만 대체곡을 한 번 시도하고, 그 외에는 한 번의 짧은 안내 또는 침묵으로 끝낸다. | Shell 오류 분류 + agent의 근거 있는 멘트: FR-RADIO-DJ.2·5. |
| **S-RADIO-DJ-3** | 연속 발화·DJ·행사 소개에서 agent가 다음 발화 전 Shell 관측값을 확인한다. 곡이 충분히 진행되지 않았거나 쿨다운 중이거나 사용자가 말하는 중이면 새 멘트와 TTS를 만들지 않는다. `speakPermit` 발급 뒤 사용자 발화/채팅이 시작하거나 재생 sequence가 바뀌면 permit을 폐기하고 DJ TTS는 0회여야 한다. | agent 소유 스케줄러, Shell의 단일 사용 permit·원자적 TTS 직전 재검증: FR-RADIO-DJ.3~4. |
| **S-RADIO-DJ-4** | 동의한 사용자에게만 유효한 IANA 시간대와 신선한 날씨 결과를 DJ/행사 맥락에 맞게 짧게 쓴다. 동의를 철회하면 원 좌표와 날씨 캐시가 폐기되고 이후 멘트에 날씨가 나오지 않는다. 잘못된 시간대는 정규화/시간 언급 비활성으로 관측 가능하게 처리하며, DST 경계도 일관되게 계산한다. | 최소 노출·TTL·정밀도·폐기·유효/무효 IANA·DST 검증: FR-RADIO-DJ.6~7. |
| **S-RADIO-DJ-5** | DJ가 곡 제목·아티스트·길이를 언급할 때는 현재 `playbackId`의 관측된 `playing` 결과에 근거한다. 명령 접수 성공만으로는 소개하지 않는다. 5초가 지난 `playing` 스냅샷이 `ended/error`로 바뀌면 재관측 뒤 소개·TTS를 하지 않는다. | 도구 결과→activity provenance·freshness 계약: FR-RADIO-DJ.1·5. |
| **S-RADIO-DJ-6** | CI는 외부 YouTube 의존 없이 로컬 iframe event fixture로 ready/playing/error/ended와 도구 결과·발화 조건을 검증한다. 실제 YouTube 검증은 부스/릴리스 전 선택적 smoke로 분리한다. | 결정론적 Tauri E2E + 선택적 smoke: FR-RADIO-DJ.7. |
| **S-RADIO-DJ-7** | 외부 LLM과 Windows 로컬 TRT를 함께 쓰는 개인 라디오에서 곡 A의 `playing`을 확인한 뒤 자동 DJ 문장을 만든다. 문장은 음성 준비 전에는 채팅에 노출하지 않고, VoxCPM2가 만든 같은 오디오를 Ditto에 보내 영상 재생이 시작될 때 표시한다. activity가 곡 B를 요청하면 현재 곡과 대기열을 교체하고 B의 `playing`을 확인한 뒤 한 번만 다시 말한다. 렌더 중 사용자가 Enter로 끼어들면 250ms 안에 현재 렌더를 취소하되 BGM은 유지한다. | 실제 Tauri + TRT NVA 통합: `94-avatar-4060-facade.spec.ts`; Shell #405, agent #103. 일반 채팅의 BGM 요청은 기존 대기열 의미를 유지한다. |

| **S-RADIO-DJ-8** | 사용자가 설정의 스킬 탭을 열면 `Youtube Radio DJ`가 시스템 스킬 다음이자 `memo` 바로 앞에 다른 기본 스킬과 같은 2열 카드로 보인다. 접힌 상태에는 짧은 설명만 표시되고, 카드를 누르면 대기시간·멘트 간격·시간대·BGM 자동재생 상세 설정이 펼쳐진다. 처음 열어도 숫자 입력이 비어 있지 않으며 자동 발화는 사용자가 켜기 전까지 시작하지 않는다. | FR-RADIO-DJ.9. Settings RTL + `settings-slots.spec.ts` Playwright. |
| **S-RADIO-DJ-9** | 사용자가 어느 언어로든 “계속 음악을 골라 소개해 줘”처럼 유사한 뜻을 말하면 LLM이 `radio_dj` 모드를 선택해 음악 재생과 능동 발화를 함께 켠다. 단순히 한 곡이나 BGM을 요청하면 `player`로 실행되어 능동 발화 설정을 바꾸지 않는다. | FR-RADIO-DJ.10. 키워드 매칭 없이 스킬 schema와 구조화 `mode` 호출 검증. |
| **S-RADIO-DJ-10** | 곡이 끝나기 전에 최근곡·싫어요·실패 후보를 제외해 비슷한 다음 곡을 미리 찾고, 실제 종료 뒤 짧은 멘트와 함께 전환한다. 새 곡은 실제 `playing` 뒤에만 소개한다. | FR-RADIO-DJ.11·14·16. 결정론적 종료/검색 fixture + 실제 YouTube 실기. |
| **S-RADIO-DJ-11** | 재생 중 일반 대화는 음악·대기열을 보존하고, “다른 곡”은 현재 자동 흐름을 취소해 새 곡으로 즉시 교체하며, “라디오 그만”은 검색·TTS·타이머까지 멈춘다. | FR-RADIO-DJ.12. 대화/종료/TTS 경합 Playwright + 네이티브 끼어들기. |
| **S-RADIO-DJ-12** | 사용자가 명시한 좋아요·싫어요만 장기 취향으로 기억하고 조회·수정·삭제할 수 있다. 단순 청취와 한 번의 건너뛰기로 영구 취향을 추론하지 않는다. | FR-RADIO-DJ.13. 메모리 쓰기·재호출·삭제 영수증 및 계정 격리. |
| **S-RADIO-DJ-13** | 최근에 튼 같은 곡과 동일 음원의 다른 영상을 피하고, 장르·분위기는 비슷하지만 새로운 곡을 추천한다. 명시적으로 같은 곡을 요청하면 반복 금지를 우회할 수 있다. | FR-RADIO-DJ.14. videoId+정규화 곡 키 최근 이력, 아티스트 편중, 8시간 피로도 검증. |
| **S-RADIO-DJ-14** | “이 곡 즐겨찾기에 등록해줘/빼줘/내 즐겨찾기 틀어줘”를 실행하고 재시작 뒤에도 유지한다. 즐겨찾기 한 바퀴 전에는 같은 곡을 반복하지 않는다. | FR-RADIO-DJ.15. 음성·텍스트 도구 계약 + 저장·복원 + 빈 목록·실패 항목. |
| **S-RADIO-DJ-15** | YouTube가 “재생할 수 없는 곡입니다”, 삭제·지역·연령 제한 또는 iframe 오류를 반환하면 성공으로 소개하지 않고 해당 후보를 제외한 다른 곡을 제한된 횟수로 찾는다. | FR-RADIO-DJ.16. 오류 fixture + 실제 YouTube 실패 후보 smoke. |
| **S-RADIO-DJ-16** | 이미지 입력이 가능한 모델이면 음악 화면만 캡처해 실제 보이는 영상·앨범 아트·오류 화면을 짧게 언급한다. 채팅·설정·알림 등 개인 UI는 캡처하지 않으며 이미지 입력이 불가능하면 보았다고 말하지 않는다. | FR-RADIO-DJ.17. 음악 표면 전용 캡처 + model capability gate + 멀티모달 도구 결과 계약. |

전체 실기 절차와 증거 형식은 [`radio-dj-practical-test-scenarios.md`](radio-dj-practical-test-scenarios.md)를 따른다.

메모리·반복 회피·즐겨찾기·오류 복구·이미지 모델 화면 관찰을 한 흐름으로 묶은 단계별 계약은 [`radio-dj-integrated-use-cases.md`](radio-dj-integrated-use-cases.md)를 따른다.

## UC-CODEX-ROLES — Codex를 main으로 쓰고 역할별 모델을 분리한다

사용자는 설정에서 Codex를 main provider로 선택한다. API key 입력 없이 로컬 Codex 로그인으로 대화하며,
sub와 memory 역할은 처음에는 main 설정을 상속한다. 사용자가 역할별 설정을 선택하면 각 역할에서 지원하는
provider/model을 독립적으로 지정하고, 다시 시작해도 그 선택을 복원한다. Codex처럼 main 전용 provider는
sub 또는 memory의 직접 선택지에 표시하지 않고, main 상속으로만 사용한다. 재시작 뒤에도 역할 설정이 보존되고,
Shell은 빌드 때 고정된 정확한 Agent 런타임만 실행한다.

검증은 `SettingsTab`, `adk-store`, `chat-service`, `uc-wire-v1-paired-proto` 계약과 실제 Codex smoke를 함께 사용한다.
설정 화면 통합 검증은 `e2e-tauri/specs/95-llm-role-settings.spec.ts`에서 상속 전환, 역할별 provider/model 저장,
재시작 뒤 config 복원을 확인한다.

## UC-JEONJU-COURSE-READINESS — 강의용 Codex 준비 상태를 확인한다

전주대 실습 참여자는 설정의 **두뇌**에서 Codex를 선택하고 `Codex 연결 확인`을 누른다. Shell은 현재 PC에서 Codex CLI가 설치되어 있고 로그인되어 있는지만 확인해 `준비됨`, `설치 필요`, `로그인 필요`, 또는 `확인 실패`를 표시한다. 인증 토큰, 계정 식별자, 명령 출력 원문은 화면·설정·로그에 표시하거나 저장하지 않는다.

참여자는 이어서 일반 설정에서 수업 워크스페이스를 선택한다. Codex 준비 확인은 파일을 읽거나 바꾸지 않으며, 수업 저장소 밖의 경로를 허용하지 않는다. 이 단계가 통과한 뒤에만 Discord에서 첫 제작 요청을 시작한다.

- 성공: Codex 선택 상태에서 준비됨이 보이고, 선택한 워크스페이스가 현재 Shell의 작업 루트와 일치한다.
- 실패: 설치되지 않았거나 로그인되지 않았으면 원인을 구분해 표시하고, 이전 provider·모델·워크스페이스 설정은 바꾸지 않는다.
- 재시도: 사용자가 설치 또는 로그인을 마친 뒤 같은 화면에서 다시 확인할 수 있다.
- 경계: 이 확인은 Codex에게 파일 작성·Git commit·push·배포를 맡기지 않는다. Git과 GitHub Pages는 수강생이 별도 단계에서 직접 수행한다.

이 UC의 상태 분류과 토큰 비노출은 Rust·Settings 단위 테스트로, 실제 로그인된 Codex CLI와 Brain 화면의 준비 상태 표시는 `e2e-tauri/specs/96-codex-readiness.spec.ts` 네이티브 Tauri E2E로 검증한다.

## UC-CODEX-WORKER-LIFECYCLE — 격리된 Codex 코딩 작업자를 관리한다

사용자는 워크스페이스의 **Coding Workers** 패널에서 provider `codex`, 작업할 worktree, 작업 설명을 명시해 코딩 작업자를 요청한다. Shell은 준비되지 않은 adapter를 성공으로 표시하지 않으며, API가 연결되기 전에는 “작업자 서비스에 연결할 수 없음”을 표시하고 목록 상태를 만들지 않는다.

작업자가 생성된 뒤에는 각 항목의 worktree·작업 설명·마지막 갱신 시각·`queued`/`running`/`cancelling`/`cancelled`/`completed`/`failed` 상태를 독립적으로 본다. 실행 중인 작업자가 같은 worktree를 이미 점유하면 두 번째 요청은 충돌 이유를 표시하고 전송하지 않는다. 동시에 실행할 작업자는 서로 다른 격리 worktree를 사용한다.

사용자는 대상 작업자에만 취소를 요청할 수 있다. Shell은 adapter가 확인한 상태만 렌더하며, PTY 종료를 취소 성공으로 바꾸지 않는다. 재개는 checkpoint 식별자가 있는 `cancelled` 또는 `failed` 항목에만 노출한다. checkpoint가 없으면 재개 버튼을 제공하지 않고, 단순 터미널 재시작을 재개로 표현하지 않는다.

- 성공: adapter가 반환한 작업자만 목록에 추가·갱신되고, 두 작업자는 서로 다른 worktree에서 병렬로 관찰된다.
- 실패: API 미연결·요청 실패·동일 worktree 충돌은 안전한 오류만 표시하며 새 상태·비밀값·원본 adapter 오류는 화면이나 로그에 남기지 않는다.
- 경계: 로그인 토큰·계정 식별자·Codex CLI 출력은 worker request·UI·로그에 포함하지 않는다. 실제 gRPC schema가 확정되기 전 Shell은 작업자 실행을 흉내 내지 않는다.

### 시각·사용성 수용 기준

사용자는 작업자 패널을 열었을 때 제어 루트, 실행 대상, 현재 수업 대상의 저장 상태, 다음 행동을 한 화면에서 구분한다. 선택할 수 없는 provider를 선택 상자처럼 보이지 않게 하며, 상태는 원시 enum이나 원문 시간만으로 전달하지 않는다. 패널은 1,100px 이하의 Shell 분할 폭에서도 입력·수업 경계·실행 버튼이 한 열의 의도된 순서로 유지된다.

- 빈 목록: 작업자가 없다는 사실과 첫 작업을 시작할 수 있는 입력 흐름을 표시한다.
- 진행 중: 저장·시작·취소·재개 요청 중에는 해당 행동을 중복 전송하지 않고 진행 상태를 표시한다.
- 오류: 안전한 원인과 재시도 전에 확인할 행동을 해당 요청 맥락에서 표시한다. 주기적 연결 오류가 사용자의 저장·시작 결과를 덮어쓰지 않는다.
- 수업 대상: 저장된 대상은 `다음 Agent 시작 시 적용`임을 명시하고, 저장되지 않았거나 아직 적용되지 않은 상태를 구분한다.

## UC-JEONJU-COURSE-WORKER

For the Jeonju course, the user explicitly selects a Git root and enables course mode. The default remains an Agent-created isolated worktree. Course mode is the only route that can run in the selected workspace.

- **ADK control root and execution target:** Shell shows the currently selected Naia ADK root as the control root. Skills, settings, and job state remain there. The user separately enters an execution-target Git root: normally `naia-adk/projects/<project>`, or the ADK root itself only for an explicit ADK-maintenance task. Codex is started with that target as its working directory; it does not receive a blanket write scope for every project under the ADK root.
- **Course containment:** a direct course target must be the control root itself or a descendant Git root. A sibling checkout or an unrelated absolute path fails closed before the worker is created. This keeps the default ADK workspace useful while allowing an independently versioned project below `projects/` to be the actual write target.
- Shell and Agent both fail closed unless the selected folder is the exact clean Git root with a remote.
- The allowed file list is fixed by Shell IPC to `index.html` and `hero.svg`. WebView input, Discord messages, LLM text, and task text cannot supply or change that list.
- **Proposal then apply:** the selected provider is a read-only proposal producer, not the filesystem authority. It returns only a versioned complete-file JSON proposal. Naia parses that fixed schema, applies the accepted subset of `index.html` and `hero.svg`, then runs the existing Git and content verification. This contract is shared by Codex, a model authenticated through the user's Naia account, and any later compatible provider.
- The worker card shows the returned verification summary. A failed check preserves student changes for manual review; Shell never resets or cleans the student workspace.
- **Visible course interaction:** Shell keeps the course start action disabled until the saved Discord course target is the same Git root currently entered by the instructor. The selected-workspace card is the student-facing Naia report: it states whether the proposal is queued, running, cancelling, completed with verification, completed without verification, failed, or cancelled. A verified completion tells the student to inspect the two files, check the page in a browser, and then make the Git commit; its `수업 파일 열기` action opens `index.html` directly in the Shell editor. Failed or cancelled work explicitly says that success was not claimed and that remaining files are preserved for review.
- If readiness fails, no worker is created and the UI gives a safe instruction to review the selected folder rather than exposing raw Git or Agent output.

### UC-JEONJU-DISCORD-COURSE-TARGET

Before starting the Agent, the instructor opens **Coding Workers**, enables Jeonju course mode, and explicitly saves the Discord course target. Shell writes the target only to the active ADK control root at `naia-settings/jeonju-discord-course.json`.

- The persisted document is versioned (`version: 1`) and contains the canonical selected Git root plus the exact fixed file list `index.html`, `hero.svg`.
- Rust accepts only a clean Git root with `origin` that is the control root or its descendant. A sibling checkout, arbitrary absolute path, dirty repository, missing remote, malformed document, or altered file list fails closed.
- The form exposes the fixed file boundary as status only. Discord messages, chat task text, and model output never supply a workspace path or allowed-file list.
- Agent startup consumes this trusted target document. The saved target is distinct from an ordinary Coding Worker request, so normal workers continue to use isolated worktrees.

Success means the visible confirmation identifies the saved target and fixed boundary without exposing a token or raw Git output. A failed save keeps the prior target unchanged and gives only the folder-readiness guidance.

## UC-NAIA-AZURE-MODELS — Naia 계정으로 Azure 모델을 일반 대화에 사용한다

Naia 계정으로 로그인한 사용자는 설정의 Naia 모델 목록에서 `grok-4.3`,
`deepseek-v4-pro`, `gpt-5.6-sol`, `gpt-5.6-luna`를 선택하고 저장할 수 있다.
`claude-opus-5`는 Azure quota가 열리기 전까지 준비중으로 보이며 적용되지 않는다.
재시작 후 선택이 복원되며 일반 채팅은
기존 Shell→Agent provider pipeline과 같은 Naia 키를 통해 선택한 정확한 모델로 전달된다.
Gateway가 제공한 Azure provenance와 tool 지원 여부는 정직하게 반영하고, gateway가
일시적으로 응답하지 않으면 정적 fallback을 사용하되 다른 모델/provider로 바꾸지 않는다.
Gateway의 가격은 이미 10%가 반영된 고객가이므로 Shell은 다시 가산하지 않는다.

이번 UC는 Coding Workers·Pi 작업 시작/취소/재개를 포함하지 않는다. 상세 계약은
`docs/progress/99.dev-comm/naia-account-model-connection-2026-07-30.md`이다.

## Test Coverage Map (P02)

**UC-JEONJU-COURSE-WORKER** maps to `apps/__tests__/coding-workers.test.tsx` and `apps/workspace/__tests__/coding-workers-tauri.test.ts` for the explicit preset, saved-target start gate, fixed boundary, preflight rejection, proposal/apply explanation, state-specific Naia report, and verification summary. Its native acceptance specs are `e2e-tauri/specs/91-jeonju-course-worker.spec.ts` (first build → student commit → revision and completed report) and `97-course-worker-guidance.spec.ts` (visible blocked start before target save); they run with the paired Agent and an isolated fixture repository. The proposal worker may inherit a read-only parent sandbox, because it no longer writes the course repository: Naia performs the constrained apply and post-apply verification.

**UC-JEONJU-DISCORD-COURSE-TARGET** maps to `apps/__tests__/coding-workers.test.tsx` and `apps/workspace/__tests__/jeonju-course-target.test.ts` for the explicit save action, fixed schema parser, and no caller-supplied allowed files. `src-tauri/src/lib.rs` contracts cover canonical containment and exact schema rejection. Its native Tauri coverage extends the Jeonju course acceptance fixture so the saved target exists before Agent startup.

The worker form shows the control-root path separately from the execution-target input, then changes the target label and help text immediately when course mode is selected. This prevents the default ADK workspace from being mistaken for Codex's write target and prevents the default isolated-worktree route from being mistaken for direct course-repository work. `apps/__tests__/coding-workers.test.tsx` verifies the transition, root/target explanation, and Korean explanatory labels while retaining the technical terms. `e2e-tauri/specs/97-course-worker-guidance.spec.ts` verifies the same transition in the actual Tauri Shell; `91-jeonju-course-worker.spec.ts` creates the course repository below the isolated ADK fixture's `projects/` directory.

**시각 검토 게이트:** 기능 UI 변경은 구현 전 상태 매트릭스(기본·빈 목록·진행·성공·오류·좁은 폭)를 P02에 기록한다. P04에서는 해당 상태를 컴포넌트/Playwright와 실제 Tauri Shell에서 확인하고, 스크린샷 또는 동등한 DOM·레이아웃 증거를 남긴다. 기능 계약 테스트만 통과한 경우에는 P05 완료로 선언하지 않는다.

| UC | 단위/계약 | UI 통합 |
|---|---|---|
| UC-CODEX-WORKER-LIFECYCLE | `apps/workspace/__tests__/coding-workers.test.tsx`: form validation, same-worktree collision, state rendering, checkpoint-only resume, unavailable adapter의 no-fake-success | `e2e/coding-workers.spec.ts` (후속): Tauri adapter fixture로 두 isolated worktree와 cancel/reconciliation을 검증한다. 실제 Agent schema 수신 전에는 fixture가 성공 실행을 가장하지 않는다. |
| UC-CODEX-WORKER-LIFECYCLE 시각 수용 | `apps/__tests__/coding-workers.test.tsx`: provider 표현, 빈 목록, 상태 배지, 수업 대상의 다음 Agent 적용 상태, 요청 중 중복 차단, 안전한 오류 맥락 | `e2e/coding-workers.spec.ts`: Shell 분할 폭(1,100px 이하)에서 입력·수업 경계·주요 행동의 순서와 접근 가능한 상태 표현을 검증. `e2e-tauri/specs/97-course-worker-guidance.spec.ts`: 실제 Tauri WebView에서 같은 안내·상태·레이아웃을 확인. |
| UC-CODEX-ROLES | `src/lib/llm/__tests__/roles.test.ts`, `src/components/__tests__/SettingsTab.test.tsx`: main 상속, 역할별 provider/model 저장, main 전용 provider 차단 | `e2e-tauri/specs/95-llm-role-settings.spec.ts`: 실제 Shell 설정 화면에서 역할 설정 저장과 재시작 복원 |
| UC-NAIA-AZURE-MODELS | registry/catalog/config contract: 두 모델, Azure provenance, tool metadata, static fallback | Settings FE + controlled Shell→Agent ordinary-chat integration + manual acceptance |

각 시나리오의 **검증 3단(verification stack)** — 어느 하나로 "됐다" 판정 금지(R1 codex·gemini 보강):
1. **Old-Baseline 측정**(이식 *전*, old): 입력/출력 trace + **상태 전이**(세션·캐시·fs·프로세스·권한 = hidden state, trace만으론 부족) + 설정/버전/키 상태 + **오류 분류축**(아래). **환경 정규화**(외부 의존 stub/mock → 루크 env 부작용을 코드 로직으로 오인 방지). **flaky**=1회 측정 금지, 반복+안정도 표기. **record-replay 한계**(외부시간·랜덤·네트워크·ws/streaming 재현 불안정) 명시.
2. **계약 테스트(contract, port)**: 시그니처·불변식 **+ 오류 의미론·timeout·cancel·retry·partial·ordering·idempotency**(adapter 공통이라 필수). 0토큰 결정론(conform-gate).
3. **통합 테스트(integration)**: 인지흐름 관통(감각→…→표현) + golden 행동 등가 **+ Negative/부정 path**(거부될 요청·승인실패·권한부족·미지원 환경·timeout·침묵) **+ downstream contamination**(상태보고 실패가 planning/route/skill 선택 오판 일으키나).

**검증 ≠ 이식 성공만**: contract+integration GREEN 이어도 baseline 행동과 다르면 FAIL(drift-gate). happy-path만 GREEN = 가짜성공(Negative 필수).
- **drift-gate 차등 필터(R2)**: trivial 상태차(timestamp·PID·랜덤·경로) 정규화 제외, *의미 있는* 상태/출력 차만 FAIL.
- **측정 간 상태 격리(R2 codex)**: 반복 측정·이식본 비교 전 workspace write·pty·cache·session **리셋/롤백**(잔존 상태를 로직 회귀로 오판 방지). 환경 정규화 = 측정 스크립트가 외부 키/엔드포인트 stub 강제(루크 env 부작용 분리).

### 오류 분류축 (R1) — 모든 측정/실패에 라벨
**2개 직교 축(R4)**:
- **오류-유형 축**: `auth · infra · timeout · flaky · old-bug · new-regression`.
- **민감-도메인 축(직교)**: `security · policy · approval · safety`(해당 시 라벨).
→ "깨짐"을 baseline 에 뭉뚱그리지 않음. **거버넌스(결정론 집행)**: `new-regression` = 무조건 FAIL. **(민감-도메인) ∩ (old-bug)** = 자동 FAIL + tranche exit 차단(승계·격리만으로 통과 금지). 그 외 `old-bug` = 승계 가능(별도 결정).

### ⚠️ 측정 불가/깨짐 ≠ baseline (R1 수렴 — 핵심 교정)
미배선(memory·cron)·깨짐(Discord)·disabled(memory backup)는 **golden baseline 아님** → **별도 "기능 격리/면제 목록"** 으로. **격리 상태 라벨(비-bug, 오류-유형 축과 별개)**: `unwired · unimplemented · disabled-by-design · unsupported-env` + 사유. ⚠️ **적용 자격(R7)**: 격리는 *old-baseline 에서도 본래 부재/비지원이 확인된 경우에만* 허용 — old 에서 **작동하던 것의 상실**은 격리 불가 = `new-regression` FAIL(재라벨 우회 차단). baseline 에 넣으면 *구현 실패*와 *원래 없음*이 섞여 **regression 은닉 장치**가 됨(codex). 격리 목록 항목은 slice 격리 + UC11 자기상태 보고 대상. **거버넌스(R2): high-importance 격리 항목은 해당 tranche exit 를 차단**(중요도만 적고 진행 금지 — 루크 명시 면제만 통과).

### baseline 갱신·coverage 규칙 (R1)
- **old-bug 승계 vs new 교정**: old 버그 *승계(동일 재현)* 기본, 교정은 별도 결정. ⚠️ **단 민감-도메인(security/policy/approval/safety) old-bug = 승계 금지**(명시 승인 필요) — deny-by-default 우선(R2 codex, R5 safety 포함).
- **coverage = 중요도 기준**(루크 측정가능성 skew 방지): 측정 불가여도 중요 시나리오는 격리 목록에 *중요도* 명시(후순위 자동화 방지).

### deny-by-default 선잠금 (R1 codex — F3 전)
`ApprovalPort` 최소 계약(승인 부재·거부·만료·중복·승인후 컨텍스트변경)을 **F3 진입 전**(F1 계약 수준)에 먼저 잠금 — 안 그러면 F1~F2 통합이 과권한/우회 전제로 굴러감.

### per-skill 샘플링 (R1 — coverage illusion 방지)
default-skills 60+ "각 1회 측정"=존재확인≠동작보장(공통 runtime/auth/env/schema drift 공유). → **capability class 대표 샘플 + 변이점별 예외 샘플**(통계 추론). **샘플 manifest 고정(R3)**: class별 ≥1 대표 + 알려진 변이축(auth·env·schema·runtime)별 예외 1 = 고정 목록(리뷰어/tranche 무관 동일, coverage drift 방지).

### Foundation tranche 테스트 매핑 (F0~F3 구체) — *provisional(실측 전 추정), Old-Baseline 측정 후 final*

| 단계 | 시나리오 | Old-Baseline 측정 | 계약 테스트 | 통합 테스트(인지흐름) |
|---|---|---|---|---|
| **F0** | UC12-min workspace init(최소 부팅, 외부키X) | naia-adk 부팅·workspace init trace | config/control-plane port | 부팅→workspace 준비 / **negative**: 손상·부분 설정→정직 보고(차단/비차단은 손상 유형별 계약 — fail-closed 차단도 정상일 수 있음) |
| **F1** | S09/S10/S11 자기상태 · S44 degradation · S52 facts · **+ApprovalPort 최소계약 선잠금** | system-status·diagnostics·device 상태 trace **+ 승인 플로우(부재·거부·만료·중복·승인후변경) 상태전이 trace** | `InteroceptivePort`(read-only 최소) **+ `ApprovalPort` 최소계약** | 내수용→지각→정직 보고 / **negative(exit-block)**: 승인부재·거부 시 행위 차단·degradation 오보 금지 / **downstream contamination**: 상태/승인 실패가 planning·route·skill 선택 오판으로 전염되지 않음 |
| **F2** | S07a workspace 관측(read-only) | workspace_* read 류 trace | `EnvironmentPort`(host-system) observe | 사고→환경 관측 / **negative(exit-block)**: 권한 밖 경로 거부·미지원 환경 정직 보고 |
| **F3** | S07 workspace 조작 + S12 승인 | workspace write·pty trace + 승인 흐름 + **거부/권한부족/timeout trace** | `EnvironmentPort` mutate + `ApprovalPort` | 승인→환경 행위→**observed→mismatch** / **negative(exit-block)**: 승인거부·권한부족→행위 차단; timeout→부분반영·rollback불가 시 *결과 미확정 정직 보고*(rollback 항상 가능 가정 금지) |

### 나머지 시나리오 매핑 (템플릿 — 각 tranche 착수 시 구체화)

| 묶음 | 시나리오 | 검증 핵심 |
|---|---|---|
| V1 텍스트 | S13 | provider 키 검증(Old-Baseline) → ChatPort 계약 → 대화 1회전 통합 |
| V2 음성 | S14~S19·S49·S50·S66 | voice ws/키/GPU Old-Baseline → voice provider·ExpressionPort 계약 → 감각→음성+아바타 통합 |
| 도구 | S20~S25·S55·S56·S71(per-skill) | skill/mcp/gateway Old-Baseline → SkillPort 계약 → 도구 호출 통합. **default-skills 60+ = capability-class 대표+변이점 샘플**(per-skill 전수 아님) |
| 환경-앱 | S26~S30·S62~S64·S70 | 브라우저/워크스페이스 group Old-Baseline → EnvironmentPort.app-surface 계약 |
| 환경-공간 | S31·S32 | BGM/배경 Old-Baseline → EnvironmentPort.space |
| 채널 | S35~S39·S60 | 외부 인증 Old-Baseline(깨짐 분류) → channels/ClientSessionPort |
| 설정·control | S01~S08·S47·S51·S53·S54·S57~S59·S67 | control-plane Old-Baseline → 각 port |
| 설정 SoT | S72 · **UC-CONFIG-SOT** | **부팅 병합 계약**: `mergeBootConfig({local,file,ui})` 순수함수 = 파일 절대 우선(스테일 localStorage persona 를 config.json 이 덮는가) → `lib/__tests__/config-boot-merge.test.ts` [계약] / **되쓰기 게이트**: 하이드레이션 전 `syncConfigToFile` 호출 없음 → 동 파일 [계약] / **e2e-tauri**(⚠️ 미작성 — 2026-07-15 리뷰 적발, 실 파일 부재): config.json=나이아 · localStorage=알파 → 부팅 → 나이아 유지·config.json 미오염 시나리오는 단위 계약(`config-boot-merge.test.ts`)으로만 검증됨, e2e-tauri 통합 스펙은 **후속 작성 대상**(P04 미충족 명시) |
| OS-core(DEFER) | S45·S46 | SafetyPort·ClientSessionPort 계약(F3 후) |
| 보류 | S41·S42·S52b | naia-memory 트랙(미배선 = **격리/면제 목록**, golden baseline 아님) |

> P02 착수 = **F0~F3 Old-Baseline 측정부터**. F0~F3 은 로컬·외부키X·read-only/승인 범위라 **루크 게이트 없이 측정 가능**(R6). 루크 게이트(실구동·키·env)는 *외부 의존* 측정(V1/V2·채널·voice)에만. 측정 결과로 계약·통합 테스트 구체화.

## 기반 성숙도 (vertical 선정 1순위 기준 — 검증된 subsystem 위에 올려야)

첫 vertical 목적 = *이식 방법론이 인지흐름 1회전을 제대로 도는지* 검증. **검증 안 된 subsystem 위에 올리면 "이식 실패 vs subsystem 실패"가 섞여 vertical 이 무의미.** → 기반이 *이미 검증된* UC 를 골라 transplant 만 격리 검증.

> ⚠️ 아래 "검증" 열 = **old-naia-os *소스* 기능 검증 상태 = 이식 golden 기준선의 존재/신뢰도**. *이식 완료도 아님*(이식은 아직 0, step-1 막 닫힘). old가 known-good 이어야 이식 후 golden-trace/record-replay 로 "이식본 ≡ old 동작"을 격리 검증 가능. old에 없는 기능(memory)은 기준선 자체가 없어 vertical 불가.

> ⚠️ **실측 경고(루크 2026-06-08)**: 아래 "기준선" 열은 **아직 실제로 돌려보지 않은 추정**. "예전엔 됐다" ≠ "지금 된다". 외부 인증/키 의존 기능은 토큰 만료로 *지금 깨진* 경우가 많음(예: **Discord = 앱 인증 풀린 듯**). **vertical 선정 전 = 후보 기능을 old-naia-os에서 *실제 기동·작동 확인*(golden 기준선 확립)이 필수 선행.**

| UC | 기반 subsystem | 의존성 | 기준선 상태(실측 전 추정) |
|---|---|---|---|
| UC1 텍스트 | llm provider | 외부 키(LLM API/gateway) | 키 유효 시 작동 추정 — **실측 필요** |
| UC2 음성 | voice cascade(omni)·아바타 | gateway realtime·키·GPU | 라이브 데모 이력 있으나 **현 작동 실측 필요**(키/서버 의존) |
| UC3 기억 | naia-memory | — | ⛔ **old에 미배선**(scrubber만) — 기준선 자체 없음 → deferred |
| UC4 능동회상 | naia-memory+동기(신설)+temporal | — | ⛔ 미배선+신설 → deferred |
| UC5 도구 | weather·time·github·web | 일부 외부 키 | 혼재 — 개별 실측 |
| UC6 브라우저 | agent-browser | 로컬(webview) | 로컬 의존 낮음 — 실측 필요 |
| UC7 시스템 | workspace·pty·memo | 로컬(fs/proc) | 로컬 — 비교적 견고 추정, 실측 |
| UC8 BGM | youtube-bgm | 외부(YouTube/InnerTube) | YouTube 변동 취약 — 실측 |
| UC9 패널 | panel install | 로컬 | 실측 |
| UC10 멀티채널 | discord·slack·google-chat | **외부 앱 인증** | ⚠️ **Discord 깨진 듯(앱 인증 만료?)** — 인증 의존 전반 의심 |
| UC11 자기상태 | system-status+InteroceptivePort(신설) | 로컬 | 부분(신설 포함) |

## Foundation tranche + vertical 순서 (R1 codex·gemini 반영)

**원칙: 외부 인증/키에 안 흔들리는 *로컬·read-only·introspective* 부터, 얇게 쪼개 결함 격리.** (V0를 "클러스터"로 묶으면 실패 시 interoception/host-adapter/setup/auth 중 어디인지 분해 불가 → 번들 금지.)

**Foundation tranche (얇은 순차 단계, read-only→mutating):**
- **F0 (전제조건, vertical 아님): UC12-min 로컬 최소 설정** — naia-adk workspace 최소(외부 키 없이 부팅 가능분). control-plane init. *인지흐름 아님 = vertical 분류 제외.*
- **F1: UC11 + UC14 자기상태 진단(read-only, afferent-only)** — naia 가 자기 상태 관측·보고. `InteroceptivePort`. **= 진단 렌즈**. **범위(R5)**: F0-min 이 남긴 *persisted config + 시스템 상태 + 무엇이 설정/미설정*까지(대체·행위 없음). UC14 = **현 설정된 것의 degradation 보고**(F1=미설정·시스템 이상; 외부 provider/계정 auth 깨짐은 그 auth 가 설정된 *UC12 이후 자동 확장* — F1 시점엔 판정 기준 부재라 다루지 않음). golden-trace 첫 성과물 = "설정/미설정·시스템 상태를 정직 보고".
- **F2: UC7a 시스템 관측(read-only)** — host-system 상태 조회(변경 X). 가장 안전한 첫 환경 이식.
- **F3: UC7 시스템 조작(mutating)** — Action→Environment→**observed→mismatch**(reafference) 완결. = 얇지만 완전한 cognitive 1회전(첫 efferent+reafferent 실증).

**그 다음 (외부 의존, F1 자기상태로 연결 검증 후):**
- **V1: UC1 텍스트 대화** — provider 키 유효 확인 후 Chat→사고→표현.
- **V2: UC2 음성 대화** — voice substrate 축 확장(다슬라이스, 데모).
- **OS-core (P01 시나리오에 포함 확정, 구현 = F-tranche 안정화 후 DEFER):** UC10a 다중 클라이언트 lease/handoff/revoke · UC13a stop/e-stop/revoke. — 부가 아니라 OS성 핵심이라 *시나리오는 지금 박되* 착수는 F3 이후.
- **보류: UC3/UC4 기억·능동** — old 미배선 → naia-memory 통합 트랙 후.

→ "가장 안전한 vertical"이 아니라 *얇게 쪼갠 foundation tranche*. G1 = 이 순서 승인.

### 전체 UC 배치 (단일 착수 SoT — 모든 UC 명시, R3 codex)

| 단계 | UC | 비고 |
|---|---|---|
| **F0** | UC12-min | 외부키 없는 최소 부팅 |
| **F1** | UC11 · UC14 *(UC12a = UC11/14 facet, 흡수 — 독립 카운트 아님)* | read-only 진단·실패감지 |
| **F2** | UC7a | host-system read-only 관측 |
| **F3** | **UC13 승인 게이트 → UC7**(F3 내부 순서: 승인 경로 먼저, 그 위에 mutating) | 첫 efferent+reafference |
| **V1** | UC1 (+ UC12 전체 = provider/계정/키 설정 완료, V1 직전) | provider 검증 후 |
| **V2** | UC2 | voice |
| **도구·환경 tranche**(V 이후, *기능별 Old-Baseline 게이트*) | UC5 도구 · UC6 브라우저 · UC8 BGM · UC9 패널 · UC10 멀티채널(기본) | 외부 의존 개별 실측 후 |
| **OS-core**(F3 후) | UC10a 다중클라이언트 lease · UC13a stop/e-stop | 구현 DEFER |
| **deferred**(naia-memory 트랙) | UC3 기억 · UC4 능동 | old 미배선 |

미배치 UC = 0(전수 배치). 착수 순서 해석 단일.

## golden 기준선 — 1회 smoke ≠ golden (R1 codex)

외부 인증/모델/YouTube/Discord 는 drift source. baseline 에 함께 **freeze**: `입력 trace` + `출력 trace` + `설정/버전/키 상태` + `실패 분류(인증 실패 vs 제품 버그)`. 안 그러면 "old 가 오늘 운 좋게 됨"을 canonical 로 오인. (UC14 가 인증실패 분류를 담당.)

**Old-Baseline 측정 = P02 전제조건 단계(R2 gemini)**: vertical/foundation 후보 기능을 *old-naia-os 에서 실제 구동* → 위 4종 스냅샷 생성. 이 측정 없이 P02 테스트 매핑 금지. ("작동 안 함"이 정상 baseline 일 수 있음 — 측정으로 확정.)
**F1 InteroceptivePort 최소 스펙(R2 gemini)**: old 에 통합된 형태가 아님(신설) → F1 에서 **read-only 최소 인터페이스부터** 정의(이식 첫 난관 최소화).

> **이식 coverage 함의**: 1단계 슬라이스의 `memory` = old 소스엔 scrubber·prompt convention(`<recalled_memories>`)만 → `accepted`(scrubber) + `deferred`(실제 store/recall = naia-memory 통합 대기). 커버리지 manifest 에 명시.

## 결정/잠정
- Foundation tranche 순서 F0→…→V2 = **아이디어 수준 잠정**(루크: 우선 적어둔 것, 실행 시 재검토 — 못 박은 결정 아님). G1 = 게이트로 두지 않음.
- botmadang(S65) = **rejected**(이식 제외, 명확 결정).

## 셸 feature 시나리오 — 지식 근거→원문 + 그래프 (K2·K3, kb-compiler 통합 — 2026-06-30)

도구·환경 tranche(UC5 도구·UC6 브라우저·UC7 워크스페이스)의 셸측 슬라이스. 사용자가 워크스페이스 지식을 물으면, 에이전트가 `skill_knowledge_ask`/`search`(naia-agent **UC-KNOWLEDGE**, kb-compiler backend — 별 레포 live)로 **근거 있는 답변**을 내고, 셸이 그 tool-result(JSON)를 **답변 + 출처 칩**으로 렌더한다(K2). 출처 칩 클릭 시 **근거→원문**: URL=브라우저 패널(UC6), 워크스페이스 파일=파일뷰어(UC7)로 원문이 열린다. 근거 없으면 **기권**(칩 없음). 또한 `skill_knowledge_graph` 결과는 셸이 **2D/3D 캔버스 그래프**(엔티티·관계·군집색·degree 크기, 2D↔3D 토글)로 시각화한다(K3).

- **인지흐름**: (사고)지식 질의 → (표현)근거 답변+출처·지식 그래프 → (행위)칩 클릭→원문 패널 전환. 백엔드 배선·계약 = naia-agent(별 레포), 셸 렌더·dispatch·뷰어 = 본 feature(기존 브라우저/워크스페이스 패널 api 재사용·그래프 의존성 0 캔버스, 신규 사이드카 0).
- **검증(P02)**: requirements.md **FR-KB-OS.1~4** 매핑 — `knowledge-result.test.ts`(파싱·분류·그래프 파싱 단위)·`knowledge-tool-result.test.tsx`(RTL 렌더+칩 dispatch)·`e2e/chat-tools.spec.ts` "지식 도구(K2)"·"지식 그래프(K3)"(Playwright 실 UI: 답변+칩+칩클릭→브라우저 패널 / 그래프 캔버스 렌더+2D/3D 토글). tsc0.
- 통합 설계 SoT = alpha-adk `.agents/progress/naia-kb-compiler-agent-os-integration-2026-06-29.md`. 전용 그래프 패널(on-demand fetch) = post-MVP. 설정 지식 탭(관리 compile/소스) = 아래 UC-KB-MANAGE.

## UC-KB-MANAGE — 지식 소스 관리 설정 탭 (K4, kb-compiler 통합 — 2026-06-30)

사용자가 설정>지식 탭에서 **자기 워크스페이스의 지식 소스(자료 폴더)를 직접 관리**한다. "준비 중" 자리를 실제 관리면이 대체한다: ①여러 자료 폴더를 추가/제거(폴더 선택 다이얼로그)하고, ②현재 **지식 스코프(프로젝트)** 와 **컴파일 상태**(카드·엔티티·관계 수, 또는 "미컴파일")를 보고, ③"지금 컴파일"로 등록 폴더 → 구조화 지식(kb.json)을 빌드한다. 빌드된 지식은 채팅에서 근거 답변(UC-KNOWLEDGE)으로 소비된다.

- **소유 경계(핵심)**: 이 설정(소스·스코프)은 **사람이 셸 UI 로만** 바꾼다 → `naia-settings/knowledge.json`(셸 전용 write). **AI 에이전트는 읽기만** 하고 설정을 못 바꾼다(config-write 도구 부재 = 신뢰경계 자가확장 차단). 사람=설정, 엔진=컴파일 산출(kb.json) 분리.
- **인지흐름/역할**: (관리)셸 UI 폴더 등록·스코프 → (지능)에이전트가 `CompileKnowledge`(naia-agent, 별 레포)로 폴더 → kb-compiler `compile()` → `knowledge/<scope>/kb.json` 저장 → (소비)채팅 근거 답변. 셸 = 관리 UI·상태 표시·트리거(직접 `invoke`, AI 미경유). 컴파일/답변 지능 = 에이전트.
- **검증(P02)**: requirements.md **FR-KB-OS.5~9** 매핑 — `knowledge-config.test.ts`(config CRUD·dedup·kb 통계 파싱 단위)·`KnowledgeSettingsTab.test.tsx`(RTL 폴더 add/remove·스코프·상태 렌더)·`e2e/settings-knowledge.spec.ts`(Playwright 실 UI: 설정 지식 탭 폴더 추가/제거/상태 표시). 컴파일 트리거(FR-KB-OS.8)는 에이전트 `CompileKnowledge` 배선에 의존(미배선 시 정직 표기).
- 통합 설계 SoT = alpha-adk `.agents/progress/naia-kb-compiler-agent-os-integration-2026-06-29.md`(K4).

## 해소·DEFER (재논 금지)
- ~~UC7 포트 축~~ = 해소(R1): UC7 = `EnvironmentPort`(host-system). `ActionPort`=body movement(별개).
- OS-core(UC10a·UC13a) = P01 시나리오 **포함 확정**, 구현 DEFER(F3 후).
- step-2 계약 backlog(goal-governance 소유자·포트 시그니처 등) = DEFER(step-2 계약 단계).
- notify/memo(non-memory) 독립 UC 여부 = **Old-Baseline 측정 시 확인**(DEFER).

## UC17 — 자유·연속 발화 session stream (#82 cross-repo)

naia-agent가 사용자 요청의 기존 `Chat` stream에서 연속 발화를 보내거나, idle/cron 같은 외부 정책으로
사용자 입력 없이 자유 발화를 시작한다. 셸은 agent 연결 뒤 현재 대화 session의
`SubscribeSpeechActivities` 장기 stream을 정확히 하나 구독하고, 받은 `AgentEvent.request_id`를 기존
`agent_response` JSON으로 변환해 기존 텍스트·TTS·아바타 표현 경로에 그대로 넣는다.

- 요청 기반 연속 발화는 기존 `Chat` stream을 그대로 소비해 셸 상태 기계를 추가하지 않는다.
- 자유 발화 event도 기존 `agent_response`와 동일한 폐쇄 union이라 별도 UI 이벤트 형식을 만들지 않는다.
- session 구독 해제·agent 재시작은 보이지 않는 활동을 계속하지 않도록 server의 cancelled 정지로 이어진다.
- 사용자가 받은 requestId+activityId로 self-init activity cancel을 보내면 provider/발화 사이 대기가
  함께 취소된다. requestGeneration은 requested Chat에만 사용한다. activityId 관측 전과 session 전체
  명시 정지는 `StopSpeechActivity`가 담당한다.
- unsolicited activity는 ordinary Chat의 currentRequestId 필터와 별도로 수용한다. 사용자 입력은
  TTS를 먼저 중단하고 `YieldSpeechActivity`가 반환한 resumeToken/profileGeneration을 Chat에 실어
  즉시 보내며 queue 뒤에 가두지 않는다. quiet/stop은 terminal Stop을 쓴다. 이전 activityId 또는
  profileGeneration의 늦은 text/audio는 재생하지 않는다.
- 중복 session 구독은 만들지 않고, dispatcher 종료 시 모든 구독 task를 종료한다. 반복·시간·기억 상태는
  agent 소유이며 셸은 복제하지 않는다.

P02 검증:

- Rust 단위/계약: `agent_grpc.rs`의 activity event 변환, subscribe/stop 요청, 같은 session 중복 구독 방지.
- 실 백엔드/계약: `agent_grpc.rs`가 agent spawn → session subscribe → self-init
  text/usage/finish → 기존 `agent_response`, requestId cancel/stop, disconnect 정리를 검증.
- 프론트 계약: ChatArea에서 unsolicited activity 표시/TTS, `interruptTts → yield/stop → Chat` 순서,
  stale audio/text 폐기를 검증한다.
- 실제 Tauri `71-proactive-speech-profiles.spec.ts`: profile 저장·복원, 개인 DJ의 실제 YouTube BGM·첫
  결과 text·stop, 전시 greeting·stop만 검증한다. 이 테스트는 TTS를 꺼 두므로 audible TTS, DJ 멘트2,
  전시 질문 barge-in→답변→resume, 모든 control, stale audio 폐기를 native로 증명하지 않는다.

Test Coverage Map:

- UC17 / FR-CONT-SHELL.1~7 → Rust `agent_grpc` contract+live tests,
  `packages/shell/e2e-tauri` 시작/표현 일부 full-stack, 기존 `src/main/adapters/tauri/uc1`·ChatArea cancel 회귀.
- FR-CONT-SHELL.8 / PA-DJ-04 UC test → `packages/shell/e2e-tauri/specs/71-proactive-speech-profiles.spec.ts`
  `persists validated proactive settings after cache-clear native reload`; FE tests →
  `packages/shell/src/lib/__tests__/proactive-speech-settings.test.ts` `normalizes proactive settings fail-closed`와
  `packages/shell/src/components/__tests__/SettingsTab.proactive-speech.test.tsx`
  `edits and persists proactive speech settings`.
- FR-CONT-SHELL.9 / PA-DJ-05·PA-EX-01 UC tests →
  `packages/shell/e2e/121-proactive-speech-product-acceptance.spec.ts`
  `speaks proactive text through browser TTS`, `plays synthesized proactive audio`,
  `interrupts before every DJ control and drops stale output`,
  `ordinary chat interrupts before yielding the active exhibition`;
  native `packages/shell/e2e-tauri/specs/71-proactive-speech-profiles.spec.ts`
  `starts and persists personal radio DJ through the real Tauri IPC path`,
  `persists validated proactive settings after cache-clear native reload`,
  `starts exhibition introduction without waiting for ordinary chat`.
- S-RADIO-DJ-7 / Shell #405 →
  `packages/shell/e2e-tauri/specs/94-avatar-4060-facade.spec.ts`
  `runs radio A-to-B switching, TRT speech/lipsync, and render-time barge-in through real Tauri`.
  이 검증은 실제 `/v1/audio/speech`와 `/stream`, A→B `playing`, 재생 시작 전 문장 숨김,
  Enter→render 취소 250ms 기준, BGM 지속을 한 흐름에서 확인한다. 수백 회 장시간 soak와
  stop/quiet/change-vibe/next 전체 조합은 #405의 후속 안정성 범위로 남긴다.

## UC-PROACTIVE-COST-CONTROL — AI/TTS 옆에서 능동 발화를 통제한다

Naia가 개인 라디오 DJ나 전시 소개를 제안하거나 시작하려 할 때, 사용자는 아바타 영역의
AI·TTS 제어 바에서 **능동 발화** 상태를 항상 확인하고 즉시 바꿀 수 있다. 이 제어는
프로필 설정과 다르다. 프로필은 무엇을 할지(개인 라디오/전시 소개)를 정하고, 능동 발화
제어는 지금 LLM·TTS·선택적 BGM을 사용해도 되는지를 정한다.

- 꺼짐: agent는 능동 발화를 시작하지 않고, 이미 진행 중인 activity는 안전하게 중단한다.
- 준비됨: 선택된 프로필과 현재 AI/TTS 경로를 표시한다. agent의 판단은 시작 **제안**으로
  보이며, 사용자는 버튼에서 허가하거나 계속 꺼 둘 수 있다.
- 실행 중: 현재 프로필과 사용 중인 AI/TTS 경로를 표시한다. 버튼 한 번으로 즉시 중단한다.
- 차단됨: TTS가 꺼져 있거나 로컬 음성/아바타 준비가 안 된 경우, 시작하지 않고 정확한
  차단 이유를 표시한다. 클라우드·로컬 비용을 추정값으로 꾸며 표시하지 않는다.

LLM은 좁은 능동 발화 도구로 profile 시작을 **요청 또는 제안**할 수 있지만, Shell의 현재
허가 상태·오디오 가능 여부·사용자 중단을 우회할 수 없다. 설정 화면은 시간대·개인정보
동의·간격·BGM 자동재생 같은 정책만 보관하며, 숨은 opt-in 토글이 런타임 허가를 대신하지 않는다.

Test Coverage Map:

- 컴포넌트: `AiControlBar`가 꺼짐/준비됨/실행 중/차단됨의 라벨, `aria-pressed`, 설명과
  시작·중단 요청을 올바르게 표현한다.
- 구성: `proactive-speech-settings`가 profile 정책과 사용자 허가를 별도로 저장·정규화하고,
  TTS-off/미구성 profile을 fail-closed 한다.
- 실제 Tauri: 새 `e2e-tauri` 시나리오가 버튼으로 시작·중단한 뒤 agent의 profile 설정과
  activity stop을 확인하고, 로컬 음성 준비 실패는 실행 성공으로 표시하지 않는지 확인한다.

## UC-WIRE-V1 — 이미지·Discord·RAG·처리 공개 공통 채팅 경계 (#384 / naia-agent #89)

셸 사용자는 기존 텍스트 대화를 그대로 사용하면서 필요할 때 안전한 이미지 참조,
Discord 채널 결속, 지식 범위, provider session, 처리 profile을 함께 보낸다.
셸은 원시 이미지 bytes, Discord token, provider thread id, endpoint 또는 지식
원문을 wire에 넣지 않는다.

- 구조화 입력은 public `chat-service`와 new-core/Tauri 경로가 같은 필드 이름과
  선택성 규칙을 보존한다.
- 구조화 출력은 grounding 출처, image artifact, provider-session lifecycle,
  처리 위치 공개를 본문과 분리해 소비한다.
- 오류는 안정 code로 분기하고 사용자 표시 문구는 셸 i18n에서 결정한다.
- Rust는 `NAIA_AGENT_PROTO_DIR`로 지정한 paired Agent proto가 없거나 enum이
  unknown/UNSPECIFIED이면 추정하지 않고 실패한다.
- 계약 동결 전에는 Discord/RAG lane이 이 형상을 소비했다고 주장하지 않는다.

P02 검증:

- T-WIRE-01~05, 08~16, 18~23: core
  `src/test/uc-wire-v1*.test.ts`, `uc1-*` 회귀 테스트.
- T-WIRE-06, 17: paired proto Rust `agent_grpc::transcode_tests::wire_v1_*`,
  `cargo check`, Shell TypeScript build.
- T-WIRE-15: `packages/shell/src/lib/__tests__/wire-errors.test.ts`와
  `chat-service.test.ts`의 안정 code/i18n/public callback 검증.

## S-STEAM — Windows Steam 배포 준비 (#314)

- **사용자 목표**: Steam에서 Naia를 설치하고 `naia-shell.exe`를 직접 실행한다.
- **배포 계약**: Windows 설치 완료 트리에서 NSIS 전용 `uninstall.exe`를 제외한 포터블 디포를 만들고,
  번들 Node·agent·BGM sidecar를 포함한다.
- **독립 실행 증명**: CI는 디포 복사 후 NSIS 기본 설치 위치를 제거한 상태에서 실제 셸을 기동해
  agent handshake와 번들 Node 사용을 확인한다.
- **무결성**: 업로드 디포에는 모든 파일의 상대 경로와 SHA256을 담은 `steam-files.sha256`이 포함된다.
- **범위 경계**: Steamworks App ID·depot ID·계정 비밀·스토어 심사 제출은 저장소 밖 운영 단계이며 #314에서 추적한다.

## UC-DISCORD — Discord 채널 에이전트 (신규 요구, 2026-07-20)

### UC-DISCORD-1: 개인 봇 연결과 채널 활동 허용

사용자는 나이아에게 Discord 연결 방법을 물어본다. 나이아는 사용자가 Discord에서 봇을 만들고 자신의 서버에 초대해야 함을 설명한 뒤 연결 설정으로 안내한다. 연결 화면은 **봇 만들기·초대 → Windows 보안 입력창에 토큰 입력 → 연결 확인 → 활동 채널 선택** 순서를 먼저 보여 준다. 토큰은 WebView 입력칸·채팅·일반 설정에 나타나지 않으며, 사용자가 `Discord 연결`을 누를 때만 열리는 운영체제 보안 입력창에서 처리한다. 나이아가 접근 가능한 채널 중 활동을 허용할 채널을 선택한 뒤에만, 이후 나이아는 허용 채널에서 다른 참여자와 대화한다.

- 성공: 연결 상태와 허용 채널이 보이고, 봇은 허용 채널에서만 동작한다.
- 실패: 토큰 오류, 봇 미초대, 권한 부족, 채널 삭제는 원인을 보여 주며 다른 채널에는 영향을 주지 않는다.
- 안전: 토큰은 채팅·일반 설정·로그·agent 요청에 나타나지 않는다.

### UC-DISCORD-2: 여러 채널을 지구본 대화함에서 읽기

사용자의 봇이 여러 Discord 채널에 초대돼 있다. 사용자가 지구본 버튼을 누르면 최근 활동한 허용 채널의 대화가 먼저 열린다. 사용자는 목록으로 돌아가 다른 채널을 고르고, 그 채널의 대화와 읽지 않은 상태를 본다.

- 좁은 화면: 목록과 대화를 동시에 강제로 넣지 않고, 목록 → 대화 → 뒤로 가기 흐름으로 전환한다.
- 넓은 화면: 목록과 선택된 대화를 함께 보여 줄 수 있다.

### UC-DISCORD-1B: 연결 설정에서 채널 대화함으로 이어가기

사용자는 **연결 → Discord**에서 봇 토큰을 보안 입력으로 저장하고 활동을 허용할 채널을 선택한다. 저장이 성공하면 같은 화면에서 `Discord 대화함 열기`를 선택해 지구본 채널 탭으로 이동한다. 채널 탭은 방금 허용한 채널들을 서버·채널명으로 표시하고, 아직 메시지가 없어도 “대기 중”으로 구분한다.

아직 토큰이 없으면 채널 탭은 구형 Gateway 오류를 보여 주지 않고, Discord를 연결하고 채널을 허용하라는 안내와 연결 설정으로 가는 버튼을 보여 준다. 토큰은 있지만 허용 채널이 없으면 채널 선택으로 돌아가는 버튼을 보여 준다. 채널 하나라도 허용된 뒤에는 Shell 개인 채팅과 섞지 않고, 선택된 Discord 채널의 기록만 보여 준다.

- 성공: 저장 직후 같은 허용 목록이 대화함에 보이고, 사용자 선택 또는 최근 채널이 열리며 개인 채팅으로 복사되지 않는다.
- 실패: 미연결·미허용·상태 조회 실패를 서로 구분해 안내한다. 오류 원문·토큰·Agent 내부 상태는 표시하지 않는다.
- 경계: `연결`은 자격 증명과 활동 권한을 정하는 곳이고, 지구본은 허용된 Discord 채널의 읽기 전용 대화함이다. 두 화면은 동일한 binding 식별자만 공유한다.
- 비어 있음: 허용 채널이 없으면 연결·권한 설정을 안내한다.

### UC-DISCORD-3: 실시간 공동 대화

가족 채널처럼 여러 사람이 있는 허용 Discord 채널에 새 메시지가 올라온다. 나이아는 지속 연결로 메시지를 받고, 해당 채널의 참여 규칙에 따라 같은 채널에 응답한다. 두 채널에서 동시에 대화해도 각 채널의 맥락과 응답은 서로 섞이지 않는다.

- 성공: 새 메시지는 한 번만 처리되며 응답은 같은 채널에 표시된다.
- 복구: 네트워크 단절 뒤 재연결해도 이미 처리한 메시지에 다시 응답하지 않는다.
- 비활성: 허용되지 않았거나 일시 중지한 채널은 읽거나 응답하지 않는다.

### Test Coverage Map

| Scenario | Unit / contract | UI / integration | Real Discord E2E |
|---|---|---|---|
| UC-DISCORD-1 | credential boundary, allow-list, participation policy | Settings connection flow | bot invite, permissions, allowed-channel activation |
| UC-DISCORD-1A | `ConnectionsSettingsTab.test.tsx`: visible four-step setup, native credential result/status-generation classification, incomplete-discovery fail-closed, binding conflict; Rust dotenv parser accepts only `DISCORD_BOT_TOKEN` for debug E2E | `e2e/discord-settings-secure.spec.ts`: no inline token and no-argument native-command contract; `e2e-tauri/specs/92-discord-secure-cancel.spec.ts`: isolated real Tauri native-cancellation seam; `e2e-tauri/specs/94-discord-live-auth.spec.ts`: private dotenv → live bot authentication/discovery without DPAPI/WebView persistence; `e2e/discord-channel-agent.spec.ts`: allow-list save. | provisioned test bot: allow-list save → Agent authority `ready` |
| UC-DISCORD-1B | `ConnectionsSettingsTab.test.tsx`: save exposes inbox handoff only for a saved binding; `ChannelsTab.test.tsx`: disconnected/unconfigured/allowed empty states and binding-scoped records; no raw status leak | `e2e-tauri/specs/93-discord-inbox-handoff.spec.ts`: real Shell settings → channels handoff and empty-state route | provisioned test bot: binding save → inbox channel list → inbound/outbound records remain in their binding |
| UC-DISCORD-2 | recency and selected-channel persistence | narrow/wide channel inbox navigation | multi-channel history visibility |
| UC-DISCORD-3 | Gateway event deduplication, per-channel context, reconnect | live status and unread rendering | two-channel message/reply/reconnect flow |

| **S-CASCADE-INSTALL-PLAN** (FR-CASCADE.2 — 2026-07-22) | 4060 profile users see a Shell-checked local-runtime plan. Loader, Python runtime, cascade service bundle, Ditto engine, VoxCPM2 model, and bundled reference voices each report a name, progress, next action, retryability, and failure reason. With no packaged artifact or download manifest, Shell reports that boundary and does not pretend to download or start anything. `ready` is true only when all prerequisites and the live :8910 requested services are verified. | Rust `cascade_installation_status` contract tests (missing prerequisite, queued model download, ready-to-start, live ready) and `SettingsTab.test.tsx` (profile plan display; no `start_cascade` when `canStart=false`). Actual download/install and Tauri voice+lipsync remain a separate E2E gate after packaged artifacts exist. |

## UC-LLM-THREE-TIER ? Pi-only development roles

The user configures `expert`, `main`, and `sub` independently in Shell. Each role selects a Codex or Claude model (or inherits another role); `memory` remains a separate consumer role. Shell writes only provider/model/credential-reference metadata to `naia-settings/config.json` and never writes credentials.

When a development task is delegated, Shell hands the saved workspace configuration and task to naia-agent. The agent resolves the selected role, validates it, then starts and supervises an embedded Pi session with that provider/model. OpenCode is neither displayed nor selected nor used as fallback on this path.

### Test Coverage Map

| Scenario | Unit / contract | Integration |
|---|---|---|
| three tiers persist and inherit | `lib/llm/roles.test.ts`, `lib/adk-store.test.ts` | config file roundtrip |
| Pi-only role handoff | Agent `pi-role-runner.contract.test.ts` | fake Pi session through supervisor |

## UC-NAIA-MODEL-ORDER — Compare only usable Naia models

A signed-in Naia user opens the AI model picker. The picker contains only
currently usable routes; models marked `comingSoon` or otherwise unavailable
are not offered. The default view is price order and there is no separate
registry/default order.

Price order estimates a general chat workload using three uncached input tokens
for every one output token: `3 * input price + output price`. Prompt-cache
prices are not included in this ordering because cache support and hit rate vary
by model and conversation. Input and output prices remain separately visible so
the user can interpret the estimate. Switching to performance order immediately
reorders the same native WebView picker without changing the selected model.

### Test Coverage Map

| Scenario | Unit / contract | UI / integration |
|---|---|---|
| weighted price is the default | registry weighted-score and stable-sort tests | Settings component and Playwright option-order assertions |
| unavailable routes are absent | registry metadata/filter contract | Settings component and Playwright absence assertions |
| performance order is evidence-based | dated recommendation-order contract | Settings sort-change assertion |

## UC-RADIO-DJ-DURABLE — Radio DJ changes music truthfully and keeps one settings owner (#414)

A user asks Naia, in any supported language, to start Radio DJ playback o
change the music. The LLM selects `skill_youtube_bgm` semantically and the
Shell refreshes that tool registration before the chat turn so an agent restart
cannot silently remove the capability. A play request is not described as
successful until the player reports an observed `playing` transition.

- If search returns the currently selected video first, Radio DJ chooses a
  different result when one exists. Explicitly replaying the same video still
  remounts the iframe and starts a new playback attempt.
- Every Agent-owned Radio DJ play carries `mode=radio_dj`. Status receipts
  include bounded recent-play and favorite title lists so Agent selection can
  combine explicit memory preferences with Shell-owned listening context;
  Shell remains the final authority for current/recent duplicate filtering.
- After an observed `ended`, Agent completes one short transition remark before
  requesting the next dynamic search. It introduces the new title only after
  the correlated playback reaches observed `playing`.
- The Tauri WebView sends an origin referrer to the YouTube embed so the playe
  is identified and does not fail with YouTube error 153.
- If the BGM sidecar exited, the next search restarts the owned sidecar. Closing
  an auxiliary window does not tear down the main Shell runtime.
- `Settings > Skills > Youtube Radio DJ` is the single owner of proactive DJ
  policy. General does not render a duplicate profile or weather-location form.
- Weather consent and coordinates remain editable across equivalent parent
  rerenders and persist after Save/reload.

### Test Coverage Map

| Scenario | Unit / contract | UI / integration |
|---|---|---|
| agent restart before a chat turn | `chat-service.test.ts` boolean delivery receipt | `e2e/bgm-skill.spec.ts` asserts same-turn `panel_skills` precedes `chat_request` |
| current search result repeats | `bgm-skill.test.ts` current-video exclusion and same-video replay receipt | BGM Playwright fixture observes a fresh iframe/playback transition |
| YouTube WebView identification | embed URL/remount component contract | Playwright request verifies referrer; paired native Linux Tauri/WebKitGTK Radio queue E2E verifies observed A-to-B playback |
| variable-length and wall-clock playback | playback snapshot carries observed `currentTime`/`duration`; stale playback IDs cannot advance the queue | The default 10-track run is compressed. A 60-minute wall-clock first local fixture followed by nine ordered transitions passed, and an actual 11:58:09 YouTube video passed an eight-hour wall-clock soak with a 7,203.0-second checkpoint and 28,800.6-second final media clock. The latter is one-long-video evidence, not a mixed 20-video session. |
| autonomous next-track DJ | correlated ended observation, one completed transition remark, fresh search and observed next playback | Agent DJ-08 and the controller↔Shell handoff integration pass the full ended-to-next-playing sequence. End-before prefetch remains a separate latency improvement. |
| user override and conversation | other-song replacement, ordinary conversation preservation, barge-in and stop boundary | Playwright covers replacement, conversation preservation and stop/no-late-transition; native TTS race coverage remains pending |
| explicit preference memory | explicit like/dislike only, durable recall, inspect/edit/delete and isolation | Agent acceptance and preference-index contracts cover tagged user-only recall, persisted exact state, tombstone precedence, malformed/assistant exclusion and memory-failure fallback; physical multi-account UI remains operational coverage. |
| recent-track variety | video and normalized-track exclusion, similar-but-new selection, bounded history | Shell search/queue contracts, Agent preference+recent+favorite selector and the 60-track logical eight-hour soak cover automatic duplicate avoidance and bounded state. |
| unified Agent recommendation context | `status` bounds recent/favorite lists; Agent play includes `mode=radio_dj`; local tombstones override recalled preferences | Shell BGM unit/Playwright plus paired Agent DJ-GRPC/DJ-08 contracts |
| voice favorites | idempotent add/remove, favorites-only playback, empty and unplayable entries | Shell structured tool Playwright covers add/play/remove/empty; actual voice intent, restart and unplayable favorite coverage remain pending |
| unplayable YouTube recovery | no false playing/intro, bounded alternative search, network/sidecar recovery | Playwright covers iframe error, 15-second loading timeout, prepared fallback and exhaustion; Agent DJ-06 covers one fresh replacement after a failed play and a single terminal notice after repeated failure. Physical network-loss recovery remains operational coverage. |
| sidecar exits or auxiliary window closes | Rust lifecycle tests | native Tauri sidecar restart/health check |
| one settings owner and durable consent | Settings component rerender test | `settings-slots.spec.ts` Skills ownership, General absence, Save/reload |
## UC-SETTINGS-ROUNDTRIP: 설정 변경·재시작·실행 반영

## UC-ONBOARDING-APPEARANCE-VOICE: 외모와 음성을 독립적으로 시작하기

사용자는 온보딩에서 VRM뿐 아니라 설치된 NVA 외모도 고를 수 있다. 비디오
배경은 재생 기호 대신 실제 영상 프레임 썸네일로 구분한다. 사용자 이름 입력은
특정 개인 이름을 예시로 노출하지 않는다.

GPU가 감지되면 온보딩은 음성 설정에서 로컬 음성과 레퍼런스 음성을 선택할 수
있다고만 안내한다. 온보딩 완료만으로 로컬 GPU 프로파일이나 음성 서버를
자동 시작하지 않으며, NVA 선택을 VRAM 조건과 결합하지 않는다.

대화창 배치는 왼쪽 소형과 왼쪽 채움만 제공한다. 과거에 저장된 중앙 배치는
왼쪽 소형으로 마이그레이션한다. YouTube BGM이 재생 중일 때 같은 재생 버튼을
누르면 즉시 일시정지 상태가 되고, 재생 버튼으로 돌아온다.

### Test Coverage Map

| 상태 | 단위/컴포넌트 | UI/통합 |
|---|---|---|
| 기본·빈 목록 | 온보딩 VRM/NVA 목록 및 일반 이름 placeholder | Playwright 기본 화면 |
| 진행·성공 | GPU 안내, NVA 저장, 비디오 프레임 캡처 | Playwright 선택/저장 및 스크린샷 |
| 오류·복구 | 영상 캡처 실패 시 video 프레임 fallback, GPU 미감지 시 자동 프로파일 없음 | 컴포넌트 오류 fallback |
| 좁은 폭 | 외모/배경 카드와 2-way 대화 배치 | Playwright 좁은 viewport |
| BGM 토글 | listening handshake 뒤 pauseVideo와 즉시 paused 상태 | BGM Playwright |

사용자는 두뇌 역할, 기억 엔진, 음성, Radio DJ, 날씨 동의, 로컬 GPU 프로필 같은 설정을 바꾼다. 저장 성공 뒤 앱을 닫아 다시 실행해도 화면 값, 워크스페이스 파일, 파생 매니페스트와 실제 에이전트 동작이 모두 같은 선택을 사용한다.

- 메모리 LLM을 Naia 또는 상속으로 바꾸면 이전 Ollama 값이 다시 살아나지 않는다.
- sub와 memory는 독립적으로 저장되고 슬롯 요약 및 런타임도 같은 역할을 표시한다.
- API 키는 워크스페이스 파일과 로그에 나타나지 않지만 보안 저장소에서 복원되어 재입력 없이 동작한다.
- 저장 중 파일 또는 에이전트 재로드가 실패하면 성공 표시를 하지 않고, 마지막 정상 실행 구성을 유지한다.
- localStorage를 지우고 다시 열어도 파일에서 같은 값이 복원된다.

검증은 설정 UI 변경 → native 파일 원문 확인 → render cache 제거 → WebView/App 재로드 → UI 복원 → agent effective config/실제 기억 호출 순으로 연결한다.

## 2026-08-06 active Windows scenarios

The following scenarios supersede older active references to `windows_trt_8g`,
Ditto-rendered NVA, a login-gated hardware profile, and automatic Radio DJ.
Those older sections are historical evidence only.

| Scenario | User-observable outcome | Coverage |
|---|---|---|
| **UC-NVA-WEB** | 사용자는 GPU·로그인·로컬 음성 없이 NVA 외모를 선택한다. 실제 web-player가 idle/speaking/gesture/새 발화 자산을 재생하고 재시작 뒤 같은 외모를 복원한다. | clean+migration config, player states, focused UI/native capture |
| **UC-LOCAL-VOICE** | VRAM 6GB+ 사용자는 Voice 설정에서 local voice를 켜고 :8910 ready를 확인한 뒤 레퍼런스 선택·녹음·업로드를 사용한다. OFF하면 엔진과 자식이 종료된다. 로그인과 아바타 선택은 영향을 주지 않는다. | VRAM boundary, no-login, ready/timeout/off, restart roundtrip |
| **UC-MEDIA-CONSENT** | 앱 시작 시 음악은 정지 상태다. 사용자 재생 또는 LLM의 명시적 radio_dj play 호출만 세션을 시작한다. 재생 버튼을 다시 누르면 pause되고 Proactive 토글은 음악 권한이 아니다. | clean/migration negative, skill contract, pause toggle |
| **UC-SHELL-PRESENTATION** | 온보딩에서 일반 이름과 실제 video-frame 썸네일을 보고 VRM/NVA를 고른다. chat은 좌측 두 레이아웃만 제공하며 Proactive는 접근 가능한 compact icon이고 기본 OFF다. | onboarding/layout/accessibility Playwright |
| **UC-WINDOWS-DISCORD** | Windows에서 Gateway를 연결·종료·재연결해도 제한 시간 안에 끝나며 orphan agent가 남지 않는다. | isolated Windows lifecycle integration |

### 2026-08-08 field-review addendum (B8)

`docs/voice-avatar-radio-handoff-2026-08-07.md` 실측 필드리뷰가 위 표의 "완료" 표시에도 남아있던 결함 6건을 적발했다. 아래는 추가 시나리오이며 위 표를 대체하지 않는다.

| Scenario | User-observable outcome | Coverage |
|---|---|---|
| **UC-NVA-TTS-OWNERSHIP** | NVA를 선택한 상태에서 어떤 TTS provider를 골라도(로컬/클라우드/브라우저) 실제로 그 엔진의 음성이 재생된다. NVA는 오디오를 자체 합성하지 않고 Shell의 실제 재생 시작/종료에 맞춰 입모양만 움직인다. 단, 정확히 일치하는 저작 문구(온보딩 인사말 등)는 그 클립 자체의 녹음 음성이 재생된다. | ChatArea 컴포넌트 테스트(계약 재작성 포함), media-runtime-routing contract test |
| **UC-NVA-COMPOSITE** | NVA가 대기·발화·대기를 오갈 때 앱 배경이 항상 유지되고, 알파를 가질 수 없는 발화 클립(mp4 등)이라도 검은 배경이 노출되지 않는다. | prebaked-renderer 유닛 테스트; 실기 Windows 시각 검증은 이 세션에서 미실시 |
| **UC-SETTINGS-AVATAR-SYNC** | 로그인·원격 설정 반영 등으로 메인 화면의 아바타가 NVA로 바뀌면, 설정 탭의 상세/미리보기도 같은 시점에 NVA로 갱신된다(재시작 불요). | SettingsTab hydration 회귀 테스트 |
| **UC-DISCORD-TAB-LIVE** | 대화창 하단 🌐 Channels 탭을 열면 실제 연결 상태·서버·채널 목록·대화 스레드가 보인다("안정화 작업 중" 정적 문구가 아니다). | NaiaMetaArea + ChannelsTab 컴포넌트 테스트 |
| **UC-BGM-NO-FALSE-SKIP** | YouTube 곡이 실제로 재생 중이면, iframe의 "재생 중" 신호 메시지가 유실되더라도(WebView2 핸드셰이크 이슈) 12초 워치독이 다른 곡으로 강제 전환하지 않는다. 진행률(`infoDelivery`) 신호가 독립적으로 재생을 확인한다. | `components/__tests__/BgmPlayer.test.tsx`(신규) + `e2e/bgm-skill.spec.ts` 실 브라우저 재작성(대기열 보존·상태 diagnostic 확인) |
| **UC-BGM-ENDED-NOTIFY** | 곡이 실제로 끝나면(타이머 아님, 진짜 ended 이벤트) Shell이 트랙 시작 때와 동일한 방식으로 에이전트에게 즉시 통지한다. 에이전트가 다음 곡을 고르거나 멘트를 하는 결정은 naia-agent 소관(이 저장소 범위 밖)이라 이 시나리오는 "통지가 나가는지"까지만 다룬다. | `components/__tests__/BgmPlayer.test.tsx`(신규, music_ended 발신 검증) |
| **UC-VOICE-ONBOARDING** | 로그인 이후 온보딩에 음성 단계가 있다: 무료 Web TTS on/off + 시스템 보이스 미리듣기, 그리고 VRAM 6GB+ 감지 시 실제로 로컬 VoxCPM2를 켜고 끌 수 있는 버튼(안내 링크가 아니라 진짜 `start_cascade`/`stop_cascade` 호출). | OnboardingWizard 컴포넌트 테스트(음성 단계 내비게이션 + 실제 invoke 호출 + 저장된 config 필드 검증) + `e2e/onboarding-fresh.spec.ts` 실 브라우저 3/3 통과 |

이번 세션에 실제로 실행한 것: Playwright chromium 신규 설치 후 실 dev server로 `e2e/onboarding-fresh.spec.ts`(3/3) + `e2e/bgm-skill.spec.ts`(12/12, 1건은 옛 강제스킵 동작을 검증하던 낡은 테스트라 새 계약에 맞게 재작성 후 통과) 실행. 여전히 미완료: `e2e-tauri`(네이티브 Tauri/WebDriver) 스위트 미실행. UC-NVA-COMPOSITE의 실제 크로마키 정확도는 headless chromium이 WebView2 특유 경로를 타지 않아 여전히 Windows 실기 미검증.

### 2026-08-08 Naia 기본모델 변경

| Scenario | User-observable outcome | Coverage |
|---|---|---|
| **UC-LLM-DEFAULT-DEEPSEEK-FLASH** | Naia 계정으로 로그인하거나 온보딩을 완료하면 메인 LLM이 `DeepSeek V4 Flash`로 자동 선택된다. 설정 탭 모델 선택기에도 `DeepSeek V4 Flash`가 `DeepSeek V4 Pro` 옆에 나타나고, "Naia 기본값 적용"을 눌러도 같은 값이 채워진다. | `lib/llm/__tests__/registry*.test.ts`, `lib/slots/__tests__/settings-slots.contract.test.ts`, `components/__tests__/SettingsTab.test.tsx` |

any-llm 게이트웨이 쪽(라우팅·가격)은 이미 구현·테스트돼 있어 이번 변경 대상이 아니었다(`pytest tests/gateway/test_naia_azure_models.py tests/unit/test_naia_pricing.py` 78 passed로 확인). 이 시나리오에 대한 전용 Playwright는 없음(모델 선택 자체는 기존 SettingsTab e2e 커버리지 범위 밖) — 이번 세션에서 새로 만들지 않음.

### 2026-08-15 v0.1.7 Windows release rebuild (#448)

| Scenario | User-observable outcome | Coverage |
|---|---|---|
| **UC-V017-WINDOWS-HERDR-RUNTIME** | On a clean Windows profile without a system Visual C++ Redistributable, the installed bundled `herdr.exe` loads, reports its version, starts the Workspace PTY, and reaches snapshot-ready. A missing adjacent runtime is a build failure, not an instruction for the user to install a prerequisite. | `stage-herdr.mjs` adjacency contract, Windows NSIS/MSI payload inspection, installed Workspace smoke |
| **UC-V017-WINDOWS-HERDR-COLD-SERVER** | On a clean Windows profile with no pre-existing `%APPDATA%/herdr/herdr.sock`, opening Workspace explicitly starts the bundled headless Herdr server, waits for its API socket, and only then attaches the embedded PTY. A failed server start preserves stderr and offers a retryable error instead of repeatedly surfacing `server_not_running`. | Rust server lifecycle unit tests + isolated-profile bundled-Herdr probe + clean Windows Workspace smoke |
| **UC-V017-WINDOWS-FIRST-CHAT** | After account onboarding on a clean profile, Shell awaits config/key persistence, reloads settings in the already-running paired Agent, replays the Naia credential, and only then exits onboarding. While this is running the completion action shows progress and cannot be submitted twice; a persistence/reload failure remains on the completion screen with an explicit retry. The first two turns produce non-zero provider usage without restarting the app. | onboarding completion ordering/error component tests, Agent reload IPC contract, exact Agent pairing contract, installed first/second-turn log and usage inspection |
| **UC-V017-WINDOWS-LOCAL-VOICE-MISSING** | On a clean Windows profile whose RTX GPU passes the VRAM gate but whose VoxCPM2 runtime is absent, Shell shows `installation required` with the concrete missing components and disables local-voice selection/start. It never labels the slot `starting`. A stale or failed local-voice selection is atomically restored to the bundled Edge voice in both `config.json` and `slots-manifest.json`, and disabled voice is never auto-started. | Rust installation classification + Settings/onboarding state and rollback tests + Playwright blocked-runtime desktop/narrow acceptance + clean Windows inspection |
| **UC-V017-WINDOWS-AVATAR-CROP** | The default and alternate Naia NVA cards show a recognizable face, an NVA badge, and a visible selected state without clipping the primary action at desktop or narrow width. Empty/loading/error are not applicable to bundled cards; a missing asset renders the existing fallback without blocking selection recovery. | onboarding component test, Playwright desktop/narrow screenshots and DOM/bounding-box assertions, clean Windows WebView2 confirmation |
| **UC-V017-WINDOWS-VOXCPM2-INSTALL** | On a clean Windows profile with a supported NVIDIA GPU but no Python, model cache, cascade checkout, or reference audio, the local-voice surface offers one explicit install/retry action. The action uses bundled, version-checked bootstrap assets, downloads pinned Python/packages/model content into the managed `~/naia-omni` runtime, builds the GPU-specific TensorRT engine, preserves an install log, refreshes every missing step, and starts only after the complete runtime is verified. Failure remains retryable and never changes the selected TTS provider. | staging manifest/hash tests, Rust install single-flight/process/status tests, Settings and onboarding install/error/retry tests, clean Windows runtime-missing install/start smoke |
| **UC-V017-WINDOWS-CLEAN-REINSTALL** | Silent or interactive uninstall removes only Naia-owned WebView/application bootstrap state and credentials, not the user's ADK documents. Reinstalling the same build cannot import `onboardingComplete` from a retained workspace before the new local bootstrap has completed, so the onboarding wizard is shown. NSIS and MSI both carry and verify the cleanup contract. | generated installer configuration tests, NSIS hook/WiX cleanup payload inspection, boot-merge negative tests, clean uninstall/reinstall smoke |
| **UC-V017-WINDOWS-DIAGNOSTICS-RUNTIME** | Diagnostics tails the live Agent stderr log rather than the retired `llm-debug.log`, and the bundled Agent's optional SQLite native module is loadable by the exact bundled Node ABI. A release build fails before packaging when either diagnostic path or native ABI is stale. | Diagnostics component/Playwright test, staged-Agent bundled-Node require smoke, packaging contract test |
| **UC-V017-LIVE-AUTH-ACTIVATION** (#449) | A successful clean-install login refreshes the account balance and activates the persisted Naia credential in the already-running chat core before onboarding completes. The first request works in the same app process; a restart is never the recovery path. Delayed or duplicate auth callbacks remain idempotent, and activation failure stays on a retryable completion state. | auth-activation unit/component tests + clean-profile Playwright first balance/first chat acceptance |
| **UC-V017-WINDOWS-VOXCPM2-SELECT-INSTALL-START** (#450) | On supported Windows NVIDIA hardware, VoxCPM2 remains selectable when its managed runtime is absent. Selecting it runs one transaction: install the pinned `windows_trt_6g` voice runtime, build/verify TensorRT LocDiT, start the direct voice service, pass health, and only then persist the provider. Failure exposes the failed phase/log, rolls back config and slot manifest, and permits retry. Generic cascade loader/service names are not presented as Windows voice prerequisites. | selector state-machine tests + Rust direct-service/install/health tests + clean Windows native acceptance; RTX 2070 success remains unclaimed until that hardware gate passes |
| **UC-V017-ONBOARDING-DEFAULT-NVA-PREVIEW** (#451) | Entering the avatar step publishes the resolved bundled Naia NVA selection as soon as its asset is ready, so the selected card and live preview agree without a click. A later default effect cannot overwrite an explicit user choice. | onboarding component event-order tests + Playwright desktop/narrow/loading/error/keyboard review |
| **UC-V017-ONBOARDING-NAIA-VRM-ASSETS** (#451) | A user who obtains a fresh `naia-adk` sees the two official Naia VRMs alongside the four existing VRMs in onboarding. Each of the six cards has a recognizable loaded thumbnail and remains selectable, while the preselected Naia NVA stays the only initially selected card. | `naia-adk` tracked-asset/hash inspection + avatar preset unit test + Playwright six-card image-load/selection/desktop/narrow review |
| **UC-V017-HERDR-FIRST-SURFACE** (#452) | A clean-install first Workspace open distinguishes Herdr process spawn, API readiness, page load, and renderer failure. A bounded failure becomes an actionable error with retry and safe diagnostics instead of a terminal black `loading` surface; retry preserves the workspace and restarts only the failed layer. | Herdr startup state-machine unit/Rust tests + Playwright/e2e-tauri absent/delayed/exit/page/renderer/retry states |

P02 release-state matrix: build preparation, missing required runtime, successful NSIS/MSI creation, silent install, installed launch; Herdr server already ready/cold start/process absent/delayed ready/process exit/API ready but page failure/renderer failure/timeout/error/retry; first-login config persistence/reload/credential and balance refresh progress/success/error/retry/duplicate callback/crash-before-complete, first-chat success/error without app restart; VoxCPM2 eligible-uninstalled/select-installing/download failure/engine-build failure/verify failure/start failure/health failure/rollback/retry/success and ineligible-GPU states; NVA default asset loading/ready/error, no-click preview, explicit selection, keyboard selection, six installed VRM cards with loaded thumbnails, and desktop/narrow layout; NSIS/MSI silent uninstall plus same-build reinstall; live/stale diagnostic logs; and bundled Node native ABI are checked separately. The Naia live-action card has a distinct face-alignment assertion; generic overflow geometry is not accepted as crop evidence. Publishing remains outside this scenario until the clean-install gate passes.

### 2026-08-14 v0.1.7 launch QA (#447)

| Scenario | User-observable outcome | Coverage |
|---|---|---|
| **UC-V017-FRESH-INSTALL-LLM** | 깨끗한 Windows 신규 설치에서 ADK 경로를 처음 선택하면 실행 중 Agent가 그 경로와 번들 Node 환경으로 즉시 다시 시작되고, 온보딩 완료 뒤 인증·알림·LLM/TTS 자격증명이 다시 전달되어 앱 재시작 없이 첫 일반 대화가 응답한다. | ADK 저장/재시작 Rust 계약, startup credential React 계약, fresh-profile Playwright, Windows 설치본 실측 |
| **UC-V017-HERDR-READY** | 깨끗한 설치에서 Workspace를 처음 열면 번들 Herdr PTY가 먼저 시작되고 API가 준비될 때까지 제한 시간 안에 기다린 뒤 snapshot을 표시한다. 준비 실패는 무한 대기나 빈 성공이 아니라 다시 시도 가능한 오류로 보인다. | Herdr runtime unit, Workspace Playwright, Windows 설치본 실측 |
| **UC-V017-CHAT-LAYOUT** | Workspace를 열어도 대화창 형식은 사용자가 고른 `왼쪽 소형`/`왼쪽 채움`을 유지하며, 저장값이 없는 신규 프로필은 왼쪽 소형이다. 중앙 대형 채팅은 존재하지 않는다. | layout state unit + fresh/workspace Playwright |
| **UC-V017-AVATAR-PICKER** | 신규 온보딩의 외모 선택은 VRM/NVA 통합 그리드, 얼굴 중심 썸네일, 유형 배지를 제공하고 기본 Naia NVA를 미리 선택한다. 기본 완료 시 `avatarProvider=naia-video-avatar`, `nvaModel=naia`가 저장된다. | onboarding component + fresh-profile Playwright screenshot/DOM |

P02 상태 매트릭스: 신규 기본, ADK 경로 저장 중, Agent 재시작 성공/실패, Herdr 준비 중/성공/실패·재시도, Workspace의 왼쪽 소형/왼쪽 채움, 아바타 VRM/NVA 선택을 각각 확인한다. 브라우저 Playwright 전체 스위트와 Linux native Tauri가 자동 검증 범위이며, 실제 NSIS 설치·번들 Node·WebView2·Windows 프로세스 수명은 Windows 인계 후 깨끗한 VM에서 최종 확인한다.
