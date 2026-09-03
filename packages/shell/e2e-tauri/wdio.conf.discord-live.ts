import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	E2E_TARGET_DIR,
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
const TAURI_BINARY = process.env.TAURI_BINARY
	? process.env.TAURI_BINARY
	: resolve(E2E_TARGET_DIR, "debug", `naia-shell${EXE}`);
const TOKEN_FILE = process.env.NAIA_E2E_DISCORD_TOKEN_FILE;

if (!TOKEN_FILE || !existsSync(TOKEN_FILE)) {
	throw new Error(
		"Set NAIA_E2E_DISCORD_TOKEN_FILE to an existing private dotenv file before running the live Discord acceptance test.",
	);
}

configureCodexE2eEnvironment();

export const config = {
	runner: "local" as const,
	specs: ["./specs/94-discord-live-auth.spec.ts"],
	maxInstances: 1,
	hostname: "127.0.0.1",
	port: Number(process.env.NAIA_E2E_WEBDRIVER_PORT ?? "4465"),
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
	mochaOpts: { ui: "bdd", timeout: 300_000 },
	reporters: ["spec"],
	async onPrepare() {
		if (!existsSync(TAURI_BINARY)) {
			throw new Error(
				`Missing embedded E2E binary: ${TAURI_BINARY}. Run pnpm run build:e2e:tauri first.`,
			);
		}
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
			{
				timeout: 45_000,
				timeoutMsg: "embedded Tauri webview never reached dedicated E2E Vite",
			},
		);
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
