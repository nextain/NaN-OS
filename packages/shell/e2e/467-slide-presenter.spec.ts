import { existsSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

const SPEECH_MOCK = `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = {
		currentWindow: { label: "main" },
		currentWebview: { windowLabel: "main", label: "main" }
	};
	var callbacks = new Map();
	var listeners = new Map();
	var nextCallbackId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
		var id = nextCallbackId++;
		callbacks.set(id, function(data) {
			if (once) callbacks.delete(id);
			return fn && fn(data);
		});
		return id;
	};
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, data) {
		var callback = callbacks.get(id);
		if (callback) callback(data);
	};
	function emit(event, payload) {
		(listeners.get(event) || []).forEach(function(handler) {
			window.__TAURI_INTERNALS__.runCallback(handler, { event: event, payload: payload });
		});
	}
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function(event, id) {
		listeners.set(event, (listeners.get(event) || []).filter(function(handler) { return handler !== id; }));
		callbacks.delete(id);
	};
	window.__TAURI_INTERNALS__.convertFileSrc = function(path, protocol) {
		return (protocol || "asset") + "://localhost/" + encodeURIComponent(path);
	};
	window.__TAURI_INTERNALS__.invoke = async function(command, args) {
		if (command === "plugin:event|listen") {
			if (!listeners.has(args.event)) listeners.set(args.event, []);
			listeners.get(args.event).push(args.handler);
			return args.handler;
		}
		if (command === "plugin:event|emit") { emit(args.event, args.payload); return null; }
		if (command === "plugin:event|unlisten") return null;
		if (command === "send_to_agent_command" || command === "cancel_stream") return null;
		if (command === "browser_wv_page_info") return ["about:blank", ""];
		if (command.startsWith("browser_wv_")) return null;
		return undefined;
	};
	window.__SLIDE_E2E__ = { spoken: [], cancelled: 0, delayMs: 40 };
	Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
		speak: function(utterance) {
			window.__SLIDE_E2E__.spoken.push(utterance.text);
			setTimeout(function() {
				if (utterance.onstart) utterance.onstart();
				if (utterance.onend) utterance.onend();
			}, window.__SLIDE_E2E__.delayMs);
		},
		cancel: function() { window.__SLIDE_E2E__.cancelled += 1; },
		getVoices: function() { return []; },
		pause: function() {},
		resume: function() {}
	}});
	Object.defineProperty(window, "SpeechSynthesisUtterance", {
		configurable: true,
		writable: true,
		value: function(text) {
			this.text = text;
			this.lang = "";
			this.onstart = null;
			this.onend = null;
			this.onerror = null;
		}
	});
})();
`;

function makeTwoPagePdf(): Buffer {
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		"<< /Length 45 >>\nstream\nBT /F1 36 Tf 96 270 Td (Slide One) Tj ET\nendstream",
		"<< /Length 45 >>\nstream\nBT /F1 36 Tf 96 270 Td (Slide Two) Tj ET\nendstream",
	];
	let pdf = "%PDF-1.4\n";
	const offsets = [0];
	for (let index = 0; index < objects.length; index += 1) {
		offsets.push(Buffer.byteLength(pdf, "ascii"));
		pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
	}
	const xref = Buffer.byteLength(pdf, "ascii");
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) {
		pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(pdf, "ascii");
}

async function setup(page: Page) {
	page.on("pageerror", (error) =>
		console.error("[slide-e2e pageerror]", error),
	);
	page.on("console", (message) => {
		if (message.type() === "error") {
			console.error("[slide-e2e console]", message.text());
		}
	});
	await page.addInitScript(SPEECH_MOCK);
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript(() => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				provider: "ollama",
				model: "qwen3.6:27b",
				ttsEnabled: true,
				ttsProvider: "browser",
				locale: "ko",
				onboardingComplete: true,
			}),
		);
	});
	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 10_000 });
	await page.locator('button[data-panel-id="slides"]').click();
	await expect(page.locator(".slides-app")).toBeVisible();
}

