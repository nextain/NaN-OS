/**
 * Return an environment suitable for an interactive Shell launch.
 *
 * Native E2E runs own isolated workspaces and app profiles. Their variables
 * must never leak into `tauri:dev` / `tauri:prod`, where they would make the
 * Agent prefer a disposable test workspace over the user's persisted ADK.
 */
export function interactiveLaunchEnv(source = process.env) {
	const env = { ...source };
	for (const key of Object.keys(env)) {
		if (
			key === "CAFE_DEBUG_E2E" ||
			key === "TAURI_WEBDRIVER_PORT" ||
			key === "WEBVIEW2_USER_DATA_FOLDER" ||
			key.startsWith("NAIA_E2E_") ||
			key.startsWith("VITE_NAIA_E2E_")
		) {
			delete env[key];
		}
	}
	return env;
}
