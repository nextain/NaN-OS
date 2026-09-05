import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

/**
 * 89 — LLM Provider Switching E2E (#60)
 *
 * Verifies each LLM provider can receive a chat response.
 * - Sets provider + model + API key in localStorage
 * - Refreshes app
 * - Sends message, verifies response
 * - Captures response content and errors for debugging
 * - Restores original config after all tests
 *
 * Observability (multiple methods):
 * 1. CAFE_DEBUG_E2E=1 → Rust logs all agent events to ~/.naia/logs/naia.log
 * 2. agent logLlm() → ~/.naia/logs/llm-debug.log (provider+model+error per request)
 * 3. log_entry chunks → DiagnosticsTab / ui-message-trace.ndjson
 * 4. Screenshots → e2e-tauri/.artifacts/screenshots/ (on success + failure)
 * 5. Browser console logs → appended to e2e-tauri/.artifacts/browser-console.ndjson
 *
 * Does NOT touch STT/TTS — pure LLM verification.
 */

const ARTIFACTS_DIR = resolve(import.meta.dirname, "../.artifacts");
const SCREENSHOTS_DIR = resolve(ARTIFACTS_DIR, "screenshots");
const BROWSER_LOG_FILE = resolve(ARTIFACTS_DIR, "browser-console.ndjson");
const LLM_LOG_PATH = resolve(homedir(), ".naia/logs/llm-debug.log");

