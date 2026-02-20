import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { directToolCall } from "../lib/chat-service";
import {
	DEFAULT_GATEWAY_URL,
	type ThemeId,
	LAB_GATEWAY_URL,
	MODEL_OPTIONS,
	clearAllowedTools,
	getDefaultModel,
	loadConfig,
	resolveGatewayUrl,
	saveConfig,
} from "../lib/config";
import { type Fact, deleteFact, getAllFacts, getRecentSessions, deleteSession } from "../lib/db";
import { type Locale, getLocale, setLocale, t } from "../lib/i18n";
import { parseLabCredits } from "../lib/lab-balance";
import { Logger } from "../lib/logger";
import { DEFAULT_PERSONA } from "../lib/persona";
import type { ProviderId } from "../lib/types";
import { useAvatarStore } from "../stores/avatar";

const PROVIDERS: { id: ProviderId; label: string; disabled?: boolean }[] = [
	{ id: "gemini", label: "Google Gemini" },
	{ id: "openai", label: "OpenAI (ChatGPT)", disabled: true },
	{ id: "anthropic", label: "Anthropic (Claude)", disabled: true },
	{ id: "xai", label: "xAI (Grok)", disabled: true },
	{ id: "zai", label: "zAI (GLM)", disabled: true },
	{ id: "ollama", label: "Ollama (로컬)", disabled: true },
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

const LOCALES: { id: Locale; label: string }[] = [
	{ id: "ko", label: "한국어" },
	{ id: "en", label: "English" },
];

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
										<span className="device-pair-node">
											{req.nodeId}
										</span>
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
														handlePairAction(
															req.requestId,
															"approve",
														)
													}
												>
													{t("settings.deviceApprove")}
												</button>
												<button
													type="button"
													className="device-pair-reject"
													onClick={() =>
														handlePairAction(
															req.requestId,
															"reject",
														)
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

const VRM_SAMPLES: { path: string; label: string }[] = [
	{
		path: "/avatars/Sendagaya-Shino-dark-uniform.vrm",
		label: "Shino (Dark)",
	},
	{
		path: "/avatars/Sendagaya-Shino-light-uniform.vrm",
		label: "Shino (Light)",
	},
	{ path: "/avatars/vrm-ol-girl.vrm", label: "Girl" },
	{ path: "/avatars/vrm-sample-boy.vrm", label: "Boy" },
];

const BG_SAMPLES: { path: string; label: string }[] = [
	{ path: "/assets/lounge-sunny.webp", label: "Lounge" },
];

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
	{ id: "espresso", label: "Espresso", preview: "#3b2f2f" },
	{ id: "midnight", label: "Midnight", preview: "#1a1a2e" },
	{ id: "ocean", label: "Ocean", preview: "#1b2838" },
	{ id: "forest", label: "Forest", preview: "#1a2e1a" },
	{ id: "rose", label: "Rose", preview: "#2e1a2a" },
	{ id: "latte", label: "Latte", preview: "#f5f0e8" },
	{ id: "sakura", label: "Sakura", preview: "#fdf2f8" },
	{ id: "cloud", label: "Cloud", preview: "#f8f9fa" },
];

