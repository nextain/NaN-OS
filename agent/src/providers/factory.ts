import { createAnthropicProvider } from "./anthropic.js";
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

	switch (config.provider) {
		case "gemini":
			return createGeminiProvider(config.apiKey, config.model);
		case "openai":
			return createOpenAIProvider(config.apiKey, config.model);
		case "anthropic":
			return createAnthropicProvider(config.apiKey, config.model);
		case "xai":
			return createXAIProvider(config.apiKey, config.model);
		case "zai":
			return createZAIProvider(config.apiKey, config.model);
		case "ollama":
			return createOpenAIProvider("ollama", config.model);
		default:
			throw new Error(`Unknown provider: ${config.provider}`);
	}
}
