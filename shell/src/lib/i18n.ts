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
