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
		ko: "모든 설정과 카메라 위치를 초기화하시겠습니까?",
		en: "Reset all settings and camera position?",
	},
	"settings.save": { ko: "저장", en: "Save" },
	"settings.cancel": { ko: "닫기", en: "Close" },

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
		ko: "Alpha 성격 설정",
		en: "Alpha Personality",
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
	"onboard.agentName.title": {
		ko: "안녕! 저는 당신의 AI 캐릭터예요.",
		en: "Hi! I'm your AI character.",
	},
	"onboard.agentName.description": {
		ko: "제 이름을 지어주세요!",
		en: "Give me a name!",
	},
	"onboard.userName.title": {
		ko: "저는 {agent}! 당신은 뭐라고 불러드릴까요?",
		en: "I'm {agent}! What should I call you?",
	},
	"onboard.userName.description": {
		ko: "비워두셔도 괜찮아요.",
		en: "You can leave this empty.",
	},
	"onboard.name.placeholder": { ko: "이름을 입력하세요", en: "Enter your name" },
	"onboard.character.title": {
		ko: "{agent}의 모습을 골라주세요!",
		en: "Choose {agent}'s look!",
	},
	"onboard.personality.title": {
		ko: "{agent}의 성격을 골라주세요!",
		en: "Choose {agent}'s personality!",
	},
	"onboard.provider.title": {
		ko: "어떤 AI 두뇌를 사용할까요?",
		en: "Which AI brain should I use?",
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
	"settings.memorySection": { ko: "기억 (Facts)", en: "Memory (Facts)" },
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
		ko: "lab.cafelua.com에 로그인하면 API 키 없이 바로 사용할 수 있어요!",
		en: "Log in to lab.cafelua.com to start without an API key!",
	},
	"onboard.lab.login": { ko: "Lab 로그인", en: "Lab Login" },
	"onboard.lab.waiting": {
		ko: "로그인 대기 중...",
		en: "Waiting for login...",
	},
	"onboard.lab.or": { ko: "또는 직접 API 키 입력", en: "or enter API key manually" },
	"settings.labSection": { ko: "Lab 계정", en: "Lab Account" },
	"settings.labConnected": { ko: "연결됨", en: "Connected" },
	"settings.labDisconnected": { ko: "미연결", en: "Not Connected" },
	"settings.labConnect": { ko: "Lab 로그인", en: "Lab Login" },
	"settings.labDisconnect": { ko: "연결 해제", en: "Disconnect" },
	"settings.labDisconnectConfirm": {
		ko: "Lab 연결을 해제하시겠습니까?",
		en: "Disconnect Lab account?",
	},
	"settings.labUserId": { ko: "유저 ID", en: "User ID" },
	"cost.labBalance": { ko: "Lab 잔액", en: "Lab Balance" },
	"cost.labCredits": { ko: "크레딧", en: "credits" },
	"cost.labCharge": { ko: "크레딧 충전", en: "Charge Credits" },
	"cost.labLoading": { ko: "잔액 조회 중...", en: "Loading balance..." },
	"cost.labError": { ko: "잔액 조회 실패", en: "Failed to load balance" },
} as const;

type TranslationKey = keyof typeof translations;

let currentLocale: Locale = detectLocale();

function detectLocale(): Locale {
	// Check saved config first
	try {
		const raw = localStorage.getItem("cafelua-config");
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
