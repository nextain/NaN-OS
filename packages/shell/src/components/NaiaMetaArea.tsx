import { useState } from "react";
import { AgentsTab } from "./AgentsTab";
import { ChannelsTab } from "./ChannelsTab";
import { DiagnosticsTab } from "./DiagnosticsTab";
import { SettingsTab } from "./SettingsTab";
import { SkillsTab } from "./SkillsTab";
import { WorkProgressArea } from "./WorkProgressArea";

type MetaTabId =
	| "progress"
	| "skills"
	| "channels"
	| "agents"
	| "diagnostics"
	| "settings";

const TABS: { id: MetaTabId; icon: string; label: string }[] = [
	{ id: "progress", icon: "📊", label: "Progress" },
	{ id: "skills", icon: "🧩", label: "Skills" },
	{ id: "channels", icon: "🌐", label: "Channels" },
	{ id: "agents", icon: "🤖", label: "Agents" },
	{ id: "diagnostics", icon: "🔬", label: "Diagnostics" },
	{ id: "settings", icon: "⚙️", label: "Settings" },
];

/** Dispatch message to ChatArea's input via custom event */
function askAI(message: string) {
	window.dispatchEvent(new CustomEvent("naia:ask-ai", { detail: message }));
}

export function NaiaMetaArea() {
	const [activeTab, setActiveTab] = useState<MetaTabId>("progress");

	return (
		<div className="naia-meta-app">
			<div className="naia-meta-app__tabs">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={`naia-meta-app__tab${activeTab === tab.id ? " naia-meta-app__tab--active" : ""}`}
						onClick={() => setActiveTab(tab.id)}
						title={tab.label}
					>
						<span>{tab.icon}</span>
					</button>
				))}
			</div>
			<div className="naia-meta-app__body">
				{activeTab === "progress" && <WorkProgressArea />}
				{activeTab === "skills" && <SkillsTab onAskAI={askAI} />}
		{activeTab === "channels" && <ChannelsTab />}
					{activeTab === "agents" && <AgentsTab />}
				{activeTab === "diagnostics" && <DiagnosticsTab />}
				{activeTab === "settings" && <SettingsTab />}
			</div>
		</div>
	);
}
