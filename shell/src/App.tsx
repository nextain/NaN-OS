import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarCanvas } from "./components/AvatarCanvas";
import { ChatPanel } from "./components/ChatPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { TitleBar } from "./components/TitleBar";
import { syncLinkedChannels } from "./lib/channel-sync";
import {
	type PanelPosition,
	type ThemeId,
	isOnboardingComplete,
	loadConfig,
	migrateLabKeyToNaiaKey,
	saveConfig,
} from "./lib/config";
import { persistDiscordDefaults } from "./lib/discord-auth";

function applyTheme(theme: ThemeId) {
	document.documentElement.setAttribute("data-theme", theme);
}

export function App() {
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [panelPosition, setPanelPosition] = useState<PanelPosition>("bottom");
	const [panelVisible, setPanelVisible] = useState(true);
	const [panelSize, setPanelSize] = useState(70);
	const layoutRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// One-time migration: labKey/labUserId → naiaKey/naiaUserId
		void migrateLabKeyToNaiaKey();

		const config = loadConfig();
		applyTheme(config?.theme ?? "espresso");
		if (config?.panelPosition) setPanelPosition(config.panelPosition);
		if (config?.panelVisible === false) setPanelVisible(false);
		if (config?.panelSize)
			setPanelSize(Math.max(15, Math.min(80, config.panelSize)));
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

	const onResizeStart = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			const rect = layoutRef.current?.getBoundingClientRect();
			if (!rect) return;

			const isBottom = panelPosition === "bottom";
			const isRight = panelPosition === "right";
			document.body.classList.add(isBottom ? "resizing-row" : "resizing-col");

			const onMove = (ev: PointerEvent) => {
				let pct: number;
				if (isBottom) {
					pct = ((rect.bottom - ev.clientY) / rect.height) * 100;
				} else if (isRight) {
					pct = ((rect.right - ev.clientX) / rect.width) * 100;
				} else {
					pct = ((ev.clientX - rect.left) / rect.width) * 100;
				}
				setPanelSize(Math.max(15, Math.min(80, pct)));
			};

			const onUp = () => {
				document.body.classList.remove("resizing-row", "resizing-col");
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				setPanelSize((current) => {
					const cfg = loadConfig();
					if (cfg) saveConfig({ ...cfg, panelSize: current });
					return current;
				});
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[panelPosition],
	);

	// Listen for panel position changes from SettingsTab
	useEffect(() => {
		const handler = (e: Event) => {
			const pos = (e as CustomEvent<PanelPosition>).detail;
			setPanelPosition(pos);
			setPanelSize(loadConfig()?.panelSize ?? 70);
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
		const unlisten = listen("naia_auth_complete", () => {
			void syncLinkedChannels();
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	if (showOnboarding) {
		return (
			<div className="app-root">
				<TitleBar panelVisible={panelVisible} onTogglePanel={togglePanel} />
				<OnboardingWizard onComplete={() => setShowOnboarding(false)} />
			</div>
		);
	}

	return (
		<div className="app-root">
			<TitleBar panelVisible={panelVisible} onTogglePanel={togglePanel} />
			<div
				className="app-layout"
				ref={layoutRef}
				data-panel-position={panelPosition}
				style={{ "--panel-size": `${panelSize}%` } as React.CSSProperties}
			>
				{panelVisible && (
					<div className="side-panel">
						<ChatPanel />
					</div>
				)}
				{panelVisible && (
					<div className="resize-handle" onPointerDown={onResizeStart} />
				)}
				<div className="main-area">
					<AvatarCanvas />
				</div>
			</div>
		</div>
	);
}
