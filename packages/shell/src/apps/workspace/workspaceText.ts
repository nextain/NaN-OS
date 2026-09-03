import { getLocale } from "../../lib/i18n";

const messages = {
	editorLoading: {
		ko: "편집기를 불러오는 중…",
		en: "Loading editor…",
	},
	editorLoadError: {
		ko: "편집기를 불러오지 못했습니다.",
		en: "Could not load the editor.",
	},
} as const;

export function workspaceText(key: keyof typeof messages): string {
	const message = messages[key];
	return getLocale() === "ko" ? message.ko : message.en;
}
