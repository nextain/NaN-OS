import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { StrictMode } from "react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const eventListeners = vi.hoisted(
	() =>
		new Map<string, (event: { payload: unknown }) => void | Promise<void>>(),
);

const secureStoreMock = vi.hoisted(() => ({
	get: vi.fn().mockResolvedValue(null),
	set: vi.fn().mockResolvedValue(undefined),
	delete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-store", () => {
	return { load: vi.fn().mockResolvedValue(secureStoreMock) };
});

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
	convertFileSrc: vi.fn((path: string) => `file://${path}`),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(
		(event: string, callback: (event: { payload: unknown }) => void) => {
			eventListeners.set(event, callback);
			return Promise.resolve(() => eventListeners.delete(event));
		},
	),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/chat-service", () => ({
	directToolCall: vi.fn().mockResolvedValue({ success: false }),
	sendAuthUpdate: vi.fn().mockResolvedValue(undefined),
	sendNotifyConfig: vi.fn().mockResolvedValue(undefined),
	sendCredsUpdate: vi.fn().mockResolvedValue(undefined),
}));

// (gateway-sync mock 제거됨 2026-06-12 — 모듈 삭제)

import { SettingsTab } from "../SettingsTab";

// SettingsTab order:
// profile | brain | voice | avatar | persona | memory | knowledge | skills | connections | general
// engine→profile, ai→brain, models→memory(병합), info→general(흡수).
// voice/avatar/persona/knowledge = 신규(Phase1 placeholder). Tests navigate via this helper.
const SETTINGS_TAB_INDEX = {
	profile: 0,
	brain: 1,
	voice: 2,
	avatar: 3,
	persona: 4,
	memory: 5,
	knowledge: 6,
	skills: 7,
	connections: 8,
	general: 9,
} as const;
function gotoSettingsTab(name: keyof typeof SETTINGS_TAB_INDEX) {
	const btn = document.querySelector(
		`[data-settings-tab="${name}"]`,
	) as HTMLButtonElement | null;
	expect(btn).toBeTruthy();
	fireEvent.click(btn!);
}

