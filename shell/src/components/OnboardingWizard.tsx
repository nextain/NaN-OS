import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import {
	LAB_GATEWAY_URL,
	getDefaultModel,
	loadConfig,
	saveConfig,
} from "../lib/config";
import { validateApiKey } from "../lib/db";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
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
	| "webhooks"
	| "complete";

const STEPS: Step[] = [
	"provider",
	"apiKey",
	"agentName",
	"userName",
	"character",
	"personality",
	"webhooks",
	"complete",
];

const VRM_CHOICES: { path: string; label: string }[] = [
	{ path: "/avatars/Sendagaya-Shino-dark-uniform.vrm", label: "Shino (Dark)" },
	{
		path: "/avatars/Sendagaya-Shino-light-uniform.vrm",
		label: "Shino (Light)",
	},
	{ path: "/avatars/vrm-ol-girl.vrm", label: "Girl" },
	{ path: "/avatars/vrm-sample-boy.vrm", label: "Boy" },
];

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
		id: "gemini",
		label: "Google Gemini",
		description: "Chat + TTS + Vision + Tool",
	},
	{
		id: "openai",
		label: "OpenAI (ChatGPT)",
		description: "지원 예정",
		disabled: true,
	},
	{
		id: "anthropic",
		label: "Anthropic (Claude)",
		description: "지원 예정",
		disabled: true,
	},
	{
		id: "xai",
		label: "xAI (Grok)",
		description: "지원 예정",
		disabled: true,
	},
	{
		id: "zai",
		label: "zAI (GLM)",
		description: "지원 예정",
		disabled: true,
	},
	{
		id: "ollama",
		label: "Ollama (로컬)",
		description: "지원 예정",
		disabled: true,
	},
];

