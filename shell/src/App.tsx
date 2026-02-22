import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { SidePanel } from "./components/SidePanel";
import { TitleBar } from "./components/TitleBar";
import { type ThemeId, isOnboardingComplete, loadConfig } from "./lib/config";
import { persistDiscordDefaults } from "./lib/discord-auth";

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

	// Global deep-link sink: must persist even when Settings/Onboarding is not open.
	useEffect(() => {
		const unlisten = listen<{
			discordUserId?: string | null;
			discordChannelId?: string | null;
			discordTarget?: string | null;
		}>("discord_auth_complete", (event) => {
			persistDiscordDefaults(event.payload);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
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