describe("SettingsTab", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		eventListeners.clear();
		vi.clearAllMocks();
		secureStoreMock.get.mockResolvedValue(null);
		vi.unstubAllGlobals();
		Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
	});

	it("loads the Naia credit balance after the StrictMode effect replay", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-2.5-flash",
				apiKey: "",
				naiaKey: "strict-mode-key",
			}),
		);
		mockInvoke.mockImplementation((command: string) => {
			if (command === "fetch_naia_balance") {
				return Promise.resolve({ balance: 5_204_139_000 });
			}
			return Promise.resolve([]);
		});
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});

		render(
			<StrictMode>
				<SettingsTab />
			</StrictMode>,
		);

		expect(await screen.findByText(/52041\.39/)).toBeDefined();
		expect(mockInvoke).toHaveBeenCalledWith("fetch_naia_balance", {
			gatewayUrl: expect.any(String),
			naiaKey: "strict-mode-key",
		});
	});

	it("keeps unfinished Connections disabled between Skills and General", async () => {
		mockInvoke.mockImplementation((command: string) => {
			if (command === "discord_bot_token_available")
				return Promise.resolve(false);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		const tabs = [...document.querySelectorAll("[data-settings-tab]")].map(
			(element) => element.getAttribute("data-settings-tab"),
		);
		expect(tabs).toEqual([
			"profile",
			"brain",
			"voice",
			"avatar",
			"persona",
			"memory",
			"knowledge",
			"skills",
			"connections",
			"general",
		]);
		const connections = document.querySelector(
			'[data-settings-tab="connections"]',
		) as HTMLButtonElement;
		expect(connections.disabled).toBe(true);
		expect(screen.queryByTestId("discord-connections")).toBeNull();
		expect(document.querySelector('input[type="password"]')).toBeNull();
	});

	// config(models) 정상화: 구 skill_config directToolCall → 게이트웨이 `GET /v1/pricing` 셸-직결(E1).
	const stubPricingFetch = (entries: unknown[]) =>
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).includes("/v1/pricing")
					? { ok: true, json: async () => entries }
					: { ok: false, json: async () => [] },
			),
		);

	it("renders gateway catalog models with pricing (/v1/pricing 셸-직결)", async () => {
		mockInvoke.mockResolvedValue([]);
		stubPricingFetch([
			{
				model_key: "gemini:test-model-1",
				input_price_per_million: 1.5,
				output_price_per_million: 2.5,
				cached_price_per_million: null,
			},
		]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");

		await vi.waitFor(() => {
			expect(screen.getByText("test-model-1 ($1.5 / $2.5)")).toBeDefined();
		});
	});

	it("parses gateway model_key provider prefix (<provider>:<id>)", async () => {
		mockInvoke.mockResolvedValue([]);
		stubPricingFetch([
			{
				model_key: "gemini:gemini-ultra-test",
				input_price_per_million: 0,
				output_price_per_million: 0,
				cached_price_per_million: null,
			},
		]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");

		await vi.waitFor(() => {
			expect(screen.getByText(/gemini-ultra-test/)).toBeDefined();
		});
	});

	it("renders provider select and API key input", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");
		const providerSelect = document.getElementById("provider-select");
		expect(providerSelect).toBeDefined();
		expect(screen.getByLabelText(/^API/i)).toBeDefined();
	});

	it("hides API key input for Naia (nextain) provider", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");
		const providerSelect = document.getElementById(
			"provider-select",
		) as HTMLSelectElement;
		fireEvent.change(providerSelect, { target: { value: "nextain" } });
		// #313 rewrite: nextain reuses the logged-in Naia key, so the AI tab just
		// omits the API key input (the account login UI lives on the info tab).
		expect(screen.queryByLabelText(/^API/i)).toBeNull();
		expect(providerSelect.value).toBe("nextain");
	});

	it("defaults to weighted price ordering, reorders visibly, and hides unavailable models", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "grok-4.3",
				apiKey: "",
			}),
		);
		mockInvoke.mockResolvedValue([]);
		stubPricingFetch([
			{
				model_key: "azure:grok-4.3",
				input_price_per_million: 0.4,
				output_price_per_million: 1.2,
				cached_price_per_million: 0.08,
				cache_write_price_per_million: 0.5,
			},
			{
				model_key: "vertexai:gemini-3.1-flash-lite",
				input_price_per_million: 0.1,
				output_price_per_million: 5,
				cached_price_per_million: 0.01,
			},
		]);

		const { unmount } = render(<SettingsTab />);
		gotoSettingsTab("brain");

		await screen.findByText(
			/Price per 1M tokens: Input \$0\.400 · Output \$1\.200 · Cache read \$0\.080 · Cache write \$0\.500/,
		);
		let modelSelect = document.getElementById(
			"model-select",
		) as HTMLSelectElement;
		const labels = [...modelSelect.options].map((option) => option.text);
		expect(labels).toContain("Grok 4.3 (Pricing: $0.400 / $1.200)");
		expect(labels.some((label) => label.includes("(Naia)"))).toBe(false);
		expect(labels.some((label) => label.includes("Analysis only"))).toBe(false);
		expect(
			[...modelSelect.options].map((option) => option.value),
		).not.toContain("naia-local");
		expect(
			[...modelSelect.options].map((option) => option.value),
		).not.toContain("claude-opus-5");
		expect(
			[...modelSelect.options].map((option) => option.value),
		).not.toContain("naia-0.9-omni-24g");

		const sortSelect = screen.getByTestId(
			"model-sort-mode",
		) as HTMLSelectElement;
		expect(sortSelect.value).toBe("price");
		expect([...sortSelect.options].map((option) => option.value)).toEqual([
			"price",
			"performance",
		]);
		expect(screen.getByTestId("model-price-sort-basis").textContent).toContain(
			"3 uncached input tokens",
		);
		const pricedOptions = [...modelSelect.options].map(
			(option) => option.value,
		);
		expect(pricedOptions[0]).toBe("grok-4.3");
		expect(modelSelect.value).toBe("grok-4.3");

		fireEvent.change(sortSelect, { target: { value: "performance" } });
		modelSelect = document.getElementById("model-select") as HTMLSelectElement;
		const performanceOptions = [...modelSelect.options].map(
			(option) => option.value,
		);
		expect(performanceOptions[0]).toBe("gpt-5.6-sol");
		expect(performanceOptions).not.toEqual(pricedOptions);
		expect(modelSelect.value).toBe("grok-4.3");
		expect(
			JSON.parse(localStorage.getItem("naia-config") ?? "{}").modelSortMode,
		).toBe("performance");

		unmount();
		render(<SettingsTab />);
		gotoSettingsTab("brain");
		expect(
			(screen.getByTestId("model-sort-mode") as HTMLSelectElement).value,
		).toBe("performance");
	});

	it("replaces a stale unavailable Naia selection with the first usable priced model", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "claude-opus-5",
				naiaKey: "gw-member",
				apiKey: "",
			}),
		);
		mockInvoke.mockResolvedValue([]);
		stubPricingFetch([
			{
				model_key: "azure:grok-4.3",
				input_price_per_million: 0.4,
				output_price_per_million: 1.2,
				cached_price_per_million: null,
			},
		]);

		render(<SettingsTab />);
		gotoSettingsTab("brain");

		await vi.waitFor(() => {
			const modelSelect = document.getElementById(
				"model-select",
			) as HTMLSelectElement;
			expect(modelSelect.value).toBe("grok-4.3");
			expect(
				[...modelSelect.options].map((option) => option.value),
			).not.toContain("claude-opus-5");
			expect(
				JSON.parse(localStorage.getItem("naia-config") || "{}").model,
			).toBe("grok-4.3");
		});
	});

	it("allows Codex for sub while keeping memory orthogonal", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ provider: "codex", model: "gpt-5.4", apiKey: "" }),
		);
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");

		const subMode = screen.getByTestId("sub-llm-mode") as HTMLSelectElement;
		const memoryMode = screen.getByTestId(
			"memory-llm-mode",
		) as HTMLSelectElement;
		expect(subMode.value).toBe("inherit:main");
		expect(memoryMode.value).toBe("inherit:sub");

		fireEvent.change(subMode, { target: { value: "explicit" } });
		const subProvider = screen.getByTestId(
			"sub-llm-provider",
		) as HTMLSelectElement;
		expect([...subProvider.options].map((option) => option.value)).toContain(
			"codex",
		);
		fireEvent.change(subProvider, { target: { value: "gemini" } });
		const subModel = screen.getByTestId("sub-llm-model") as HTMLInputElement;
		fireEvent.change(subModel, { target: { value: "gemini-3.1-flash-lite" } });
		fireEvent.blur(subModel);
		fireEvent.change(memoryMode, { target: { value: "inherit:main" } });

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.llmRoles).toMatchObject({
			sub: { provider: "gemini", model: "gemini-3.1-flash-lite" },
			memory: { inherit: "main" },
		});
		expect(saved.subLlmProvider).toBe("gemini");
		expect(saved.subLlmModel).toBe("gemini-3.1-flash-lite");
		expect(saved.memoryLlmProvider).toBeUndefined();
	});

	it("hydrates the expert role from the workspace file fallback", async () => {
		localStorage.setItem("naia-adk-path", "D:\\alpha-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "gemini",
				model: "gemini-3.5-flash",
				apiKey: "",
			}),
		);
		mockInvoke.mockImplementation((command: string) => {
			if (command === "read_naia_config") {
				return Promise.resolve(
					JSON.stringify({
						provider: "gemini",
						model: "gemini-3.5-flash",
						llmRoles: {
							expert: { provider: "openai", model: "gpt-5.4" },
						},
					}),
				);
			}
			return Promise.resolve([]);
		});

		render(<SettingsTab />);
		gotoSettingsTab("brain");

		await vi.waitFor(() => {
			expect(
				(screen.getByTestId("expert-llm-mode") as HTMLSelectElement).value,
			).toBe("explicit");
			expect(
				(screen.getByTestId("expert-llm-provider") as HTMLSelectElement).value,
			).toBe("openai");
			expect(
				(screen.getByTestId("expert-llm-model") as HTMLInputElement).value,
			).toBe("gpt-5.4");
		});
	});

	it("persists Naia auth callback even when no config exists yet", async () => {
		mockInvoke.mockResolvedValue([]);
		const authReady = vi.fn();
		window.addEventListener("naia_auth_ready", authReady);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ credits: 10 }),
			}),
		);

		render(<SettingsTab />);

		await vi.waitFor(() => {
			expect(eventListeners.get("naia_auth_complete")).toBeDefined();
		});

		await act(async () => {
			await eventListeners.get("naia_auth_complete")?.({
				payload: { naiaKey: "gw-test-key", naiaUserId: "user-123" },
			});
		});

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.provider).toBe("nextain");
		expect(saved.model).toBeTruthy();
		expect(saved.apiKey).toBe("");
		expect(saved.naiaKey).toBe("gw-test-key");
		expect(saved.naiaUserId).toBe("user-123");
		expect(authReady).toHaveBeenCalledTimes(1);
		window.removeEventListener("naia_auth_ready", authReady);
	});

	it("shows STT provider selector with vosk option", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("voice");

		// STT provider selector is in the voice tab
		const sttSelect = document
			.querySelector('select option[value="vosk"]')
			?.closest("select") as HTMLSelectElement;
		expect(sttSelect).toBeDefined();
		// Default is empty (no provider set) — vosk is an available option
		expect(sttSelect.querySelector('option[value="vosk"]')).toBeDefined();
	});

	it("hides API key input for Claude Code CLI provider", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");
		const providerSelect = document.getElementById(
			"provider-select",
		) as HTMLSelectElement;
		fireEvent.change(providerSelect, { target: { value: "claude-code-cli" } });
		// #313 rewrite: claude-code-cli uses the local CLI login session, so the
		// AI tab omits the API key input (no separate hint text).
		expect(screen.queryByLabelText(/^API/i)).toBeNull();
		expect(providerSelect.value).toBe("claude-code-cli");
	});

	it("shows Codex in the main provider selector without an API key field", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");
		const providerSelect = document.getElementById(
			"provider-select",
		) as HTMLSelectElement;
		expect(providerSelect.querySelector('option[value="codex"]')).toBeTruthy();

		fireEvent.change(providerSelect, { target: { value: "codex" } });

		expect(providerSelect.value).toBe("codex");
		expect(screen.queryByLabelText(/^API/i)).toBeNull();
		expect(
			(document.getElementById("model-select") as HTMLSelectElement).value,
		).toBe("gpt-5.4");
	});

	it("checks Codex readiness without rendering CLI output or changing credentials", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				onboardingComplete: true,
				provider: "codex",
				model: "gpt-5.4",
				apiKey: "",
			}),
		);
		mockInvoke.mockImplementation((command: string) => {
			if (command === "codex_preflight") {
				return Promise.resolve({
					status: "ready",
					output: "Logged in as private@example.com",
				});
			}
			return Promise.resolve([]);
		});

		render(<SettingsTab />);
		gotoSettingsTab("brain");
		const check = await screen.findByTestId("codex-readiness-check");
		expect(check.parentElement).toHaveClass("codex-readiness-actions");
		fireEvent.click(check);

		await vi.waitFor(() => {
			expect(
				screen.getByTestId("codex-readiness-status").textContent,
			).toContain("Ready");
		});
		expect(mockInvoke).toHaveBeenCalledWith("codex_preflight");
		expect(screen.queryByText("private@example.com")).toBeNull();
		expect(JSON.parse(localStorage.getItem("naia-config") || "{}").apiKey).toBe(
			"",
		);
	});

	it("saves main, sub, and memory brains as role settings", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				onboardingComplete: true,
				provider: "codex",
				model: "gpt-5.4",
				apiKey: "",
			}),
		);
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");

		const subMode = screen.getByTestId("sub-llm-mode");
		fireEvent.change(subMode, { target: { value: "explicit" } });
		const subProvider = screen.getByTestId(
			"sub-llm-provider",
		) as HTMLSelectElement;
		fireEvent.change(subProvider, { target: { value: "nextain" } });
		fireEvent.change(screen.getByTestId("memory-llm-mode"), {
			target: { value: "explicit" },
		});
		fireEvent.change(screen.getByTestId("memory-llm-provider"), {
			target: { value: "nextain" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.llmRoles).toEqual(
			expect.objectContaining({
				main: expect.objectContaining({ provider: "codex", model: "gpt-5.4" }),
				sub: expect.objectContaining({
					provider: "nextain",
					model: "deepseek-v4-flash",
				}),
				memory: expect.objectContaining({
					provider: "nextain",
					model: "deepseek-v4-flash",
				}),
			}),
		);
	});

	it.each(["grok-4.3", "deepseek-v4-pro", "gpt-5.6-sol", "gpt-5.6-luna"])(
		"keeps the live Naia Azure model %s selectable and persisted",
		async (modelId) => {
			localStorage.setItem(
				"naia-config",
				JSON.stringify({
					onboardingComplete: true,
					provider: "nextain",
					model: modelId,
					apiKey: "",
				}),
			);
			mockInvoke.mockResolvedValue([]);
			render(<SettingsTab />);
			gotoSettingsTab("brain");
			const select = screen.getByRole("combobox", {
				name: /model/i,
			}) as HTMLSelectElement;
			expect([...select.options].map((option) => option.value)).toContain(
				modelId,
			);
			expect(select.value).toBe(modelId);
			fireEvent.click(screen.getByRole("button", { name: "Apply" }));
			expect(
				JSON.parse(localStorage.getItem("naia-config") || "{}"),
			).toMatchObject({ provider: "nextain", model: modelId });
		},
	);

	it("allows an explicit Codex sub brain but excludes Codex from memory", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				onboardingComplete: true,
				provider: "codex",
				model: "gpt-5.4",
				apiKey: "",
			}),
		);
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("brain");

		fireEvent.change(screen.getByTestId("sub-llm-mode"), {
			target: { value: "explicit" },
		});
		fireEvent.change(screen.getByTestId("memory-llm-mode"), {
			target: { value: "explicit" },
		});
		expect(
			[
				...(screen.getByTestId("sub-llm-provider") as HTMLSelectElement)
					.options,
			].map((option) => option.value),
		).toContain("codex");
		expect(
			[
				...(screen.getByTestId("memory-llm-provider") as HTMLSelectElement)
					.options,
			].map((option) => option.value),
		).not.toContain("codex");
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		const roles = JSON.parse(
			localStorage.getItem("naia-config") || "{}",
		).llmRoles;
		expect(roles.sub).toMatchObject({ provider: "codex", model: "gpt-5.4" });
		expect(roles.memory.provider).not.toBe("codex");
	});

	it("shows a safe Codex login-required state and clears it on provider switch", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				onboardingComplete: true,
				provider: "codex",
				model: "gpt-5.4",
			}),
		);
		mockInvoke.mockImplementation((command: string) =>
			Promise.resolve(
				command === "codex_preflight" ? { status: "login-required" } : [],
			),
		);

		render(<SettingsTab />);
		gotoSettingsTab("brain");
		fireEvent.click(await screen.findByTestId("codex-readiness-check"));
		await vi.waitFor(() => {
			expect(
				screen.getByTestId("codex-readiness-status").textContent,
			).toContain("Login required");
		});

		fireEvent.change(document.getElementById("provider-select")!, {
			target: { value: "gemini" },
		});
		expect(screen.queryByTestId("codex-readiness")).toBeNull();
	});

	it("renders VRM model picker — shows empty state when no VRMs in naia-settings", () => {
		// No adkPath set → listNaiaAssets returns [] without calling invoke
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// Empty state message is shown in the vrm-list
		gotoSettingsTab("avatar");
		expect(screen.getByText(/vrm-files|VRM 파일을 추가/i)).toBeDefined();
	});

	it("renders VRM items from naia-settings when invoke returns filenames", async () => {
		// Set adkPath so listNaiaAssets actually calls invoke
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "list_naia_assets")
				return Promise.resolve(["01-OL_Woman.vrm", "02-Hood_Boy.vrm"]);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("avatar");

		await vi.waitFor(() => {
			// VRM items rendered with alt text matching filenames (minus .vrm)
			expect(screen.getByAltText("01-OL_Woman")).toBeDefined();
			expect(screen.getByAltText("02-Hood_Boy")).toBeDefined();
		});
	});

	it("renders background image picker with 없음(기본) option", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// Background is now a dropdown in general tab (under theme, #10)
		gotoSettingsTab("general");
		expect(screen.getByText(/없음 \(기본\)|None \(Default\)/i)).toBeDefined();
	});

	it("renders VRM import file button", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("avatar");
		expect(screen.getByText(/파일 추가|Add file/i)).toBeDefined();
	});

	it("preserves the configured NVA Host without forcing a local TRT profile", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "ollama",
				model: "qwen3:8b",
				ollamaHost: "http://gpu-box.local:11434",
				naiaKey: "nk",
				localGpuTier: "auto",
				cascadeRuntimeUrl: "https://cascade.example.invalid:9449",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("avatar");

		const option = document.querySelector(
			'option[value="naia-video-avatar"]',
		) as HTMLOptionElement;
		await vi.waitFor(() => expect(option.disabled).toBe(false));
		fireEvent.change(option.parentElement as HTMLSelectElement, {
			target: { value: "naia-video-avatar" },
		});

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.avatarProvider).toBe("naia-video-avatar");
		expect(saved.nvaModel).toBeTruthy();
		expect(saved.cascadeRuntimeUrl).toBeUndefined();
		expect(saved.local8gFocus).toBeUndefined();
	});

	it("selects VRM item from naia-settings and marks as active", async () => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "list_naia_assets")
				return Promise.resolve(["01-OL_Woman.vrm"]);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("avatar");

		const vrmBtn = await screen.findByAltText("01-OL_Woman");
		// Click the parent button
		fireEvent.click(vrmBtn.closest("button")!);
		expect(vrmBtn.closest("button")!.className).toContain("active");
	});

	it("renders memory section with empty state", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// Switch to the memory tab first (tab bar separates memory from settings)
		gotoSettingsTab("memory");
		// Multiple elements match /Memory/i (Memory Adapter, Memory LLM, etc.) — use getAllByText
		expect(screen.getAllByText(/기억|Memory/i).length).toBeGreaterThan(0);
		expect(screen.getByText(/저장된 기억이|No stored memories/i)).toBeDefined();
	});

	it("renders facts when available", async () => {
		mockInvoke.mockResolvedValue([
			{
				id: "f1",
				content: "favorite_lang is Rust",
				entities: ["Rust"],
				topics: ["programming"],
				createdAt: 1000,
				updatedAt: 1000,
				importance: 0.5,
				recallCount: 0,
				lastAccessed: 1000,
				strength: 1.0,
				sourceEpisodes: [],
			},
		]);
		render(<SettingsTab />);
		// Switch to the memory tab first
		gotoSettingsTab("memory");

		await vi.waitFor(() => {
			expect(screen.getByText("favorite_lang is Rust")).toBeDefined();
			expect(screen.getByText("Rust")).toBeDefined();
		});
	});

	it("saves config with VRM model from naia-settings", async () => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ provider: "gemini", model: "gemini-3.5-flash" }),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "list_naia_assets")
				return Promise.resolve(["01-OL_Woman.vrm"]);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);

		// VRM picker lives on the avatar tab — select VRM (auto-applies via handleVrmSelect)
		gotoSettingsTab("avatar");
		const vrmImg = await screen.findByAltText("01-OL_Woman");
		fireEvent.click(vrmImg.closest("button")!);

		// VRM auto-applied — verify immediately without Save
		const savedVrm = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(savedVrm.vrmModel).toContain("01-OL_Woman.vrm");
	});

	it("renders theme picker", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("general");
		expect(screen.getByTitle("Light")).toBeDefined();
		expect(screen.getByTitle("Dark")).toBeDefined();
	});

	it("shows error for empty API key", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// Provider/API key + the save error banner live on the AI tab.
		gotoSettingsTab("brain");
		const saveBtn = document.querySelector(".settings-save-btn") as HTMLElement;
		fireEvent.click(saveBtn);
		expect(screen.getByText(/입력해주세요|enter.*api/i)).toBeDefined();
	});

	it("shows the native reload failure instead of a saved badge", async () => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ provider: "codex", model: "gpt-5.4" }),
		);
		mockInvoke.mockImplementation((command: string) => {
			if (command === "reload_agent_settings") {
				return Promise.reject(new Error("memory reload rejected"));
			}
			if (command === "read_naia_ui_config") return Promise.resolve("{}");
			return Promise.resolve([]);
		});

		render(<SettingsTab />);
		gotoSettingsTab("brain");
		fireEvent.click(document.querySelector(".settings-save-btn")!);

		expect(await screen.findByText(/memory reload rejected/)).toBeDefined();
		expect(
			document.querySelector(".settings-save-btn")?.textContent,
		).not.toMatch(/Saved/i);
	});

	it("shows a reset failure on the general tab", async () => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		mockInvoke.mockImplementation((command: string) => {
			if (command === "reset_naia_config_files") {
				return Promise.reject(new Error("settings files are locked"));
			}
			return Promise.resolve([]);
		});

		render(<SettingsTab />);
		gotoSettingsTab("general");
		fireEvent.click(
			document.querySelector(".settings-danger-zone .settings-reset-btn")!,
		);
		fireEvent.click(
			document.querySelector(".reset-confirm-panel .settings-reset-btn")!,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"settings files are locked",
		);
	});
});