async function loadFiles(
	page: Page,
	pdf: string | { name: string; mimeType: string; buffer: Buffer },
	script: string | { name: string; mimeType: string; buffer: Buffer },
) {
	await page.getByLabel("PDF 열기").setInputFiles(pdf);
	await page.getByLabel("발표 스크립트").setInputFiles(script);
}

async function expectRenderedSlide(page: Page) {
	const canvas = page.locator(".slides-app__page canvas");
	await expect(canvas).toBeVisible({ timeout: 30_000 });
	await expect
		.poll(
			() =>
				canvas.evaluate((element: HTMLCanvasElement) => {
					const context = element.getContext("2d");
					if (!context || element.width === 0 || element.height === 0) return 0;
					const pixels = context.getImageData(
						0,
						0,
						element.width,
						element.height,
					).data;
					let ink = 0;
					for (let index = 0; index < pixels.length; index += 400) {
						if (
							pixels[index] < 245 ||
							pixels[index + 1] < 245 ||
							pixels[index + 2] < 245
						) {
							ink += 1;
						}
					}
					return ink;
				}),
			{ timeout: 30_000 },
		)
		.toBeGreaterThan(10);
}

test.describe("#467 slide presenter", () => {
	test("runs the deterministic browser-TTS presentation loop", async ({
		page,
	}) => {
		await setup(page);
		await loadFiles(
			page,
			{
				name: "two-slides.pdf",
				mimeType: "application/pdf",
				buffer: makeTwoPagePdf(),
			},
			{
				name: "two-slides.md",
				mimeType: "text/markdown",
				buffer: Buffer.from(
					"## 1. First\n\n첫 번째 발표입니다.\n\n## 2. Second\n\n두 번째 발표입니다.",
				),
			},
		);

		await expect(page.locator('.slides-app[data-state="ready"]')).toBeVisible();
		await expect(page.locator(".slides-app__progress strong")).toHaveText(
			"1 / 2",
		);
		await expect(page.getByTestId("slides-current-note")).toContainText(
			"첫 번째 발표입니다.",
		);

		await page.getByRole("button", { name: "발표 시작" }).click();
		await expect
			.poll(() =>
				page.evaluate(() => [...(window as any).__SLIDE_E2E__.spoken]),
			)
			.toEqual(["첫 번째 발표입니다.", "두 번째 발표입니다."]);
		await expect(
			page.locator('.slides-app[data-state="completed"]'),
		).toBeVisible();
		await expect(page.locator(".slides-app__progress strong")).toHaveText(
			"2 / 2",
		);
	});

	test("loads and presents the current 21-slide IR deck", async ({ page }) => {
		const pdfPath = process.env.NAIA_SLIDE_IR_PDF ?? "";
		const scriptPath = process.env.NAIA_SLIDE_IR_SCRIPT ?? "";
		test.skip(
			!existsSync(pdfPath) || !existsSync(scriptPath),
			"Current local IR artifacts are not available on this machine.",
		);

		await setup(page);
		await loadFiles(page, pdfPath, scriptPath);
		await expect(page.locator('.slides-app[data-state="ready"]')).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.locator(".slides-app__progress strong")).toHaveText(
			"1 / 21",
		);
		await expect(page.getByTestId("slides-current-note")).not.toBeEmpty();
		await expectRenderedSlide(page);
		await page.screenshot({
			path: "test-results/issue-467-ir-desktop.png",
			fullPage: true,
		});

		await page.evaluate(() => {
			(window as any).__SLIDE_E2E__.delayMs = 1_500;
		});
		await page.getByRole("button", { name: "발표 시작" }).click();
		await expect(page.locator(".slides-app__progress strong")).toHaveText(
			"2 / 21",
			{ timeout: 30_000 },
		);
		await expect
			.poll(() =>
				page.evaluate(() => (window as any).__SLIDE_E2E__.spoken.length),
			)
			.toBeGreaterThan(0);
		await page.getByRole("button", { name: "일시정지" }).click();
		await expectRenderedSlide(page);
		await page.locator(".slides-app").evaluate((element) => {
			element.scrollTop = 0;
		});

		await page.setViewportSize({ width: 900, height: 700 });
		await page.screenshot({
			path: "test-results/issue-467-ir-narrow.png",
			fullPage: true,
		});
	});
});
