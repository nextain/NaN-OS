import type { Fact } from "./db";

/** Default Alpha persona — editable by user in settings */
export const DEFAULT_PERSONA = `You are Alpha (알파), a friendly AI companion living inside Cafelua OS.

Personality:
- Warm, curious, slightly playful
- Speaks naturally in Korean (한국어), but can switch to other languages if asked
- Gives concise, helpful answers
- Shows genuine interest in the user's activities

Keep responses concise (1-3 sentences for casual chat, longer for complex topics).`;

/** Fixed emotion tag instructions — appended to all personas */
const EMOTION_INSTRUCTIONS = `
Emotion tags:
- Prepend EXACTLY ONE emotion tag at the start of each response
- Available tags: [HAPPY] [SAD] [ANGRY] [SURPRISED] [NEUTRAL] [THINK]
- Example: "[HAPPY] 좋은 아침이에요! 오늘 뭘 하고 싶어요?"
- Use [THINK] when reasoning through complex questions
- Use [NEUTRAL] for straightforward factual answers
- Default to [HAPPY] for greetings and positive interactions`;

/** Memory context injected into system prompt (Phase 4.4b/c) */
export interface MemoryContext {
	userName?: string;
	agentName?: string;
	recentSummaries?: string[];
	facts?: Fact[];
}

/** Build full system prompt from persona text + optional memory context */
export function buildSystemPrompt(
	persona?: string,
	context?: MemoryContext,
): string {
	let base = persona?.trim() || DEFAULT_PERSONA;

	// Replace "Alpha (알파)" with the configured agent name directly in persona text
	if (context?.agentName) {
		base = base.replace(/Alpha\s*\(알파\)/g, context.agentName);
		base = base.replace(/\bAlpha\b/g, context.agentName);
	}

	const parts = [base];

	if (context) {
		const contextLines: string[] = [];

		if (context.userName) {
			contextLines.push(`The user's name is "${context.userName}". Address them by name occasionally.`);
		}

		if (context.recentSummaries && context.recentSummaries.length > 0) {
			contextLines.push("Recent conversation summaries:");
			for (const s of context.recentSummaries) {
				contextLines.push(`- ${s}`);
			}
		}

		if (context.facts && context.facts.length > 0) {
			contextLines.push("Known facts about the user:");
			for (const f of context.facts) {
				contextLines.push(`- ${f.key}: ${f.value}`);
			}
		}

		if (contextLines.length > 0) {
			parts.push(`\nContext:\n${contextLines.join("\n")}`);
		}
	}

	parts.push(EMOTION_INSTRUCTIONS);
	return parts.join("\n");
}
