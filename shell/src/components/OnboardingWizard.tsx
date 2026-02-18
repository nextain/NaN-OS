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

type Step = "welcome" | "name" | "provider" | "apiKey" | "complete";

const STEPS: Step[] = ["welcome", "name", "provider", "apiKey", "complete"];

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
	const [step, setStep] = useState<Step>("welcome");
	const [userName, setUserName] = useState("");
	const [provider, setProvider] = useState<ProviderId>("gemini");
	const [apiKey, setApiKey] = useState("");
	const [validating, setValidating] = useState(false);
	const [validationResult, setValidationResult] = useState<
		"idle" | "success" | "error"
	>("idle");

	const stepIndex = STEPS.indexOf(step);

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
		saveConfig({
			provider,
			model: getDefaultModel(provider),
			apiKey: apiKey.trim(),
			userName: userName.trim() || undefined,
			onboardingComplete: true,
		});
		onComplete();
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

				{/* Step content */}
				{step === "welcome" && (
					<div className="onboarding-content">
						<h2>{t("onboard.welcome.title")}</h2>
						<p className="onboarding-subtitle">
							{t("onboard.welcome.subtitle")}
						</p>
						<p className="onboarding-description">
							{t("onboard.welcome.description")}
						</p>
					</div>
				)}

				{step === "name" && (
					<div className="onboarding-content">
						<h2>{t("onboard.name.title")}</h2>
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

				{step === "complete" && (
					<div className="onboarding-content">
						<h2>
							{t("onboard.complete.greeting").replace(
								"{name}",
								userName.trim() || "User",
							)}
						</h2>
					</div>
				)}

				{/* Navigation */}
				<div className="onboarding-nav">
					{step === "welcome" && (
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
							disabled={step === "apiKey" && !apiKey.trim()}
						>
							{t("onboard.next")}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
