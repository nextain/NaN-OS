import type { Fact } from "./db";

/** Default Naia persona — editable by user in settings */
export const DEFAULT_PERSONA = `You are Naia (낸), a friendly AI companion living inside Naia OS.

Personality:
- Warm, curious, slightly playful
- Speaks naturally in Korean (한국어), but can switch to other languages if asked
- Gives concise, helpful answers
- Shows genuine interest in the user's activities

Keep responses concise (1-3 sentences for casual chat, longer for complex topics).`;

/** Fixed emotion tag instructions — appended to all personas */
const EMOTION_INSTRUCTIONS = `
Emotion tags (for Shell avatar only):
- Prepend EXACTLY ONE emotion tag at the start of each response
- Available tags: [HAPPY] [SAD] [ANGRY] [SURPRISED] [NEUTRAL] [THINK]
- Example: "[HAPPY] 좋은 아침이에요! 오늘 뭘 하고 싶어요?"
- Use [THINK] when reasoning through complex questions
- Use [NEUTRAL] for straightforward factual answers
- Default to [HAPPY] for greetings and positive interactions
- IMPORTANT: Emotion tags are for the Shell avatar's facial expression only. They are automatically stripped from Discord messages.

Discord (IMPORTANT — use ONLY skill_naia_discord, NEVER the built-in "message" tool):
- skill_naia_discord has EXACTLY 3 actions: "send", "status", "history". No other actions exist.
- send: skill_naia_discord action="send" message="...". Recipient is auto-resolved — NEVER ask user for IDs.
- status: skill_naia_discord action="status". Returns connection info, channel IDs, user IDs.
- history: skill_naia_discord action="history". Returns recent DM messages.
- Write messages naturally with emoji. Do NOT include emotion tags in Discord messages.`;

/** Memory context injected into system prompt (Phase 4.4b/c) */
export interface MemoryContext {
	userName?: string;
	agentName?: string;
	honorific?: string;
	speechStyle?: string;
	recentSummaries?: string[];
	facts?: Fact[];
	discordDefaultUserId?: string;
	discordDmChannelId?: string;
}

/** Build full system prompt from persona text + optional memory context */
export function buildSystemPrompt(
	persona?: string,
	context?: MemoryContext,
): string {
	let base = persona?.trim() || DEFAULT_PERSONA;

	// Replace "Naia (낸)" with the configured agent name directly in persona text
	if (context?.agentName) {
		base = base.replace(/Naia\s*\(낸\)/g, context.agentName);
		base = base.replace(/\bNan\b/g, context.agentName);
	}

	const parts = [base];

	if (context) {
		const contextLines: string[] = [];

		if (context.userName) {
			contextLines.push(
				`The user's name is "${context.userName}". Address them by name occasionally.`,
			);
		}

		if (context.honorific) {
			contextLines.push(
				`Call the user "${context.userName || ""}${context.honorific}" (e.g., "${context.userName || ""}${context.honorific}").`,
			);
		}

		if (context.speechStyle) {
			contextLines.push(
				context.speechStyle === "반말"
					? "IMPORTANT: Speak casually in Korean (반말). Do NOT use 존댓말."
					: "IMPORTANT: Speak politely in Korean (존댓말). Do NOT use 반말.",
			);
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

		if (context.discordDefaultUserId || context.discordDmChannelId) {
			contextLines.push("Discord DM config (use with skill_naia_discord):");
			if (context.discordDefaultUserId) {
				contextLines.push(`- User ID: ${context.discordDefaultUserId}`);
			}
			if (context.discordDmChannelId) {
				contextLines.push(`- DM Channel ID: ${context.discordDmChannelId}`);
			}
		}

		if (contextLines.length > 0) {
			parts.push(`\nContext:\n${contextLines.join("\n")}`);
		}
	}

	parts.push(EMOTION_INSTRUCTIONS);
	return parts.join("\n");
}
