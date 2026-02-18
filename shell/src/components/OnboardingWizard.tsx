import { useState } from "react";
import {
	getDefaultModel,
	loadConfig,
	saveConfig,
} from "../lib/config";
import { validateApiKey } from "../lib/db";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import type { ProviderId } from "../lib/types";
import { useAvatarStore } from "../stores/avatar";

type Step =
	| "agentName"
	| "userName"
	| "character"
	| "personality"
	| "provider"
	| "apiKey"
	| "complete";

const STEPS: Step[] = [
	"agentName",
	"userName",
	"character",
	"personality",
	"provider",
	"apiKey",
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

const PROVIDERS: { id: ProviderId; label: string; description: string }[] = [
	{
		id: "gemini",
		label: "Google Gemini",
		description: "Chat + TTS + Vision",
	},
	{
		id: "xai",
		label: "xAI (Grok)",
		description: "Grok models",
	},
	{
		id: "anthropic",
		label: "Anthropic (Claude)",
		description: "Claude models",
	},
];

export function OnboardingWizard({
	onComplete,
}: {
	onComplete: () => void;
}) {
	const setAvatarModelPath = useAvatarStore((s) => s.setModelPath);
	const [step, setStep] = useState<Step>("agentName");
	const [agentName, setAgentName] = useState("");
	const [userName, setUserName] = useState("");
	const [selectedVrm, setSelectedVrm] = useState(VRM_CHOICES[0].path);
	const [selectedPersonality, setSelectedPersonality] = useState("friendly");
	const [provider, setProvider] = useState<ProviderId>("gemini");
	const [apiKey, setApiKey] = useState("");
	const [validating, setValidating] = useState(false);
	const [validationResult, setValidationResult] = useState<
		"idle" | "success" | "error"
	>("idle");

	const stepIndex = STEPS.indexOf(step);
	const displayName = agentName.trim() || "Alpha";

	function goNext() {
		if (stepIndex < STEPS.length - 1) {
			setStep(STEPS[stepIndex + 1]);
		}
	}

	function goBack() {
		if (stepIndex > 0) {
			setStep(STEPS[stepIndex - 1]);
		}
	}

	function handleSkip() {
		const existing = loadConfig();
		saveConfig({
			provider: existing?.provider ?? "gemini",
			model: existing?.model ?? getDefaultModel("gemini"),
			apiKey: existing?.apiKey ?? "",
			onboardingComplete: true,
		});
		onComplete();
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
		saveConfig({
			provider,
			model: getDefaultModel(provider),
			apiKey: apiKey.trim(),
			userName: userName.trim() || undefined,
			agentName: displayName !== "Alpha" ? displayName : undefined,
			vrmModel: selectedVrm !== defaultVrm ? selectedVrm : undefined,
			persona,
			onboardingComplete: true,
		});

		setAvatarModelPath(selectedVrm);
		onComplete();
	}

	function canProceed(): boolean {
		switch (step) {
			case "apiKey":
				return !!apiKey.trim();
			default:
				return true;
		}
	}

	return (
		<div className="onboarding-overlay">
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

				{/* Step: Agent Name */}
				{step === "agentName" && (
					<div className="onboarding-content">
						<h2>{t("onboard.agentName.title")}</h2>
						<p className="onboarding-description">
							{t("onboard.agentName.description")}
						</p>
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
						<p className="onboarding-description">
							{t("onboard.userName.description")}
						</p>
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

				{/* Step: Character (VRM) */}
				{step === "character" && (
					<div className="onboarding-content">
						<h2>
							{t("onboard.character.title").replace("{agent}", displayName)}
						</h2>
						<div className="onboarding-vrm-cards">
							{VRM_CHOICES.map((v) => (
								<button
									key={v.path}
									type="button"
									className={`onboarding-vrm-card${selectedVrm === v.path ? " selected" : ""}`}
									onClick={() => setSelectedVrm(v.path)}
								>
									<span className="onboarding-vrm-icon">&#x1F464;</span>
									<span className="onboarding-vrm-label">{v.label}</span>
								</button>
							))}
						</div>
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
					</div>
				)}

				{/* Step: Provider */}
				{step === "provider" && (
					<div className="onboarding-content">
						<h2>{t("onboard.provider.title")}</h2>
						<div className="onboarding-provider-cards">
							{PROVIDERS.map((p) => (
								<button
									key={p.id}
									type="button"
									className={`onboarding-provider-card${provider === p.id ? " selected" : ""}`}
									onClick={() => setProvider(p.id)}
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
					{step === "agentName" && (
						<button
							type="button"
							className="onboarding-skip-btn"
							onClick={handleSkip}
						>
							{t("onboard.skip")}
						</button>
					)}
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
