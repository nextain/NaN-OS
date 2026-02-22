import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { directToolCall } from "../lib/chat-service";
import {
	DEFAULT_GATEWAY_URL,
	getDefaultModel,
	loadConfig,
	resolveGatewayUrl,
	saveConfig,
} from "../lib/config";
import { AVATAR_PRESETS, DEFAULT_AVATAR_MODEL } from "../lib/avatar-presets";
import { validateApiKey } from "../lib/db";
import { getLocale, t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import { syncToOpenClaw } from "../lib/openclaw-sync";
import { persistDiscordDefaults } from "../lib/discord-auth";
import { fetchLabConfig, pushConfigToLab } from "../lib/lab-sync";
import { buildSystemPrompt } from "../lib/persona";
import type { ProviderId } from "../lib/types";
import { useAvatarStore } from "../stores/avatar";
import { VrmPreview } from "./VrmPreview";

type Step =
	| "provider"
	| "apiKey"
	| "agentName"
	| "userName"
	| "character"
	| "personality"
	| "speechStyle"
	| "complete";

const STEPS: Step[] = [
	"provider",
	"apiKey",
	"agentName",
	"userName",
	"character",
	"personality",
	"speechStyle",
	"complete",
];

function looksLikeApiKey(value: string): boolean {
	const v = value.trim();
	if (!v) return false;
	return (
		/^AIza[0-9A-Za-z_\-]{20,}$/.test(v) ||
		/^sk-[0-9A-Za-z_\-]{16,}$/.test(v) ||
		/^gw-[0-9A-Za-z_\-]{10,}$/.test(v) ||
		/^xai-[0-9A-Za-z_\-]{16,}$/.test(v) ||
		/^claude_[0-9A-Za-z_\-]{10,}$/i.test(v)
	);
}

function sanitizeName(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	return looksLikeApiKey(trimmed) ? "" : trimmed;
}

const PERSONALITY_PRESETS: {
	id: string;
	label: string;
	description: string;
	persona: string;
}[] = [
	{
		id: "friendly",
		label: "다정한 친구",
		description: "편하게 반말, 따뜻한 성격",
		persona: `You are {name}, a warm and friendly AI companion.
Personality:
- Speaks casually in Korean (반말)
- Warm, caring, and supportive
- Uses friendly expressions naturally
- Gives concise, helpful answers`,
	},
	{
		id: "polite",
		label: "듬직한 비서",
		description: "존댓말, 격식 있는 말투",
		persona: `You are {name}, a reliable and professional AI assistant.
Personality:
- Speaks politely in Korean (존댓말)
- Professional, reliable, and thorough
- Clear and organized communication
- Gives structured, detailed answers when needed`,
	},
	{
		id: "playful",
		label: "장난꾸러기",
		description: "유머러스, 밝은 말투",
		persona: `You are {name}, a playful and humorous AI companion.
Personality:
- Speaks casually with humor in Korean
- Playful, witty, and cheerful
- Makes conversations fun and lighthearted
- Sneaks in jokes and clever remarks`,
	},
	{
		id: "calm",
		label: "차분한 학자",
		description: "지적이고 침착한 톤",
		persona: `You are {name}, a calm and intellectual AI companion.
Personality:
- Speaks thoughtfully in Korean
- Calm, analytical, and knowledgeable
- Explains things clearly and logically
- Takes time to consider before answering`,
	},
];

const PROVIDERS: {
	id: ProviderId;
	label: string;
	description: string;
	disabled?: boolean;
}[] = [
	{
		id: "claude-code-cli",
		label: "Claude Code CLI (Local)",
		description: "로컬 Claude CLI 로그인 세션 사용",
	},
	{
		id: "gemini",
		label: "Google Gemini",
		description: "Chat + TTS + Vision + Tool",
	},
	{
		id: "openai",
		label: "OpenAI (ChatGPT)",
		description: "API Key 필요",
	},
	{
		id: "anthropic",
		label: "Anthropic (Claude)",
		description: "API Key 필요",
	},
	{
		id: "xai",
		label: "xAI (Grok)",
		description: "API Key 필요",
	},
	{
		id: "zai",
		label: "zAI (GLM)",
		description: "API Key 필요",
	},
	{
		id: "ollama",
		label: "Ollama (로컬)",
		description: "로컬 설치 필요",
	},
];

function getNaiaWebBaseUrl() {
	return (
		import.meta.env.VITE_NAIA_WEB_BASE_URL?.trim() ||
		"https://naia.nextain.io"
	);
}

export function OnboardingWizard({
	onComplete,
}: {
	onComplete: () => void;
}) {
	const setAvatarModelPath = useAvatarStore((s) => s.setModelPath);
	const [step, setStep] = useState<Step>("provider");
	const [agentName, setAgentName] = useState("");
	const [userName, setUserName] = useState("");
	const [selectedVrm, setSelectedVrm] = useState(AVATAR_PRESETS[0].path);
	const [selectedPersonality, setSelectedPersonality] = useState("friendly");
	const [provider, setProvider] = useState<ProviderId>("gemini");
	const [apiKey, setApiKey] = useState("");
	const [validating, setValidating] = useState(false);
	const [validationResult, setValidationResult] = useState<
		"idle" | "success" | "error"
	>("idle");
	const [labKey, setLabKey] = useState("");
	const [labUserId, setLabUserId] = useState("");
	const [labWaiting, setLabWaiting] = useState(false);
	const [labTimeout, setLabTimeout] = useState(false);
	const [selectedSpeechStyle, setSelectedSpeechStyle] = useState("반말");
	const [honorificInput, setHonorificInput] = useState("");
	const [discordConnectLoading, setDiscordConnectLoading] = useState(false);
	const [discordConnected, setDiscordConnected] = useState(false);

	// Listen for deep-link Lab auth callback
	useEffect(() => {
		const unlisten = listen<{ labKey: string; labUserId?: string }>(
			"lab_auth_complete",
			async (event) => {
				Logger.info("OnboardingWizard", "Lab auth received", {});
				const key = event.payload.labKey;
				const userId = event.payload.labUserId ?? "";
				setLabKey(key);
				setLabUserId(userId);
				setProvider("nextain");
				setLabWaiting(false);
				setLabTimeout(false);

				// Try to pull settings from Lab
				const onlineConfig = userId ? await fetchLabConfig(key, userId) : null;

				// Restore from online or local
				const existing = loadConfig();
				const source = onlineConfig ?? existing;
				if (source?.agentName) {
					setAgentName(sanitizeName(source.agentName as string));
				}
				if (source?.userName) setUserName(source.userName as string);
				if (onlineConfig?.honorific) setHonorificInput(onlineConfig.honorific);
				if (onlineConfig?.speechStyle) setSelectedSpeechStyle(onlineConfig.speechStyle);

				const vrmSource = existing?.vrmModel;
				if (vrmSource) {
					const match = AVATAR_PRESETS.find((v) => v.path === vrmSource);
					if (match) setSelectedVrm(match.path);
				}

				const personaSource = onlineConfig?.persona ?? existing?.persona;
				if (personaSource) {
					const match = PERSONALITY_PRESETS.find((p) =>
						(personaSource as string).includes(p.id),
					);
					if (match) setSelectedPersonality(match.id);
				}

				// Returning user with existing settings → restore & complete
				// First-time user → go through name/character/personality
				if (source?.agentName && source?.userName) {
					// Immediately persist config to local storage
					// Prefer online values, fall back to local existing values
					const existing = loadConfig();
					const restored = {
						...existing,
						provider: "nextain" as ProviderId,
						model: getDefaultModel("nextain"),
						apiKey: "",
						userName: (onlineConfig?.userName ?? existing?.userName ?? source.userName) as string,
						agentName: (onlineConfig?.agentName ?? existing?.agentName ?? source.agentName) as string,
						persona: (onlineConfig?.persona ?? existing?.persona) as string | undefined,
						honorific: (onlineConfig?.honorific ?? existing?.honorific) as string | undefined,
						speechStyle: (onlineConfig?.speechStyle ?? existing?.speechStyle) as string | undefined,
						enableTools: true,
						onboardingComplete: true,
						labKey: key,
						labUserId: userId,
					};
					saveConfig(restored);

					// Sync to OpenClaw gateway
					const fullPrompt = buildSystemPrompt(restored.persona, {
						agentName: restored.agentName,
						userName: restored.userName,
						honorific: restored.honorific,
						speechStyle: restored.speechStyle,
						discordDefaultUserId: restored.discordDefaultUserId,
						discordDmChannelId: restored.discordDmChannelId,
					});
					syncToOpenClaw(restored.provider, restored.model, restored.apiKey, restored.persona, restored.agentName, restored.userName, fullPrompt, getLocale(), restored.discordDmChannelId, restored.discordDefaultUserId);

					// Push to Lab if not yet saved online
					if (!onlineConfig) {
						pushConfigToLab(key, userId, restored);
					}

					// Restore avatar and skip directly to chat
					if (restored.vrmModel) {
						setAvatarModelPath(restored.vrmModel);
					}
					onComplete();
				} else {
					setStep("agentName");
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
			if (!next) return;
			setDiscordConnected(true);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	useEffect(() => {
		if (step !== "complete") return;
		let cancelled = false;
		const refreshDiscordStatus = async () => {
			try {
				const cfg = loadConfig();
				const gatewayUrl = resolveGatewayUrl(cfg) || DEFAULT_GATEWAY_URL;
				const result = await directToolCall({
					toolName: "skill_channels",
					args: { action: "status" },
					requestId: `onboard-discord-status-${Date.now()}`,
					gatewayUrl,
					gatewayToken: cfg?.gatewayToken,
				});
				if (!result.success || !result.output || cancelled) return;
				const channels = JSON.parse(result.output) as Array<{
					id?: string;
					accounts?: Array<{ connected?: boolean }>;
				}>;
				const discord = channels.find((ch) => ch.id === "discord");
				const connected =
					discord?.accounts?.some((acc) => acc.connected === true) ?? false;
				setDiscordConnected(connected);
			} catch {
				// Keep optional flow non-blocking
			}
		};
		void refreshDiscordStatus();
		return () => {
			cancelled = true;
		};
	}, [step]);

	const stepIndex = STEPS.indexOf(step);
	const safeAgentName = sanitizeName(agentName);
	const displayName = safeAgentName || "Naia";

	// Enter key advances to next step
	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" && canProceed()) {
			e.preventDefault();
			if (step === "complete") {
				handleComplete();
			} else {
				goNext();
			}
		}
	}

	function goNext() {
		const skipApiKey = labKey || provider === "claude-code-cli" || provider === "ollama";
		if (stepIndex < STEPS.length - 1) {
			let nextStep = STEPS[stepIndex + 1];
			// Skip apiKey step if Lab key is set
			if (nextStep === "apiKey" && skipApiKey) {
				nextStep = STEPS[stepIndex + 2];
			}
			setStep(nextStep);
		}
	}

	function goBack() {
		const skipApiKey = labKey || provider === "claude-code-cli" || provider === "ollama";
		if (stepIndex > 0) {
			let prevStep = STEPS[stepIndex - 1];
			// Skip apiKey step going back if Lab key is set
			if (prevStep === "apiKey" && skipApiKey) {
				prevStep = STEPS[stepIndex - 2];
			}
			setStep(prevStep);
		}
	}

	async function handleLabLogin() {
		setLabWaiting(true);
		setLabTimeout(false);
		try {
			await openUrl("https://naia.nextain.io/ko/login?redirect=desktop");
		} catch {
			setLabWaiting(false);
			return;
		}
		// Timeout after 30s
		setTimeout(() => {
			setLabWaiting(false);
			setLabTimeout(true);
		}, 30_000);
	}

	async function handleValidate() {
		if (provider === "claude-code-cli" || provider === "ollama") {
			setValidationResult("success");
			return;
		}
		if (!apiKey.trim()) return;
		setValidating(true);
		setValidationResult("idle");
		try {
			const ok = await validateApiKey(provider, apiKey.trim());
			setValidationResult(ok ? "success" : "error");
		} catch (err) {
			Logger.warn("OnboardingWizard", "Validation failed", {
				error: String(err),
			});
			setValidationResult("error");
		} finally {
			setValidating(false);
		}
	}

	function handleComplete() {
		const preset = PERSONALITY_PRESETS.find(
			(p) => p.id === selectedPersonality,
		);
		const persona = preset
			? preset.persona.replace(/\{name\}/g, displayName)
			: undefined;

		const defaultVrm = DEFAULT_AVATAR_MODEL;
		const effectiveProvider: ProviderId = labKey ? "nextain" : provider;
		// Merge with existing config to preserve fields set by discord_auth_complete etc.
		const existing = loadConfig();
		const config = {
			...existing,
			provider: effectiveProvider,
			model: getDefaultModel(effectiveProvider),
			apiKey:
				labKey || provider === "claude-code-cli" || provider === "ollama"
					? ""
					: apiKey.trim(),
			userName: userName.trim() || undefined,
			agentName: safeAgentName || undefined,
			vrmModel: selectedVrm !== defaultVrm ? selectedVrm : undefined,
			persona,
			honorific: honorificInput.trim() || undefined,
			speechStyle: selectedSpeechStyle,
			enableTools: true,
			onboardingComplete: true,
			labKey: labKey || undefined,
			labUserId: labUserId || undefined,
		};
		saveConfig(config);

		// Sync provider/model + full system prompt to OpenClaw gateway config
		const fullPrompt = buildSystemPrompt(config.persona, {
			agentName: config.agentName,
			userName: config.userName,
			honorific: config.honorific,
			speechStyle: config.speechStyle,
			discordDefaultUserId: config.discordDefaultUserId,
			discordDmChannelId: config.discordDmChannelId,
		});
		syncToOpenClaw(config.provider, config.model, config.apiKey, config.persona, config.agentName, config.userName, fullPrompt, getLocale(), config.discordDmChannelId, config.discordDefaultUserId);

		// Sync to Lab if connected
		if (labKey && labUserId) {
			pushConfigToLab(labKey, labUserId, config);
		}

		setAvatarModelPath(selectedVrm);
		onComplete();
	}

	function canProceed(): boolean {
		switch (step) {
			case "provider":
				return true;
			case "apiKey":
				return (
					!!apiKey.trim() ||
					!!labKey ||
					provider === "claude-code-cli" ||
					provider === "ollama"
				);
			case "agentName":
				return !!sanitizeName(agentName);
			case "userName":
				return !!userName.trim();
			default:
				return true;
		}
	}

	async function handleOptionalDiscordConnect() {
		setDiscordConnectLoading(true);
		try {
			const lang = getLocale();
			const connectUrl = `${getNaiaWebBaseUrl()}/${lang}/settings/integrations?channel=discord&source=naia-shell`;
			await openUrl(connectUrl);
		} catch (err) {
			Logger.warn("OnboardingWizard", "Optional discord connect failed", {
				error: String(err),
			});
		} finally {
			setDiscordConnectLoading(false);
		}
	}

	return (
		<div className="onboarding-overlay" onKeyDown={handleKeyDown}>
			<div className="onboarding-card">
				{/* Step indicators */}
				<div className="onboarding-steps">
					{STEPS.map((s, i) => (
						<div
							key={s}
							className={`onboarding-step-dot${i <= stepIndex ? " active" : ""}`}
						/>
					))}
				</div>

				{/* Step: Provider (FIRST) */}
				{step === "provider" && (
					<div className="onboarding-content">
						<h2>{t("onboard.provider.title")}</h2>

						{/* Lab login — prominent card at top */}
						<button
							type="button"
							className={`onboarding-provider-card lab-card${labKey ? " selected" : ""}`}
							disabled={labWaiting}
							onClick={handleLabLogin}
						>
							<span className="provider-card-label">
								{labKey
									? t("onboard.apiKey.success")
									: labWaiting
										? t("onboard.lab.waiting")
										: "Naia Lab"}
							</span>
							<span className="provider-card-desc">
								{t("onboard.lab.description")}
							</span>
						</button>

						{labTimeout && (
							<div className="onboarding-validation-error">
								{t("onboard.lab.timeout")}
							</div>
						)}

						<div className="onboarding-divider">
							<span>{t("onboard.lab.or")}</span>
						</div>

						<div className="onboarding-provider-cards">
							{PROVIDERS.map((p) => (
								<button
									key={p.id}
									type="button"
									className={`onboarding-provider-card${!labKey && provider === p.id ? " selected" : ""}${p.disabled ? " disabled" : ""}`}
									disabled={p.disabled}
									onClick={() => {
										if (p.disabled) return;
										setProvider(p.id);
										setLabKey("");
										setLabUserId("");
										setLabTimeout(false);
									}}
								>
									<span className="provider-card-label">{p.label}</span>
									<span className="provider-card-desc">{p.description}</span>
								</button>
							))}
						</div>
					</div>
				)}

				{/* Step: API Key */}
				{step === "apiKey" && (
					<div className="onboarding-content">
						<h2>{t("onboard.apiKey.title")}</h2>
						<input
							type="password"
							className="onboarding-input"
							value={apiKey}
							onChange={(e) => {
								setApiKey(e.target.value);
								setValidationResult("idle");
							}}
							placeholder="API key..."
							autoFocus
						/>
						<button
							type="button"
							className="onboarding-validate-btn"
							onClick={handleValidate}
							disabled={!apiKey.trim() || validating}
						>
							{validating
								? t("onboard.apiKey.validating")
								: t("onboard.apiKey.validate")}
						</button>
						{validationResult === "success" && (
							<div className="onboarding-validation-success">
								{t("onboard.apiKey.success")}
							</div>
						)}
						{validationResult === "error" && (
							<div className="onboarding-validation-error">
								{t("onboard.apiKey.error")}
							</div>
						)}
					</div>
				)}

				{/* Step: Agent Name */}
				{step === "agentName" && (
					<div className="onboarding-content">
						<h2>{t("onboard.agentName.title")}</h2>
						<input
							type="text"
							className="onboarding-input"
							value={agentName}
							onChange={(e) => setAgentName(e.target.value)}
							placeholder={t("onboard.name.placeholder")}
							autoFocus
						/>
					</div>
				)}

				{/* Step: User Name */}
				{step === "userName" && (
					<div className="onboarding-content">
						<h2>
							{t("onboard.userName.title").replace("{agent}", displayName)}
						</h2>
						<input
							type="text"
							className="onboarding-input"
							value={userName}
							onChange={(e) => setUserName(e.target.value)}
							placeholder={t("onboard.name.placeholder")}
							autoFocus
						/>
					</div>
				)}

				{/* Step: Character (VRM) with preview */}
				{step === "character" && (
					<div className="onboarding-content">
						<h2>
							{t("onboard.character.title")
								.replace("{user}", userName.trim() || "")
								.replace("{agent}", displayName)}
						</h2>
						<VrmPreview modelPath={selectedVrm} />
						<div className="onboarding-vrm-cards">
							{AVATAR_PRESETS.map((v) => (
								<button
									key={v.path}
									type="button"
									className={`onboarding-vrm-card${selectedVrm === v.path ? " selected" : ""}`}
									onClick={() => setSelectedVrm(v.path)}
									style={
										v.previewImage
											? {
													padding: 0,
													overflow: "hidden",
													display: "flex",
													flexDirection: "column",
												}
											: {}
									}
								>
									{v.previewImage && (
										<img
											src={v.previewImage}
											alt={v.label}
											style={{
												width: "100%",
												height: "60px",
												objectFit: "cover",
												flexShrink: 0,
											}}
										/>
									)}
									<span
										className="onboarding-vrm-label"
										style={
											v.previewImage
												? {
														flexGrow: 1,
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														padding: "4px",
													}
												: {}
										}
									>
										{v.label}
									</span>
								</button>
							))}
						</div>
						<p className="onboarding-description">
							{t("onboard.character.hint")}
						</p>
					</div>
				)}

				{/* Step: Personality */}
				{step === "personality" && (
					<div className="onboarding-content">
						<h2>
							{t("onboard.personality.title").replace("{agent}", displayName)}
						</h2>
						<div className="onboarding-personality-cards">
							{PERSONALITY_PRESETS.map((p) => (
								<button
									key={p.id}
									type="button"
									className={`onboarding-personality-card${selectedPersonality === p.id ? " selected" : ""}`}
									onClick={() => {
									setSelectedPersonality(p.id);
									setSelectedSpeechStyle(p.id === "polite" || p.id === "calm" ? "존댓말" : "반말");
								}}
								>
									<span className="personality-card-label">{p.label}</span>
									<span className="personality-card-desc">{p.description}</span>
								</button>
							))}
						</div>
						<p className="onboarding-description">
							{t("onboard.personality.hint")}
						</p>
					</div>
				)}

				{/* Step: Speech Style */}
				{step === "speechStyle" && (
					<div className="onboarding-content">
						<h2>
							{t("onboard.speechStyle.title").replace("{agent}", displayName)}
						</h2>
						<div className="onboarding-personality-cards">
							<button
								type="button"
								className={`onboarding-personality-card${selectedSpeechStyle === "반말" ? " selected" : ""}`}
								onClick={() => setSelectedSpeechStyle("반말")}
							>
								<span className="personality-card-label">{t("onboard.speechStyle.casual")}</span>
								<span className="personality-card-desc">{t("onboard.speechStyle.casualDesc")}</span>
							</button>
							<button
								type="button"
								className={`onboarding-personality-card${selectedSpeechStyle === "존댓말" ? " selected" : ""}`}
								onClick={() => setSelectedSpeechStyle("존댓말")}
							>
								<span className="personality-card-label">{t("onboard.speechStyle.formal")}</span>
								<span className="personality-card-desc">{t("onboard.speechStyle.formalDesc")}</span>
							</button>
						</div>
						<div className="settings-field" style={{ marginTop: 16 }}>
							<label>{t("onboard.speechStyle.honorificLabel")}</label>
							<input
								type="text"
								className="onboarding-input"
								value={honorificInput}
								onChange={(e) => setHonorificInput(e.target.value)}
								placeholder={t("onboard.speechStyle.honorificPlaceholder")}
							/>
						</div>
						<p className="onboarding-description">
							{t("onboard.speechStyle.hint")}
						</p>
					</div>
				)}

				{/* Step: Complete */}
				{step === "complete" && (
					<div className="onboarding-content">
						<h2>
							{t("onboard.complete.greeting").replace(
								"{name}",
								userName.trim() || "User",
							)}
						</h2>
						<p className="onboarding-description">
							{t("onboard.complete.ready").replace("{agent}", displayName)}
						</p>
						<div
							style={{
								marginTop: 12,
								display: "flex",
								flexDirection: "column",
								gap: 8,
							}}
						>
							<span className="onboarding-description">
								선택: Discord 봇도 지금 연결할 수 있어요.
							</span>
							<div style={{ display: "flex", gap: 8 }}>
								<button
									type="button"
									className="onboarding-back-btn"
									onClick={() => void handleOptionalDiscordConnect()}
									disabled={discordConnectLoading}
									data-testid="onboarding-discord-connect-btn"
								>
									{discordConnectLoading
										? "Discord 연결 중..."
										: "Discord 봇 연결(선택)"}
								</button>
								<span className="onboarding-description">
									{discordConnected
										? "연결됨"
										: "상태: 브라우저에서 연동 진행"}
								</span>
							</div>
						</div>
					</div>
				)}

				{/* Navigation */}
				<div className="onboarding-nav">
					{stepIndex > 0 && step !== "complete" && (
						<button
							type="button"
							className="onboarding-back-btn"
							onClick={goBack}
						>
							{t("onboard.back")}
						</button>
					)}
					<div className="onboarding-nav-spacer" />
					{step === "complete" ? (
						<button
							type="button"
							className="onboarding-next-btn"
							onClick={handleComplete}
						>
							{t("onboard.complete.start")}
						</button>
					) : (
						<button
							type="button"
							className="onboarding-next-btn"
							onClick={goNext}
							disabled={!canProceed()}
							autoFocus={step === "character" || step === "personality"}
						>
							{t("onboard.next")}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
