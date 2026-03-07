import { readFile } from "node:fs/promises";
import type { GatewayClient } from "./client.js";

export type TtsProvider = "google" | "openai" | "elevenlabs" | "edge";
export type TtsMode = "final" | "all";
export type TtsAutoMode = "off" | "always" | "inbound" | "tagged";

/** Result from tts.status RPC */
export interface TtsStatusResult {
	enabled: boolean;
	provider: TtsProvider;
	auto: TtsAutoMode;
	mode: TtsMode;
	hasOpenAIKey?: boolean;
	hasElevenLabsKey?: boolean;
	edgeEnabled?: boolean;
}

/** Provider info from tts.providers RPC */
export interface TtsProviderInfo {
	id: string;
	label: string;
	configured: boolean;
	voices: string[];
}

/** Result from tts.convert RPC */
export interface TtsConvertResult {
	audio: string;
	format: string;
	durationMs?: number;
}

/** Get current TTS status and configuration */
export async function getTtsStatus(
	client: GatewayClient,
): Promise<TtsStatusResult> {
	const payload = await client.request("tts.status", {});
	return payload as TtsStatusResult;
}

/** List available TTS providers with configuration status */
export async function getTtsProviders(
	client: GatewayClient,
): Promise<TtsProviderInfo[]> {
	const payload = await client.request("tts.providers", {});
	// Gateway may return { providers: [...], active: "..." } or a plain array
	if (Array.isArray(payload)) return payload as TtsProviderInfo[];
	const wrapped = payload as Record<string, unknown>;
	if (Array.isArray(wrapped.providers))
		return wrapped.providers as TtsProviderInfo[];
	return [];
}

/** Change the active TTS provider */
export async function setTtsProvider(
	client: GatewayClient,
	provider: TtsProvider,
): Promise<{ provider: string; applied: boolean }> {
	const payload = await client.request("tts.setProvider", { provider });
	return payload as { provider: string; applied: boolean };
}

/** Convert text to speech audio */
export async function convertTts(
	client: GatewayClient,
	text: string,
	options?: { voice?: string },
): Promise<TtsConvertResult> {
	if (!text.trim()) return { audio: "", format: "mp3" };
	const params: Record<string, unknown> = { text };
	if (options?.voice) {
		params.voice = options.voice;
	}
	const payload = await client.request("tts.convert", params);
	const raw = payload as Record<string, unknown>;

	// Gateway may return { audio: base64 } directly or { audioPath: "/tmp/..." }
	if (typeof raw.audio === "string" && raw.audio.length > 0) {
		return {
			audio: raw.audio,
			format: (raw.format as string) ?? "mp3",
			durationMs: raw.durationMs as number | undefined,
		};
	}

	// Read audio file from audioPath and convert to base64
	if (typeof raw.audioPath === "string") {
		const buf = await readFile(raw.audioPath);
		const ext = raw.audioPath.split(".").pop() ?? "mp3";
		return {
			audio: buf.toString("base64"),
			format: (raw.outputFormat as string) ?? ext,
		};
	}

	return { audio: "", format: "mp3" };
}

/** Enable TTS */
export async function enableTts(
	client: GatewayClient,
): Promise<{ enabled: boolean }> {
	const payload = await client.request("tts.enable", {});
	return payload as { enabled: boolean };
}

/** Disable TTS */
export async function disableTts(
	client: GatewayClient,
): Promise<{ enabled: boolean }> {
	const payload = await client.request("tts.disable", {});
	return payload as { enabled: boolean };
}

/**
 * Update messages.tts.* via config.patch.
 * OpenClaw requires baseHash for config writes when config exists.
 */
async function patchMessagesTts(
	client: GatewayClient,
	patch: Record<string, unknown>,
): Promise<void> {
	const snapshot = (await client.request("config.get", {})) as {
		hash?: string;
		exists?: boolean;
	};
	const params: Record<string, unknown> = {
		raw: JSON.stringify({ messages: { tts: patch } }),
	};
	if (snapshot?.exists && typeof snapshot.hash === "string" && snapshot.hash) {
		params.baseHash = snapshot.hash;
	}
	await client.request("config.patch", params);
}

/** Set OpenClaw auto TTS mode (messages.tts.auto) */
export async function setTtsAutoMode(
	client: GatewayClient,
	auto: TtsAutoMode,
): Promise<{ auto: TtsAutoMode }> {
	await patchMessagesTts(client, { auto });
	return { auto };
}

/** Set OpenClaw output mode (messages.tts.mode) */
export async function setTtsOutputMode(
	client: GatewayClient,
	mode: TtsMode,
): Promise<{ mode: TtsMode }> {
	await patchMessagesTts(client, { mode });
	return { mode };
}
