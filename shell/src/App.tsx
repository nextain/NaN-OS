import { useEffect, useState } from "react";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { SidePanel } from "./components/SidePanel";
import { TitleBar } from "./components/TitleBar";
import { type ThemeId, isOnboardingComplete, loadConfig } from "./lib/config";

function applyTheme(theme: ThemeId) {
	document.documentElement.setAttribute("data-theme", theme);
}

export function App() {
	const [showOnboarding, setShowOnboarding] = useState(false);

	useEffect(() => {
		const config = loadConfig();
		applyTheme(config?.theme ?? "espresso");
		if (!isOnboardingComplete()) {
			setShowOnboarding(true);
		}
	}, []);

	if (showOnboarding) {
		return (
			<div className="app-root">
				<TitleBar />
				<OnboardingWizard onComplete={() => setShowOnboarding(false)} />
			</div>
		);
	}

	return (
		<div className="app-root">
			<TitleBar />
			<div className="app-layout">
				<SidePanel />
				<div className="main-area">
					{/* Phase 3+: browser, games, windows */}
				</div>
			</div>
		</div>
	);
}
