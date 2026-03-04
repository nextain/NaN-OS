import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AvatarCanvas } from "./components/AvatarCanvas";
import { ChatPanel } from "./components/ChatPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { TitleBar } from "./components/TitleBar";
import {
	type PanelPosition,
	type ThemeId,
	isOnboardingComplete,
	loadConfig,
	saveConfig,
} from "./lib/config";
import { persistDiscordDefaults } from "./lib/discord-auth";
import { syncLinkedChannels } from "./lib/channel-sync";

function applyTheme(theme: ThemeId) {
	document.documentElement.setAttribute("data-theme", theme);
}

export function App() {
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [panelPosition, setPanelPosition] = useState<PanelPosition>("bottom");
	const [panelVisible, setPanelVisible] = useState(true);

	useEffect(() => {
		const config = loadConfig();
		applyTheme(config?.theme ?? "espresso");
		if (config?.panelPosition) setPanelPosition(config.panelPosition);
		if (config?.panelVisible === false) setPanelVisible(false);
		if (!isOnboardingComplete()) {
			setShowOnboarding(true);
		}
	}, []);

	// Ctrl+B: toggle panel visibility
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "b") {
				e.preventDefault();
				togglePanel();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const togglePanel = useCallback(() => {
		setPanelVisible((prev) => {
			const next = !prev;
			const config = loadConfig();
			if (config) saveConfig({ ...config, panelVisible: next });
			return next;
		});
	}, []);

	// Listen for panel position changes from SettingsTab
	useEffect(() => {
		const handler = (e: Event) => {
			const pos = (e as CustomEvent<PanelPosition>).detail;
			setPanelPosition(pos);
		};
		window.addEventListener("naia:panel-position", handler);
		return () => window.removeEventListener("naia:panel-position", handler);
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

	// After Lab login, sync linked channels (e.g. Discord DM) from gateway
	useEffect(() => {
		const unlisten = listen("lab_auth_complete", () => {
			void syncLinkedChannels();
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	if (showOnboarding) {
		return (
			<div className="app-root">
				<TitleBar
					panelVisible={panelVisible}
					onTogglePanel={togglePanel}
				/>
				<OnboardingWizard onComplete={() => setShowOnboarding(false)} />
			</div>
		);
	}

	return (
		<div className="app-root">
			<TitleBar
				panelVisible={panelVisible}
				onTogglePanel={togglePanel}
			/>
			<div className="app-layout" data-panel-position={panelPosition}>
				{panelVisible && (
					<div className="side-panel">
						<ChatPanel />
					</div>
				)}
				<div className="main-area">
					<AvatarCanvas />
				</div>
			</div>
		</div>
	);
}
