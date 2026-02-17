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
