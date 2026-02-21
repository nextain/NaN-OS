export type Locale = "ko" | "en";

const translations = {
	// Settings
	"settings.title": { ko: "설정", en: "Settings" },
	"settings.provider": { ko: "프로바이더", en: "Provider" },
	"settings.aiSection": { ko: "AI 설정", en: "AI Settings" },
	"settings.model": { ko: "모델", en: "Model" },
	"settings.apiKey": { ko: "API 키", en: "API Key" },
	"settings.apiKeyRequired": {
		ko: "API 키를 입력해주세요.",
		en: "Please enter an API key.",
	},
	"settings.language": { ko: "언어", en: "Language" },
	"settings.theme": { ko: "테마", en: "Theme" },
	"settings.background": { ko: "배경 이미지", en: "Background Image" },
	"settings.backgroundClear": { ko: "제거", en: "Clear" },
	"settings.reset": { ko: "초기화", en: "Reset All" },
	"settings.resetConfirm": {
		ko: "모든 설정과 카메라 위치를 초기화합니다.",
		en: "This will reset all settings and camera position.",
	},
	"settings.resetClearHistory": {
		ko: "대화 기록도 함께 삭제",
		en: "Also delete chat history",
	},
	"settings.resetExecute": {
		ko: "초기화 실행",
		en: "Execute Reset",
	},
	"settings.save": { ko: "저장", en: "Save" },
	"settings.cancel": { ko: "취소", en: "Cancel" },

	// Chat
	"chat.placeholder": {
		ko: "메시지를 입력하세요...",
		en: "Type a message...",
	},
	"chat.noApiKey": {
		ko: "API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.",
		en: "No API key configured. Please enter your API key in settings.",
	},
	"chat.error": { ko: "오류", en: "Error" },
	"chat.settings": { ko: "설정", en: "Settings" },
	"chat.tokens": { ko: "토큰", en: "tokens" },
	"settings.voiceSection": { ko: "음성 (TTS/STT)", en: "Voice (TTS/STT)" },
	"settings.googleApiKey": {
		ko: "Google API 키 (TTS/STT용)",
		en: "Google API Key (for TTS/STT)",
	},
	"settings.googleApiKeyGeminiFallback": {
		ko: "비워두면 대화용 키 사용",
		en: "Leave empty to use chat key",
	},
	"settings.personaSection": { ko: "페르소나", en: "Persona" },
	"settings.persona": {
		ko: "Naia 성격 설정",
		en: "Naia Personality",
	},
	"settings.personaHint": {
		ko: "이름, 성격, 말투, 행동 등을 자유롭게 설정하세요. 감정 태그는 자동 추가됩니다.",
		en: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.",
	},
	"settings.ttsEnabled": { ko: "음성 응답 (TTS)", en: "Voice Response (TTS)" },
	"settings.sttEnabled": { ko: "음성 입력 (STT)", en: "Voice Input (STT)" },
	"settings.ttsVoice": { ko: "TTS 음성", en: "TTS Voice" },
	"settings.voicePreview": { ko: "미리 듣기", en: "Preview" },
	"settings.voicePreviewing": { ko: "재생 중...", en: "Playing..." },
	"chat.recording": { ko: "녹음 중...", en: "Recording..." },
	"chat.micError": {
		ko: "마이크를 사용할 수 없습니다.",
		en: "Microphone is not available.",
	},

	// Tools
	"tool.execute_command": { ko: "명령 실행", en: "Execute Command" },
	"tool.read_file": { ko: "파일 읽기", en: "Read File" },
	"tool.write_file": { ko: "파일 쓰기", en: "Write File" },
	"tool.search_files": { ko: "파일 검색", en: "Search Files" },
	"tool.web_search": { ko: "웹 검색", en: "Web Search" },
	"tool.apply_diff": { ko: "파일 편집", en: "Apply Diff" },
	"tool.browser": { ko: "웹 페이지", en: "Browser" },
	"tool.sessions_spawn": { ko: "서브 에이전트", en: "Sub-agent" },
	"tool.unknown": { ko: "도구 실행", en: "Tool Execution" },
	"settings.toolsSection": { ko: "도구 (Tools)", en: "Tools" },
	"settings.enableTools": { ko: "도구 사용", en: "Enable Tools" },
	"settings.gatewayUrl": { ko: "Gateway URL", en: "Gateway URL" },
	"settings.gatewayToken": { ko: "Gateway 토큰", en: "Gateway Token" },
	"settings.allowedTools": {
		ko: "허용된 도구",
		en: "Allowed Tools",
	},
	"settings.clearAllowedTools": {
		ko: "허용 목록 초기화",
		en: "Clear Allowed Tools",
	},

	// Permission modal
	"permission.title": {
		ko: "도구 실행 승인",
		en: "Tool Execution Approval",
	},
	"permission.allowOnce": { ko: "이번만 허용", en: "Allow Once" },
	"permission.allowAlways": { ko: "항상 허용", en: "Always Allow" },
	"permission.reject": { ko: "거부", en: "Reject" },
	"permission.tier1": { ko: "알림", en: "Notice" },
	"permission.tier2": { ko: "주의", en: "Caution" },
	"permission.rejectReason": {
		ko: "사용자가 실행을 거부했습니다.",
		en: "User rejected execution.",
	},
	"permission.timeout": {
		ko: "승인 시간이 초과되었습니다.",
		en: "Approval timed out.",
	},

	// Work Progress
	"progress.title": { ko: "작업 현황", en: "Work Progress" },
	"progress.loading": { ko: "로딩 중...", en: "Loading..." },
	"progress.empty": {
		ko: "기록이 없습니다. 대화를 시작하면 여기에 표시됩니다.",
		en: "No events yet. Start a conversation to see progress here.",
	},
	"progress.refresh": { ko: "새로고침", en: "Refresh" },
	"progress.totalEvents": { ko: "총 이벤트", en: "Total Events" },
	"progress.totalCost": { ko: "총 비용", en: "Total Cost" },
	"progress.toolCount": { ko: "도구 수", en: "Tools Used" },
	"progress.errorCount": { ko: "에러 수", en: "Errors" },
	"progress.tabChat": { ko: "채팅", en: "Chat" },
	"progress.tabProgress": { ko: "작업", en: "Progress" },

	// Memory
	"chat.newConversation": { ko: "새 대화", en: "New Chat" },

	// Settings tab
	"settings.saved": { ko: "저장됨!", en: "Saved!" },

	// Skills Tab
	"skills.tabSkills": { ko: "스킬", en: "Skills" },
	"skills.loading": { ko: "스킬 로딩 중...", en: "Loading skills..." },
	"skills.empty": {
		ko: "등록된 스킬이 없습니다.",
		en: "No skills registered.",
	},
	"skills.enabled": { ko: "활성", en: "Enabled" },
	"skills.disabled": { ko: "비활성", en: "Disabled" },
	"skills.builtIn": { ko: "기본", en: "Built-in" },
	"skills.custom": { ko: "커스텀", en: "Custom" },
	"skills.gateway": { ko: "게이트웨이", en: "Gateway" },
	"skills.command": { ko: "명령", en: "Command" },
	"skills.search": { ko: "스킬 검색...", en: "Search skills..." },
	"skills.enableAll": { ko: "전체 활성", en: "Enable All" },
	"skills.disableAll": { ko: "전체 비활성", en: "Disable All" },
	"skills.builtInSection": { ko: "기본 스킬", en: "Built-in Skills" },
	"skills.customSection": { ko: "커스텀 스킬", en: "Custom Skills" },
	"skills.askAI": {
		ko: "AI에게 이 스킬에 대해 질문하기",
		en: "Ask AI about this skill",
	},
	"skills.gatewayStatusSection": {
		ko: "Gateway 스킬 상태",
		en: "Gateway Skills Status",
	},
	"skills.eligible": { ko: "사용 가능", en: "Eligible" },
	"skills.install": { ko: "설치", en: "Install" },
	"skills.installing": { ko: "설치 중...", en: "Installing..." },
	"skills.missing": { ko: "필요 항목", en: "Missing" },
	"skills.gatewayLoading": {
		ko: "Gateway 스킬 로딩 중...",
		en: "Loading Gateway skills...",
	},

	// Cost Dashboard (4.4-ui)
	"cost.title": { ko: "비용 상세", en: "Cost Details" },
	"cost.provider": { ko: "프로바이더", en: "Provider" },
	"cost.model": { ko: "모델", en: "Model" },
	"cost.messages": { ko: "메시지", en: "Messages" },
	"cost.inputTokens": { ko: "입력 토큰", en: "Input Tokens" },
	"cost.outputTokens": { ko: "출력 토큰", en: "Output Tokens" },
	"cost.total": { ko: "합계", en: "Total" },
	"cost.empty": { ko: "비용 데이터가 없습니다.", en: "No cost data." },

	// History Tab (4.4-ui)
	"history.title": { ko: "대화 기록", en: "History" },
	"history.empty": {
		ko: "대화 기록이 없습니다.",
		en: "No conversation history.",
	},
	"history.untitled": { ko: "제목 없음", en: "Untitled" },
	"history.messages": { ko: "메시지", en: "messages" },
	"history.delete": { ko: "삭제", en: "Delete" },
	"history.deleteConfirm": {
		ko: "이 대화를 삭제하시겠습니까?",
		en: "Delete this conversation?",
	},
	"history.current": { ko: "현재", en: "Current" },
	"history.tabHistory": { ko: "기록", en: "History" },

	// Progress filter (4.4-ui)
	"progress.showAll": { ko: "전체 보기", en: "Show All" },
	"progress.filteredErrors": {
		ko: "에러만 표시 중",
		en: "Showing errors only",
	},

	// Message queue (4.4-ui)
	"chat.queued": { ko: "대기 중", en: "queued" },

	// Onboarding (conversational)
	"onboard.provider.title": {
		ko: "어떤 두뇌를 사용할까요?",
		en: "Which brain should we use?",
	},
	"onboard.agentName.title": {
		ko: "안녕! 나에게 이름을 지어줘!",
		en: "Hi! Give me a name!",
	},
	"onboard.agentName.description": {
		ko: "",
		en: "",
	},
	"onboard.userName.title": {
		ko: "나는 {agent}! 너는 뭐라고 부르면 돼?",
		en: "I'm {agent}! What should I call you?",
	},
	"onboard.userName.description": {
		ko: "",
		en: "",
	},
	"onboard.name.placeholder": { ko: "이름을 입력하세요", en: "Enter a name" },
	"onboard.character.title": {
		ko: "{user}, {agent}의 모습을 골라줘",
		en: "{user}, choose {agent}'s look",
	},
	"onboard.character.hint": {
		ko: "나중에 설정에서 나만의 VRM 모델을 추가할 수 있어요.",
		en: "You can add your own VRM model later in Settings.",
	},
	"onboard.personality.title": {
		ko: "{agent}의 성격을 골라줘!",
		en: "Choose {agent}'s personality!",
	},
	"onboard.personality.hint": {
		ko: "나중에 설정에서 자유롭게 수정할 수 있어요.",
		en: "You can edit this later in Settings.",
	},
	"onboard.apiKey.title": {
		ko: "API 키를 입력해주세요",
		en: "Enter your API key",
	},
	"onboard.apiKey.validate": { ko: "연결 확인", en: "Validate" },
	"onboard.apiKey.validating": { ko: "확인 중...", en: "Validating..." },
	"onboard.apiKey.success": { ko: "연결 성공!", en: "Connected!" },
	"onboard.apiKey.error": {
		ko: "연결 실패. 키를 확인해주세요.",
		en: "Connection failed. Check your key.",
	},
	"onboard.complete.greeting": {
		ko: "반가워요, {name}!",
		en: "Nice to meet you, {name}!",
	},
	"onboard.complete.ready": {
		ko: "{agent} 준비 완료! 이제 시작해볼까요?",
		en: "{agent} is ready! Shall we begin?",
	},
	"onboard.complete.start": { ko: "시작하기", en: "Get Started" },
	"onboard.next": { ko: "다음", en: "Next" },
	"onboard.back": { ko: "이전", en: "Back" },
	"onboard.skip": { ko: "건너뛰기", en: "Skip" },

	// Session summarization (4.4b)
	"chat.summarizing": { ko: "요약 중...", en: "Summarizing..." },
	"chat.summarized": { ko: "요약 완료", en: "Summarized" },

	// Facts (4.4c)
	"settings.memorySection": { ko: "기억", en: "Memory" },
	"settings.factsEmpty": {
		ko: "저장된 기억이 없습니다.",
		en: "No stored memories.",
	},
	"settings.factDelete": { ko: "삭제", en: "Delete" },
	"chat.extractingFacts": {
		ko: "기억 추출 중...",
		en: "Extracting memories...",
	},

	// Avatar & Background (VRM/BG picker)
	"settings.avatarSection": { ko: "아바타", en: "Avatar" },
	"settings.vrmModel": { ko: "VRM 모델", en: "VRM Model" },
	"settings.vrmCustom": { ko: "파일 선택...", en: "Choose File..." },
	"settings.backgroundSection": {
		ko: "배경",
		en: "Background",
	},
	"settings.bgCustom": { ko: "파일 선택...", en: "Choose File..." },
	"settings.bgNone": { ko: "기본 그라데이션", en: "Default Gradient" },

	// Lab integration (Phase 5)
	"onboard.lab.title": {
		ko: "Lab 계정으로 바로 시작하기",
		en: "Get started with Lab account",
	},
	"onboard.lab.description": {
		ko: "API 키 없이 무료로 바로 사용할 수 있고, 설정도 저장/복원됩니다.",
		en: "Free to use without an API key. Settings are saved and restored.",
	},
	"onboard.lab.login": { ko: "Lab 로그인", en: "Lab Login" },
	"onboard.lab.waiting": {
		ko: "로그인 대기 중...",
		en: "Waiting for login...",
	},
	"onboard.lab.or": { ko: "또는 직접 API 키 입력", en: "or enter API key manually" },
	"onboard.lab.timeout": {
		ko: "로그인 응답이 없어요. 다시 시도해주세요.",
		en: "No login response. Please try again.",
	},
	"settings.labSection": { ko: "Nextain 랩 계정", en: "Nextain Lab Account" },
	"settings.labConnected": { ko: "연결됨", en: "Connected" },
	"settings.labDisconnected": { ko: "미연결", en: "Not Connected" },
	"settings.labConnect": { ko: "Lab 로그인", en: "Lab Login" },
	"settings.labDisconnect": { ko: "연결 해제", en: "Disconnect" },
	"settings.labDisconnectConfirm": {
		ko: "Lab 연결을 해제하시겠습니까?",
		en: "Disconnect Lab account?",
	},
	"settings.labUserId": { ko: "유저 ID", en: "User ID" },
	"settings.manual": { ko: "사용법 매뉴얼", en: "User Manual" },
	"settings.labDashboard": { ko: "대시보드", en: "Dashboard" },
	"settings.labBalance": { ko: "크레딧 잔액", en: "Credit Balance" },
	"settings.labBalanceLoading": {
		ko: "잔액 조회 중...",
		en: "Loading balance...",
	},
	"cost.labBalance": { ko: "Lab 잔액", en: "Lab Balance" },
	"cost.labCredits": { ko: "크레딧", en: "credits" },
	"cost.labCharge": { ko: "크레딧 충전", en: "Charge Credits" },
	"cost.labLoading": { ko: "잔액 조회 중...", en: "Loading balance..." },
	"cost.labError": { ko: "잔액 조회 실패", en: "Failed to load balance" },

	// Channels Tab (Phase 4)
	"channels.tabChannels": { ko: "채널", en: "Channels" },
	"channels.title": { ko: "메시징 채널", en: "Messaging Channels" },
	"channels.loading": { ko: "채널 로딩 중...", en: "Loading channels..." },
	"channels.empty": {
		ko: "연결된 채널이 없습니다. Gateway가 실행 중인지 확인하세요.",
		en: "No channels connected. Make sure Gateway is running.",
	},
	"channels.connected": { ko: "연결됨", en: "Connected" },
	"channels.disconnected": { ko: "연결 안 됨", en: "Disconnected" },
	"channels.enabled": { ko: "활성", en: "Enabled" },
	"channels.disabled": { ko: "비활성", en: "Disabled" },
	"channels.logout": { ko: "로그아웃", en: "Logout" },
	"channels.logoutConfirm": {
		ko: "이 채널에서 로그아웃하시겠습니까?",
		en: "Log out of this channel?",
	},
	"channels.login": { ko: "로그인", en: "Login" },
	"channels.loginQr": {
		ko: "QR 코드를 스캔하여 로그인하세요",
		en: "Scan the QR code to log in",
	},
	"channels.loginWaiting": {
		ko: "QR 스캔 대기 중...",
		en: "Waiting for QR scan...",
	},
	"channels.noAccounts": {
		ko: "계정 없음",
		en: "No accounts",
	},
	"channels.error": { ko: "오류", en: "Error" },
	"channels.refresh": { ko: "새로고침", en: "Refresh" },
	"channels.gatewayRequired": {
		ko: "Gateway 연결이 필요합니다. 설정에서 Gateway URL을 확인하세요.",
		en: "Gateway connection required. Check Gateway URL in settings.",
	},

	// Channel settings section (Phase 4)
	"settings.channelsSection": {
		ko: "채널 관리",
		en: "Channel Management",
	},
	"settings.channelsHint": {
		ko: "Gateway를 통해 Discord, Slack, Telegram 등의 채널을 관리합니다.",
		en: "Manage Discord, Slack, Telegram and other channels via Gateway.",
	},
	"settings.channelsOpenTab": {
		ko: "채널 탭에서 관리",
		en: "Manage in Channels tab",
	},

	// Gateway TTS section (Phase 5)
	"settings.gatewayTtsSection": {
		ko: "Gateway TTS",
		en: "Gateway TTS",
	},
	"settings.gatewayTtsHint": {
		ko: "Gateway를 통해 OpenAI, ElevenLabs, Edge TTS 프로바이더를 사용합니다.",
		en: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.",
	},
	"settings.gatewayTtsProvider": {
		ko: "TTS 프로바이더",
		en: "TTS Provider",
	},
	"settings.gatewayTtsLoading": {
		ko: "프로바이더 로딩...",
		en: "Loading providers...",
	},
	"settings.gatewayTtsNone": {
		ko: "프로바이더 없음",
		en: "No providers available",
	},
	"settings.gatewayTtsNotConfigured": {
		ko: "(미설정)",
		en: "(not configured)",
	},

	// Voice wake section (Phase 5)
	"settings.voiceWakeSection": {
		ko: "음성 활성화",
		en: "Voice Wake",
	},
	"settings.voiceWakeHint": {
		ko: "호출어를 말하면 AI가 깨어납니다.",
		en: "Say the wake word to activate AI.",
	},
	"settings.voiceWakeTriggers": {
		ko: "호출어 목록",
		en: "Wake Triggers",
	},
	"settings.voiceWakeAdd": {
		ko: "추가",
		en: "Add",
	},
	"settings.voiceWakeRemove": {
		ko: "제거",
		en: "Remove",
	},
	"settings.voiceWakePlaceholder": {
		ko: "호출어 입력...",
		en: "Enter wake word...",
	},
	"settings.voiceWakeSave": {
		ko: "호출어 저장",
		en: "Save Triggers",
	},
	"settings.voiceWakeSaved": {
		ko: "저장됨!",
		en: "Saved!",
	},
	"settings.voiceWakeLoading": {
		ko: "호출어 로딩...",
		en: "Loading triggers...",
	},

	// Agents tab (Phase 6)
	"agents.tabAgents": { ko: "에이전트", en: "Agents" },
	"agents.agentsTitle": { ko: "에이전트 목록", en: "Agents" },
	"agents.sessionsTitle": {
		ko: "서브에이전트 세션",
		en: "Sub-agent Sessions",
	},
	"agents.loading": {
		ko: "에이전트 로딩 중...",
		en: "Loading agents...",
	},
	"agents.error": { ko: "오류", en: "Error" },
	"agents.refresh": { ko: "새로고침", en: "Refresh" },
	"agents.noAgents": { ko: "등록된 에이전트 없음", en: "No agents found" },
	"agents.noSessions": {
		ko: "서브에이전트 세션 없음",
		en: "No sub-agent sessions",
	},
	"agents.compact": { ko: "압축", en: "Compact" },
	"agents.deleteSession": { ko: "삭제", en: "Delete" },
	"agents.deleteSessionConfirm": {
		ko: "이 세션을 삭제하시겠습니까?",
		en: "Delete this session?",
	},
	"agents.gatewayRequired": {
		ko: "Gateway 연결이 필요합니다. 설정에서 Gateway URL을 확인하세요.",
		en: "Gateway connection required. Check Gateway URL in settings.",
	},
	"agents.filesTitle": { ko: "에이전트 파일", en: "Agent Files" },
	"agents.filesEmpty": { ko: "파일 없음", en: "No files" },
	"agents.filesLoading": { ko: "파일 로딩 중...", en: "Loading files..." },
	"agents.filesSave": { ko: "저장", en: "Save" },
	"agents.filesSaved": { ko: "저장됨!", en: "Saved!" },
	"agents.filesFailed": { ko: "저장 실패", en: "Save failed" },

	// Diagnostics tab
	"diagnostics.tabDiagnostics": { ko: "진단", en: "Diagnostics" },
	"diagnostics.gatewayStatus": { ko: "Gateway 상태", en: "Gateway Status" },
	"diagnostics.connected": { ko: "연결됨", en: "Connected" },
	"diagnostics.disconnected": { ko: "연결 안 됨", en: "Disconnected" },
	"diagnostics.version": { ko: "버전", en: "Version" },
	"diagnostics.uptime": { ko: "가동 시간", en: "Uptime" },
	"diagnostics.methods": { ko: "사용 가능 메서드", en: "Available Methods" },
	"diagnostics.loading": { ko: "상태 확인 중...", en: "Checking status..." },
	"diagnostics.error": { ko: "상태 확인 실패", en: "Failed to check status" },
	"diagnostics.refresh": { ko: "새로고침", en: "Refresh" },
	"diagnostics.logsTitle": { ko: "실시간 로그", en: "Live Logs" },
	"diagnostics.logsEmpty": { ko: "로그 없음", en: "No logs" },
	"diagnostics.logsTailing": { ko: "로그 수신 중...", en: "Tailing logs..." },
	"diagnostics.logsStart": { ko: "로그 시작", en: "Start Logs" },
	"diagnostics.logsStop": { ko: "로그 중지", en: "Stop Logs" },
	"diagnostics.logsClear": { ko: "로그 초기화", en: "Clear Logs" },

	// Device pairing (in Settings)
	"settings.deviceSection": { ko: "디바이스 페어링", en: "Device Pairing" },
	"settings.deviceHint": {
		ko: "Gateway와 연결된 노드(디바이스)를 관리합니다.",
		en: "Manage nodes (devices) connected to Gateway.",
	},
	"settings.deviceLoading": {
		ko: "디바이스 로딩 중...",
		en: "Loading devices...",
	},
	"settings.deviceEmpty": { ko: "페어링된 디바이스 없음", en: "No paired devices" },
	"settings.deviceApprove": { ko: "승인", en: "Approve" },
	"settings.deviceReject": { ko: "거부", en: "Reject" },
	"settings.devicePending": { ko: "대기 중", en: "Pending" },
	"settings.devicePairRequests": {
		ko: "페어링 요청",
		en: "Pair Requests",
	},
	"settings.deviceNoPairRequests": {
		ko: "대기 중인 요청 없음",
		en: "No pending requests",
	},
} as const;

type TranslationKey = keyof typeof translations;

let currentLocale: Locale = detectLocale();

function detectLocale(): Locale {
	// Check saved config first
	try {
		const raw = localStorage.getItem("naia-config");
		if (raw) {
			const config = JSON.parse(raw);
			if (config.locale === "ko" || config.locale === "en") {
				return config.locale;
			}
		}
	} catch {
		// ignore
	}

	// Fall back to OS/browser language
	const lang = navigator.language.toLowerCase();
	if (lang.startsWith("ko")) return "ko";
	return "en";
}

export function getLocale(): Locale {
	return currentLocale;
}

export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

export function t(key: TranslationKey): string {
	return translations[key][currentLocale];
}
