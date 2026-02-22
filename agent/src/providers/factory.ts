import { createAnthropicProvider } from "./anthropic.js";
import { createClaudeCodeCliProvider } from "./claude-code-cli.js";
import { createGeminiProvider } from "./gemini.js";
import { createLabProxyProvider } from "./lab-proxy.js";
import { createOpenAIProvider } from "./openai.js";
import type { LLMProvider, ProviderConfig } from "./types.js";
import { createXAIProvider } from "./xai.js";
import { createZAIProvider } from "./zai.js";

export function buildProvider(config: ProviderConfig): LLMProvider {
	// Lab proxy mode: route through any-llm Gateway
	if (config.labKey) {
		return createLabProxyProvider(config.labKey, config.model);
	}

	const getApiKey = (key: string, envVar: string) => key || process.env[envVar] || "";

	switch (config.provider) {
		case "nextain":
			throw new Error("Nextain provider requires Naia OS account login.");
		case "claude-code-cli":
			return createClaudeCodeCliProvider(config.model);
		case "gemini":
			return createGeminiProvider(getApiKey(config.apiKey, "GEMINI_API_KEY"), config.model);
		case "openai":
			return createOpenAIProvider(getApiKey(config.apiKey, "OPENAI_API_KEY"), config.model);
		case "anthropic":
			return createAnthropicProvider(getApiKey(config.apiKey, "ANTHROPIC_API_KEY"), config.model);
		case "xai":
			return createXAIProvider(getApiKey(config.apiKey, "XAI_API_KEY"), config.model);
		case "zai":
			return createZAIProvider(getApiKey(config.apiKey, "ZHIPU_API_KEY"), config.model);
		case "ollama":
			return createOpenAIProvider("ollama", config.model);
		default:
			throw new Error(`Unknown provider: ${config.provider}`);
	}
}
