import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLongPress } from "../hooks/useLongPress";
import { directToolCall } from "../lib/chat-service";
import {
	DEFAULT_GATEWAY_URL,
	LAB_GATEWAY_URL,
	MODEL_OPTIONS,
	type ThemeId,
	type TtsProviderId,
	clearAllowedTools,
	getDefaultModel,
	loadConfig,
	resolveGatewayUrl,
	saveConfig,
	getLabKeySecure,
} from "../lib/config";
import {
	type Fact,
	deleteFact,
	getAllFacts,
} from "../lib/db";
import { type Locale, getLocale, setLocale, t } from "../lib/i18n";
import { parseLabCredits } from "../lib/lab-balance";
import { Logger } from "../lib/logger";
import { syncToOpenClaw, restartGateway } from "../lib/openclaw-sync";
import { fetchLabConfig, pushConfigToLab, clearLabConfig, diffConfigs } from "../lib/lab-sync";
import { DEFAULT_PERSONA, buildSystemPrompt } from "../lib/persona";
import { persistDiscordDefaults } from "../lib/discord-auth";
import { resetGatewaySession } from "../lib/gateway-sessions";
import type { ProviderId } from "../lib/types";
import { AVATAR_PRESETS, DEFAULT_AVATAR_MODEL } from "../lib/avatar-presets";
import { useAvatarStore } from "../stores/avatar";
import { useChatStore } from "../stores/chat";

const PROVIDERS: { id: ProviderId; label: string; disabled?: boolean }[] = [
	{ id: "nextain", label: "Nextain (Naia OS)" },
	{ id: "claude-code-cli", label: "Claude Code CLI (Local)" },
	{ id: "gemini", label: "Google Gemini" },
	{ id: "openai", label: "OpenAI (ChatGPT)", disabled: true },
	{ id: "anthropic", label: "Anthropic (Claude)", disabled: true },
	{ id: "xai", label: "xAI (Grok)", disabled: true },
	{ id: "zai", label: "zAI (GLM)", disabled: true },
	{ id: "ollama", label: "Ollama", disabled: true },
];

const TTS_VOICES: { id: string; label: string; price: string }[] = [
	{ id: "ko-KR-Neural2-A", label: "여성 A (Neural2)", price: "$16/1M자" },
	{ id: "ko-KR-Neural2-B", label: "여성 B (Neural2)", price: "$16/1M자" },
	{ id: "ko-KR-Neural2-C", label: "남성 C (Neural2)", price: "$16/1M자" },
	{ id: "ko-KR-Wavenet-A", label: "여성 A (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Wavenet-B", label: "여성 B (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Wavenet-C", label: "남성 C (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Wavenet-D", label: "남성 D (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Standard-A", label: "여성 A (Standard)", price: "$4/1M자" },
	{ id: "ko-KR-Standard-B", label: "여성 B (Standard)", price: "$4/1M자" },
	{ id: "ko-KR-Standard-C", label: "남성 C (Standard)", price: "$4/1M자" },
	{ id: "ko-KR-Standard-D", label: "남성 D (Standard)", price: "$4/1M자" },
];

// Fallback voice lists for gateway providers that don't return voices dynamically
const ALL_EDGE_VOICES: string[] = [
	// 한국어
	"ko-KR-SunHiNeural",
	"ko-KR-InJoonNeural",
	"ko-KR-HyunsuMultilingualNeural",
	// English
	"en-US-AvaNeural",
	"en-US-AndrewNeural",
	"en-US-EmmaNeural",
	"en-US-BrianNeural",
	"en-US-AriaNeural",
	"en-US-AnaNeural",
	"en-US-ChristopherNeural",
	"en-US-EricNeural",
	"en-US-GuyNeural",
	"en-US-JennyNeural",
	"en-US-MichelleNeural",
	"en-US-RogerNeural",
	"en-US-SteffanNeural",
	"en-US-AndrewMultilingualNeural",
	"en-US-AvaMultilingualNeural",
	"en-US-BrianMultilingualNeural",
	"en-US-EmmaMultilingualNeural",
	"en-GB-LibbyNeural",
	"en-GB-SoniaNeural",
	"en-GB-RyanNeural",
	"en-GB-ThomasNeural",
	"en-GB-MaisieNeural",
	"en-AU-NatashaNeural",
	"en-AU-WilliamMultilingualNeural",
	// 日本語
	"ja-JP-NanamiNeural",
	"ja-JP-KeitaNeural",
	// 中文
	"zh-CN-XiaoxiaoNeural",
	"zh-CN-XiaoyiNeural",
	"zh-CN-YunjianNeural",
	"zh-CN-YunxiNeural",
	"zh-CN-YunxiaNeural",
	"zh-CN-YunyangNeural",
	"zh-TW-HsiaoChenNeural",
	"zh-TW-HsiaoYuNeural",
	"zh-TW-YunJheNeural",
	// Français
	"fr-FR-DeniseNeural",
	"fr-FR-HenriNeural",
	"fr-FR-EloiseNeural",
	"fr-FR-VivienneMultilingualNeural",
	"fr-FR-RemyMultilingualNeural",
	// Deutsch
	"de-DE-KatjaNeural",
	"de-DE-ConradNeural",
	"de-DE-AmalaNeural",
	"de-DE-KillianNeural",
	"de-DE-SeraphinaMultilingualNeural",
	"de-DE-FlorianMultilingualNeural",
	// Русский
	"ru-RU-SvetlanaNeural",
	"ru-RU-DmitryNeural",
	// Español
	"es-ES-ElviraNeural",
	"es-ES-AlvaroNeural",
	"es-ES-XimenaNeural",
	"es-MX-DaliaNeural",
	"es-MX-JorgeNeural",
	// العربية
	"ar-SA-ZariyahNeural",
	"ar-SA-HamedNeural",
	"ar-EG-SalmaNeural",
	"ar-EG-ShakirNeural",
	// हिन्दी
	"hi-IN-SwaraNeural",
	"hi-IN-MadhurNeural",
	// বাংলা
	"bn-BD-NabanitaNeural",
	"bn-BD-PradeepNeural",
	"bn-IN-TanishaaNeural",
	"bn-IN-BashkarNeural",
	// Português
	"pt-BR-FranciscaNeural",
	"pt-BR-AntonioNeural",
	"pt-BR-ThalitaMultilingualNeural",
	"pt-PT-RaquelNeural",
	"pt-PT-DuarteNeural",
	// Bahasa Indonesia
	"id-ID-GadisNeural",
	"id-ID-ArdiNeural",
	// Tiếng Việt
	"vi-VN-HoaiMyNeural",
	"vi-VN-NamMinhNeural",
];

/** Filter Edge voices by locale; multilingual voices always included */
function getEdgeVoicesForLocale(loc: string): string[] {
	const langPrefix = loc.slice(0, 2).toLowerCase() + "-";
	return ALL_EDGE_VOICES.filter(
		(v) => v.toLowerCase().startsWith(langPrefix) || v.includes("Multilingual"),
	);
}

const OPENAI_VOICES: string[] = [
	"alloy", "ash", "coral", "echo", "fable",
	"nova", "onyx", "sage", "shimmer",
];

// Voices that require gpt-4o-mini-tts or are unreliable with tts-1
const OPENAI_EXCLUDED_VOICES = new Set(["ballad", "cedar", "juniper", "marin", "verse"]);

const ELEVENLABS_VOICES: string[] = [
	"Rachel", "Domi", "Bella", "Antoni", "Elli",
	"Josh", "Arnold", "Adam", "Sam",
];

type GatewayTtsAuto = "off" | "always" | "inbound" | "tagged";
type GatewayTtsMode = "final" | "all";

const TTS_PROVIDERS: {
	id: TtsProviderId;
	label: string;
	needsKey: boolean;
	keyLabel?: string;
	keyPlaceholder?: string;
	usesGateway: boolean;
	gatewayProviderId?: string; // maps to OpenClaw TTS provider ID
}[] = [
	{ id: "nextain", label: "Nextain Cloud TTS", needsKey: false, usesGateway: false },
	{ id: "edge", label: "Edge TTS (Free)", needsKey: false, usesGateway: true, gatewayProviderId: "edge" },
	{ id: "google", label: "Google Cloud TTS", needsKey: true, keyLabel: "Google API Key", keyPlaceholder: "AIza...", usesGateway: false },
	{ id: "openai", label: "OpenAI TTS", needsKey: true, keyLabel: "OpenAI API Key", keyPlaceholder: "sk-...", usesGateway: true, gatewayProviderId: "openai" },
	{ id: "elevenlabs", label: "ElevenLabs", needsKey: true, keyLabel: "ElevenLabs API Key", keyPlaceholder: "xi-...", usesGateway: true, gatewayProviderId: "elevenlabs" },
];

const LOCALES: { id: Locale; label: string }[] = [
	{ id: "ko", label: "한국어" },
	{ id: "en", label: "English" },
	{ id: "ja", label: "日本語" },
	{ id: "zh", label: "中文" },
	{ id: "fr", label: "Français" },
	{ id: "de", label: "Deutsch" },
	{ id: "ru", label: "Русский" },
	{ id: "es", label: "Español" },
	{ id: "ar", label: "العربية" },
	{ id: "hi", label: "हिन्दी" },
	{ id: "bn", label: "বাংলা" },
	{ id: "pt", label: "Português" },
	{ id: "id", label: "Bahasa Indonesia" },
	{ id: "vi", label: "Tiếng Việt" },
];

function getNaiaWebBaseUrl() {
	return (
		import.meta.env.VITE_NAIA_WEB_BASE_URL?.trim() ||
		"https://naia.nextain.io"
	);
}

interface DeviceNode {
	nodeId: string;
	displayName?: string;
	platform?: string;
}

interface PairReq {
	requestId: string;
	nodeId: string;
	status: string;
}

function normalizeLocalPath(path: string): string {
	if (!path.startsWith("file://")) return path;
	try {
		return decodeURIComponent(new URL(path).pathname);
	} catch {
		return path.replace(/^file:\/\//, "");
	}
}

function toAssetUrl(path: string): string {
	const normalized = normalizeLocalPath(path);
	if (normalized.startsWith("http://localhost")) {
		return normalized.replace(
			/^http:\/\/localhost\/?/,
			"http://asset.localhost/",
		);
	}
	if (
		normalized.startsWith("/assets/") ||
		normalized.startsWith("/avatars/") ||
		normalized.startsWith("asset:") ||
		normalized.startsWith("http://asset.localhost") ||
		normalized.startsWith("tauri://") ||
		normalized.startsWith("blob:") ||
		normalized.startsWith("data:")
	) {
		return normalized;
	}
	const assetUrl = convertFileSrc(normalized);
	return assetUrl
		.replace(/^asset:\/\/localhost\/?/, "http://asset.localhost/")
		.replace(/^http:\/\/localhost\/?/, "http://asset.localhost/");
}

function buildVrmPreviewCandidates(path: string): string[] {
	const rootPath = normalizeLocalPath(path).replace(/\.vrm$/i, "");
	const candidates = [".webp", ".png", ".jpg", ".jpeg"];
	return candidates.map((ext) => toAssetUrl(`${rootPath}${ext}`));
}

function buildLocalVrmPreviewCandidates(path: string): string[] {
	const rootPath = normalizeLocalPath(path).replace(/\.vrm$/i, "");
	return [".webp", ".png", ".jpg", ".jpeg"].map((ext) => `${rootPath}${ext}`);
}

function isAbsoluteLocalFilePath(path: string): boolean {
	return path.startsWith("/");
}

function guessMimeType(path: string): string {
	const ext = path.toLowerCase().split(".").pop() ?? "";
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		case "bmp":
			return "image/bmp";
		default:
			return "application/octet-stream";
	}
}

