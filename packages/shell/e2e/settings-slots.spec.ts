import { type Page, expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * S-SLOT 설정 E2E — FR-SLOT.1~5 (docs/requirements.md), #gate-slots.
 * 실 UI(Playwright chromium ≈ WebView2) 자동구동. Tauri Rust IPC = mock.
 *
 * 검증 경로(단위 테스트가 가리지 못하는 실 UI 배선):
 *  - FR-SLOT.1: naia 계정 게이트(naiaKey 파생, GPU 무관) 표시.
 *  - FR-SLOT.2: 3 그룹(Brain/Voice/Avatar) + 6 슬롯 렌더.
 *  - FR-SLOT.3: "Gemini 기본값 적용" 버튼 → 미설정 슬롯에 기본값 자동 적용.
 *  - R1-7: 구 3-profile 카드(engine-profile-*) 제거.
 */

/** Tauri IPC mock — detect_gpu_vram 포함(GPU 있어도 게이트는 naiaKey 에만 의존 = R1-3). */
function buildMock(vramGb: number | null): string {
	return `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } };
	var callbacks = new Map(); var nextCbId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) { var id = nextCbId++; callbacks.set(id, function(d){ if(once) callbacks.delete(id); return fn && fn(d); }); return id; };
	window.__TAURI_INTERNALS__.unregisterCallback = function(id){ callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, d){ var cb = callbacks.get(id); if (cb) cb(d); };
	window.__TAURI_INTERNALS__.callbacks = callbacks;
	var eventListeners = new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};
	window.__TAURI_INTERNALS__.convertFileSrc = function(p, proto){ return (proto||"asset") + "://localhost/" + encodeURIComponent(p); };
	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		if (cmd === "plugin:event|listen") { if(!eventListeners.has(args.event)) eventListeners.set(args.event, []); eventListeners.get(args.event).push(args.handler); return args.handler; }
		if (cmd === "plugin:event|emit" || cmd === "plugin:event|unlisten") return null;
		if (cmd === "detect_gpu_vram") return ${vramGb === null ? "null" : vramGb};
		if (cmd === "write_naia_config") return null;
		if (cmd === "list_skills") return [
			{ name: "skill_time", description: "Get current date and time", type: "built-in", tier: 0, source: "built-in" },
			{ name: "skill_memo", description: "Save and retrieve memos", type: "built-in", tier: 0, source: "built-in" }
		];
		return undefined; // TAURI_BASE_MOCK_FALLBACK handles the rest
	};
})();
`;
}

interface SetupOpts {
	vramGb?: number | null;
	/** naia-config override (gate/slots 시나리오). */
	config?: Record<string, unknown>;
}

async function openSlotSettings(
	page: Page,
	opts: SetupOpts = {},
): Promise<void> {
	await page.addInitScript(buildMock(opts.vramGb ?? null));
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript(
		(configJson: string) => localStorage.setItem("naia-config", configJson),
		JSON.stringify({
			provider: "nextain",
			model: "gemini-3.5-flash",
			enableTools: false,
			ttsEnabled: true,
			locale: "en",
			onboardingComplete: true,
			...opts.config,
		}),
	);
	await page.route("**/v1/pricing", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
	);
	await page.route("**/v1/models", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
	);
	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 15_000 });
	await page.getByRole("button", { name: /^(Settings|설정)$/ }).click();
	// S-SLOT 게이트+그룹 = profile 탭(프로파일 엔트리포인트).
	await page.locator('[data-settings-tab="profile"]').click();
}

