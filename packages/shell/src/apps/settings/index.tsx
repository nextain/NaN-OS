import { Suspense, lazy } from "react";
import { appRegistry } from "../../lib/app-registry";

const SettingsTab = lazy(() =>
	import("../../components/SettingsTab").then(({ SettingsTab }) => ({
		default: SettingsTab,
	})),
);

function SettingsCenterArea() {
	return (
		<div
			style={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			<Suspense fallback={null}>
				<SettingsTab />
			</Suspense>
		</div>
	);
}

appRegistry.register({
	id: "settings",
	name: "설정",
	names: { ko: "설정", en: "Settings" },
	icon: "⚙️",
	builtIn: true,
	keepAlive: true, // SettingsTab must stay mounted during browser-app login to keep naia_auth_complete listener alive
	deferMountUntilActive: true,
	center: SettingsCenterArea,
});