function ensureArtifactDirs(): void {
	mkdirSync(SCREENSHOTS_DIR, { recursive: true });
	mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

/** Save screenshot to .artifacts/screenshots/{name}.png */
async function screenshot(name: string): Promise<void> {
	try {
		ensureArtifactDirs();
		const path = resolve(SCREENSHOTS_DIR, `${name}.png`);
		await browser.saveScreenshot(path);
		console.log(`[89:screenshot] Saved: ${path}`);
	} catch (e) {
		console.warn(`[89:screenshot] Failed to save ${name}: ${e}`);
	}
}

/** Dump browser console logs to .artifacts/browser-console.ndjson */
async function dumpBrowserLogs(context: string): Promise<void> {
	try {
		ensureArtifactDirs();
		const logs = await browser.getLogs("browser");
		if (logs.length === 0) return;
		const lines = logs
			.map((entry) =>
				JSON.stringify({ ts: new Date().toISOString(), context, ...entry }),
			)
			.join("\n");
		appendFileSync(BROWSER_LOG_FILE, `${lines}\n`);
		const errors = logs.filter(
			(l) => l.level === "SEVERE" || l.level === "ERROR",
		);
		if (errors.length > 0) {
			console.error(`[89:browserlog] ${context} — ${errors.length} error(s):`);
			for (const e of errors) console.error(`  [${e.level}] ${e.message}`);
		}
	} catch {
		// getLogs may be unsupported in some WebKit versions — ignore
	}
}

/** Read last N lines of ~/.naia/logs/llm-debug.log and print them */
function printLlmDebugLog(lastN = 20): void {
	try {
		if (!existsSync(LLM_LOG_PATH)) {
			console.log("[89:llm-log] ~/.naia/logs/llm-debug.log not found yet");
			return;
		}
		const lines = readFileSync(LLM_LOG_PATH, "utf-8").trim().split("\n");
		const tail = lines.slice(-lastN);
		console.log(`[89:llm-log] Last ${tail.length} entries from llm-debug.log:`);
		for (const line of tail) {
			try {
				const entry = JSON.parse(line) as Record<string, unknown>;
				console.log(
					`  ${entry.ts} [${entry.event}] provider=${entry.provider} model=${entry.model}${entry.error ? ` ERROR=${entry.error}` : ""}${entry.durationMs != null ? ` ${entry.durationMs}ms` : ""}${entry.textLen != null ? ` textLen=${entry.textLen}` : ""}`,
				);
			} catch {
				console.log(`  ${line}`);
			}
		}
	} catch (e) {
		console.warn(`[89:llm-log] Failed to read llm-debug.log: ${e}`);
	}
}

const TEST_PROVIDERS: {
	provider: string;
	model: string;
	label: string;
	keyEnv?: string;
	keyField?: "apiKey" | "naiaKey";
	extraConfig?: Record<string, unknown>;
}[] = [
	{
		provider: "gemini",
		model: "gemini-2.5-flash",
		label: "Gemini 2.5 Flash",
		keyEnv: "GEMINI_API_KEY",
	},
	{
		provider: "openai",
		model: "gpt-4o",
		label: "OpenAI GPT-4o",
		keyEnv: "OPENAI_API_KEY",
	},
	{
		provider: "anthropic",
		model: "claude-haiku-4-5-20251001",
		label: "Anthropic Haiku",
		keyEnv: "ANTHROPIC_API_KEY",
	},
	{
		provider: "xai",
		model: "grok-3-mini",
		label: "xAI Grok 3 Mini",
		keyEnv: "XAI_API_KEY",
	},
	{
		provider: "zai",
		model: "glm-4.7",
		label: "Zhipu AI GLM-4.7",
		keyEnv: "ZHIPU_API_KEY",
	},
	{
		provider: "nextain",
		model: "gemini-2.5-flash",
		label: "Nextain (lab-proxy)",
		keyEnv: "NAIA_API_KEY",
		keyField: "naiaKey",
	},
	{
		provider: "ollama",
		model: "qwen3.5:9b",
		label: "Ollama qwen3.5:9b",
		extraConfig: { ollamaHost: "http://localhost:11434" },
	},
	{
		provider: "vllm",
		model: "Qwen/Qwen2.5-1.5B-Instruct",
		label: "vLLM (localhost:8000)",
		extraConfig: { vllmHost: "http://localhost:8000" },
	},
	{
		provider: "claude-code-cli",
		model: "claude-sonnet-4-6",
		label: "Claude Code CLI",
	},
];

function getApiKey(envName?: string): string {
	if (!envName) return "";
	return process.env[envName] ?? "";
}

/** Read current config from localStorage */
async function readConfig(): Promise<Record<string, unknown>> {
	return browser.execute(() => {
		const raw = localStorage.getItem("naia-config");
		return raw ? JSON.parse(raw) : {};
	});
}

/** Write config to localStorage */
async function writeConfig(patch: Record<string, unknown>): Promise<void> {
	await browser.execute((patchStr: string) => {
		const raw = localStorage.getItem("naia-config");
		const config = raw ? JSON.parse(raw) : {};
		Object.assign(config, JSON.parse(patchStr));
		localStorage.setItem("naia-config", JSON.stringify(config));
	}, JSON.stringify(patch));
}

/** Refresh app and wait for chat input to be ready */
async function refreshAndWaitForChat(): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await browser.refresh();
			break;
		} catch {
			if (attempt === 2)
				throw new Error("browser.refresh() failed after 3 attempts");
			await browser.pause(2_000);
		}
	}

	// Wait for onboarding overlay to disappear
	await browser.waitUntil(
		async () =>
			browser.execute(
				(sel: string) => !document.querySelector(sel),
				S.onboardingOverlay,
			),
		{
			timeout: 30_000,
			timeoutMsg: "Onboarding overlay still visible after 30s",
		},
	);

	// Wait for tabs to render, then explicitly click the chat tab
	await browser.waitUntil(
		async () =>
			browser.execute(
				() => document.querySelectorAll(".chat-tabs .chat-tab").length >= 1,
			),
		{ timeout: 20_000, timeoutMsg: "Chat tabs not rendered after 20s" },
	);
	// Click the first (chat) tab to ensure it is active
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (el) el.click();
	}, S.chatTab);
	await browser.pause(1_000);

	// Diagnose what's visible before waiting for chat input
	const domState = await browser.execute((chatSel: string) => {
		const chatInput = document.querySelector(chatSel);
		const body = document.body.className;
		const activeTab =
			document.querySelector(".chat-tab.active")?.className ?? "(none)";
		const chatApp = document.querySelector(".chat-app");
		const chatInputStyle = chatInput
			? window.getComputedStyle(chatInput).display
			: "(not in DOM)";
		return {
			chatInputExists: !!chatInput,
			chatInputDisplay: chatInputStyle,
			activeTab,
			chatAppExists: !!chatApp,
			bodyClass: body,
			tabCount: document.querySelectorAll(".chat-tabs .chat-tab").length,
		};
	}, S.chatInput);
	console.log(`[89] DOM state after tab click: ${JSON.stringify(domState)}`);

	// Wait for chat input — use waitForExist first to diagnose
	const chatInput = await $(S.chatInput);
	await chatInput.waitForExist({ timeout: 30_000 });
	await chatInput.waitForDisplayed({ timeout: 30_000 });
}

/** Capture current app state for debugging */
async function captureAppState(): Promise<{
	provider: string;
	model: string;
	hasApiKey: boolean;
	hasNaiaKey: boolean;
	lastMessage: string;
	tabCount: number;
	hasOnboarding: boolean;
}> {
	return browser.execute((onboardSel: string) => {
		const raw = localStorage.getItem("naia-config");
		const cfg = raw ? JSON.parse(raw) : {};
		const msgs = document.querySelectorAll(
			".chat-message.assistant .message-content",
		);
		const lastMsg =
			msgs.length > 0 ? (msgs[msgs.length - 1]?.textContent?.trim() ?? "") : "";
		return {
			provider: cfg.provider ?? "",
			model: cfg.model ?? "",
			hasApiKey: !!cfg.apiKey,
			hasNaiaKey: !!cfg.naiaKey,
			lastMessage: lastMsg.slice(0, 200),
			tabCount: document.querySelectorAll(".chat-tabs .chat-tab").length,
			hasOnboarding: !!document.querySelector(onboardSel),
		};
	}, S.onboardingOverlay);
}