export function OnboardingWizard({
	onComplete,
}: {
	onComplete: () => void;
}) {
	const setAvatarModelPath = useAvatarStore((s) => s.setModelPath);
	const [step, setStep] = useState<Step>("provider");
	const [agentName, setAgentName] = useState("");
	const [userName, setUserName] = useState("");
	const [selectedVrm, setSelectedVrm] = useState(VRM_CHOICES[0].path);
	const [selectedPersonality, setSelectedPersonality] = useState("friendly");
	const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
	const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
	const [googleChatWebhookUrl, setGoogleChatWebhookUrl] = useState("");
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

	// Listen for deep-link Lab auth callback
	useEffect(() => {
		const unlisten = listen<{ labKey: string; labUserId?: string }>(
			"lab_auth_complete",
			(event) => {
				Logger.info("OnboardingWizard", "Lab auth received", {});
				const key = event.payload.labKey;
				const userId = event.payload.labUserId ?? "";
				setLabKey(key);
				setLabUserId(userId);
				setLabWaiting(false);
				setLabTimeout(false);

				// Restore previous settings if they exist
				const existing = loadConfig();
				if (existing?.agentName) setAgentName(existing.agentName);
				if (existing?.userName) setUserName(existing.userName);
				if (existing?.vrmModel) {
					const match = VRM_CHOICES.find(
						(v) => v.path === existing.vrmModel,
					);
					if (match) setSelectedVrm(match.path);
				}
				if (existing?.persona) {
					const match = PERSONALITY_PRESETS.find((p) =>
						existing.persona?.includes(p.id),
					);
					if (match) setSelectedPersonality(match.id);
				}

				// Returning user with existing settings → complete
				// First-time user → go through name/character/personality
				if (existing?.agentName && existing?.userName) {
					setStep("complete");
				} else {
					setStep("agentName");
				}
			},
		);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	const stepIndex = STEPS.indexOf(step);
	const displayName = agentName.trim() || "Alpha";

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
		if (stepIndex < STEPS.length - 1) {
			let nextStep = STEPS[stepIndex + 1];
			// Skip apiKey step if Lab key is set
			if (nextStep === "apiKey" && labKey) {
				nextStep = STEPS[stepIndex + 2];
			}
			setStep(nextStep);
		}
	}

	function goBack() {
		if (stepIndex > 0) {
			let prevStep = STEPS[stepIndex - 1];
			// Skip apiKey step going back if Lab key is set
			if (prevStep === "apiKey" && labKey) {
				prevStep = STEPS[stepIndex - 2];
			}
			setStep(prevStep);
		}
	}

	async function handleLabLogin() {
		setLabWaiting(true);
		setLabTimeout(false);
		try {
			await openUrl("https://lab.cafelua.com/ko/login?redirect=desktop");
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

		const defaultVrm = VRM_CHOICES[0].path;
		const config = {
			provider,
			model: getDefaultModel(provider),
			apiKey: labKey ? "" : apiKey.trim(),
			userName: userName.trim() || undefined,
			agentName: agentName.trim() || undefined,
			vrmModel: selectedVrm !== defaultVrm ? selectedVrm : undefined,
			persona,
			slackWebhookUrl: slackWebhookUrl.trim() || undefined,
			discordWebhookUrl: discordWebhookUrl.trim() || undefined,
			googleChatWebhookUrl: googleChatWebhookUrl.trim() || undefined,
			onboardingComplete: true,
			labKey: labKey || undefined,
			labUserId: labUserId || undefined,
		};
		saveConfig(config);

		// Sync to Lab if connected
		if (labKey && labUserId) {
			const syncData = {
				provider: config.provider,
				model: config.model,
				locale: undefined,
				theme: undefined,
				vrmModel: config.vrmModel,
				persona: config.persona,
				userName: config.userName,
				agentName: config.agentName,
			};
			fetch(
				`${LAB_GATEWAY_URL}/v1/users/${encodeURIComponent(labUserId)}`,
				{
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
						"X-AnyLLM-Key": `Bearer ${labKey}`,
					},
					body: JSON.stringify({
						metadata: { cafelua_config: syncData },
					}),
				},
			).catch((err) => {
				Logger.warn("OnboardingWizard", "Lab sync failed", {
					error: String(err),
				});
			});
		}

		setAvatarModelPath(selectedVrm);
		onComplete();
	}

	function canProceed(): boolean {
		switch (step) {
			case "provider":
				return true;
			case "apiKey":
				return !!apiKey.trim() || !!labKey;
			case "agentName":
				return !!agentName.trim();
			case "userName":
				return !!userName.trim();
			default:
				return true;
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
										: "Cafelua Lab"}
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
							{t("onboard.character.title").replace("{user}", userName.trim() || "").replace("{agent}", displayName)}
						</h2>
						<VrmPreview modelPath={selectedVrm} />
						<div className="onboarding-vrm-cards">
							{VRM_CHOICES.map((v) => (
								<button
									key={v.path}
									type="button"
									className={`onboarding-vrm-card${selectedVrm === v.path ? " selected" : ""}`}
									onClick={() => setSelectedVrm(v.path)}
								>
									<span className="onboarding-vrm-label">{v.label}</span>
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
									onClick={() => setSelectedPersonality(p.id)}
								>
									<span className="personality-card-label">{p.label}</span>
									<span className="personality-card-desc">
										{p.description}
									</span>
								</button>
							))}
						</div>
						<p className="onboarding-description">
							{t("onboard.personality.hint")}
						</p>
					</div>
				)}

				{/* Step: Webhooks */}
				{step === "webhooks" && (
					<div className="onboarding-content">
						<h2>메신저 연동 (선택)</h2>
						<p className="onboarding-description">
							{displayName}가 알림을 보낼 메신저 웹훅 URL을 입력해주세요. 나중에 설정에서 추가할 수도 있습니다.
						</p>
						<div className="onboarding-input-group">
							<label htmlFor="slack-webhook">Slack 웹훅 URL</label>
							<input
								id="slack-webhook"
								className="onboarding-input"
								type="password"
								placeholder="https://hooks.slack.com/services/..."
								value={slackWebhookUrl}
								onChange={(e) => setSlackWebhookUrl(e.target.value)}
							/>
						</div>
						<div className="onboarding-input-group" style={{ marginTop: 12 }}>
							<label htmlFor="discord-webhook">Discord 웹훅 URL</label>
							<input
								id="discord-webhook"
								className="onboarding-input"
								type="password"
								placeholder="https://discord.com/api/webhooks/..."
								value={discordWebhookUrl}
								onChange={(e) => setDiscordWebhookUrl(e.target.value)}
							/>
						</div>
						<div className="onboarding-input-group" style={{ marginTop: 12 }}>
							<label htmlFor="google-chat-webhook">Google Chat 웹훅 URL</label>
							<input
								id="google-chat-webhook"
								className="onboarding-input"
								type="password"
								placeholder="https://chat.googleapis.com/v1/spaces/..."
								value={googleChatWebhookUrl}
								onChange={(e) => setGoogleChatWebhookUrl(e.target.value)}
							/>
						</div>
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
						>
							{t("onboard.next")}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