function CustomAssetCard({
	path,
	isSelected,
	onSelect,
	onDelete,
	type,
}: {
	path: string;
	isSelected: boolean;
	onSelect: () => void;
	onDelete: () => void;
	type: "vrm" | "bg";
}) {
	const [deleteMode, setDeleteMode] = useState(false);
	const previewCandidates = useMemo(
		() => (type === "vrm" ? buildVrmPreviewCandidates(path) : []),
		[path, type],
	);
	const [previewIndex, setPreviewIndex] = useState(0);
	const [localPreviewSrc, setLocalPreviewSrc] = useState<string | null>(null);
	useEffect(() => {
		setPreviewIndex(0);
	}, [path, type]);
	useEffect(() => {
		let revokedUrl = "";
		let cancelled = false;
		setLocalPreviewSrc(null);

		const normalized = normalizeLocalPath(path);
		const isLocal =
			isAbsoluteLocalFilePath(normalized) &&
			!normalized.startsWith("/assets/") &&
			!normalized.startsWith("/avatars/");
		if (!isLocal) return;

		const loadLocalPreview = async () => {
			try {
				const targetPaths =
					type === "bg" ? [normalized] : buildLocalVrmPreviewCandidates(normalized);
				for (const targetPath of targetPaths) {
					try {
						const bytes = await invoke<number[]>("read_local_binary", {
							path: targetPath,
						});
						if (cancelled) return;
						const blob = new Blob([new Uint8Array(bytes)], {
							type: guessMimeType(targetPath),
						});
						revokedUrl = URL.createObjectURL(blob);
						setLocalPreviewSrc(revokedUrl);
						return;
					} catch {
						// try next candidate
					}
				}
			} catch {
				// keep default preview fallback
			}
		};

		void loadLocalPreview();
		return () => {
			cancelled = true;
			if (revokedUrl) URL.revokeObjectURL(revokedUrl);
		};
	}, [path, type]);
	const lp = useLongPress(
		() => setDeleteMode(true),
		() => {
			if (deleteMode) onDelete();
			else onSelect();
		},
	);

	if (type === "vrm") {
		const previewSrc = localPreviewSrc ?? previewCandidates[previewIndex];
		return (
			<button
				type="button"
				className={`vrm-card ${isSelected ? "active" : ""} ${deleteMode ? "shake" : ""}`}
				title={path}
				{...lp}
				onClick={(e) => {
					e.preventDefault();
					if (!deleteMode) onSelect();
				}}
				style={{ position: "relative" }}
				onMouseLeave={() => {
					lp.onMouseLeave();
					setDeleteMode(false);
				}}
			>
				{previewSrc ? (
					<img
						src={previewSrc}
						alt={path.split("/").pop()?.replace(".vrm", "") ?? "VRM"}
						style={{ width: "100%", height: "100%", objectFit: "cover" }}
						onError={() => {
							if (previewIndex < previewCandidates.length - 1) {
								setPreviewIndex((prev) => prev + 1);
							} else {
								setPreviewIndex(-1);
							}
						}}
					/>
				) : (
					<>
						<span className="vrm-card-icon">&#x1F464;</span>
						<span className="vrm-card-label">
							{path.split("/").pop()?.replace(".vrm", "")}
						</span>
					</>
				)}
				{deleteMode && <div className="delete-overlay">🗑️</div>}
			</button>
		);
	}

	return (
		<button
			type="button"
			className={`bg-card ${isSelected ? "active" : ""} ${deleteMode ? "shake" : ""}`}
			title={path}
			{...lp}
			onClick={(e) => {
				e.preventDefault();
				if (!deleteMode) onSelect();
			}}
			style={{ position: "relative" }}
			onMouseLeave={() => {
				lp.onMouseLeave();
				setDeleteMode(false);
			}}
		>
			<span
				className="bg-card-preview"
				style={{
					backgroundImage: `url(${localPreviewSrc ?? toAssetUrl(path)})`,
				}}
			/>
			<span className="bg-card-label">{path.split("/").pop()}</span>
			{deleteMode && <div className="delete-overlay">🗑️</div>}
		</button>
	);
}