// ── #298: SettingsTab Memory tab ─────────────────────────────────────────────

describe("SettingsTab — memory tab (#298)", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("renders settings tab bar with six tab buttons", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		const tabBar = document.querySelector(".settings-tab-bar");
		expect(tabBar).toBeTruthy();
		// 10 tabs: profile|brain|voice|avatar|persona|memory|knowledge|skills|connections|general
		const tabBtns = document.querySelectorAll(".settings-tab-btn");
		expect(tabBtns.length).toBe(10);
	});

	it("owns radio DJ parameters under skill_youtube_bgm, not General", async () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("skills");
		const radioDjCard = await screen.findByTestId("youtube-bgm-skill-settings");
		expect(radioDjCard).toBeDefined();
		expect(screen.getByText("Youtube Radio DJ")).toBeDefined();
		expect(screen.queryByText("skill_youtube_bgm")).toBeNull();
		expect(screen.queryByTestId("proactive-speech-profile")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /Youtube Radio DJ/ }));
		expect(screen.getByText("skill_youtube_bgm")).toBeDefined();
		const skillProfile = screen.getByTestId(
			"proactive-speech-profile",
		) as HTMLSelectElement;
		expect(
			Array.from(skillProfile.options).map((option) => option.value),
		).toEqual(["disabled", "personal_radio_dj"]);
		expect(screen.getByTestId("proactive-bgm-autoplay")).toBeDefined();
		expect(
			(screen.getByTestId("proactive-idle-ms") as HTMLInputElement).value,
		).toBe("120000");
		expect(
			(screen.getByTestId("proactive-interval-ms") as HTMLInputElement).value,
		).toBe("900000");
		expect(
			(screen.getByTestId("proactive-timezone") as HTMLInputElement).value,
		).not.toBe("");
		expect(screen.queryByTestId("proactive-knowledge-scope")).toBeNull();

		gotoSettingsTab("general");
		expect(screen.queryByTestId("proactive-speech-settings")).toBeNull();
		expect(screen.queryByTestId("proactive-speech-profile")).toBeNull();
		expect(screen.queryByTestId("proactive-bgm-autoplay")).toBeNull();
		expect(screen.queryByTestId("proactive-knowledge-scope")).toBeNull();
	});

	it("does not expose a GPU profile or start local voice from detection", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "ollama",
				model: "qwen3:8b",
				avatarProvider: "naia-video-avatar",
				nvaModel: "naia",
				localGpuTier: "windows-voice-6g",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) =>
			cmd === "detect_gpu_vram" ? Promise.resolve(8) : Promise.resolve([]),
		);

		render(<SettingsTab />);
		gotoSettingsTab("profile");
		await vi.waitFor(() =>
			expect(mockInvoke).toHaveBeenCalledWith("detect_gpu_vram"),
		);

		expect(document.getElementById("local-gpu-tier")).toBeNull();
		expect(mockInvoke).not.toHaveBeenCalledWith(
			"start_cascade",
			expect.anything(),
		);
		const saved = JSON.parse(localStorage.getItem("naia-config") ?? "{}");
		expect(saved.provider).toBe("ollama");
		expect(saved.model).toBe("qwen3:8b");
		expect(saved.avatarProvider).toBe("naia-video-avatar");
	});

	it("keeps the avatar runtime card out of Profile across config changes", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "ollama",
				model: "qwen3:8b",
				avatarProvider: "vrm",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) =>
			cmd === "detect_gpu_vram" ? Promise.resolve(8) : Promise.resolve([]),
		);

		render(<SettingsTab />);
		gotoSettingsTab("profile");
		expect(screen.queryByTestId("slot-group-avatar")).toBeNull();
		expect(screen.queryByTestId("slot-avatar")).toBeNull();

		// Something outside this tab (login hydration, another tab) switches the
		// live config to NVA and announces it — Settings must follow, not stay
		// stuck showing the stale VRM detail it had at mount.
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "ollama",
				model: "qwen3:8b",
				avatarProvider: "naia-video-avatar",
				nvaModel: "naia",
			}),
		);
		window.dispatchEvent(new CustomEvent("naia-config-changed"));

		await vi.waitFor(() => {
			expect(screen.queryByTestId("slot-group-avatar")).toBeNull();
			expect(screen.queryByTestId("slot-avatar")).toBeNull();
		});
	});

	it.skip("retired: selects the visible Windows TRT profile without replacing the external brain", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				naiaKey: "nk",
				ttsProvider: "nextain",
				// localhost raw /tts 잔재 — 로컬 티어 선택이 로컬 façade 기본(:8910)으로 교정해야 한다.
				vllmTtsHost: "http://localhost:8892",
				// 음성 전용 티어를 선택해도 독립적인 사전 생성 NVA 선택은 유지해야 한다.
				avatarProvider: "naia-video-avatar",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(16);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("profile");

		await vi.waitFor(() => {
			expect(document.getElementById("local-gpu-tier")).toBeTruthy();
		});
		fireEvent.change(document.getElementById("local-gpu-tier") as HTMLElement, {
			target: { value: "windows-voice-6g" },
		});

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.provider).toBe("nextain");
		expect(saved.model).toBe("gemini-3.5-flash");
		// 음성: 로컬 음성으로 자동 전환 + 원격 호스트 잔재를 로컬 façade 기본으로 교정.
		expect(saved.ttsProvider).toBe("naia-local-voice");
		expect(saved.ttsEnabled).toBe(true);
		expect(saved.vllmTtsHost).toBe("http://localhost:8910");
		expect(saved.localGpuTier).toBe("windows-voice-6g");
		expect(saved.avatarProvider).toBe("naia-video-avatar");
	});

	it.skip("retired: GPU profile 8GB stages local voice while preserving the external LLM and VRM", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "ollama",
				model: "qwen3:8b",
				ollamaHost: "http://gpu-box.local:11434",
				naiaKey: "nk",
				ttsProvider: "nextain",
				vllmTtsHost: "http://localhost:8892",
				avatarProvider: "vrm",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("profile");

		await vi.waitFor(() => {
			expect(document.getElementById("local-gpu-tier")).toBeTruthy();
		});
		fireEvent.change(document.getElementById("local-gpu-tier") as HTMLElement, {
			target: { value: "windows-voice-6g" },
		});

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.localGpuTier).toBe("windows-voice-6g");
		expect(saved.provider).toBe("ollama");
		expect(saved.model).toBe("qwen3:8b");
		expect(saved.ollamaHost).toBe("http://gpu-box.local:11434");
		expect(saved.ollamaNumGpu).toBeUndefined();
		expect(saved.ttsProvider).toBe("naia-local-voice");
		expect(saved.ttsEnabled).toBe(true);
		expect(saved.vllmTtsHost).toBe("http://localhost:8910");
		expect(saved.avatarProvider).toBe("vrm");
	});

	it.skip("retired: describes local GPU profiles by capability without engine implementation names", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-2.5-flash-live",
				naiaKey: "nk",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) =>
			cmd === "detect_gpu_vram" ? Promise.resolve(8) : Promise.resolve([]),
		);
		render(<SettingsTab />);
		gotoSettingsTab("profile");

		const select = await vi.waitFor(() => {
			const element = document.getElementById("local-gpu-tier");
			expect(element).toBeTruthy();
			return element as HTMLSelectElement;
		});
		const labels = Array.from(select.options).map(
			(option) => option.textContent ?? "",
		);
		expect(labels.some((label) => label.includes("NVIDIA GPU 6GB+"))).toBe(
			true,
		);
		expect(labels.join(" ")).not.toMatch(
			/VoxCPM2|Ditto|TensorRT|CUDA INT8|NVIDIA RTX/,
		);
	});

	it.skip("retired: GPU profile 6GB stages VoxCPM2 while preserving the external LLM and pre-baked NVA", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "ollama",
				model: "qwen3:8b",
				ollamaHost: "http://gpu-box.local:11434",
				naiaKey: "nk",
				ttsProvider: "nextain",
				avatarProvider: "naia-video-avatar",
				nvaModel: "stale.nva",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(6);
			if (cmd === "start_cascade") {
				return Promise.resolve(
					JSON.stringify({ facade_port: 8910, services: ["tts"] }),
				);
			}
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("profile");

		const select = document.getElementById(
			"local-gpu-tier",
		) as HTMLSelectElement;
		const option = select.querySelector(
			'option[value="windows-voice-6g"]',
		) as HTMLOptionElement;
		await vi.waitFor(() => expect(option.disabled).toBe(false));
		fireEvent.change(select, { target: { value: "windows-voice-6g" } });

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.localGpuTier).toBe("windows-voice-6g");
		expect(saved.provider).toBe("ollama");
		expect(saved.model).toBe("qwen3:8b");
		expect(saved.ollamaHost).toBe("http://gpu-box.local:11434");
		expect(saved.ttsProvider).toBe("naia-local-voice");
		expect(saved.ttsEnabled).toBe(true);
		expect(saved.vllmTtsHost).toBe("http://localhost:8910");
		expect(saved.avatarProvider).toBe("naia-video-avatar");
		expect(saved.nvaModel).toBe("stale.nva");
	});

	it.skip("retired: blocks a hardware profile change without a Naia login", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ provider: "ollama", model: "qwen3:8b" }),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(6);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("profile");

		const select = document.getElementById(
			"local-gpu-tier",
		) as HTMLSelectElement;
		expect(select.disabled).toBe(true);
		fireEvent.change(select, { target: { value: "windows-voice-6g" } });

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.localGpuTier).toBeUndefined();
		expect(mockInvoke).not.toHaveBeenCalledWith("start_cascade");
		expect(screen.getByTestId("local-profile-hint").textContent).toMatch(
			/registered Naia members.*log in/i,
		);
	});

	it.skip("retired: shows the 4060 install plan and does not start a missing runtime", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				naiaKey: "nk",
				localGpuTier: "windows-voice-6g",
				local8gFocus: "llm",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			if (cmd === "cascade_installation_status") {
				return Promise.resolve({
					phase: "blocked",
					ready: false,
					canStart: false,
					summary:
						"Local runtime installation is blocked because required package artifacts are missing.",
					steps: [
						{
							id: "cascade-service-bundle",
							label: "Cascade service bundle",
							state: "blocked",
							action: "install",
							actionAvailable: false,
							progressPercent: 0,
							retryable: false,
							failure: {
								code: "CASCADE_SERVICE_BUNDLE_MISSING",
								message:
									"VoxCPM2 or voice facade service files are not packaged.",
								retryable: false,
							},
						},
					],
				});
			}
			if (cmd === "cascade_status") return Promise.resolve(false);
			return Promise.resolve([]);
		});

		render(<SettingsTab />);
		await vi.waitFor(() => {
			expect(
				screen.getByTestId("cascade-installation-status").textContent,
			).toMatch(/Cascade service bundle.*blocked.*0%/i);
			expect(mockInvoke).not.toHaveBeenCalledWith("start_cascade");
		});
	});

	it.skip("retired: restores an explicitly saved 8GB profile without replacing the external LLM", async () => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				naiaKey: "nk",
				localGpuTier: "windows-voice-6g",
				local8gFocus: "llm",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			if (cmd === "cascade_installation_status") {
				return Promise.resolve({
					phase: "ready-to-start",
					ready: false,
					canStart: true,
					summary:
						"Local runtime files are ready. Services have not been started yet.",
					steps: [],
				});
			}
			if (cmd === "start_cascade") {
				return Promise.resolve(
					JSON.stringify({ facade_port: 8910, services: [] }),
				);
			}
			return Promise.resolve([]);
		});

		render(<SettingsTab />);

		await vi.waitFor(() => {
			const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
			expect(saved.provider).toBe("nextain");
			expect(saved.model).toBe("gemini-3.5-flash");
			expect(saved.ollamaNumGpu).toBeUndefined();
			expect(saved.ttsProvider).toBe("naia-local-voice");
			expect(saved.vllmTtsHost).toBe("http://localhost:8910");
			expect(saved.avatarProvider).toBe("vrm");
			expect(mockInvoke).toHaveBeenCalledWith("start_cascade", {
				expectedLoaderProfile: "windows_trt_6g",
			});
		});
	});

	it.skip("retired: restores a secret-backed 6GB profile and writes an account-gated voice manifest", async () => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "codex",
				model: "gpt-5.4",
				localGpuTier: "windows-voice-6g",
				local8gFocus: "avatar",
			}),
		);
		secureStoreMock.get.mockImplementation((key: string) =>
			Promise.resolve(key === "naiaKey" ? "gw-restored-member" : null),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			if (cmd === "cascade_installation_status") {
				return Promise.resolve({
					phase: "ready-to-start",
					ready: false,
					canStart: true,
					summary: "Ready",
					steps: [],
				});
			}
			if (cmd === "start_cascade") {
				return Promise.resolve(
					JSON.stringify({ facade_port: 8910, services: [] }),
				);
			}
			return Promise.resolve([]);
		});

		render(<SettingsTab />);

		await vi.waitFor(() => {
			const profileWrites = mockInvoke.mock.calls
				.filter(([cmd]) => cmd === "write_slots_manifest")
				.map((call) => JSON.parse(call[1]?.json as string));
			const write = mockInvoke.mock.calls
				.filter(([cmd]) => cmd === "write_slots_manifest")
				.find((call) => {
					const value = JSON.parse(call[1]?.json as string);
					return (
						value.gate.naiaAccount === true &&
						value.gpu.loaderProfile === "windows_trt_6g" &&
						value.slots.avatar.provider === "vrm"
					);
				});
			expect(write).toBeDefined();
			const manifest = JSON.parse(write?.[1]?.json as string);
			expect(manifest.gate.naiaAccount).toBe(true);
			expect(manifest.gpu).toMatchObject({
				tier: "windows-voice-6g",
				loaderProfile: "windows_trt_6g",
			});
			expect(manifest.slots.main).toMatchObject({
				provider: "codex",
				model: "gpt-5.4",
			});
			expect(manifest.slots.tts.provider).toBe("naia-local-voice");
			expect(manifest.slots.avatar.provider).toBe("vrm");
			expect(mockInvoke).toHaveBeenCalledWith("start_cascade", {
				expectedLoaderProfile: "windows_trt_6g",
			});
			expect(profileWrites.at(-1)?.gate.naiaAccount).toBe(true);
		});
	});

	it.skip("retired: stops cascade and writes a dormant manifest when the member logs out", async () => {
		localStorage.setItem("naia-adk-path", "/home/user/naia-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				naiaKey: "gw-member",
				localGpuTier: "windows-voice-6g",
				ttsProvider: "naia-local-voice",
				avatarProvider: "vrm",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			if (cmd === "cascade_status") return Promise.resolve(true);
			if (cmd === "fetch_naia_balance") return Promise.resolve({ balance: 1 });
			return Promise.resolve([]);
		});

		render(<SettingsTab />);
		await vi.waitFor(() =>
			expect(document.querySelector(".lab-disconnect-btn")).toBeTruthy(),
		);
		fireEvent.click(document.querySelector(".lab-disconnect-btn")!);
		fireEvent.click(
			document.querySelector(".reset-confirm-panel .settings-reset-btn")!,
		);

		await vi.waitFor(() => {
			expect(mockInvoke).toHaveBeenCalledWith("stop_cascade");
			const writes = mockInvoke.mock.calls.filter(
				([cmd]) => cmd === "write_slots_manifest",
			);
			const manifest = JSON.parse(writes.at(-1)?.[1]?.json as string);
			expect(manifest.gate.naiaAccount).toBe(false);
			expect(manifest.gpu.tier).toBeUndefined();
			expect(manifest.gpu.loaderProfile).toBeUndefined();
		});
	});

	it("restores a selected Naia Local runtime for preset playback", async () => {
		localStorage.setItem("naia-adk-path", "D:\\alpha-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				ttsProvider: "naia-local-voice",
				ttsEnabled: true,
				localVoiceEnabled: false,
				vllmTtsHost: "http://localhost:8910",
			}),
		);
		let started = false;
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			if (cmd === "cascade_status") return Promise.resolve(false);
			if (cmd === "cascade_installation_status") {
				return Promise.resolve({
					phase: started ? "ready" : "ready-to-start",
					ready: started,
					canStart: true,
					summary: "Ready",
					steps: [],
				});
			}
			if (cmd === "start_cascade") {
				started = true;
				return Promise.resolve(
					JSON.stringify({ facade_port: 8910, services: [{ id: "tts" }] }),
				);
			}
			return Promise.resolve([]);
		});

		render(<SettingsTab />);

		await vi.waitFor(() => {
			expect(mockInvoke).toHaveBeenCalledWith("start_cascade", {
				expectedLoaderProfile: "windows_trt_6g",
			});
			const write = mockInvoke.mock.calls.find(
				([cmd]) => cmd === "write_slots_manifest",
			);
			const manifest = JSON.parse(write?.[1]?.json as string);
			expect(manifest.gpu).toMatchObject({
				tier: "windows-voice-6g",
				loaderProfile: "windows_trt_6g",
			});
		});
	});

	it("FR-VOICE.13: shows the migration reason and recovers local voice in place", async () => {
		localStorage.setItem("naia-adk-path", "D:\\alpha-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				ttsProvider: "naia-local-voice",
				ttsEnabled: true,
				// Retired field: the safety migration disables local voice and
				// must record the reason instead of going silent.
				localGpuTier: "windows-voice-6g",
				vllmTtsHost: "http://localhost:8910",
			}),
		);
		let started = false;
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(8);
			if (cmd === "cascade_status") return Promise.resolve(false);
			if (cmd === "cascade_installation_status") {
				return Promise.resolve({
					phase: started ? "ready" : "ready-to-start",
					ready: started,
					canStart: true,
					summary: "Ready",
					steps: [],
				});
			}
			if (cmd === "start_cascade") {
				started = true;
				return Promise.resolve(
					JSON.stringify({ facade_port: 8910, services: [{ id: "tts" }] }),
				);
			}
			return Promise.resolve([]);
		});

		render(<SettingsTab />);
		fireEvent.click(
			document.querySelector('[data-settings-tab="voice"]') as HTMLElement,
		);

		await vi.waitFor(() => {
			expect(screen.getByTestId("local-voice-migration-notice")).toBeTruthy();
		});
		const restore = screen.getByTestId("local-voice-migration-restore");
		await vi.waitFor(() => expect(restore).not.toBeDisabled());
		fireEvent.click(restore);

		await vi.waitFor(() => {
			const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
			expect(saved.localVoiceEnabled).toBe(true);
			expect(saved.localVoiceMigrationNotice).toBeUndefined();
		});
		await vi.waitFor(() => {
			expect(screen.queryByTestId("local-voice-migration-notice")).toBeNull();
		});
	});

	it("renders S-SLOT gate + Brain/Voice groups without moving canonical controls", async () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				naiaKey: "nk",
				localGpuTier: "auto",
			}),
		);
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "detect_gpu_vram") return Promise.resolve(6);
			return Promise.resolve([]);
		});
		render(<SettingsTab />);
		gotoSettingsTab("profile");

		// FR-SLOT.1: gate section — naiaKey present → Naia account mode.
		expect(document.querySelector("[data-testid='slot-gate']")).toBeTruthy();
		expect(screen.getByTestId("slot-gate-mode").textContent).toContain(
			"Naia account",
		);
		expect(screen.getByTestId("slot-apply-defaults")).toBeTruthy();
		// Profile shows the user-configurable Brain/Voice groups only.
		expect(document.querySelector("[data-testid='slot-groups']")).toBeTruthy();
		expect(
			document.querySelector("[data-testid='slot-group-brain']"),
		).toBeTruthy();
		expect(
			document.querySelector("[data-testid='slot-group-voice']"),
		).toBeTruthy();
		expect(
			document.querySelector("[data-testid='slot-group-avatar']"),
		).toBeNull();
		expect(document.querySelector("[data-testid='slot-main']")).toBeTruthy();
		expect(document.querySelector("[data-testid='slot-sub']")).toBeTruthy();
		expect(
			document.querySelector("[data-testid='slot-embedding']"),
		).toBeTruthy();
		expect(document.querySelector("[data-testid='slot-stt']")).toBeTruthy();
		expect(document.querySelector("[data-testid='slot-tts']")).toBeTruthy();
		const profileTtsProvider = screen.getByTestId(
			"profile-tts-provider",
		) as HTMLSelectElement;
		expect(
			profileTtsProvider.querySelector('option[value="naia-local-voice"]')
				?.textContent,
		).toContain("Naia Local Voice");
		fireEvent.change(profileTtsProvider, {
			target: { value: "naia-local-voice" },
		});
		await vi.waitFor(() => {
			const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
			expect(saved.ttsProvider).toBe("naia-local-voice");
			expect(saved.vllmTtsHost).toBe("http://localhost:8910");
			expect(screen.getByTestId("profile-local-voice-toggle")).not.toBeDisabled();
		});
		expect(document.querySelector("[data-testid='slot-avatar']")).toBeNull();
		// R1-7: 3-profile residue removed.
		expect(
			document.querySelector("[data-testid='engine-profile-summary']"),
		).toBeNull();
		expect(
			document.querySelector("[data-testid='engine-profile-naia']"),
		).toBeNull();
		expect(
			document.querySelector("[data-testid='engine-profile-byo']"),
		).toBeNull();
		expect(
			document.querySelector("[data-testid='engine-profile-local']"),
		).toBeNull();
		// engine-core-summary 제거(2026-06-30): slot-groups 두뇌 그룹과 100% 중복.
		// engine-gpu-summary·tier-recommendations 제거(2026-07-07): GPU 프로파일 드롭다운 +
		// 로컬 집중 + 슬롯 개요와 중복 → 자리 절약. capability 요약만 고유 정보로 유지.
		expect(
			document.querySelector("[data-testid='engine-core-summary']"),
		).toBeNull();
		expect(
			document.querySelector("[data-testid='engine-gpu-summary']"),
		).toBeNull();
		expect(
			document.querySelector("[data-testid='tier-recommendations']"),
		).toBeNull();
		expect(
			document.querySelector("[data-testid='engine-capability-summary']"),
		).toBeTruthy();
		// Canonical controls remain on ai tab, not engine.
		expect(document.getElementById("provider-select")).toBeNull();
		expect(document.getElementById("model-select")).toBeNull();
		gotoSettingsTab("brain");
		expect(document.getElementById("provider-select")).toBeTruthy();
		expect(document.getElementById("model-select")).toBeTruthy();
	});

	it("first tab button is active by default", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		const activeBtn = document.querySelector(".settings-tab-btn--active");
		expect(activeBtn).toBeTruthy();
		// Profile & Engine is the entrypoint.
		const allBtns = document.querySelectorAll(".settings-tab-btn");
		expect(allBtns[0]?.classList.contains("settings-tab-btn--active")).toBe(
			true,
		);
		expect(allBtns[1]?.classList.contains("settings-tab-btn--active")).toBe(
			false,
		);
	});

	it("apply Naia defaults fills unset slots non-destructively (FR-SLOT.3)", async () => {
		localStorage.setItem("naia-adk-path", "D:\\alpha-adk");
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "nextain",
				model: "gemini-3.5-flash",
				naiaKey: "nk",
			}),
		);
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("profile");

		// 게이트 = naia → "Gemini 기본값 적용" 버튼. 클릭 시 미설정 슬롯에 기본값(R2-1, §9 #5).
		fireEvent.click(screen.getByTestId("slot-apply-defaults"));
		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		// 이미 설정한 main 보존(비파괴).
		expect(saved.provider).toBe("nextain");
		expect(saved.model).toBe("gemini-3.5-flash");
		// 미설정 슬롯 = Gemini 기본값.
		expect(saved.subLlmProvider).toBe("naia");
		expect(saved.subLlmModel).toBe("gemini-3.1-flash-lite");
		expect(saved.llmRoles.sub).toMatchObject({
			provider: "naia",
			model: "gemini-3.1-flash-lite",
		});
		expect(saved.memoryLlmProvider).toBeUndefined();
		expect(saved.memoryEmbeddingProvider).toBe("offline");
		// 한국어 우선: 기본 오프라인 임베딩 = 다국어 e5 (2026-07-15 승인)
		expect(saved.memoryOfflineModel).toBe("multilingual-e5-large");
		expect(saved.ttsProvider).toBe("nextain");
		await vi.waitFor(() => {
			expect(mockInvoke).toHaveBeenCalledWith(
				"write_naia_config",
				expect.objectContaining({ adkPath: "D:\\alpha-adk" }),
			);
		});
	});

	it("memory section is NOT visible on settings tab by default", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// memorySection divider only renders when memory tab is active
		// In English test env, t("settings.memorySection") returns "Memory"
		const dividerTexts = Array.from(
			document.querySelectorAll(".settings-section-divider span"),
		).map((el) => el.textContent);
		// No divider with "Memory"/"기억" when on settings tab
		const hasMemoryDivider = dividerTexts.some(
			(t) => t === "Memory" || t === "기억",
		);
		expect(hasMemoryDivider).toBe(false);
	});

	it("clicking memory tab button shows memory section", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// Click the memory tab button (index 3 in the 5-tab bar)
		gotoSettingsTab("memory");
		// The memory tab button is now active
		expect(
			document
				.querySelector('[data-settings-tab="memory"]')
				?.classList.contains("settings-tab-btn--active"),
		).toBe(true);
		// Memory section divider should now appear
		const dividerTexts = Array.from(
			document.querySelectorAll(".settings-section-divider span"),
		).map((el) => el.textContent);
		const hasMemoryDivider = dividerTexts.some(
			(t) => t === "Memory" || t === "기억",
		);
		expect(hasMemoryDivider).toBe(true);
	});

	it("switching to memory tab hides settings-danger-zone", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// #313 rewrite: the danger zone moved to the info tab.
		gotoSettingsTab("general");
		expect(document.querySelector(".settings-danger-zone")).toBeTruthy();
		// Switch to memory tab — danger zone hidden
		gotoSettingsTab("memory");
		expect(document.querySelector(".settings-danger-zone")).toBeNull();
	});

	it("switching back to info tab restores danger-zone and hides memory section", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// Info tab → memory tab → back to info tab (danger zone lives on info).
		gotoSettingsTab("general");
		gotoSettingsTab("memory");
		gotoSettingsTab("general");
		// Danger zone back
		expect(document.querySelector(".settings-danger-zone")).toBeTruthy();
		// Memory section divider gone
		const dividerTexts = Array.from(
			document.querySelectorAll(".settings-section-divider span"),
		).map((el) => el.textContent);
		const hasMemoryDivider = dividerTexts.some(
			(t) => t === "Memory" || t === "기억",
		);
		expect(hasMemoryDivider).toBe(false);
	});
});

