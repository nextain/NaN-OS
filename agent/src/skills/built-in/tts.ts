import {
	type TtsAutoMode,
	type TtsMode,
	type TtsProvider,
	convertTts,
	disableTts,
	enableTts,
	getTtsProviders,
	getTtsStatus,
	setTtsAutoMode,
	setTtsOutputMode,
	setTtsProvider,
} from "../../gateway/tts-proxy.js";
import { synthesizeEdgeSpeech } from "../../tts/edge-tts.js";
import { synthesizeElevenLabsSpeech } from "../../tts/elevenlabs-tts.js";
import { synthesizeOpenAISpeech } from "../../tts/openai-tts.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createTtsSkill(): SkillDefinition {
	return {
		name: "skill_tts",
		description:
			"Manage Gateway TTS (Text-to-Speech). Actions: status, providers, set_provider, set_auto, set_mode, enable, disable, convert, preview.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						"Action: status, providers, set_provider, set_auto, set_mode, enable, disable, convert, preview",
					enum: [
						"status",
						"providers",
						"set_provider",
						"set_auto",
						"set_mode",
						"enable",
						"disable",
						"convert",
						"preview",
					],
				},
				provider: {
					type: "string",
					description:
						"TTS provider (openai, elevenlabs, edge). Required for set_provider and preview.",
				},
				text: {
					type: "string",
					description: "Text to convert. Required for convert and preview.",
				},
				voice: {
					type: "string",
					description: "Voice name (optional, for convert and preview).",
				},
				apiKey: {
					type: "string",
					description: "API key for preview (OpenAI or ElevenLabs).",
				},
				auto: {
					type: "string",
					description: "Auto mode for set_auto: off, always, inbound, tagged.",
					enum: ["off", "always", "inbound", "tagged"],
				},
				mode: {
					type: "string",
					description: "Output mode for set_mode: final, all.",
					enum: ["final", "all"],
				},
			},
			required: ["action"],
		},
		tier: 0,
		requiresGateway: false,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			// preview action works without Gateway
			if (action !== "preview" && !gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error:
						"Gateway not connected. TTS management requires a running Gateway.",
				};
			}

			switch (action) {
				case "status": {
					const result = await getTtsStatus(gateway!);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "providers": {
					const result = await getTtsProviders(gateway!);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "set_provider": {
					const provider = args.provider as string;
					if (!provider) {
						return {
							success: false,
							output: "",
							error: "provider is required for set_provider action",
						};
					}
					const result = await setTtsProvider(
						gateway!,
						provider as TtsProvider,
					);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "set_auto": {
					const auto = args.auto as TtsAutoMode | undefined;
					if (!auto) {
						return {
							success: false,
							output: "",
							error: "auto is required for set_auto action",
						};
					}
					const result = await setTtsAutoMode(gateway!, auto);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "set_mode": {
					const mode = args.mode as TtsMode | undefined;
					if (!mode) {
						return {
							success: false,
							output: "",
							error: "mode is required for set_mode action",
						};
					}
					const result = await setTtsOutputMode(gateway!, mode);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "enable": {
					const result = await enableTts(gateway!);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "disable": {
					const result = await disableTts(gateway!);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "preview": {
					const text = args.text as string;
					const provider = args.provider as string;
					if (!text) {
						return {
							success: false,
							output: "",
							error: "text is required for preview action",
						};
					}
					let audio: string | null = null;
					if (provider === "openai") {
						const key = args.apiKey as string;
						if (!key) {
							return {
								success: false,
								output: "",
								error: "apiKey is required for OpenAI preview",
							};
						}
						audio = await synthesizeOpenAISpeech(
							text,
							key,
							args.voice as string | undefined,
						);
					} else if (provider === "elevenlabs") {
						const key = args.apiKey as string;
						if (!key) {
							return {
								success: false,
								output: "",
								error: "apiKey is required for ElevenLabs preview",
							};
						}
						audio = await synthesizeElevenLabsSpeech(
							text,
							key,
							args.voice as string | undefined,
						);
					} else {
						// Default: Edge TTS (free)
						audio = await synthesizeEdgeSpeech(
							text,
							args.voice as string | undefined,
						);
					}
					if (audio) {
						return {
							success: true,
							output: JSON.stringify({ audio, format: "mp3" }),
						};
					}
					return {
						success: false,
						output: "",
						error: `${provider || "edge"} TTS 미리듣기에 실패했습니다.`,
					};
				}

				case "convert": {
					const text = args.text as string;
					if (!text) {
						return {
							success: false,
							output: "",
							error: "text is required for convert action",
						};
					}
					// Try Gateway first, fall back to direct edge-tts if no audio
					const result = await convertTts(gateway!, text, {
						voice: args.voice as string | undefined,
					});
					if (result.audio) {
						return {
							success: true,
							output: JSON.stringify(result),
						};
					}
					// Gateway returned no audio — use msedge-tts directly
					const edgeAudio = await synthesizeEdgeSpeech(
						text,
						args.voice as string | undefined,
					);
					if (edgeAudio) {
						return {
							success: true,
							output: JSON.stringify({
								audio: edgeAudio,
								format: "mp3",
							}),
						};
					}
					return {
						success: false,
						output: "",
						error: "TTS 변환에 실패했습니다.",
					};
				}

				default:
					return {
						success: false,
						output: "",
						error: `Unknown action: ${action}`,
					};
			}
		},
	};
}