function DevicePairingSection() {
	const [nodes, setNodes] = useState<DeviceNode[]>([]);
	const [pairRequests, setPairRequests] = useState<PairReq[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchDevices = useCallback(async () => {
		const config = loadConfig();
		const gatewayUrl = resolveGatewayUrl(config);
		if (!gatewayUrl) return;
		setLoading(true);
		try {
			const [nodesRes, pairRes] = await Promise.all([
				directToolCall({
					toolName: "skill_device",
					args: { action: "node_list" },
					requestId: `dev-nodes-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config?.gatewayToken,
				}),
				directToolCall({
					toolName: "skill_device",
					args: { action: "pair_list" },
					requestId: `dev-pairs-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config?.gatewayToken,
				}),
			]);

			if (nodesRes.success && nodesRes.output) {
				const parsed = JSON.parse(nodesRes.output);
				setNodes(parsed.nodes || []);
			}
			if (pairRes.success && pairRes.output) {
				const parsed = JSON.parse(pairRes.output);
				setPairRequests(parsed.requests || []);
			}
		} catch (err) {
			Logger.warn("DevicePairing", "Failed to fetch devices", {
				error: String(err),
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchDevices();
	}, [fetchDevices]);

	const handlePairAction = useCallback(
		async (requestId: string, action: "approve" | "reject") => {
			const config = loadConfig();
			const gatewayUrl = resolveGatewayUrl(config);
			try {
				await directToolCall({
					toolName: "skill_device",
					args: { action: `pair_${action}`, requestId },
					requestId: `dev-${action}-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config?.gatewayToken,
				});
				fetchDevices();
			} catch (err) {
				Logger.warn("DevicePairing", `Failed to ${action}`, {
					error: String(err),
				});
			}
		},
		[fetchDevices],
	);

	return (
		<>
			<div className="settings-section-divider">
				<span>{t("settings.deviceSection")}</span>
			</div>
			<div className="settings-field">
				<span className="settings-hint">{t("settings.deviceHint")}</span>
			</div>

			{loading ? (
				<div className="settings-field">
					<span className="settings-hint">{t("settings.deviceLoading")}</span>
				</div>
			) : (
				<>
					{/* Paired nodes */}
					{nodes.length === 0 ? (
						<div className="settings-field">
							<span className="settings-hint">{t("settings.deviceEmpty")}</span>
						</div>
					) : (
						<div className="device-nodes-list">
							{nodes.map((node) => (
								<div key={node.nodeId} className="device-node-card">
									<span className="device-node-name">
										{node.displayName || node.nodeId}
									</span>
									{node.platform && (
										<span className="device-node-platform">
											{node.platform}
										</span>
									)}
								</div>
							))}
						</div>
					)}

					{/* Pair requests */}
					{pairRequests.length > 0 && (
						<>
							<div className="settings-field">
								<label>{t("settings.devicePairRequests")}</label>
							</div>
							<div className="device-pair-requests">
								{pairRequests.map((req) => (
									<div key={req.requestId} className="device-pair-card">
										<span className="device-pair-node">{req.nodeId}</span>
										<span className="device-pair-status">
											{req.status === "pending"
												? t("settings.devicePending")
												: req.status}
										</span>
										{req.status === "pending" && (
											<div className="device-pair-actions">
												<button
													type="button"
													className="device-pair-approve"
													onClick={() =>
														handlePairAction(req.requestId, "approve")
													}
												>
													{t("settings.deviceApprove")}
												</button>
												<button
													type="button"
													className="device-pair-reject"
													onClick={() =>
														handlePairAction(req.requestId, "reject")
													}
												>
													{t("settings.deviceReject")}
												</button>
											</div>
										)}
									</div>
								))}
							</div>
						</>
					)}

					{pairRequests.length === 0 && nodes.length > 0 && (
						<div className="settings-field">
							<span className="settings-hint">
								{t("settings.deviceNoPairRequests")}
							</span>
						</div>
					)}
				</>
			)}
		</>
	);
}

const BG_SAMPLES: { path: string; label: string }[] = [
	{ path: "/assets/background-space.webp", label: "Space" },
];

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
	{ id: "espresso", label: "Light", preview: "#ffffff" },
	{ id: "midnight", label: "Dark", preview: "#1a1a2e" },
	{ id: "ocean", label: "Ocean", preview: "#1b2838" },
	{ id: "forest", label: "Forest", preview: "#1a2e1a" },
	{ id: "rose", label: "Rose", preview: "#2e1a2a" },
	{ id: "latte", label: "Latte", preview: "#fffcf5" },
	{ id: "sakura", label: "Sakura", preview: "#fdf2f8" },
	{ id: "cloud", label: "Cloud", preview: "#f1f5f9" },
];

export function SettingsTab() {
	const existing = loadConfig();
	const setAvatarModelPath = useAvatarStore((s) => s.setModelPath);
	const setAvatarBackgroundImage = useAvatarStore((s) => s.setBackgroundImage);
	const [savedVrmModel, setSavedVrmModel] = useState(
		normalizeLocalPath(existing?.vrmModel ?? DEFAULT_AVATAR_MODEL)
	);
	const [savedBgImage, setSavedBgImage] = useState(
		normalizeLocalPath(existing?.backgroundImage ?? "")
	);
	const [provider, setProvider] = useState<ProviderId>(
		existing?.provider ?? "gemini",
	);
	const initProvider = existing?.provider ?? "gemini";
	const savedModel = existing?.model;
	const modelValid =
		savedModel && MODEL_OPTIONS[initProvider]?.some((m) => m.id === savedModel);
	const [model, setModel] = useState(
		modelValid ? savedModel : getDefaultModel(initProvider),
	);
	const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
	const [locale, setLocaleState] = useState<Locale>(
		existing?.locale ?? getLocale(),
	);
	const [theme, setTheme] = useState<ThemeId>(existing?.theme ?? "espresso");
	const [vrmModel, setVrmModel] = useState(savedVrmModel);
	const [customVrms, setCustomVrms] = useState<string[]>(
		(existing?.customVrms ?? []).map(normalizeLocalPath),
	);
	const [customBgs, setCustomBgs] = useState<string[]>(
		(existing?.customBgs ?? []).map(normalizeLocalPath),
	);
	const [backgroundImage, setBackgroundImage] = useState(
		normalizeLocalPath(existing?.backgroundImage ?? ""),
	);
	const [ttsVoice, setTtsVoice] = useState(
		existing?.ttsVoice ?? "ko-KR-Neural2-A",
	);
	const [googleApiKey, setGoogleApiKey] = useState(
		existing?.googleApiKey ?? "",
	);
	const [ttsProvider, setTtsProvider] = useState<TtsProviderId>(
		existing?.ttsProvider ??
			(existing?.ttsEngine === "openclaw" ? "edge" :
			 existing?.ttsEngine === "google" ? "google" : "edge"),
	);
	const [ttsEnabled, setTtsEnabled] = useState(existing?.ttsEnabled ?? true);
	const [sttEnabled, setSttEnabled] = useState(existing?.sttEnabled ?? true);
	const [persona, setPersona] = useState(existing?.persona ?? DEFAULT_PERSONA);
	const [userName, setUserName] = useState(existing?.userName ?? "");
	const [agentName, setAgentName] = useState(existing?.agentName ?? "");
	const [honorific, setHonorific] = useState(existing?.honorific ?? "");
	const [speechStyle, setSpeechStyle] = useState(existing?.speechStyle ?? "반말");
	const [enableTools, setEnableTools] = useState(
		existing?.enableTools ?? true,
	);
	const [dynamicModels, setDynamicModels] = useState(MODEL_OPTIONS);
	const [gatewayUrl, setGatewayUrl] = useState(
		existing?.gatewayUrl ?? "ws://localhost:18789",
	);
	const [gatewayToken, setGatewayToken] = useState(
		existing?.gatewayToken ?? "",
	);
	const [discordDefaultUserId, setDiscordDefaultUserId] = useState(
		existing?.discordDefaultUserId ?? "",
	);
	const [discordDefaultTarget, setDiscordDefaultTarget] = useState(
		existing?.discordDefaultTarget ?? "",
	);
	const [discordDmChannelId, setDiscordDmChannelId] = useState(
		existing?.discordDmChannelId ?? "",
	);
	const [error, setError] = useState("");
	const [saved, setSaved] = useState(false);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [facts, setFacts] = useState<Fact[]>([]);
	const [allowedToolsCount, setAllowedToolsCount] = useState(existing?.allowedTools?.length ?? 0);
	const [labKey, setLabKeyState] = useState(existing?.labKey ?? "");
	const [labUserId, setLabUserIdState] = useState(existing?.labUserId ?? "");
	const [syncDialogOpen, setSyncDialogOpen] = useState(false);
	const [syncDialogOnlineConfig, setSyncDialogOnlineConfig] = useState<Record<string, unknown> | null>(null);
	const labSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const modelPrefixPattern =
			/^(nextain|claude-code-cli|claude-code|gemini|google|openai|anthropic|claude|xai|grok|zai|glm|ollama)[:/](.+)$/i;
		const providerAlias: Record<string, ProviderId> = {
			nextain: "nextain",
			"claude-code-cli": "claude-code-cli",
			"claude-code": "claude-code-cli",
			gemini: "gemini",
			google: "gemini",
			openai: "openai",
			anthropic: "anthropic",
			claude: "anthropic",
			xai: "xai",
			grok: "xai",
			zai: "zai",
			glm: "zai",
			ollama: "ollama",
		};

		const normalizeModelId = (raw: string): string => {
			const matched = modelPrefixPattern.exec(raw);
			if (matched?.[2]) return matched[2];
			return raw;
		};

		const resolveProvider = (raw: unknown): ProviderId | null => {
			if (typeof raw !== "string") return null;
			return providerAlias[raw.toLowerCase()] ?? null;
		};

		const resolveProviderFromId = (id: string): ProviderId | null => {
			const matched = modelPrefixPattern.exec(id);
			if (!matched?.[1]) return null;
			return resolveProvider(matched[1]);
		};

		const extractModels = (
			parsed: unknown,
		): Array<{
			id: string;
			name?: string;
			provider?: string;
			price?: { input?: number; output?: number };
		}> => {
			if (Array.isArray(parsed)) return parsed as any[];

			if (parsed && typeof parsed === "object") {
				const root = parsed as Record<string, unknown>;

				if (Array.isArray(root.models)) {
					return root.models as any[];
				}

				if (root.data && typeof root.data === "object") {
					const data = root.data as Record<string, unknown>;
					if (Array.isArray(data.models)) {
						return data.models as any[];
					}
				}

				if (root.providers && typeof root.providers === "object") {
					const providers = root.providers as Record<string, unknown>;
					const out: any[] = [];
					for (const [providerName, value] of Object.entries(providers)) {
						if (!Array.isArray(value)) continue;
						for (const item of value) {
							if (typeof item === "string") {
								out.push({ id: item, provider: providerName, name: item });
							} else if (item && typeof item === "object") {
								out.push({ provider: providerName, ...(item as object) });
							}
						}
					}
					return out;
				}
			}

			return [];
		};

		async function fetchModels() {
			try {
				const res = await directToolCall({
					toolName: "skill_config",
					args: { action: "models" },
					requestId: `fetch-models-${Date.now()}`,
					gatewayUrl: gatewayUrl.trim() || DEFAULT_GATEWAY_URL,
					gatewayToken,
				});

				if (res.success && res.output) {
					const parsed = JSON.parse(res.output);
					const models = extractModels(parsed);
					if (models.length === 0) return;

					const grouped = Object.fromEntries(
						Object.entries(MODEL_OPTIONS).map(([k, v]) => [k, [...v]]),
					) as typeof MODEL_OPTIONS;

					for (const m of models) {
						if (!m || typeof m.id !== "string") continue;
						const modelId = normalizeModelId(m.id);
						const priceStr = m.price
							? ` ($${m.price.input ?? "?"} / $${m.price.output ?? "?"})`
							: "";
						const label = `${m.name || modelId}${priceStr}`;

						const pushModel = (key: ProviderId) => {
							if (!grouped[key].some((x) => x.id === modelId)) {
								grouped[key].push({ id: modelId, label });
							}
						};

			const mappedProvider =
				resolveProvider(m.provider) || resolveProviderFromId(m.id);
			if (mappedProvider) pushModel(mappedProvider);
			if (mappedProvider === "anthropic") pushModel("claude-code-cli");
			// Nextain only supports curated Gemini models
			if (mappedProvider === "gemini") {
				const NEXTAIN_ALLOWED = [
					"gemini-3.1-pro-preview",
					"gemini-3-flash-preview",
					"gemini-2.5-pro",
					"gemini-2.5-flash",
				];
				if (NEXTAIN_ALLOWED.includes(modelId)) {
					pushModel("nextain");
				}
			}
		}

					setDynamicModels(grouped);
				}
			} catch {
				// Fallback to static MODEL_OPTIONS
			}
		}
		fetchModels();
	}, [gatewayUrl, gatewayToken]);

	useEffect(() => {
		getLabKeySecure().then((key) => {
			if (key && key !== labKey) {
				setLabKeyState(key);
			}
		});
	}, [labKey]);
	const [labWaiting, setLabWaiting] = useState(false);
	const [labBalance, setLabBalance] = useState<number | null>(null);
	const [labBalanceLoading, setLabBalanceLoading] = useState(false);

	const startLabLogin = () => {
		setLabWaiting(true);
		openUrl("https://naia.nextain.io/ko/login?redirect=desktop").catch(() =>
			setLabWaiting(false),
		);
		setTimeout(() => setLabWaiting(false), 60_000);
	};

	// Gateway TTS state
	const [gatewayTtsProviders, setGatewayTtsProviders] = useState<
		{ id: string; label: string; configured: boolean; voices: string[] }[]
	>([]);
	// gatewayTtsActiveProvider tracks which provider the gateway is using (for API sync only)
	const gatewayTtsActiveProviderRef = useRef("");
	const [gatewayTtsAuto, setGatewayTtsAuto] = useState<GatewayTtsAuto>("off");
	const [gatewayTtsMode, setGatewayTtsMode] = useState<GatewayTtsMode>("final");
	const [gatewayTtsLoading, setGatewayTtsLoading] = useState(false);
	const [gatewayTtsApiKey, setGatewayTtsApiKey] = useState(() => {
		const p = existing?.ttsProvider ?? "edge";
		if (p === "openai") return existing?.openaiTtsApiKey ?? "";
		if (p === "elevenlabs") return existing?.elevenlabsApiKey ?? "";
		return "";
	});
	const [gatewayTtsKeySaving, setGatewayTtsKeySaving] = useState(false);
	const [gatewayTtsKeySaved, setGatewayTtsKeySaved] = useState(false);

	// Voice wake state
	const [voiceWakeTriggers, setVoiceWakeTriggers] = useState<string[]>([]);
	const [voiceWakeInput, setVoiceWakeInput] = useState("");
	const [voiceWakeLoading, setVoiceWakeLoading] = useState(false);
	const [voiceWakeSaved, setVoiceWakeSaved] = useState(false);
	const [discordBotConnected, setDiscordBotConnected] = useState(false);
	const [discordBotLoading, setDiscordBotLoading] = useState(false);

	// In-app confirmation state (replaces window.confirm to avoid WebKitGTK double-dialog)
	const [showResetConfirm, setShowResetConfirm] = useState(false);
	const [resetClearHistory, setResetClearHistory] = useState(false);
	const [showLabDisconnect, setShowLabDisconnect] = useState(false);
	const [showReOnboarding, setShowReOnboarding] = useState(false);

	const fetchGatewayTts = useCallback(async () => {
		const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
		setGatewayTtsLoading(true);
		try {
			const [statusRes, providersRes] = await Promise.all([
				directToolCall({
					toolName: "skill_tts",
					args: { action: "status" },
					requestId: `tts-status-${Date.now()}`,
					gatewayUrl: effectiveGatewayUrl,
					gatewayToken,
				}),
				directToolCall({
					toolName: "skill_tts",
					args: { action: "providers" },
					requestId: `tts-providers-${Date.now()}`,
					gatewayUrl: effectiveGatewayUrl,
					gatewayToken,
				}),
			]);
			if (statusRes.success && statusRes.output) {
				const status = JSON.parse(statusRes.output) as {
					enabled?: boolean;
					provider?: string;
					auto?: GatewayTtsAuto;
					mode?: GatewayTtsMode;
				};
				gatewayTtsActiveProviderRef.current = status.provider || "";
				// Prefer localStorage values over gateway runtime (which may be stale)
				const savedConfig = loadConfig();
				setGatewayTtsAuto(savedConfig?.gatewayTtsAuto as GatewayTtsAuto ?? status.auto ?? "off");
				setGatewayTtsMode(savedConfig?.gatewayTtsMode as GatewayTtsMode ?? status.mode ?? "final");
			}
			if (providersRes.success && providersRes.output) {
				const raw = JSON.parse(providersRes.output);
				// Gateway may return array or object with providers
				const providers = Array.isArray(raw)
					? raw
					: Array.isArray(raw?.providers)
						? raw.providers
						: Object.entries(raw)
								.filter(([k]) => k !== "current" && k !== "fallback")
								.map(([id, v]) => ({
									id,
									label: id,
									configured: (v as Record<string, unknown>)?.configured === true,
									voices: ((v as Record<string, unknown>)?.voices as string[]) ?? [],
								}));
				setGatewayTtsProviders(providers);
			}
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to load Gateway TTS", {
				error: String(err),
			});
		} finally {
			setGatewayTtsLoading(false);
		}
	}, [gatewayUrl, gatewayToken]);

	const fetchVoiceWake = useCallback(async () => {
		const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
		setVoiceWakeLoading(true);
		try {
			const result = await directToolCall({
				toolName: "skill_voicewake",
				args: { action: "get" },
				requestId: `vw-get-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});
			if (result.success && result.output) {
				const data = JSON.parse(result.output);
				setVoiceWakeTriggers(data.triggers || []);
			}
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to load voice wake triggers", {
				error: String(err),
			});
		} finally {
			setVoiceWakeLoading(false);
		}
	}, [gatewayUrl, gatewayToken]);

	const fetchDiscordBotStatus = useCallback(async () => {
		const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
		setDiscordBotLoading(true);
		try {
			const result = await directToolCall({
				toolName: "skill_channels",
				args: { action: "status" },
				requestId: `discord-status-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});
			if (result.success && result.output) {
				const channels = JSON.parse(result.output) as Array<{
					id?: string;
					accounts?: Array<{ connected?: boolean }>;
				}>;
				const discord = channels.find((ch) => ch.id === "discord");
				const connected =
					discord?.accounts?.some((acc) => acc.connected === true) ?? false;
				setDiscordBotConnected(connected);
			} else {
				setDiscordBotConnected(false);
			}
		} catch {
			setDiscordBotConnected(false);
		} finally {
			setDiscordBotLoading(false);
		}
	}, [gatewayUrl, gatewayToken]);

	useEffect(() => {
		fetchGatewayTts();
		fetchVoiceWake();
		fetchDiscordBotStatus();
	}, [fetchGatewayTts, fetchVoiceWake, fetchDiscordBotStatus]);

	useEffect(() => {
		getAllFacts()
			.then((result) => setFacts(result ?? []))
			.catch((err) => {
				Logger.warn("SettingsTab", "Failed to load facts", {
					error: String(err),
				});
			});
	}, []);

	// Fetch Lab balance when labKey is available
	useEffect(() => {
		if (!labKey) return;
		setLabBalanceLoading(true);
		fetch(`${LAB_GATEWAY_URL}/v1/profile/balance`, {
			headers: { "X-AnyLLM-Key": `Bearer ${labKey}` },
		})
			.then((res) => {
				if (!res.ok) {
					return res.text().then((text) => {
						throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
					});
				}
				return res.json();
			})
			.then((data: unknown) => {
				const credits = parseLabCredits(data);
				setLabBalance(credits ?? 0);
			})
			.catch((err) => {
				Logger.warn("SettingsTab", "Lab balance fetch failed", {
					error: String(err),
				});
			})
			.finally(() => setLabBalanceLoading(false));
	}, [labKey]);

	// Listen for Lab auth deep-link callback
	useEffect(() => {
		const unlisten = listen<{ labKey: string; labUserId?: string }>(
			"lab_auth_complete",
			async (event) => {
				const nextLabKey = event.payload.labKey;
				const nextLabUserId = event.payload.labUserId ?? "";
				setLabKeyState(nextLabKey);
				setLabUserIdState(nextLabUserId);
				setProvider("nextain");
				setModel((prev) => prev || getDefaultModel("nextain"));
				setError("");
				// In Lab mode, clear direct API key input to avoid confusion.
				setApiKey("");
				setLabWaiting(false);

				// Persist immediately so ChatPanel routes requests through Lab proxy
				const current = loadConfig();
				const nextModel = current?.model || getDefaultModel("nextain");
				if (current) {
					saveConfig({
						...current,
						provider: "nextain",
						model: nextModel,
						labKey: nextLabKey,
						labUserId: nextLabUserId || undefined,
					});
				}

				// Sync to OpenClaw (no API key for Lab proxy)
				const labFullPrompt = buildSystemPrompt(current?.persona, {
					agentName: current?.agentName,
					userName: current?.userName,
					honorific: current?.honorific,
					speechStyle: current?.speechStyle,
					discordDefaultUserId: current?.discordDefaultUserId,
					discordDmChannelId: current?.discordDmChannelId,
				});
				await syncToOpenClaw("nextain", nextModel, undefined, current?.persona, current?.agentName, current?.userName, labFullPrompt, current?.locale || getLocale(), current?.discordDmChannelId, current?.discordDefaultUserId, undefined, undefined, undefined, undefined, nextLabKey);
				await restartGateway();

				// Try Lab pull — show diff dialog if settings differ
				if (nextLabUserId) {
					const onlineConfig = await fetchLabConfig(nextLabKey, nextLabUserId);
					if (onlineConfig && current) {
						const diffs = diffConfigs(current, onlineConfig);
						if (diffs.length > 0) {
							setSyncDialogOnlineConfig(onlineConfig as Record<string, unknown>);
							setSyncDialogOpen(true);
						}
					}
				}
			},
		);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Listen for Discord auth deep-link callback
	useEffect(() => {
		const unlisten = listen<{
			discordUserId?: string | null;
			discordChannelId?: string | null;
			discordTarget?: string | null;
		}>("discord_auth_complete", (event) => {
			const next = persistDiscordDefaults(event.payload);
			if (!next) {
				return;
			}

			setDiscordDefaultUserId(next.discordDefaultUserId ?? "");
			setDiscordDefaultTarget(next.discordDefaultTarget ?? "");
			setDiscordDmChannelId(next.discordDmChannelId ?? "");
			setDiscordBotConnected(true);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Live-preview: apply VRM instantly on selection
	function handleVrmSelect(path: string) {
		const normalized = normalizeLocalPath(path);
		setVrmModel(normalized);
		setAvatarModelPath(normalized);
	}

	function handleBgSelect(path: string) {
		const normalized = normalizeLocalPath(path);
		setBackgroundImage(normalized);
		setAvatarBackgroundImage(normalized);
	}

	// Revert on unmount if not saved
	useEffect(() => {
		return () => {
			// Restore saved VRM when leaving settings without saving
			const currentVrm = useAvatarStore.getState().modelPath;
			if (currentVrm !== savedVrmModel) {
				setAvatarModelPath(savedVrmModel);
			}
			const currentBg = useAvatarStore.getState().backgroundImage;
			if (currentBg !== savedBgImage) {
				setAvatarBackgroundImage(savedBgImage);
			}
		};
	}, [savedVrmModel, savedBgImage, setAvatarModelPath, setAvatarBackgroundImage]);

	function handleProviderChange(id: ProviderId) {
		setProvider(id);
		setModel(getDefaultModel(id));
		setError("");
		if (id === "nextain" && !labKey) {
			setError("Nextain 계정 로그인이 필요합니다. 먼저 Nextain에 로그인하세요.");
			startLabLogin();
		}
	}

	function handleLocaleChange(id: Locale) {
		setLocaleState(id);
		setLocale(id);
	}

	function handleThemeChange(id: ThemeId) {
		setTheme(id);
		document.documentElement.setAttribute("data-theme", id);
	}

	async function handlePickVrmFile() {
		const selected = await open({
			title: "VRM 파일 선택",
			filters: [{ name: "VRM", extensions: ["vrm"] }],
			multiple: false,
		});
		if (selected) {
			const normalized = normalizeLocalPath(selected as string);
			setCustomVrms((prev) => {
				if (prev.includes(normalized)) return prev;
				return [...prev, normalized];
			});
			handleVrmSelect(normalized);
		}
	}

	async function handlePickBgFile() {
		const selected = await open({
			title: t("settings.bgPickerTitle"),
			filters: [
				{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
			],
			multiple: false,
		});
		if (selected) {
			const normalized = normalizeLocalPath(selected as string);
			setCustomBgs((prev) => {
				if (prev.includes(normalized)) return prev;
				return [...prev, normalized];
			});
			handleBgSelect(normalized);
		}
	}

	const ttsProviderMeta = TTS_PROVIDERS.find((p) => p.id === ttsProvider);
	const ttsUsesGateway = ttsProviderMeta?.usesGateway ?? false;

	function debouncedLabSync() {
		if (labSyncTimerRef.current) clearTimeout(labSyncTimerRef.current);
		labSyncTimerRef.current = setTimeout(() => {
			const cfg = loadConfig();
			if (!cfg) return;
			if (labKey && labUserId) pushConfigToLab(labKey, labUserId, cfg);
			// Also sync TTS settings to OpenClaw gateway config
			syncToOpenClaw(
				cfg.provider, cfg.model,
				undefined, undefined, undefined, undefined, undefined, undefined,
				undefined, undefined,
				cfg.ttsProvider, cfg.ttsVoice, gatewayTtsAuto, gatewayTtsMode,
				labKey || undefined,
			);
		}, 2000);
	}

	// Persist TTS voice/provider changes immediately (without full handleSave)
	function persistTtsVoice(voice: string) {
		setTtsVoice(voice);
		if (existing) {
			saveConfig({ ...existing, ttsVoice: voice });
		}
		debouncedLabSync();
	}
	function persistTtsProvider(p: TtsProviderId) {
		setTtsProvider(p);
		const derivedEngine = (p === "google" || p === "nextain") ? "google" : "openclaw";
		if (existing) {
			saveConfig({ ...existing, ttsProvider: p, ttsEngine: derivedEngine as "google" | "openclaw" });
		}
		debouncedLabSync();
	}

	function getPreviewText(voice: string): string {
		const lang = voice.slice(0, 2).toLowerCase();
		switch (lang) {
			case "ko": return "안녕하세요, 반갑습니다. 오늘도 좋은 하루 되세요.";
			case "en": return "Hello, nice to meet you. Have a great day!";
			case "ja": return "こんにちは、はじめまして。良い一日をお過ごしください。";
			case "zh": return "你好，很高兴认识你。祝你有美好的一天！";
			case "fr": return "Bonjour, enchanté. Passez une bonne journée !";
			case "de": return "Hallo, freut mich. Einen schönen Tag noch!";
			case "es": return "Hola, mucho gusto. ¡Que tengas un buen día!";
			case "ru": return "Здравствуйте, приятно познакомиться. Хорошего дня!";
			case "ar": return "مرحباً، سعيد بلقائك. أتمنى لك يوماً سعيداً!";
			case "hi": return "नमस्ते, आपसे मिलकर खुशी हुई। आपका दिन शुभ हो!";
			case "bn": return "নমস্কার, আপনার সাথে দেখা হয়ে ভালো লাগলো। শুভ দিন!";
			case "pt": return "Olá, prazer em conhecê-lo. Tenha um ótimo dia!";
			case "id": return "Halo, senang bertemu Anda. Semoga hari Anda menyenangkan!";
			case "vi": return "Xin chào, rất vui được gặp bạn. Chúc bạn một ngày tốt lành!";
			default: return "Hello, nice to meet you. Have a great day!";
		}
	}

	async function handleVoicePreview() {
		if (isPreviewing) return;
		setError("");
		setIsPreviewing(true);
		try {
			// Ensure Gateway TTS provider is initialized before preview
			const meta = TTS_PROVIDERS.find((p) => p.id === ttsProvider);
			if (meta?.usesGateway) {
				const gwId = meta.gatewayProviderId ?? ttsProvider;
				await handleGatewayTtsProviderChange(gwId);
			}
			let base64 = "";
			const previewText = getPreviewText(ttsVoice);
			if (ttsProvider === "nextain") {
				// Nextain TTS preview — call Gateway directly with labKey
				if (!labKey) {
					setError("Nextain TTS를 사용하려면 Nextain 로그인이 필요합니다.");
					return;
				}
				const resp = await fetch(`${LAB_GATEWAY_URL}/v1/audio/speech`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-AnyLLM-Key": `Bearer ${labKey}`,
					},
					body: JSON.stringify({
						input: previewText,
						voice: ttsVoice,
						audio_encoding: "MP3",
					}),
				});
				if (!resp.ok) {
					throw new Error(`Nextain TTS 미리듣기 실패 (${resp.status})`);
				}
				const data = await resp.json() as { audio_content?: string };
				base64 = data.audio_content ?? "";
			} else if (ttsProvider === "google") {
				// Direct Google TTS preview via Rust (needs Google API key)
				const key = googleApiKey.trim() || (provider === "gemini" ? apiKey.trim() : "");
				if (!key) {
					setError("TTS 미리듣기를 사용하려면 Google TTS API Key를 입력하세요.");
					return;
				}
				base64 = await invoke<string>("preview_tts", {
					apiKey: key,
					voice: ttsVoice,
					text: previewText,
				});
			} else {
				// Direct TTS preview via agent (edge/openai/elevenlabs — no Gateway needed)
				const previewArgs: Record<string, unknown> = {
					action: "preview",
					provider: ttsProvider,
					text: previewText,
					voice: ttsVoice,
				};
				// Pass API key for providers that need it
				if (ttsProvider === "openai") {
					previewArgs.apiKey = gatewayTtsApiKey.trim() || existing?.openaiTtsApiKey || undefined;
				} else if (ttsProvider === "elevenlabs") {
					previewArgs.apiKey = gatewayTtsApiKey.trim() || existing?.elevenlabsApiKey || undefined;
				}
				const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
				const result = await directToolCall({
					toolName: "skill_tts",
					args: previewArgs,
					requestId: `tts-preview-${Date.now()}`,
					gatewayUrl: effectiveGatewayUrl,
					gatewayToken,
				});
				if (!result.success || !result.output) {
					throw new Error(
						ttsProvider === "edge"
							? "Edge TTS 미리듣기에 실패했습니다."
							: "TTS 미리듣기에 실패했습니다. API Key를 확인하세요.",
					);
				}
				const parsed = JSON.parse(result.output) as { audio?: string };
				if (!parsed.audio) {
					throw new Error("TTS 오디오 데이터를 수신하지 못했습니다.");
				}
				base64 = parsed.audio;
			}
			const audio = new Audio(`data:audio/mp3;base64,${base64}`);
			await audio.play();
		} catch (err) {
			setError(
				`TTS 미리듣기 실패: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsPreviewing(false);
		}
	}

	async function handleGatewayTtsProviderChange(newProvider: string) {
		gatewayTtsActiveProviderRef.current = newProvider;
		try {
			const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
			await directToolCall({
				toolName: "skill_tts",
				args: { action: "set_provider", provider: newProvider },
				requestId: `tts-set-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to set Gateway TTS provider", {
				error: String(err),
			});
		}
	}

	async function handleGatewayTtsAutoChange(auto: GatewayTtsAuto) {
		setGatewayTtsAuto(auto);
		// Persist to localStorage so fetchGatewayTts doesn't revert it
		const cfg = loadConfig();
		if (cfg) saveConfig({ ...cfg, gatewayTtsAuto: auto });
		// Write to openclaw.json then restart gateway to apply
		await syncToOpenClaw(
			cfg?.provider || provider, cfg?.model || model,
			undefined, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined,
			ttsProvider, ttsVoice, auto, gatewayTtsMode,
			labKey || undefined,
		);
		await restartGateway();
	}

	async function handleGatewayTtsModeChange(mode: GatewayTtsMode) {
		setGatewayTtsMode(mode);
		const cfg = loadConfig();
		if (cfg) saveConfig({ ...cfg, gatewayTtsMode: mode });
		await syncToOpenClaw(
			cfg?.provider || provider, cfg?.model || model,
			undefined, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined,
			ttsProvider, ttsVoice, gatewayTtsAuto, mode,
			labKey || undefined,
		);
		await restartGateway();
	}

	async function handleGatewayTtsApiKeySave() {
		const key = gatewayTtsApiKey.trim();
		if (!key) return;
		const meta = TTS_PROVIDERS.find((p) => p.id === ttsProvider);
		const gwProviderId = meta?.gatewayProviderId;
		if (!gwProviderId || gwProviderId === "edge") return;

		setGatewayTtsKeySaving(true);
		try {
			const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
			// skill_config patch action uses args.patch object
			// patchConfig() internally does config.get for hash + config.patch with raw JSON
			await directToolCall({
				toolName: "skill_config",
				args: {
					action: "patch",
					patch: {
						messages: { tts: { [gwProviderId]: { apiKey: key } } },
					},
				},
				requestId: `config-patch-tts-key-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});

			// Persist key in Shell config for preview reuse across reloads
			if (existing) {
				if (ttsProvider === "openai") {
					saveConfig({ ...existing, openaiTtsApiKey: key });
				} else if (ttsProvider === "elevenlabs") {
					saveConfig({ ...existing, elevenlabsApiKey: key });
				}
			}
			setGatewayTtsKeySaved(true);
			setTimeout(() => setGatewayTtsKeySaved(false), 4000);

			// Gateway restarts after config.patch (SIGUSR1, ~2s delay)
			// Wait before refreshing provider status
			await new Promise((r) => setTimeout(r, 3500));
			await fetchGatewayTts();
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to save Gateway TTS API key", {
				error: String(err),
			});
			setError(`TTS API Key 저장 실패: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setGatewayTtsKeySaving(false);
		}
	}

	function handleVoiceWakeAdd() {
		const trimmed = voiceWakeInput.trim();
		if (trimmed && !voiceWakeTriggers.includes(trimmed)) {
			setVoiceWakeTriggers((prev) => [...prev, trimmed]);
			setVoiceWakeInput("");
		}
	}

	function handleVoiceWakeRemove(trigger: string) {
		setVoiceWakeTriggers((prev) => prev.filter((item) => item !== trigger));
	}

	async function handleVoiceWakeSave() {
		const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
		try {
			await directToolCall({
				toolName: "skill_voicewake",
				args: { action: "set", triggers: voiceWakeTriggers },
				requestId: `vw-set-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});
			setVoiceWakeSaved(true);
			setTimeout(() => setVoiceWakeSaved(false), 2000);
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to save voice wake triggers", {
				error: String(err),
			});
		}
	}

	function handleReset() {
		setShowResetConfirm(true);
	}

	async function executeReset() {
		localStorage.removeItem("naia-config");
		localStorage.removeItem("naia-camera");
		invoke("reset_window_state").catch(() => {});
		if (resetClearHistory) {
			useChatStore.getState().newConversation();
			resetGatewaySession().catch(() => {});
			invoke("reset_openclaw_data").catch(() => {});
		}
		setLocale("ko");
		document.documentElement.setAttribute("data-theme", "espresso");
		window.location.reload();
	}

	function handleSyncDialogApply() {
		if (!syncDialogOnlineConfig) return;
		const current = loadConfig();
		if (!current) return;
		const merged = { ...current, ...syncDialogOnlineConfig };
		saveConfig(merged);
		// Update local state from merged config
		if (merged.userName) setUserName(merged.userName);
		if (merged.agentName) setAgentName(merged.agentName);
		if (merged.honorific !== undefined) setHonorific(merged.honorific ?? "");
		if (merged.speechStyle) setSpeechStyle(merged.speechStyle);
		if (merged.persona) setPersona(merged.persona ?? DEFAULT_PERSONA);
		if (merged.locale) setLocaleState(merged.locale);
		if (merged.theme) setTheme(merged.theme);
		if (merged.ttsEnabled !== undefined) setTtsEnabled(merged.ttsEnabled);
		if (merged.sttEnabled !== undefined) setSttEnabled(merged.sttEnabled);
		if (merged.ttsVoice) setTtsVoice(merged.ttsVoice);
		if (merged.ttsProvider) setTtsProvider(merged.ttsProvider);
		setSyncDialogOpen(false);
		setSyncDialogOnlineConfig(null);
	}

	function handleSave() {
		// Keep previous key when input is empty (password field UX).
		const resolvedApiKey = apiKey.trim() || existing?.apiKey || "";
		const isNextainProvider = provider === "nextain";
		const isApiKeyOptionalProvider =
			provider === "claude-code-cli" || provider === "ollama";
		if (isNextainProvider && !labKey) {
			setError("Nextain 계정 로그인이 필요합니다. Nextain 계정 연결 후 저장하세요.");
			return;
		}
		if (
			!isNextainProvider &&
			!isApiKeyOptionalProvider &&
			!resolvedApiKey &&
			!labKey
		) {
			setError(t("settings.apiKeyRequired"));
			return;
		}
		const defaultVrm = DEFAULT_AVATAR_MODEL;
		// Derive ttsEngine from ttsProvider for agent compatibility
		// Only "google" uses direct Google TTS; all others (including nextain) use Gateway
		const derivedTtsEngine = ttsProvider === "google" ? "google" : "openclaw";
		const newConfig = {
			...existing,
			provider,
			model,
			apiKey: isNextainProvider || isApiKeyOptionalProvider ? "" : resolvedApiKey,
			labKey: labKey || undefined,
			labUserId: labUserId || undefined,
			locale,
			theme,
			vrmModel: vrmModel !== defaultVrm ? vrmModel : undefined,
			customVrms: customVrms.length > 0 ? customVrms : undefined,
			customBgs: customBgs.length > 0 ? customBgs : undefined,
			backgroundImage: backgroundImage || undefined,
			ttsEnabled,
			sttEnabled,
			ttsVoice,
			ttsProvider,
			ttsEngine: derivedTtsEngine as "google" | "openclaw",
			googleApiKey: googleApiKey.trim() || undefined,
			openaiTtsApiKey: (ttsProvider === "openai" && gatewayTtsApiKey.trim())
				? gatewayTtsApiKey.trim()
				: (existing?.openaiTtsApiKey || undefined),
			elevenlabsApiKey: (ttsProvider === "elevenlabs" && gatewayTtsApiKey.trim())
				? gatewayTtsApiKey.trim()
				: (existing?.elevenlabsApiKey || undefined),
			persona:
				persona.trim() !== DEFAULT_PERSONA.trim() ? persona.trim() : undefined,
			userName: userName.trim() || undefined,
			agentName: agentName.trim() || undefined,
			honorific: honorific.trim() || undefined,
			speechStyle,
			enableTools,
			gatewayUrl: enableTools
				? gatewayUrl.trim() || DEFAULT_GATEWAY_URL
				: undefined,
			gatewayToken: gatewayToken.trim() || undefined,
			discordDefaultUserId: discordDefaultUserId.trim() || undefined,
			discordDefaultTarget: discordDefaultTarget.trim() || undefined,
			discordDmChannelId: discordDmChannelId.trim() || undefined,
			gatewayTtsAuto,
			gatewayTtsMode,
		};
		saveConfig(newConfig);
		setLocale(locale);
		setAvatarModelPath(vrmModel);
		setAvatarBackgroundImage(backgroundImage);
		setSavedVrmModel(vrmModel);
		setSavedBgImage(backgroundImage);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);

		// Sync provider/model + full system prompt to OpenClaw gateway config
		const fullPrompt = buildSystemPrompt(newConfig.persona, {
			agentName: newConfig.agentName,
			userName: newConfig.userName,
			honorific: newConfig.honorific,
			speechStyle: newConfig.speechStyle,
			discordDefaultUserId: newConfig.discordDefaultUserId,
			discordDmChannelId: newConfig.discordDmChannelId,
		});
		syncToOpenClaw(newConfig.provider, newConfig.model, resolvedApiKey, newConfig.persona, newConfig.agentName, newConfig.userName, fullPrompt, newConfig.locale || getLocale(), newConfig.discordDmChannelId, newConfig.discordDefaultUserId, newConfig.ttsProvider, newConfig.ttsVoice, gatewayTtsAuto, gatewayTtsMode, labKey || undefined)
			.then(() => restartGateway());

		// Auto-sync to Lab if connected
		if (labKey && labUserId) {
			pushConfigToLab(labKey, labUserId, newConfig);
		}
	}

	const providerModels = dynamicModels[provider] ?? [];
	const selectedModelMeta = providerModels.find((m) => m.id === model);
	const hasSelectedModel = Boolean(selectedModelMeta);
	const manualUrl = `https://naia.nextain.io/${locale}/manual`;

	async function handleDiscordBotConnect() {
		if (!enableTools) {
			setError(t("settings.enableToolsFirst"));
			return;
		}
		setError("");
		setDiscordBotLoading(true);
		try {
			const connectUrl = `${getNaiaWebBaseUrl()}/${locale}/settings/integrations?channel=discord&source=naia-shell`;
			await openUrl(connectUrl);
			await fetchDiscordBotStatus();
		} catch (err) {
			setError(
				`${t("settings.discordConnectError")}: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setDiscordBotLoading(false);
		}
	}

	return (
		<div className="settings-tab">
			<div className="settings-field">
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<label htmlFor="locale-select" style={{ margin: 0 }}>
						{t("settings.language")}
					</label>
					<select
						id="locale-select"
						value={locale}
						onChange={(e) => handleLocaleChange(e.target.value as Locale)}
						style={{ width: "auto", minWidth: 120 }}
					>
						{LOCALES.map((l) => (
							<option key={l.id} value={l.id}>
								{l.label}
							</option>
						))}
					</select>
					<button
						type="button"
						className="voice-preview-btn"
						onClick={() => openUrl(manualUrl).catch(() => {})}
					>
						{t("settings.manual")}
					</button>
				</div>
			</div>

			<div className="settings-field">
				<label>{t("settings.theme")}</label>
				<div className="theme-picker">
					{THEMES.map((th) => (
						<button
							key={th.id}
							type="button"
							className={`theme-swatch ${theme === th.id ? "active" : ""}`}
							style={{ background: th.preview }}
							onClick={() => handleThemeChange(th.id)}
							title={th.label}
						/>
					))}
				</div>
			</div>

			<div className="settings-section-divider">
				<span>{t("settings.avatarSection")}</span>
			</div>

			<div className="settings-field">
				<label>{t("settings.vrmModel")}</label>
				<div className="vrm-picker">
					{AVATAR_PRESETS.map((v) => (
						<button
							key={v.path}
							type="button"
							className={`vrm-card ${vrmModel === v.path ? "active" : ""}`}
							onClick={() => handleVrmSelect(v.path)}
							title={v.label}
							style={v.previewImage ? { padding: 0, overflow: "hidden" } : {}}
						>
							{v.previewImage ? (
								<img
									src={v.previewImage}
									alt={v.label}
									style={{ width: "100%", height: "100%", objectFit: "cover" }}
								/>
							) : (
								<>
									<span className="vrm-card-icon">&#x1F464;</span>
									<span className="vrm-card-label">{v.label}</span>
								</>
							)}
						</button>
					))}
					{customVrms.map((path) => (
						<CustomAssetCard
							key={path}
							type="vrm"
							path={path}
							isSelected={vrmModel === path}
							onSelect={() => handleVrmSelect(path)}
							onDelete={() => {
								setCustomVrms((prev) => prev.filter((p) => p !== path));
								if (vrmModel === path) {
									handleVrmSelect(AVATAR_PRESETS[0].path);
								}
							}}
						/>
					))}
					<button
						type="button"
						className="vrm-card vrm-card-add"
						onClick={handlePickVrmFile}
						title={t("settings.vrmCustom")}
					>
						<span className="vrm-card-icon">+</span>
						<span className="vrm-card-label">{t("settings.vrmCustom")}</span>
					</button>
				</div>
			</div>

			<div className="settings-field">
				<label>{t("settings.background")}</label>
				<div className="bg-picker">
					<button
						type="button"
						className={`bg-card ${!backgroundImage ? "active" : ""}`}
						onClick={() => handleBgSelect("")}
						title={t("settings.bgNone")}
					>
						<span
							className="bg-card-preview"
							style={{
								background: "linear-gradient(180deg, #1a1412 0%, #0F172A 100%)",
							}}
						/>
						<span className="bg-card-label">{t("settings.bgNone")}</span>
					</button>
					{BG_SAMPLES.map((bg) => (
						<button
							key={bg.path}
							type="button"
							className={`bg-card ${backgroundImage === bg.path ? "active" : ""}`}
							onClick={() => handleBgSelect(bg.path)}
							title={bg.label}
						>
							<span
								className="bg-card-preview"
								style={{ backgroundImage: `url(${bg.path})` }}
							/>
							<span className="bg-card-label">{bg.label}</span>
						</button>
					))}
					{customBgs.map((path) => (
						<CustomAssetCard
							key={path}
							type="bg"
							path={path}
							isSelected={backgroundImage === path}
							onSelect={() => handleBgSelect(path)}
							onDelete={() => {
								setCustomBgs((prev) => prev.filter((p) => p !== path));
								if (backgroundImage === path) {
									handleBgSelect("");
								}
							}}
						/>
					))}
					<button
						type="button"
						className="bg-card bg-card-add"
						onClick={handlePickBgFile}
						title={t("settings.bgCustom")}
					>
						<span className="bg-card-preview bg-card-add-icon">+</span>
						<span className="bg-card-label">{t("settings.bgCustom")}</span>
					</button>
				</div>
			</div>

			<div className="settings-section-divider">
				<span>{t("settings.personaSection")}</span>
			</div>

			<div className="settings-field">
				<label>{t("settings.agentName")}</label>
				<input
					type="text"
					className="settings-input"
					value={agentName}
					onChange={(e) => setAgentName(e.target.value)}
					placeholder="Naia"
				/>
			</div>
			<div className="settings-field">
				<label>{t("settings.userName")}</label>
				<input
					type="text"
					className="settings-input"
					value={userName}
					onChange={(e) => setUserName(e.target.value)}
				/>
			</div>
			<div className="settings-field">
				<label>{t("settings.honorific")}</label>
				<input
					type="text"
					className="settings-input"
					value={honorific}
					onChange={(e) => setHonorific(e.target.value)}
					placeholder={t("onboard.speechStyle.honorificPlaceholder")}
				/>
			</div>
			<div className="settings-field">
				<label>{t("settings.speechStyle")}</label>
				<select
					className="settings-select"
					value={speechStyle}
					onChange={(e) => setSpeechStyle(e.target.value)}
				>
					<option value="반말">{t("onboard.speechStyle.casual")} (Casual)</option>
					<option value="존댓말">{t("onboard.speechStyle.formal")} (Formal)</option>
				</select>
			</div>

			<div className="settings-field">
				<label htmlFor="persona-input">{t("settings.persona")}</label>
				<textarea
					id="persona-input"
					className="settings-persona-textarea"
					value={persona}
					onChange={(e) => setPersona(e.target.value)}
					rows={6}
				/>
				<div className="settings-hint">{t("settings.personaHint")}</div>
			</div>

				{provider !== "nextain" && (
					<>
						<div className="settings-section-divider">
							<span>{t("settings.labSection")}</span>
						</div>

						<div className="settings-field">
							<label>
								{labKey
									? t("settings.labConnected")
									: t("settings.labDisconnected")}
							</label>
							{labKey ? (
								<div className="lab-info-block">
							{labUserId && <span className="lab-user-id">{labUserId}</span>}
							<div className="lab-balance-row">
								<span className="lab-balance-label">
								{t("settings.labBalance")}
							</span>
							<span className="lab-balance-value">
								{labBalanceLoading
									? t("settings.labBalanceLoading")
									: labBalance !== null
										? `${labBalance.toFixed(2)} ${t("cost.labCredits")}`
										: "-"}
							</span>
						</div>
						<div className="lab-actions-row">
							<button
								type="button"
								className="voice-preview-btn"
								onClick={() =>
									openUrl("https://naia.nextain.io/ko/dashboard").catch(
										() => {},
									)
								}
							>
								{t("settings.labDashboard")}
							</button>
							<button
								type="button"
								className="voice-preview-btn"
								onClick={() =>
									openUrl("https://naia.nextain.io/ko/billing").catch(() => {})
								}
							>
								{t("cost.labCharge")}
							</button>
							{showLabDisconnect ? (
								<div className="reset-confirm-panel" style={{ marginTop: 8 }}>
									<p className="reset-confirm-msg">
										{t("settings.labDisconnectConfirm")}
									</p>
									<div className="reset-confirm-actions">
										<button
											type="button"
											className="settings-reset-btn"
											onClick={() => {
												setLabKeyState("");
												setLabUserIdState("");
												setLabBalance(null);
													setProvider("gemini");
													setModel(getDefaultModel("gemini"));
												setShowLabDisconnect(false);
												const current = loadConfig();
												if (current) {
													saveConfig({
														...current,
														provider:
															current.provider === "nextain"
																? "gemini"
																: current.provider,
														model:
															current.provider === "nextain"
																? getDefaultModel("gemini")
																: current.model,
														labKey: undefined,
														labUserId: undefined,
													});
												}
											}}
										>
											{t("settings.labDisconnect")}
										</button>
										<button
											type="button"
											className="settings-cancel-btn"
											onClick={() => setShowLabDisconnect(false)}
										>
											{t("settings.cancel")}
										</button>
									</div>
								</div>
							) : (
								<button
									type="button"
									className="voice-preview-btn lab-disconnect-btn"
									onClick={() => setShowLabDisconnect(true)}
								>
									{t("settings.labDisconnect")}
								</button>
							)}
						</div>
								</div>
							) : (
								<button
									type="button"
									className="voice-preview-btn"
									disabled={labWaiting}
									onClick={startLabLogin}
								>
									{labWaiting
										? t("onboard.lab.waiting")
										: t("settings.labConnect")}
								</button>
							)}
						</div>
					</>
				)}

			<div className="settings-section-divider">
				<span>{t("settings.aiSection")}</span>
			</div>

			<div className="settings-field">
				<label htmlFor="provider-select">{t("settings.provider")}</label>
				<select
					id="provider-select"
					value={provider}
					onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
				>
					{PROVIDERS.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
			</div>

			<div className="settings-field">
				<label htmlFor="model-select">{t("settings.model")}</label>
				<select
					id="model-select"
					value={hasSelectedModel ? model : "__custom__"}
					onChange={(e) => {
						if (e.target.value === "__custom__") return;
						setModel(e.target.value);
					}}
				>
					{!hasSelectedModel && model ? (
						<option value="__custom__">{`${model} (현재값)`}</option>
					) : null}
					{providerModels.map((m) => (
						<option key={m.id} value={m.id}>
							{m.label}
						</option>
					))}
				</select>
				<div className="settings-hint">
					{selectedModelMeta?.label ?? model}
				</div>
			</div>

			{provider === "nextain" ? (
				<div className="settings-field">
					<label>{t("settings.labSection")}</label>
					<div className="settings-hint">
						Nextain provider는 API 키 대신 Nextain 계정 로그인을 사용합니다.
					</div>
						{labKey ? (
							<div className="lab-info-block">
								<span className="settings-hint">
									로그인됨{labUserId ? ` (${labUserId})` : ""}
								</span>
								<div className="lab-balance-row">
									<span className="lab-balance-label">{t("settings.labBalance")}</span>
									<span className="lab-balance-value">
										{labBalanceLoading
											? t("settings.labBalanceLoading")
											: labBalance !== null
												? `${labBalance.toFixed(2)} ${t("cost.labCredits")}`
												: "-"}
									</span>
								</div>
								<div className="lab-actions-row">
								<button
									type="button"
									className="voice-preview-btn"
									onClick={() =>
										openUrl("https://naia.nextain.io/ko/dashboard").catch(() => {})
									}
								>
									{t("settings.labDashboard")}
								</button>
								<button
									type="button"
									className="voice-preview-btn"
									onClick={() =>
										openUrl("https://naia.nextain.io/ko/billing").catch(() => {})
									}
								>
									{t("cost.labCharge")}
								</button>
								{showLabDisconnect ? (
									<div className="reset-confirm-panel" style={{ marginTop: 8 }}>
										<p className="reset-confirm-msg">
											{t("settings.labDisconnectConfirm")}
										</p>
										<div className="reset-confirm-actions">
											<button
												type="button"
												className="settings-reset-btn"
												onClick={() => {
													setLabKeyState("");
													setLabUserIdState("");
													setLabBalance(null);
													setProvider("gemini");
													setModel(getDefaultModel("gemini"));
													setShowLabDisconnect(false);
													const current = loadConfig();
													if (current) {
														saveConfig({
															...current,
															provider:
																current.provider === "nextain"
																	? "gemini"
																	: current.provider,
															model:
																current.provider === "nextain"
																	? getDefaultModel("gemini")
																	: current.model,
															labKey: undefined,
															labUserId: undefined,
														});
													}
												}}
											>
												{t("settings.labDisconnect")}
											</button>
											<button
												type="button"
												className="settings-cancel-btn"
												onClick={() => setShowLabDisconnect(false)}
											>
												{t("settings.cancel")}
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										className="voice-preview-btn lab-disconnect-btn"
										onClick={() => setShowLabDisconnect(true)}
									>
										{t("settings.labDisconnect")}
									</button>
								)}
								{showReOnboarding ? (
									<div className="reset-confirm-panel" style={{ marginTop: 8 }}>
										<p className="reset-confirm-msg">
											{t("settings.reOnboardingConfirm")}
										</p>
										<div className="reset-confirm-actions">
											<button
												type="button"
												className="settings-reset-btn"
												onClick={async () => {
													// Delete online config first, then reload
													if (labKey && labUserId) {
														await clearLabConfig(labKey, labUserId);
													}
													// Reset local onboarding state
													const current = loadConfig();
													if (current) {
														saveConfig({
															...current,
															onboardingComplete: undefined,
															userName: undefined,
															agentName: undefined,
															persona: undefined,
															honorific: undefined,
															speechStyle: undefined,
														});
													}
													// Reload to trigger onboarding
													window.location.reload();
												}}
											>
												{t("settings.reOnboardingContinue")}
											</button>
											<button
												type="button"
												className="settings-cancel-btn"
												onClick={() => setShowReOnboarding(false)}
											>
												{t("settings.cancel")}
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										className="voice-preview-btn re-onboarding-btn"
										onClick={() => setShowReOnboarding(true)}
									>
										{t("settings.reOnboarding")}
									</button>
								)}
								</div>
							</div>
						) : (
						<button
							type="button"
							className="voice-preview-btn"
							disabled={labWaiting}
							onClick={startLabLogin}
						>
							{labWaiting ? t("onboard.lab.waiting") : t("settings.labConnect")}
						</button>
					)}
					{error && <div className="settings-error">{error}</div>}
				</div>
				) : provider === "claude-code-cli" || provider === "ollama" ? (
					<div className="settings-field">
						<label>{t("settings.apiKey")}</label>
						<div className="settings-hint">
							{provider === "claude-code-cli"
								? "Claude Code CLI provider는 로컬 CLI 로그인 세션을 사용합니다."
								: "Ollama provider는 API 키가 필요 없습니다."}
						</div>
						{error && <div className="settings-error">{error}</div>}
					</div>
				) : (
					<div className="settings-field">
						<label htmlFor="apikey-input">{t("settings.apiKey")}</label>
					<input
						id="apikey-input"
						type="password"
						value={apiKey}
						onChange={(e) => {
							setApiKey(e.target.value);
							setError("");
						}}
						placeholder="sk-..."
					/>
					{error && <div className="settings-error">{error}</div>}
				</div>
			)}

			<div className="settings-section-divider">
				<span>{t("settings.voiceSection")}</span>
			</div>

			<div className="settings-field settings-toggle-row">
				<label htmlFor="tts-toggle">{t("settings.ttsEnabled")}</label>
				<input
					id="tts-toggle"
					type="checkbox"
					checked={ttsEnabled}
					onChange={(e) => {
						const on = e.target.checked;
						setTtsEnabled(on);
						if (!on && gatewayTtsAuto !== "off") {
							handleGatewayTtsAutoChange("off");
						}
					}}
				/>
			</div>

			<div className="settings-field settings-toggle-row">
				<label htmlFor="stt-toggle">{t("settings.sttEnabled")}</label>
				<input
					id="stt-toggle"
					type="checkbox"
					checked={sttEnabled}
					onChange={(e) => setSttEnabled(e.target.checked)}
				/>
			</div>

			<div className="settings-field">
				<label htmlFor="tts-provider-select">TTS 프로바이더</label>
				<select
					id="tts-provider-select"
					value={ttsProvider}
					onChange={(e) => {
						const newProvider = e.target.value as TtsProviderId;
						persistTtsProvider(newProvider);
						// Reset voice to first available for the new provider
						if (newProvider === "google" || newProvider === "nextain") {
							persistTtsVoice(TTS_VOICES[0]?.id ?? "ko-KR-Neural2-A");
						} else if (newProvider === "edge") {
							const edgeVoices = getEdgeVoicesForLocale(locale);
							persistTtsVoice(edgeVoices[0] ?? "ko-KR-SunHiNeural");
						} else if (newProvider === "openai") {
							persistTtsVoice(OPENAI_VOICES[0] ?? "alloy");
						} else if (newProvider === "elevenlabs") {
							persistTtsVoice(ELEVENLABS_VOICES[0] ?? "Rachel");
						}
						// Restore saved key for the new provider
						const cfg = loadConfig();
						if (newProvider === "openai") {
							setGatewayTtsApiKey(cfg?.openaiTtsApiKey ?? "");
						} else if (newProvider === "elevenlabs") {
							setGatewayTtsApiKey(cfg?.elevenlabsApiKey ?? "");
						} else {
							setGatewayTtsApiKey("");
						}
						// When switching to a gateway provider, set gateway provider then refresh voices
						const meta = TTS_PROVIDERS.find((p) => p.id === newProvider);
						if (meta?.usesGateway) {
							const gwId = meta.gatewayProviderId ?? newProvider;
							handleGatewayTtsProviderChange(gwId).then(() => fetchGatewayTts());
						}
					}}
				>
					{TTS_PROVIDERS.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
			</div>

			{/* API Key — provider-specific */}
			{ttsProvider === "google" && (
				<div className="settings-field">
					<label htmlFor="google-apikey-input">
						{t("settings.googleApiKey")}
					</label>
					<input
						id="google-apikey-input"
						type="password"
						value={googleApiKey}
						onChange={(e) => setGoogleApiKey(e.target.value)}
						placeholder={
							provider === "gemini"
								? t("settings.googleApiKeyGeminiFallback")
								: "AIza..."
						}
					/>
				</div>
			)}

			{/* Gateway TTS API Key input — for OpenAI, ElevenLabs */}
			{ttsProviderMeta?.usesGateway && ttsProviderMeta?.needsKey && (() => {
				const gwId = ttsProviderMeta.gatewayProviderId ?? ttsProvider;
				const gwProvider = gatewayTtsProviders.find((p) => p.id === gwId);
				const isConfigured = gwProvider?.configured ?? false;
				return (
					<div className="settings-field">
						<label htmlFor="gateway-tts-apikey-input">
							{ttsProviderMeta.keyLabel ?? "API Key"}
							{isConfigured && <span style={{ color: "var(--color-success, #22c55e)", marginLeft: 8, fontSize: "0.85em" }}>{t("settings.gatewayTtsConfigured")}</span>}
						</label>
						<div className="voice-picker">
							<input
								id="gateway-tts-apikey-input"
								type="password"
								value={gatewayTtsApiKey}
								onChange={(e) => setGatewayTtsApiKey(e.target.value)}
								placeholder={isConfigured ? t("settings.gatewayTtsKeyPlaceholder") : (ttsProviderMeta.keyPlaceholder ?? "")}
							/>
							<button
								type="button"
								className="voice-preview-btn"
								onClick={handleGatewayTtsApiKeySave}
								disabled={gatewayTtsKeySaving || !gatewayTtsApiKey.trim()}
							>
								{gatewayTtsKeySaved ? t("settings.gatewayTtsKeySaved") : gatewayTtsKeySaving ? t("settings.gatewayTtsKeySaving") : t("settings.gatewayTtsKeySave")}
							</button>
						</div>
					</div>
				);
			})()}

			{/* Nextain — labKey required warning */}
			{ttsProvider === "nextain" && !labKey && (
				<div className="settings-field">
					<span className="settings-hint" style={{ color: "var(--color-warning, #f59e0b)" }}>
						{t("settings.nextainLoginRequired")}
					</span>
				</div>
			)}

			{/* Voice list — Google voices (google / nextain provider) */}
			{(ttsProvider === "google" || ttsProvider === "nextain") && (
				<div className="settings-field">
					<label htmlFor="tts-voice-select">{t("settings.ttsVoice")}</label>
					<div className="voice-picker">
						<select
							id="tts-voice-select"
							value={ttsVoice}
							onChange={(e) => persistTtsVoice(e.target.value)}
						>
							{TTS_VOICES.map((v) => (
								<option key={v.id} value={v.id}>
									{v.label} — {v.price}
								</option>
							))}
						</select>
						<button
							type="button"
							className="voice-preview-btn"
							onClick={handleVoicePreview}
							disabled={isPreviewing}
						>
							{isPreviewing
								? t("settings.voicePreviewing")
								: t("settings.voicePreview")}
						</button>
					</div>
				</div>
			)}

			{/* Voice list — Gateway voices (nextain, edge, openai, elevenlabs) */}
			{ttsUsesGateway && (
				<>
					{gatewayTtsLoading ? (
						<div className="settings-field">
							<span className="settings-hint">
								{t("settings.gatewayTtsLoading")}
							</span>
						</div>
					) : (() => {
						const gwId = ttsProviderMeta?.gatewayProviderId ?? ttsProvider;
						const gwProvider = gatewayTtsProviders.find((p) => p.id === gwId);
						// Use gateway voices, fall back to hardcoded lists for providers that don't enumerate
						let gwVoices = gwProvider?.voices ?? [];
						if (gwId === "openai" && gwVoices.length > 0) {
							gwVoices = gwVoices.filter((v) => !OPENAI_EXCLUDED_VOICES.has(v));
						}
						// Edge: filter by locale (both gateway and fallback)
						if (gwId === "edge" && gwVoices.length > 0) {
							const langPrefix = locale.slice(0, 2).toLowerCase() + "-";
							gwVoices = gwVoices.filter(
								(v) => v.toLowerCase().startsWith(langPrefix) || v.includes("Multilingual"),
							);
						}
						const fallbackVoices = gwId === "edge" ? getEdgeVoicesForLocale(locale)
							: gwId === "openai" ? OPENAI_VOICES
							: gwId === "elevenlabs" ? ELEVENLABS_VOICES : [];
						const voices = gwVoices.length > 0 ? gwVoices : fallbackVoices;
						if (voices.length > 0) {
							return (
								<div className="settings-field">
									<label htmlFor="gateway-tts-voice">{t("settings.ttsVoice")}</label>
									<div className="voice-picker">
										<select
											id="gateway-tts-voice"
											data-testid="gateway-tts-voice"
											value={ttsVoice}
											onChange={(e) => persistTtsVoice(e.target.value)}
										>
											{voices.map((v) => (
												<option key={v} value={v}>
													{v}
												</option>
											))}
										</select>
										<button
											type="button"
											className="voice-preview-btn"
											onClick={handleVoicePreview}
											disabled={isPreviewing}
										>
											{isPreviewing
												? t("settings.voicePreviewing")
												: t("settings.voicePreview")}
										</button>
									</div>
								</div>
							);
						}
						return (
							<div className="settings-field">
								<span className="settings-hint">
									{gatewayTtsProviders.length === 0
										? "Gateway에 연결할 수 없습니다. Gateway가 실행 중인지 확인하세요."
										: `사용 가능한 음성이 없습니다.${gwProvider && !gwProvider.configured ? " API Key를 먼저 설정하세요." : ""}`}
								</span>
							</div>
						);
					})()}
				</>
			)}

			{/* 자동 발화 모드 */}
			<div className="settings-field">
				<label htmlFor="tts-auto-mode">자동 발화 모드</label>
				<select
					id="tts-auto-mode"
					value={gatewayTtsAuto}
					onChange={(e) =>
						handleGatewayTtsAutoChange(
							e.target.value as GatewayTtsAuto,
						)}
				>
					<option value="off">off</option>
					<option value="always">always</option>
					<option value="inbound">inbound</option>
					<option value="tagged">tagged</option>
				</select>
			</div>

			{/* 출력 범위 */}
			<div className="settings-field">
				<label htmlFor="tts-output-mode">출력 범위</label>
				<select
					id="tts-output-mode"
					value={gatewayTtsMode}
					onChange={(e) =>
						handleGatewayTtsModeChange(
							e.target.value as GatewayTtsMode,
						)}
				>
					<option value="final">final</option>
					<option value="all">all</option>
				</select>
			</div>

			<div className="settings-section-divider">
				<span>{t("settings.toolsSection")}</span>
			</div>

			<div className="settings-field settings-toggle-row">
				<label htmlFor="tools-toggle">{t("settings.enableTools")}</label>
				<input
					id="tools-toggle"
					type="checkbox"
					checked={enableTools}
					onChange={(e) => setEnableTools(e.target.checked)}
				/>
			</div>

			<div className="settings-field">
				<label htmlFor="gateway-url-input">{t("settings.gatewayUrl")}</label>
				<input
					id="gateway-url-input"
					type="text"
					value={gatewayUrl}
					onChange={(e) => setGatewayUrl(e.target.value)}
					placeholder="ws://localhost:18789"
				/>
			</div>

			<div className="settings-field">
				<label htmlFor="gateway-token-input">
					{t("settings.gatewayToken")}
				</label>
				<input
					id="gateway-token-input"
					type="password"
					value={gatewayToken}
					onChange={(e) => setGatewayToken(e.target.value)}
				/>
			</div>

			{/* Discord ID / target — managed via Channels tab & OAuth deep link */}

			{allowedToolsCount > 0 && (
				<div className="settings-field">
					<label>
						{t("settings.allowedTools")} ({allowedToolsCount})
					</label>
					<button
						type="button"
						className="voice-preview-btn"
						onClick={() => {
							clearAllowedTools();
							setAllowedToolsCount(0);
						}}
					>
						{t("settings.clearAllowedTools")}
					</button>
				</div>
			)}

			{enableTools && (
				<>
					<div className="settings-section-divider">
						<span>{t("settings.channelsSection")}</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint">{t("settings.channelsHint")}</span>
					</div>

					{/* Discord channel card */}
					<div className="channel-card" data-testid="discord-settings-card">
						<div className="channel-card-header">
							<span className="channel-name">Discord</span>
							<span
								className={`channel-status-badge ${discordBotConnected ? "connected" : "disconnected"}`}
								data-testid="channel-status"
							>
								{discordBotConnected
									? t("channels.connected")
									: discordBotLoading
										? "..."
										: t("channels.disconnected")}
							</span>
						</div>
						<div className="settings-field" style={{ marginBottom: 6 }}>
							<div style={{ display: "flex", gap: 8 }}>
								<button
									type="button"
									className="voice-preview-btn"
									onClick={handleDiscordBotConnect}
									disabled={discordBotLoading}
								>
									{discordBotLoading ? t("settings.discordBotConnecting") : discordBotConnected ? t("settings.discordBotReconnect") : t("settings.discordBotConnect")}
								</button>
								<button
									type="button"
									className="voice-preview-btn"
									onClick={() => fetchDiscordBotStatus()}
									disabled={discordBotLoading}
								>
									{t("settings.discordCheckStatus")}
								</button>
							</div>
						</div>
						<div className="settings-field">
							<label htmlFor="discord-user-id">Discord User ID</label>
							<input
								id="discord-user-id"
								type="text"
								value={discordDefaultUserId}
								onChange={(e) => setDiscordDefaultUserId(e.target.value)}
								placeholder={t("settings.discordUserIdPlaceholder")}
							/>
						</div>
						<div className="settings-field">
							<label htmlFor="discord-dm-channel-id">Discord DM Channel ID</label>
							<input
								id="discord-dm-channel-id"
								type="text"
								value={discordDmChannelId}
								onChange={(e) => setDiscordDmChannelId(e.target.value)}
								placeholder={t("settings.discordDmChannelIdPlaceholder")}
							/>
						</div>
					</div>

					<div className="settings-section-divider">
						<span>{t("settings.voiceWakeSection")}</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint">{t("settings.voiceWakeHint")}</span>
					</div>
					{voiceWakeLoading ? (
						<div className="settings-field">
							<span className="settings-hint">
								{t("settings.voiceWakeLoading")}
							</span>
						</div>
					) : (
						<>
							<div className="settings-field">
								<label>{t("settings.voiceWakeTriggers")}</label>
								<div
									className="voice-wake-triggers"
									data-testid="voice-wake-triggers"
								>
									{voiceWakeTriggers.map((trigger) => (
										<span key={trigger} className="voice-wake-tag">
											{trigger}
											<button
												type="button"
												className="voice-wake-tag-remove"
												onClick={() => handleVoiceWakeRemove(trigger)}
											>
												×
											</button>
										</span>
									))}
								</div>
							</div>
							<div className="settings-field voice-wake-add-row">
								<input
									type="text"
									data-testid="voice-wake-input"
									value={voiceWakeInput}
									onChange={(e) => setVoiceWakeInput(e.target.value)}
									placeholder={t("settings.voiceWakePlaceholder")}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleVoiceWakeAdd();
									}}
								/>
								<button type="button" onClick={handleVoiceWakeAdd}>
									{t("settings.voiceWakeAdd")}
								</button>
							</div>
							<div className="settings-field">
								<button
									type="button"
									className="voice-preview-btn"
									data-testid="voice-wake-save"
									onClick={handleVoiceWakeSave}
								>
									{voiceWakeSaved
										? t("settings.voiceWakeSaved")
										: t("settings.voiceWakeSave")}
								</button>
							</div>
						</>
					)}
				</>
			)}

			{enableTools && <DevicePairingSection />}

			<div className="settings-section-divider">
				<span>{t("settings.memorySection")}</span>
			</div>

			{facts.length === 0 ? (
				<div className="settings-field">
					<span className="settings-hint">{t("settings.factsEmpty")}</span>
				</div>
			) : (
				<div className="facts-list">
					{facts.map((f) => (
						<div key={f.id} className="fact-item">
							<div className="fact-content">
								<span className="fact-key">{f.key}</span>
								<span className="fact-value">{f.value}</span>
							</div>
							<button
								type="button"
								className="fact-delete-btn"
								onClick={async () => {
									try {
										await deleteFact(f.id);
										setFacts((prev) => prev.filter((x) => x.id !== f.id));
									} catch (err) {
										Logger.warn("SettingsTab", "Failed to delete fact", {
											error: String(err),
										});
									}
								}}
							>
								{t("settings.factDelete")}
							</button>
						</div>
					))}
				</div>
			)}

			<div className="settings-danger-zone">
				{showResetConfirm ? (
					<div className="reset-confirm-panel">
						<p className="reset-confirm-msg">{t("settings.resetConfirm")}</p>
						<label className="reset-confirm-checkbox">
							<input
								type="checkbox"
								checked={resetClearHistory}
								onChange={(e) => setResetClearHistory(e.target.checked)}
							/>
							{t("settings.resetClearHistory")}
						</label>
						<div className="reset-confirm-actions">
							<button
								type="button"
								className="settings-reset-btn"
								onClick={executeReset}
							>
								{t("settings.resetExecute")}
							</button>
							<button
								type="button"
								className="settings-cancel-btn"
								onClick={() => {
									setShowResetConfirm(false);
								}}
							>
								{t("settings.cancel")}
							</button>
						</div>
					</div>
				) : (
					<button
						type="button"
						className="settings-reset-btn"
						onClick={handleReset}
					>
						{t("settings.reset")}
					</button>
				)}
			</div>

			<div className="settings-actions">
				<button
					type="button"
					className="settings-save-btn"
					onClick={handleSave}
				>
					{saved ? t("settings.saved") : t("settings.save")}
				</button>
			</div>

			{syncDialogOpen && (
				<div className="sync-dialog-overlay">
					<div className="sync-dialog-card">
						<h3>{t("settings.labSyncDialog.title")}</h3>
						<p>{t("settings.labSyncDialog.message")}</p>
						<div className="sync-dialog-actions">
							<button
								type="button"
								className="onboarding-next-btn"
								onClick={handleSyncDialogApply}
							>
								{t("settings.labSyncDialog.useOnline")}
							</button>
							<button
								type="button"
								className="onboarding-back-btn"
								onClick={() => {
									setSyncDialogOpen(false);
									setSyncDialogOnlineConfig(null);
								}}
							>
								{t("settings.labSyncDialog.keepLocal")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