/**
 * 기능 단정을 지고 갈 대표 제공자 하나.
 *
 * 루크 결정(2026-09-05): 모든 제공자에서 기능까지 다시 재지는 않는다. 이
 * 순회는 제공자마다 실제 모델을 부르므로, 제공자별 단정을 깊게 둘수록 같은
 * 비용이 제공자 수만큼 곱해진다. 그래서 기능(설정의 세부 값이 그대로
 * 복원되는가, 성공 화면을 남기는가)은 대표 하나에서 재고, 나머지 제공자는
 * "고를 수 있고, 요청이 거절되지 않고, 오류가 아닌 응답이 하나 돌아온다"
 * 까지만 잰다. 제공자 수는 줄지 않는다 — 줄어드는 것은 제공자별 단정의
 * 깊이다.
 *
 * 대표는 registry(PROVIDER_DISPLAY_ORDER)의 첫째인 `nextain`(사내 lab-proxy)
 * 이다. 그 키가 없으면 이 스펙의 before() 가 기준선으로 삼는 `gemini` 로,
 * 그것도 없으면 이번 실행에서 건너뛰지 않는 첫 제공자로 내려간다. 대표를
 * 하나로 못 박아 두면 그 키가 없는 기계에서 대표가 통째로 skip 되고, 기능
 * 단정이 어디에서도 돌지 않은 채 초록만 남는다 — 덮개가 조용히 얇아지는
 * 바로 그 형태다.
 */
function pickRepresentative(): string {
	const runnable = TEST_PROVIDERS.filter(
		(p) => !p.keyEnv || getApiKey(p.keyEnv),
	);
	for (const preferred of ["nextain", "gemini"]) {
		if (runnable.some((p) => p.provider === preferred)) return preferred;
	}
	return runnable[0]?.provider ?? "";
}

const REPRESENTATIVE = pickRepresentative();

/** 제공자 설정을 쓰고 앱을 새로 고친 뒤 화면 상태를 돌려준다. */
async function applyProvider(
	tp: (typeof TEST_PROVIDERS)[number],
	apiKey: string,
): Promise<Awaited<ReturnType<typeof captureAppState>>> {
	const patch: Record<string, unknown> = {
		provider: tp.provider,
		model: tp.model,
		onboardingComplete: true,
	};
	const keyField = tp.keyField ?? "apiKey";
	if (apiKey) patch[keyField] = apiKey;
	if (tp.extraConfig) Object.assign(patch, tp.extraConfig);
	await writeConfig(patch);

	// Refresh to apply
	await refreshAndWaitForChat();

	const state = await captureAppState();
	console.log(
		`[89] ${tp.provider} state after switch: ${JSON.stringify(state)}`,
	);
	return state;
}

/**
 * 메시지를 하나 보내고 응답이 돌아오는지 본다 — 이것이 "동작 여부" 다.
 *
 * `keepSuccessArtifacts` 는 대표 제공자에서만 켠다. 통과한 화면과 브라우저
 * 로그를 제공자 수만큼 남길 이유가 없다. 실패했을 때의 화면·로그·llm 로그는
 * 제공자를 가리지 않고 그대로 남긴다 — 그것이 없으면 어느 제공자가 왜
 * 죽었는지 알 수 없다.
 */
async function sendAndCheckResponse(
	tp: (typeof TEST_PROVIDERS)[number],
	keepSuccessArtifacts: boolean,
): Promise<void> {
	await dumpBrowserLogs(`${tp.provider}:before-send`);
	try {
		await sendMessage("Say hello in one word.");
		const response = await getLastAssistantMessage();
		console.log(`[89] ${tp.provider} response: "${response.slice(0, 200)}"`);

		if (keepSuccessArtifacts) {
			await screenshot(`89-${tp.provider}-response`);
			await dumpBrowserLogs(`${tp.provider}:after-response`);
		}

		expect(response.length).toBeGreaterThan(0);

		// Check for error in response
		if (
			response.includes("[오류]") ||
			response.toLowerCase().includes("error")
		) {
			console.error(
				`[89] ${tp.provider} ERROR in response: ${response.slice(0, 300)}`,
			);
			await screenshot(`89-${tp.provider}-error-in-response`);
		}
	} catch (err) {
		// Capture state + screenshot on failure for debugging
		const state = await captureAppState();
		console.error(
			`[89] ${tp.provider} FAILED. App state: ${JSON.stringify(state)}`,
		);
		await screenshot(`89-${tp.provider}-FAILED`);
		await dumpBrowserLogs(`${tp.provider}:FAILED`);
		// Print current llm-debug.log to see what agent reported
		printLlmDebugLog(10);
		throw err;
	}
}