// ── #296: Agent health check panel ───────────────────────────────────────────

describe("SettingsTab — agent health check (#296)", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("renders agent health section with check button", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("general");
		expect(
			document.querySelector("[data-testid='agent-health-section']"),
		).toBeTruthy();
		expect(
			document.querySelector("[data-testid='agent-health-check-btn']"),
		).toBeTruthy();
	});

	it("shows idle status initially", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("general");
		const statusEl = document.querySelector(
			"[data-testid='agent-health-status']",
		) as HTMLElement;
		expect(statusEl).toBeTruthy();
		// In English test env, "Not checked" is shown
		expect(statusEl.classList.contains("agent-health-status--idle")).toBe(true);
	});

	it("clicking check button calls gateway_health invoke", async () => {
		mockInvoke.mockResolvedValue(true);
		render(<SettingsTab />);
		gotoSettingsTab("general");
		const btn = document.querySelector(
			"[data-testid='agent-health-check-btn']",
		) as HTMLButtonElement;
		fireEvent.click(btn);

		await vi.waitFor(() => {
			const healthCalls = (mockInvoke as any).mock.calls.filter(
				([cmd]: [string]) => cmd === "gateway_health",
			);
			expect(healthCalls.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("shows healthy status when gateway_health returns true", async () => {
		mockInvoke.mockImplementation(async (cmd: string) => {
			if (cmd === "gateway_health") return true;
			return [];
		});
		render(<SettingsTab />);
		gotoSettingsTab("general");
		const btn = document.querySelector(
			"[data-testid='agent-health-check-btn']",
		) as HTMLButtonElement;
		fireEvent.click(btn);

		await vi.waitFor(() => {
			const statusEl = document.querySelector(
				"[data-testid='agent-health-status']",
			) as HTMLElement;
			expect(statusEl.classList.contains("agent-health-status--healthy")).toBe(
				true,
			);
		});
	});

	it("shows unhealthy status when gateway_health returns false", async () => {
		mockInvoke.mockImplementation(async (cmd: string) => {
			if (cmd === "gateway_health") return false;
			return [];
		});
		render(<SettingsTab />);
		gotoSettingsTab("general");
		const btn = document.querySelector(
			"[data-testid='agent-health-check-btn']",
		) as HTMLButtonElement;
		fireEvent.click(btn);

		await vi.waitFor(() => {
			const statusEl = document.querySelector(
				"[data-testid='agent-health-status']",
			) as HTMLElement;
			expect(
				statusEl.classList.contains("agent-health-status--unhealthy"),
			).toBe(true);
		});
	});

	it("agent-health-section is on the settings tab (not memory tab)", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		gotoSettingsTab("general");
		// By default on settings tab — health section should be visible
		expect(
			document.querySelector("[data-testid='agent-health-section']"),
		).toBeTruthy();
		// Switch to memory tab — health section should disappear
		gotoSettingsTab("memory");
		expect(
			document.querySelector("[data-testid='agent-health-section']"),
		).toBeNull();
	});

	it("shows unhealthy status when gateway_health throws", async () => {
		mockInvoke.mockImplementation(async (cmd: string) => {
			if (cmd === "gateway_health") throw new Error("Agent not running");
			return [];
		});
		render(<SettingsTab />);
		gotoSettingsTab("general");
		const btn = document.querySelector(
			"[data-testid='agent-health-check-btn']",
		) as HTMLButtonElement;
		fireEvent.click(btn);

		await vi.waitFor(() => {
			const statusEl = document.querySelector(
				"[data-testid='agent-health-status']",
			) as HTMLElement;
			expect(
				statusEl.classList.contains("agent-health-status--unhealthy"),
			).toBe(true);
		});
	});
});

// ── #297: Log viewer button ───────────────────────────────────────────────────

const mockOpenPath = vi.fn();
vi.mock("@tauri-apps/plugin-opener", async (importOriginal) => {
	const original = (await importOriginal()) as Record<string, unknown>;
	return {
		...original,
		openPath: (...args: unknown[]) => mockOpenPath(...args),
	};
});

describe("SettingsTab — log viewer (#297)", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("renders log viewer button on info tab", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// #313 rewrite: the log viewer moved to the info tab.
		gotoSettingsTab("general");
		expect(
			document.querySelector("[data-testid='log-viewer-btn']"),
		).toBeTruthy();
	});

	it("log viewer button is on info tab only (not memory tab)", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		// Info tab: visible
		gotoSettingsTab("general");
		expect(
			document.querySelector("[data-testid='log-viewer-btn']"),
		).toBeTruthy();
		// Switch to memory tab: hidden
		gotoSettingsTab("memory");
		expect(document.querySelector("[data-testid='log-viewer-btn']")).toBeNull();
	});

	it("clicking log viewer button calls get_log_dir then openPath", async () => {
		const logDir = "/home/user/.naia/logs";
		mockInvoke.mockImplementation(async (cmd: string) => {
			if (cmd === "get_log_dir") return logDir;
			return [];
		});
		mockOpenPath.mockResolvedValue(undefined);

		render(<SettingsTab />);
		gotoSettingsTab("general");
		const btn = document.querySelector(
			"[data-testid='log-viewer-btn']",
		) as HTMLButtonElement;
		fireEvent.click(btn);

		await vi.waitFor(() => {
			const logDirCalls = (mockInvoke as any).mock.calls.filter(
				([cmd]: [string]) => cmd === "get_log_dir",
			);
			expect(logDirCalls.length).toBeGreaterThanOrEqual(1);
		});

		await vi.waitFor(() => {
			expect(mockOpenPath).toHaveBeenCalledWith(logDir);
		});
	});
});
