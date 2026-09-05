import { Suspense, lazy, useState } from "react";
import { WorkProgressArea } from "./WorkProgressArea";

const AgentsTab = lazy(() =>
	import("./AgentsTab").then(({ AgentsTab }) => ({ default: AgentsTab })),
);
const ChannelsTab = lazy(() =>
	import("./ChannelsTab").then(({ ChannelsTab }) => ({ default: ChannelsTab })),
);
const DiagnosticsTab = lazy(() =>
	import("./DiagnosticsTab").then(({ DiagnosticsTab }) => ({
		default: DiagnosticsTab,
	})),
);
const SkillsTab = lazy(() =>
	import("./SkillsTab").then(({ SkillsTab }) => ({ default: SkillsTab })),
);

const SettingsTab = lazy(() =>
	import("./SettingsTab").then(({ SettingsTab }) => ({ default: SettingsTab })),
);

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
						// 테스트가 순서(nth-child)로 탭을 집으면 탭이 하나 늘거나
						// 줄 때마다 조용히 다른 것을 누른다. 실제로 그 탓에 스펙
						// 여럿이 없어진 여섯 번째 탭을 기다리다 죽었다.
						data-meta-tab={tab.id}
						onClick={() => setActiveTab(tab.id)}
						title={tab.label}
					>
						<span>{tab.icon}</span>
					</button>
				))}
			</div>
			<div className="naia-meta-app__body">
				{activeTab === "progress" && <WorkProgressArea />}
				<Suspense fallback={null}>
					{activeTab === "skills" && <SkillsTab onAskAI={askAI} />}
					{activeTab === "channels" && <ChannelsTab />}
					{activeTab === "agents" && <AgentsTab />}
					{activeTab === "diagnostics" && <DiagnosticsTab />}
				</Suspense>
				{activeTab === "settings" && (
					<Suspense fallback={null}>
						<SettingsTab />
					</Suspense>
				)}
			</div>
		</div>
	);
}
