/**
 * Converts the assistant's display text into text that is safe to speak.
 * The chat transcript keeps the original Markdown; only TTS receives this form.
 */
export const ttsTextFilter = Object.freeze({
	filter(input: string): string {
		return input
			.replace(/\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/gi, "")
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`([^`]*)`/g, "$1")
			.replace(/(^|\n)\s{0,3}(?:#{1,6}|>|[-+*])\s+/g, "$1")
			.replace(/[*_~]/g, "")
			.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
			.replace(/\s+/g, " ")
			.trim();
	},
});
