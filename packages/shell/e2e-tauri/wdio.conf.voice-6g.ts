import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	E2E_SETTINGS,
	E2E_TARGET_DIR,
	E2E_WEBDRIVER_PORT,
	E2E_WEBVIEW2_DATA,
	assertCodexE2eIsolation,
	cleanupCodexE2eRoot,
	configureCodexE2eEnvironment,
	resetCodexE2eRoot,
	startOwnedEmbeddedApp,
	startOwnedViteServer,
	stopOwnedEmbeddedApp,
	stopOwnedViteServer,
} from "./codex-e2e-environment.js";

const EXE = process.platform === "win32" ? ".exe" : "";
const TAURI_BINARY =
	process.env.TAURI_BINARY ??
	resolve(E2E_TARGET_DIR, "debug", `naia-shell${EXE}`);
if (process.env.NAIA_E2E_VOICE_6G !== "1") {
	throw new Error("Set NAIA_E2E_VOICE_6G=1 to run the 6GB voice acceptance");
}
configureCodexE2eEnvironment();

export const config = {
	runner: "local" as const,
	specs: ["./specs/94-voice-6g-shell.spec.ts"],
	maxInstances: 1,
	hostname: "127.0.0.1",
	port: E2E_WEBDRIVER_PORT,
	capabilities: [
		{
			maxInstances: 1,
			browserName: "tauri",
			"wdio:enforceWebDriverClassic": true,
			pageLoadStrategy: "eager",
			"tauri:options": { application: TAURI_BINARY },
		},
	],
	logLevel: "error",
	waitforTimeout: 30_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 2,
	framework: "mocha",
	mochaOpts: { ui: "bdd", timeout: 420_000 },
	reporters: ["spec"],
	async onPrepare() {
		if (!existsSync(TAURI_BINARY))
			throw new Error(`Missing embedded E2E binary: ${TAURI_BINARY}`);
		resetCodexE2eRoot();
		assertCodexE2eIsolation();
		await startOwnedViteServer();
		await startOwnedEmbeddedApp(TAURI_BINARY);
	},
	async before() {
		await browser.waitUntil(
			async () => {
				try {
					return await browser.execute(() =>
						document.location.href.startsWith("http"),
					);
				} catch {
					return false;
				}
			},
			{ timeout: 45_000, timeoutMsg: "Tauri webview did not reach E2E Vite" },
		);
		if (!existsSync(E2E_WEBVIEW2_DATA))
			throw new Error("isolated WebView2 profile was not created");
		// A manifest boolean alone is not membership evidence. Before seeding the
		// isolated credential store, the native command must reject this otherwise
		// valid 6GB manifest.
		const forgedManifestResult = await browser.execute(async () => {
			const shell = window as unknown as {
				__TAURI_INTERNALS__?: {
					invoke: (command: string, value?: unknown) => Promise<unknown>;
				};
			};
			try {
				await shell.__TAURI_INTERNALS__?.invoke("start_cascade");
				return "unexpected-success";
			} catch (error) {
				return String(error);
			}
		});
		if (!forgedManifestResult.includes("cascade_naia_member_required")) {
			throw new Error(
				`Manifest-only member gate was not rejected: ${forgedManifestResult}`,
			);
		}
		// Let the first keyless App hydration finish before seeding. Otherwise its
		// already-open empty Store resource can win a race and overwrite the E2E
		// credential between the seed command and start_cascade.
		await browser.waitUntil(
			() => browser.execute(() => document.querySelector(".app-root") !== null),
			{ timeout: 30_000, timeoutMsg: "Shell app root did not render before secure seed" },
		);
		await browser.pause(1_500);
		// Seed the isolated Tauri Store only after proving that a manifest cannot
		// forge membership. Production restores the same naiaKey from its secure
		// store; localStorage alone is intentionally insufficient for native start.
		await browser.execute(async (naiaKey: string) => {
			const shell = window as unknown as {
				__TAURI_INTERNALS__?: {
					invoke: (command: string, value: unknown) => Promise<unknown>;
				};
			};
			const invoke = shell.__TAURI_INTERNALS__?.invoke;
			if (!invoke) throw new Error("Tauri invoke unavailable");
			await invoke("e2e_seed_secure_naia_key", { naiaKey });
		}, "gw-e2e-registered-naia-member");
		// Exercise the native member/profile boundary immediately after secure
		// hydration. The refreshed production App repeats this idempotently; doing
		// it here also keeps the acceptance independent from React reload timing.
		await browser.execute(async (settingsRoot: string) => {
			const shell = window as unknown as {
				__TAURI_INTERNALS__?: {
					invoke: (command: string, value: unknown) => Promise<unknown>;
				};
			};
			const invoke = shell.__TAURI_INTERNALS__?.invoke;
			if (!invoke) throw new Error("Tauri invoke unavailable");
			await invoke("write_slots_manifest", {
				adkPath: settingsRoot.replace(/[\\/]naia-settings$/, ""),
				json: JSON.stringify({
					version: 1,
					gate: { naiaAccount: true, mode: "naia" },
					slots: {
						main: { provider: "codex", model: "gpt-5.4" },
						sub: { provider: "none" },
						embedding: { provider: "none" },
						stt: {},
						tts: { provider: "naia-local-voice" },
						avatar: { provider: "vrm" },
					},
					gpu: {
						detectedVramGb: 8,
						tier: "windows-voice-6g",
						loaderProfile: "windows_trt_6g",
					},
				}),
			});
			await invoke("start_cascade", {
				expectedLoaderProfile: "windows_trt_6g",
			});
		}, E2E_SETTINGS);
		// AvatarStore reads the local cache synchronously before file hydration.
		// Seed the same isolated file-backed identity into the fresh WebView and
		// reload once so this acceptance exercises a real VRM, not an empty model.
		await browser.execute((settingsRoot: string) => {
			localStorage.setItem(
				"naia-adk-path",
				settingsRoot.replace(/[\\/]naia-settings$/, ""),
			);
			localStorage.setItem(
				"naia-config",
				JSON.stringify({
					provider: "codex",
					model: "gpt-5.4",
					naiaKey: "gw-e2e-registered-naia-member",
					onboardingComplete: true,
					workspaceRoot: settingsRoot.replace(/[\\/]naia-settings$/, ""),
					localGpuTier: "windows-voice-6g",
					ttsProvider: "naia-local-voice",
					ttsEnabled: true,
					vllmTtsHost: "http://127.0.0.1:8910",
					avatarProvider: "vrm",
					vrmModel: `${settingsRoot}\\vrm-files\\03-OL_Woman.vrm`,
				}),
			);
		}, E2E_SETTINGS);
		await browser.refresh();
	},
	async onComplete() {
		try {
			await stopOwnedEmbeddedApp();
			stopOwnedViteServer();
		} finally {
			cleanupCodexE2eRoot();
		}
	},
};
