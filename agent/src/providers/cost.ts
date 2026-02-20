/** Per-million-token pricing for supported models */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	// Gemini 3
	"gemini-3.1-pro-preview": { input: 2.0, output: 12.0 },
	"gemini-3-flash-preview": { input: 0.5, output: 3.0 },
	// Gemini 2.5
	"gemini-2.5-flash": { input: 0.15, output: 0.6 },
	"gemini-2.5-pro": { input: 1.25, output: 10.0 },
	// Gemini 2.0
	"gemini-2.0-flash": { input: 0.1, output: 0.4 },
	"gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
	// xAI
	"grok-3": { input: 3.0, output: 15.0 },
	"grok-3-fast": { input: 5.0, output: 25.0 },
	"grok-3-mini": { input: 0.3, output: 0.5 },
	"grok-3-mini-fast": { input: 0.6, output: 4.0 },
	"grok-2": { input: 2.0, output: 10.0 },
	// Anthropic
	"claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
	"claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
	"claude-opus-4-6": { input: 15.0, output: 75.0 },
	// OpenAI
	"gpt-4o": { input: 2.5, output: 10.0 },
	"gpt-4o-mini": { input: 0.15, output: 0.6 },
	"gpt-5-2025-08-07": { input: 1.25, output: 10.0 },
	"o3-mini": { input: 1.1, output: 4.4 },
	// zAI (GLM)
	"glm-4.7": { input: 0.6, output: 2.2 },
	"glm-4.5": { input: 0.6, output: 2.2 },
	"glm-4.5-air": { input: 0.2, output: 1.2 },
};

export function calculateCost(
	model: string,
	inputTokens: number,
	outputTokens: number,
): number {
	const pricing = MODEL_PRICING[model];
	if (!pricing) return 0;
	return (
		(pricing.input / 1_000_000) * inputTokens +
		(pricing.output / 1_000_000) * outputTokens
	);
}
