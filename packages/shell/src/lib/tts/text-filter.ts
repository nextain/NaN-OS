/** Locale-specific extensions applied after the common LLM-to-speech rules. */
export interface TtsTextRule {
	readonly locale: "fallback" | "ko" | "en" | "ja" | "zh";
	transformInlineCode(content: string): string;
}

const makeRule = (locale: TtsTextRule["locale"]): TtsTextRule =>
	Object.freeze({
		locale,
		// Inline code is meaningful prose in every currently supported locale.
		// Providers should receive its content, never the Markdown backticks.
		transformInlineCode: (content: string) => content,
	});

export const ttsTextRuleRegistry = Object.freeze({
	fallback: makeRule("fallback"),
	ko: makeRule("ko"),
	en: makeRule("en"),
	ja: makeRule("ja"),
	zh: makeRule("zh"),
});

export function resolveTtsTextRule(locale?: string): TtsTextRule {
	const language = locale?.trim().toLowerCase().split(/[-_]/, 1)[0];
	if (language && language in ttsTextRuleRegistry) {
		return ttsTextRuleRegistry[language as keyof typeof ttsTextRuleRegistry];
	}
	return ttsTextRuleRegistry.fallback;
}

/** The canonical TTS payload normalizer shared by every voice provider. */
export const ttsTextFilter = Object.freeze({
	filter(input: string, locale?: string): string {
		const rule = resolveTtsTextRule(locale);
		return input
			.replace(/```[\s\S]*?(?:```|$)/g, " ")
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			.replace(/\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/gi, "")
			.replace(/`([^`]*)`/g, (_match, content: string) =>
				rule.transformInlineCode(content),
			)
			.replace(/(?:https?:\/\/|www\.)[^\s<>()]+/gi, " ")
			.replace(/(^|\n)\s{0,3}(?:#{1,6}|>|[-+*])\s+/g, "$1")
			.replace(/(?:^|\s)(?:[:;=8xX]-?[)(DPp/\\]|\^_\^)(?=\s|$)/g, " ")
			.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
			.replace(/[★☆◆◇■□●○◎※▶▷◀◁✓✔✕✖✦✧]/g, " ")
			.replace(/[*_~]/g, "")
			.replace(/\s+/g, " ")
			.trim();
	},
});