test.describe("S-SLOT settings — gate + 6 cloud slots (#gate-slots)", () => {
	test("Youtube Radio DJ precedes memo and expands populated settings", async ({
		page,
	}) => {
		await openSlotSettings(page, {
			config: { locale: "en", proactiveSpeechProfile: "disabled" },
		});
		await page.locator('[data-settings-tab="skills"]').click();

		const card = page.getByTestId("youtube-bgm-skill-settings");
		await expect(card).toBeVisible();
		await expect(card).toContainText("Youtube Radio DJ");
		await expect(card).not.toContainText("skill_youtube_bgm");
		await expect(page.getByTestId("proactive-speech-profile")).toHaveCount(0);

		const columns = await card
			.locator("..")
			.evaluate(
				(element) =>
					getComputedStyle(element).gridTemplateColumns.split(" ").length,
			);
		expect(columns).toBe(2);

		const memoCard = page.locator(".skill-card", { hasText: "skill_memo" });
		await expect(memoCard).toBeVisible();
		expect(
			await card.evaluate((radio) => {
				const cards = Array.from(
					document.querySelectorAll(".skills-list > .skill-card"),
				);
				const memoIndex = cards.findIndex((item) =>
					item.textContent?.includes("skill_memo"),
				);
				return cards.indexOf(radio) === memoIndex - 1;
			}),
		).toBe(true);

		await card.getByRole("button", { name: /Youtube Radio DJ/ }).click();
		await expect(card).toContainText("skill_youtube_bgm");
		await expect(page.getByTestId("proactive-idle-ms")).toHaveValue("120000");
		await expect(page.getByTestId("proactive-interval-ms")).toHaveValue(
			"900000",
		);
		await expect(page.getByTestId("proactive-timezone")).not.toHaveValue("");
		const consent = page.getByTestId("proactive-weather-consent");
		await consent.check();
		await expect(consent).toBeChecked();
		await page.getByTestId("proactive-weather-latitude").fill("37.5665");
		await page.getByTestId("proactive-weather-longitude").fill("126.978");
		await card
			.getByRole("button", { name: "Save proactive speech settings" })
			.click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						JSON.parse(localStorage.getItem("naia-config") ?? "{}")
							.proactiveSpeechWeatherConsented,
				),
			)
			.toBe(true);

		await page.locator('[data-settings-tab="general"]').click();
		await expect(page.getByTestId("proactive-speech-settings")).toHaveCount(0);
		await page.locator('[data-settings-tab="skills"]').click();
		await card.getByRole("button", { name: /Youtube Radio DJ/ }).click();
		await expect(page.getByTestId("proactive-speech-settings")).toHaveCount(1);
		await expect(page.getByTestId("proactive-weather-consent")).toBeChecked();
	});

	test("FR-SLOT.1/2: naia gate + 3 groups (Brain/Voice/Avatar) render; 3-profile cards removed (R1-7)", async ({
		page,
	}) => {
		await openSlotSettings(page, {
			vramGb: 12,
			config: { naiaKey: "e2e-naia-key" },
		});

		// FR-SLOT.1: gate = naia (naiaKey present, GPU 무관 — vram=12 임에도 gate 는 naia).
		await expect(page.locator('[data-testid="slot-gate"]')).toBeVisible();
		await expect(page.locator('[data-testid="slot-gate-mode"]')).toContainText(
			/Naia account/i,
		);
		await expect(
			page.locator('[data-testid="slot-apply-defaults"]'),
		).toBeVisible();

		// FR-SLOT.2: 3 groups + 6 slots.
		await expect(page.locator('[data-testid="slot-groups"]')).toBeVisible();
		await expect(
			page.locator('[data-testid="slot-group-brain"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="slot-group-voice"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="slot-group-avatar"]'),
		).toBeVisible();
		for (const sid of ["main", "sub", "embedding", "stt", "tts", "avatar"]) {
			await expect(page.locator(`[data-testid="slot-${sid}"]`)).toBeVisible();
		}

		// R1-7: legacy 3-profile cards removed.
		await expect(
			page.locator('[data-testid="engine-profile-summary"]'),
		).toHaveCount(0);
		await expect(
			page.locator('[data-testid="engine-profile-naia"]'),
		).toHaveCount(0);
	});

	test("FR-SLOT.1: BYO gate when no naiaKey — login button shown", async ({
		page,
	}) => {
		await openSlotSettings(page, {
			config: { provider: "gemini", naiaKey: undefined },
		});

		await expect(page.locator('[data-testid="slot-gate-mode"]')).toContainText(
			/BYO|Bring your own/i,
		);
		await expect(page.locator('[data-testid="slot-login-naia"]')).toBeVisible();
		await expect(
			page.locator('[data-testid="slot-apply-defaults"]'),
		).toHaveCount(0);
	});

	test("FR-SLOT.3: apply Gemini defaults fills unset slots (non-destructive, §9 #5)", async ({
		page,
	}) => {
		// naia 게이트 + main 만 설정(sub/embed/stt/tts 미설정).
		await openSlotSettings(page, {
			config: {
				naiaKey: "e2e-naia-key",
				provider: "nextain",
				model: "gemini-3.5-flash",
			},
		});

		await page.locator('[data-testid="slot-apply-defaults"]').click();

		// localStorage 영속 — 미설정 슬롯이 Gemini 기본값으로 채워졌는지(§9 #5 모델 문자열).
		const saved = await page.evaluate(() => {
			const raw = localStorage.getItem("naia-config") ?? "{}";
			return JSON.parse(raw) as Record<string, unknown>;
		});
		expect(saved.provider).toBe("nextain"); // 보존
		expect(saved.model).toBe("gemini-3.5-flash"); // 보존(비파괴)
		expect(saved.subLlmProvider).toBe("naia");
		expect(saved.subLlmModel).toBe("gemini-3.1-flash-lite");
		expect(saved.memoryLlmProvider).toBeUndefined();
		expect(saved.memoryEmbeddingProvider).toBe("offline");
		// 한국어 우선: 기본 오프라인 임베딩 = 다국어 e5 (2026-07-15 승인)
		expect(saved.memoryOfflineModel).toBe("multilingual-e5-large");
		expect(saved.ttsProvider).toBe("nextain");

		// UI 도 연동 — sub 슬롯 표시가 업데이트됨.
		await expect(page.locator('[data-testid="slot-sub"]')).toContainText(
			/naia/i,
		);
	});

	test("voice-only GPU profile preserves the Naia external brain and selected NVA", async ({
		page,
	}) => {
		await openSlotSettings(page, {
			vramGb: 16,
			config: {
				naiaKey: "nk",
				// 이전 상태 잔재 3종 — 프로파일 선택이 전부 교정해야 한다 (2026-07-15 실사고 재현):
				ttsProvider: "nextain", // 클라우드 음성
				vllmTtsHost: "http://localhost:8892", // ★로컬 형식이지만 틀린 포트 — 그대로 살아남던 실사고
				avatarProvider: "naia-video-avatar",
				avatarProvider: "naia-video-avatar", // 아바타 티어 잔재 (VRM 복원 대상)
			},
		});

		const tierSelect = page.locator("#local-gpu-tier");
		await expect(tierSelect).toBeVisible();

		// 피커 정리(2026-07-15 루크): 미검증 티어 비노출 + "자동" 제거 — 선택지 = 끄기 + 16GB 뿐.
		const optionValues = await tierSelect
			.locator("option")
			.evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
		expect(optionValues).toContain("windows-voice-6g");
		expect(optionValues).not.toContain("local-llm-voice-16g");
		expect(optionValues).not.toContain("auto"); // 자동이 미검증 티어(NVA)를 고르던 사고로 제거
		for (const hiddenId of [
			"avatar-6g",
			"local-llm-avatar-8g",
			"local-voice-12g",
			"full-realtime-24g",
		]) {
			expect(optionValues).not.toContain(hiddenId);
		}

		await tierSelect.selectOption("windows-voice-6g");

		// 영속 검증 — 프로파일 한 번으로 로컬 풀 구성 완성.
		const saved = await page.evaluate(() => {
			const raw = localStorage.getItem("naia-config") ?? "{}";
			return JSON.parse(raw) as Record<string, unknown>;
		});
		expect(saved.localGpuTier).toBe("windows-voice-6g");
		expect(saved.provider).toBe("nextain");
		expect(saved.model).toBe("gemini-3.5-flash");
		expect(saved.ttsProvider).toBe("naia-local-voice"); // 음성 → 로컬
		expect(saved.ttsEnabled).toBe(true);
		expect(saved.vllmTtsHost).toBe("http://localhost:8910"); // 원격 잔재 → 로컬 façade 교정
		expect(saved.avatarProvider).toBe("naia-video-avatar");

		// UI 반영 — 슬롯 표시가 로컬 구성으로 갱신.
		await expect(page.locator('[data-testid="slot-main"]')).toContainText(
			/nextain/i,
		);
		await expect(page.locator('[data-testid="slot-tts"]')).toContainText(
			/naia-local-voice/i,
		);
	});

	test("voice-only GPU profile preserves a remote Ollama route and VRM", async ({
		page,
	}) => {
		await openSlotSettings(page, {
			vramGb: 8,
			config: {
				naiaKey: "nk",
				provider: "ollama",
				model: "qwen3:8b",
				ollamaHost: "http://gpu-box.local:11434",
				ttsProvider: "nextain",
				vllmTtsHost: "http://localhost:8892",
				avatarProvider: "vrm",
			},
		});

		const tierSelect = page.locator("#local-gpu-tier");
		await expect(tierSelect).toBeVisible();
		await expect(
			tierSelect.locator('option[value="windows-voice-6g"]'),
		).toHaveCount(1);
		await tierSelect.selectOption("windows-voice-6g");

		const saved = await page.evaluate(() => {
			const raw = localStorage.getItem("naia-config") ?? "{}";
			return JSON.parse(raw) as Record<string, unknown>;
		});
		expect(saved.localGpuTier).toBe("windows-voice-6g");
		expect(saved.provider).toBe("ollama");
		expect(saved.model).toBe("qwen3:8b");
		expect(saved.ollamaHost).toBe("http://gpu-box.local:11434");
		expect(saved.ttsProvider).toBe("naia-local-voice");
		expect(saved.ttsEnabled).toBe(true);
		expect(saved.vllmTtsHost).toBe("http://localhost:8910");
		expect(saved.avatarProvider).toBe("vrm");
		expect(saved.nvaModel).toBeUndefined();
		await expect(page.locator('[data-testid="slot-main"]')).toContainText(
			/ollama/i,
		);
		await expect(page.locator('[data-testid="slot-tts"]')).toContainText(
			/naia-local-voice/i,
		);
	});
});