export function SettingsTab() {
	const existing = loadConfig();
	const setAvatarModelPath = useAvatarStore((s) => s.setModelPath);
	const savedVrmModel =
		existing?.vrmModel ?? "/avatars/Sendagaya-Shino-dark-uniform.vrm";
	const [provider, setProvider] = useState<ProviderId>(
		existing?.provider ?? "gemini",
	);
	const initProvider = existing?.provider ?? "gemini";
	const savedModel = existing?.model;
	const modelValid = savedModel && MODEL_OPTIONS[initProvider]?.some((m) => m.id === savedModel);
	const [model, setModel] = useState(
		modelValid ? savedModel : getDefaultModel(initProvider),
	);
	const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
	const [locale, setLocaleState] = useState<Locale>(
		existing?.locale ?? getLocale(),
	);
	const [theme, setTheme] = useState<ThemeId>(existing?.theme ?? "espresso");
	const [vrmModel, setVrmModel] = useState(savedVrmModel);
	const [backgroundImage, setBackgroundImage] = useState(
		existing?.backgroundImage ?? "",
	);
	const [ttsVoice, setTtsVoice] = useState(
		existing?.ttsVoice ?? "ko-KR-Neural2-A",
	);
	const [googleApiKey, setGoogleApiKey] = useState(
		existing?.googleApiKey ?? "",
	);
	const [ttsEnabled, setTtsEnabled] = useState(existing?.ttsEnabled ?? true);
	const [sttEnabled, setSttEnabled] = useState(existing?.sttEnabled ?? true);
	const [persona, setPersona] = useState(existing?.persona ?? DEFAULT_PERSONA);
	const [enableTools, setEnableTools] = useState(
		existing?.enableTools ?? false,
	);
	const [gatewayUrl, setGatewayUrl] = useState(
		existing?.gatewayUrl ?? "ws://localhost:18789",
	);
	const [gatewayToken, setGatewayToken] = useState(
		existing?.gatewayToken ?? "",
	);
	const [error, setError] = useState("");
	const [saved, setSaved] = useState(false);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [facts, setFacts] = useState<Fact[]>([]);
	const allowedToolsCount = existing?.allowedTools?.length ?? 0;
	const [labKey, setLabKeyState] = useState(existing?.labKey ?? "");
	const [labUserId, setLabUserIdState] = useState(existing?.labUserId ?? "");
	const [labWaiting, setLabWaiting] = useState(false);
	const [labBalance, setLabBalance] = useState<number | null>(null);
	const [labBalanceLoading, setLabBalanceLoading] = useState(false);

	// Gateway TTS state
	const [gatewayTtsProviders, setGatewayTtsProviders] = useState<
		{ id: string; label: string; configured: boolean; voices: string[] }[]
	>([]);
	const [gatewayTtsProvider, setGatewayTtsProvider] = useState("");
	const [gatewayTtsLoading, setGatewayTtsLoading] = useState(false);

	// Voice wake state
	const [voiceWakeTriggers, setVoiceWakeTriggers] = useState<string[]>([]);
	const [voiceWakeInput, setVoiceWakeInput] = useState("");
	const [voiceWakeLoading, setVoiceWakeLoading] = useState(false);
	const [voiceWakeSaved, setVoiceWakeSaved] = useState(false);

	// In-app confirmation state (replaces window.confirm to avoid WebKitGTK double-dialog)
	const [showResetConfirm, setShowResetConfirm] = useState(false);
	const [resetClearHistory, setResetClearHistory] = useState(false);
	const [showLabDisconnect, setShowLabDisconnect] = useState(false);

	const fetchGatewayTts = useCallback(async () => {
		if (!enableTools) return;
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
				const status = JSON.parse(statusRes.output);
				setGatewayTtsProvider(status.provider || "");
			}
			if (providersRes.success && providersRes.output) {
				setGatewayTtsProviders(JSON.parse(providersRes.output));
			}
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to load Gateway TTS", {
				error: String(err),
			});
		} finally {
			setGatewayTtsLoading(false);
		}
	}, [enableTools, gatewayUrl, gatewayToken]);

	const fetchVoiceWake = useCallback(async () => {
		if (!enableTools) return;
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
	}, [enableTools, gatewayUrl, gatewayToken]);

	useEffect(() => {
		fetchGatewayTts();
		fetchVoiceWake();
	}, [fetchGatewayTts, fetchVoiceWake]);

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
			(event) => {
				const nextLabKey = event.payload.labKey;
				const nextLabUserId = event.payload.labUserId ?? "";
				setLabKeyState(nextLabKey);
				setLabUserIdState(nextLabUserId);
				// In Lab mode, clear direct API key input to avoid confusion.
				setApiKey("");
				setLabWaiting(false);

				// Persist immediately so ChatPanel routes requests through Lab proxy
				const current = loadConfig();
				if (current) {
					saveConfig({
						...current,
						labKey: nextLabKey,
						labUserId: nextLabUserId || undefined,
					});
				}
			},
		);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Live-preview: apply VRM instantly on selection
	function handleVrmSelect(path: string) {
		setVrmModel(path);
		setAvatarModelPath(path);
	}

	// Revert VRM on unmount if not saved
	useEffect(() => {
		return () => {
			// Restore saved VRM when leaving settings without saving
			const current = useAvatarStore.getState().modelPath;
			if (current !== savedVrmModel) {
				setAvatarModelPath(savedVrmModel);
			}
		};
	}, [savedVrmModel, setAvatarModelPath]);

	function handleProviderChange(id: ProviderId) {
		setProvider(id);
		setModel(getDefaultModel(id));
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
			handleVrmSelect(selected);
		}
	}

	async function handlePickBgFile() {
		const selected = await open({
			title: "배경 이미지 선택",
			filters: [
				{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
			],
			multiple: false,
		});
		if (selected) {
			setBackgroundImage(selected);
		}
	}

	async function handleVoicePreview() {
		const key =
			googleApiKey.trim() || (provider === "gemini" ? apiKey.trim() : "");
		if (!key || isPreviewing) return;
		setIsPreviewing(true);
		try {
			const base64 = await invoke<string>("preview_tts", {
				apiKey: key,
				voice: ttsVoice,
				text: "안녕하세요, 저는 알파예요.",
			});
			const audio = new Audio(`data:audio/mp3;base64,${base64}`);
			await audio.play();
		} catch {
			// preview failure is non-critical
		} finally {
			setIsPreviewing(false);
		}
	}

	async function handleGatewayTtsProviderChange(newProvider: string) {
		setGatewayTtsProvider(newProvider);
		try {
			await directToolCall({
				toolName: "skill_tts",
				args: { action: "set_provider", provider: newProvider },
				requestId: `tts-set-${Date.now()}`,
				gatewayUrl,
				gatewayToken,
			});
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to set Gateway TTS provider", {
				error: String(err),
			});
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
		if (resetClearHistory) {
			try {
				const sessions = await getRecentSessions(10000);
				await Promise.all(sessions.map((s) => deleteSession(s.id)));
			} catch (err) {
				Logger.warn("SettingsTab", "Failed to clear chat history", {
					error: String(err),
				});
			}
		}
		localStorage.removeItem("cafelua-config");
		localStorage.removeItem("cafelua-camera");
		invoke("reset_window_state").catch(() => {});
		setLocale("ko");
		document.documentElement.setAttribute("data-theme", "espresso");
		window.location.reload();
	}

	function handleSave() {
		// Keep previous key when input is empty (password field UX).
		const resolvedApiKey = apiKey.trim() || existing?.apiKey || "";
		if (!resolvedApiKey && !labKey) {
			setError(t("settings.apiKeyRequired"));
			return;
		}
		const defaultVrm = "/avatars/Sendagaya-Shino-dark-uniform.vrm";
		const newConfig = {
			...existing,
			provider,
			model,
			apiKey: labKey ? "" : resolvedApiKey,
			labKey: labKey || undefined,
			labUserId: labUserId || undefined,
			locale,
			theme,
			vrmModel: vrmModel !== defaultVrm ? vrmModel : undefined,
			backgroundImage: backgroundImage || undefined,
			ttsEnabled,
			sttEnabled,
			ttsVoice,
			googleApiKey: googleApiKey.trim() || undefined,
			persona:
				persona.trim() !== DEFAULT_PERSONA.trim() ? persona.trim() : undefined,
			enableTools,
			gatewayUrl: enableTools
				? (gatewayUrl.trim() || DEFAULT_GATEWAY_URL)
				: undefined,
			gatewayToken: gatewayToken.trim() || undefined,
		};
		saveConfig(newConfig);
		setLocale(locale);
		setAvatarModelPath(vrmModel);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);

		// Auto-sync to Lab if connected
		if (labKey && labUserId) {
			syncConfigToLab(labKey, labUserId, newConfig);
		}
	}

	function syncConfigToLab(
		key: string,
		userId: string,
		config: ReturnType<typeof loadConfig>,
	) {
		// Strip secrets before syncing
		const syncData = {
			provider: config?.provider,
			model: config?.model,
			locale: config?.locale,
			theme: config?.theme,
			vrmModel: config?.vrmModel,
			ttsEnabled: config?.ttsEnabled,
			sttEnabled: config?.sttEnabled,
			ttsVoice: config?.ttsVoice,
			persona: config?.persona,
			userName: config?.userName,
			agentName: config?.agentName,
			enableTools: config?.enableTools,
		};
		fetch(`${LAB_GATEWAY_URL}/v1/users/${encodeURIComponent(userId)}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				"X-AnyLLM-Key": `Bearer ${key}`,
			},
			body: JSON.stringify({ metadata: { cafelua_config: syncData } }),
		}).catch((err) => {
			Logger.warn("SettingsTab", "Lab sync failed", {
				error: String(err),
			});
		});
	}

	return (
		<div className="settings-tab">
			<div className="settings-field">
				<label htmlFor="locale-select">{t("settings.language")}</label>
				<select
					id="locale-select"
					value={locale}
					onChange={(e) => handleLocaleChange(e.target.value as Locale)}
				>
					{LOCALES.map((l) => (
						<option key={l.id} value={l.id}>
							{l.label}
						</option>
					))}
				</select>
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
					{VRM_SAMPLES.map((v) => (
						<button
							key={v.path}
							type="button"
							className={`vrm-card ${vrmModel === v.path ? "active" : ""}`}
							onClick={() => handleVrmSelect(v.path)}
							title={v.label}
						>
							<span className="vrm-card-icon">&#x1F464;</span>
							<span className="vrm-card-label">{v.label}</span>
						</button>
					))}
					{/* Show custom VRM card if selected */}
					{!VRM_SAMPLES.some((v) => v.path === vrmModel) && vrmModel && (
						<button
							type="button"
							className="vrm-card active"
							title={vrmModel}
						>
							<span className="vrm-card-icon">&#x1F464;</span>
							<span className="vrm-card-label">
								{vrmModel.split("/").pop()?.replace(".vrm", "") ?? "Custom"}
							</span>
						</button>
					)}
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
						onClick={() => setBackgroundImage("")}
						title={t("settings.bgNone")}
					>
						<span
							className="bg-card-preview"
							style={{
								background: "linear-gradient(180deg, #1a1412 0%, #3b2f2f 100%)",
							}}
						/>
						<span className="bg-card-label">{t("settings.bgNone")}</span>
					</button>
					{BG_SAMPLES.map((bg) => (
						<button
							key={bg.path}
							type="button"
							className={`bg-card ${backgroundImage === bg.path ? "active" : ""}`}
							onClick={() => setBackgroundImage(bg.path)}
							title={bg.label}
						>
							<span
								className="bg-card-preview"
								style={{ backgroundImage: `url(${bg.path})` }}
							/>
							<span className="bg-card-label">{bg.label}</span>
						</button>
					))}
					{/* Show custom BG card if selected */}
					{backgroundImage
						&& !BG_SAMPLES.some((bg) => bg.path === backgroundImage) && (
						<button
							type="button"
							className="bg-card active"
							title={backgroundImage}
						>
							<span
								className="bg-card-preview"
								style={{
									backgroundImage: `url(${convertFileSrc(backgroundImage)})`,
								}}
							/>
							<span className="bg-card-label">
								{backgroundImage.split("/").pop() ?? "Custom"}
							</span>
						</button>
					)}
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

			<div className="settings-section-divider">
				<span>{t("settings.labSection")}</span>
			</div>

			<div className="settings-field">
				<label>{labKey ? t("settings.labConnected") : t("settings.labDisconnected")}</label>
				{labKey ? (
					<div className="lab-info-block">
						{labUserId && (
							<span className="lab-user-id">{labUserId}</span>
						)}
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
									openUrl("https://lab.cafelua.com/ko/dashboard").catch(() => {})
								}
							>
								{t("settings.labDashboard")}
							</button>
							<button
								type="button"
								className="voice-preview-btn"
								onClick={() =>
									openUrl("https://lab.cafelua.com/ko/billing").catch(() => {})
								}
							>
								{t("cost.labCharge")}
							</button>
							{showLabDisconnect ? (
								<div className="reset-confirm-panel" style={{ marginTop: 8 }}>
									<p className="reset-confirm-msg">{t("settings.labDisconnectConfirm")}</p>
									<div className="reset-confirm-actions">
										<button
											type="button"
											className="settings-reset-btn"
											onClick={() => {
												setLabKeyState("");
												setLabUserIdState("");
												setLabBalance(null);
												setShowLabDisconnect(false);
												const current = loadConfig();
												if (current) {
													saveConfig({
														...current,
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
						onClick={() => {
							setLabWaiting(true);
							openUrl(
								"https://lab.cafelua.com/ko/login?redirect=desktop",
							).catch(() => setLabWaiting(false));
							// Reset after 60s if deep-link callback never arrives
							setTimeout(() => setLabWaiting(false), 60_000);
						}}
					>
						{labWaiting ? t("onboard.lab.waiting") : t("settings.labConnect")}
					</button>
				)}
			</div>

			<div className="settings-field">
				<button
					type="button"
					className="voice-preview-btn"
					onClick={() =>
						openUrl("https://lab.cafelua.com/ko/manual").catch(() => {})
					}
				>
					{t("settings.manual")}
				</button>
			</div>

			<div className="settings-section-divider">
				<span>{t("settings.aiSection")}</span>
			</div>

			<div className="settings-field">
				<label htmlFor="provider-select">{t("settings.provider")}</label>
				<select
					id="provider-select"
					value={provider}
					onChange={(e) =>
						handleProviderChange(e.target.value as ProviderId)
					}
				>
					{PROVIDERS.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
			</div>

			<div className="settings-field">
				<label htmlFor="model-input">{t("settings.model")}</label>
				<select
					id="model-input"
					value={model}
					onChange={(e) => setModel(e.target.value)}
				>
					{(MODEL_OPTIONS[provider] ?? []).map((m) => (
						<option key={m.id} value={m.id}>
							{m.label}
						</option>
					))}
				</select>
			</div>

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

			<div className="settings-section-divider">
				<span>{t("settings.voiceSection")}</span>
			</div>

			<div className="settings-field settings-toggle-row">
				<label htmlFor="tts-toggle">{t("settings.ttsEnabled")}</label>
				<input
					id="tts-toggle"
					type="checkbox"
					checked={ttsEnabled}
					onChange={(e) => setTtsEnabled(e.target.checked)}
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

			<div className="settings-field">
				<label htmlFor="tts-voice-select">{t("settings.ttsVoice")}</label>
				<div className="voice-picker">
					<select
						id="tts-voice-select"
						value={ttsVoice}
						onChange={(e) => setTtsVoice(e.target.value)}
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
							window.location.reload();
						}}
					>
						{t("settings.clearAllowedTools")}
					</button>
				</div>
			)}

			<div className="settings-actions">
				<button
					type="button"
					className="settings-save-btn"
					onClick={handleSave}
				>
					{saved ? t("settings.saved") : t("settings.save")}
				</button>
			</div>

			{enableTools && (
				<>
					<div className="settings-section-divider">
						<span>{t("settings.channelsSection")}</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint">
							{t("settings.channelsHint")}
						</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint" data-testid="channels-settings-hint">
							{t("settings.channelsOpenTab")}
						</span>
					</div>

					<div className="settings-section-divider">
						<span>{t("settings.gatewayTtsSection")}</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint">
							{t("settings.gatewayTtsHint")}
						</span>
					</div>
					{gatewayTtsLoading ? (
						<div className="settings-field">
							<span className="settings-hint">
								{t("settings.gatewayTtsLoading")}
							</span>
						</div>
					) : gatewayTtsProviders.length > 0 ? (
						<div className="settings-field">
							<label htmlFor="gateway-tts-provider">
								{t("settings.gatewayTtsProvider")}
							</label>
							<select
								id="gateway-tts-provider"
								data-testid="gateway-tts-provider"
								value={gatewayTtsProvider}
								onChange={(e) =>
									handleGatewayTtsProviderChange(e.target.value)
								}
							>
								{gatewayTtsProviders.map((p) => (
									<option key={p.id} value={p.id}>
										{p.label}
										{!p.configured
											? ` ${t("settings.gatewayTtsNotConfigured")}`
											: ""}
									</option>
								))}
							</select>
						</div>
					) : (
						<div className="settings-field">
							<span className="settings-hint">
								{t("settings.gatewayTtsNone")}
							</span>
						</div>
					)}

					<div className="settings-section-divider">
						<span>{t("settings.voiceWakeSection")}</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint">
							{t("settings.voiceWakeHint")}
						</span>
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
								<div className="voice-wake-triggers" data-testid="voice-wake-triggers">
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
									setResetClearHistory(false);
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
		</div>
	);
}
