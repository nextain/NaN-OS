import { useEffect } from "react";
import { SidePanel } from "./components/SidePanel";
import { TitleBar } from "./components/TitleBar";
import { type ThemeId, hasApiKey, loadConfig } from "./lib/config";

function applyTheme(theme: ThemeId) {
	document.documentElement.setAttribute("data-theme", theme);
}

export function App() {
	useEffect(() => {
		const config = loadConfig();
		applyTheme(config?.theme ?? "espresso");
	}, []);

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