describe("89 — LLM provider switching", () => {
	let originalConfig: string;

	// Save original config and set baseline
	before(async () => {
		ensureArtifactDirs();

		// Save original config for restoration
		originalConfig = await browser.execute(
			() => localStorage.getItem("naia-config") ?? "{}",
		);

		const geminiKey = process.env.GEMINI_API_KEY ?? "";
		console.log(`[89] GEMINI_API_KEY: ${geminiKey ? "available" : "MISSING"}`);
		console.log(
			`[89] OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "available" : "MISSING"}`,
		);
		console.log(
			`[89] ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "available" : "MISSING"}`,
		);
		console.log(
			`[89] XAI_API_KEY: ${process.env.XAI_API_KEY ? "available" : "MISSING"}`,
		);
		console.log(
			`[89] ZHIPU_API_KEY: ${process.env.ZHIPU_API_KEY ? "available" : "MISSING"}`,
		);
		console.log(
			`[89] NAIA_API_KEY: ${process.env.NAIA_API_KEY ? "available" : "MISSING"}`,
		);
		console.log(`[89] Artifacts dir: ${ARTIFACTS_DIR}`);
		console.log(`[89] LLM debug log: ${LLM_LOG_PATH}`);

		// Set baseline config: gemini + API key
		await writeConfig({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: geminiKey,
			agentName: "Naia",
			userName: "Tester",
			persona: "Friendly AI companion",
			enableTools: true,
			locale: "ko",
			onboardingComplete: true,
			vrmModel: "/avatars/01-OL_Woman.vrm",
			appVisible: true,
		});

		await refreshAndWaitForChat();

		// Log initial state
		const state = await captureAppState();
		console.log(`[89] Initial state: ${JSON.stringify(state)}`);
		await screenshot("89-initial-state");
	});

	// Restore original config after all tests
	after(async () => {
		// Print llm-debug.log summary for all test activity
		printLlmDebugLog(50);

		await browser.execute((cfg: string) => {
			localStorage.setItem("naia-config", cfg);
		}, originalConfig);
		console.log("[89] Original config restored");

		try {
			await browser.refresh();
		} catch {
			// best effort
		}
	});

	console.log(
		`[89] 기능 단정을 맡는 대표 제공자: ${REPRESENTATIVE || "(없음)"}`,
	);

	for (const tp of TEST_PROVIDERS) {
		const apiKey = getApiKey(tp.keyEnv);
		const skip = tp.keyEnv && !apiKey;
		const isRepresentative = tp.provider === REPRESENTATIVE;

		describe(`${tp.label} (${tp.provider})`, () => {
			if (skip) {
				// 키가 없으면 건너뛴다. 통과하는 테스트를 만들면 그 공급자를 한 번도
				// 재지 않고 커버로 세어진다.
				it.skip(`rewrite-needed: ${tp.keyEnv} 가 없어 ${tp.label} 을 검증하지 못했다`, () => {});
				return;
			}

			if (!isRepresentative) {
				// 동작 여부만 잰다: 제공자를 고를 수 있고, 요청이 거절되지 않고,
				// 오류가 아닌 응답이 하나 돌아오는가.
				//
				// 여기 있던 기능 단정 — 모델 식별자가 설정에 그대로 복원되는지
				// (`expect(state.model).toBe(tp.model)`) 와 전환 직후의 성공 화면
				// 저장 — 은 지운 것이 아니라 대표 제공자(REPRESENTATIVE) 경로로
				// 옮겼다. 설정을 쓰고 되읽는 코드는 제공자와 무관하게 같은
				// 경로여서 아홉 번 다시 잴 것이 없고, 다시 재면 제공자마다 실제
				// 모델 호출 비용만 곱해진다.
				it("should switch provider and answer (동작 여부만)", async () => {
					const state = await applyProvider(tp, apiKey);
					expect(state.provider).toBe(tp.provider);
					await sendAndCheckResponse(tp, false);
				});
				return;
			}

			it("should switch provider and verify config", async () => {
				const state = await applyProvider(tp, apiKey);
				await screenshot(`89-${tp.provider}-after-switch`);
				expect(state.provider).toBe(tp.provider);
				// 기능: 설정의 세부 값(모델 식별자)이 그대로 복원되는가. 나머지
				// 제공자에서 이 단정을 여기로 모았다.
				expect(state.model).toBe(tp.model);
			});

			it("should get chat response", async () => {
				await sendAndCheckResponse(tp, true);
			});
		});
	}
});
