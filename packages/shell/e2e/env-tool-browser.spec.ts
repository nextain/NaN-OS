import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * #499 UC-ENV-TOOL-BROWSE — 브라우저 환경 도구 배선 (실 UI, browser 등급).
 *
 * 문서 Test Coverage Map 이 이 파일을 확인 수단으로 선언해 두었으나 실제로는 없었다
 * (2026-08-26 벤치가 발견). 계약 테스트는 순수 규칙만 보고, 도구가 실제로 등록돼
 * 나이아의 호출이 브라우저 명령까지 가는지는 아무도 안 봤다.
 *
 * 여기서 고정하는 것:
 *   (A) 브라우저 앱이 자기 도구를 agent 에 등록한다
 *   (B) 나이아의 도구 호출이 실제 브라우저 명령까지 간다
 *   (C) 조작은 스냅샷의 참조로 한다 — 좌표로 찍지 않는다
 *   (D) 행동 전후 관측이 남아 무엇이 달라졌는지 말할 수 있다
 */

const NEW_CORE_FLAG =
	"window.__NAIA_NEW_CORE__ = true; window.__E2E_OUTBOUND__ = []; window.__E2E_WV__ = []; window.__E2E_CANCELLED__ = [];";

const MOCK_SCRIPT = `
(function () {
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
  window.__TAURI_INTERNALS__.metadata = {
    currentWindow: { label: "main" },
    currentWebview: { windowLabel: "main", label: "main" },
  };
  var callbacks = new Map(); var nextCbId = 1;
  window.__TAURI_INTERNALS__.transformCallback = function (fn, once) {
    var id = nextCbId++;
    callbacks.set(id, function (data) { if (once) callbacks.delete(id); return fn && fn(data); });
    return id;
  };
  window.__TAURI_INTERNALS__.unregisterCallback = function (id) { callbacks.delete(id); };
  window.__TAURI_INTERNALS__.runCallback = function (id, data) { var cb = callbacks.get(id); if (cb) cb(data); };
  var eventListeners = new Map();
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function () {};
  function emitEvent(event, payload) {
    var hs = eventListeners.get(event) || [];
    for (var i = 0; i < hs.length; i++) window.__TAURI_INTERNALS__.runCallback(hs[i], { event: event, payload: payload });
  }
  window.__TAURI_INTERNALS__.convertFileSrc = function (p, proto) { return (proto || "asset") + "://localhost/" + encodeURIComponent(p); };

  // 페이지 구조 스냅샷 대역. 안정된 참조(@e1..)를 주는 것이 요점이다.
  var SNAPSHOT = [
    'link "제품 소개" [ref=@e1]',
    'button "로그인" [ref=@e2]',
    'textbox "검색어" [ref=@e3]'
  ].join("\\n");

  window.__TAURI_INTERNALS__.invoke = async function (cmd, args) {
    if (cmd === "plugin:event|listen") {
      if (!eventListeners.has(args.event)) eventListeners.set(args.event, []);
      eventListeners.get(args.event).push(args.handler);
      return args.handler;
    }
    if (cmd === "plugin:event|emit") { emitEvent(args.event, args.payload); return null; }
    if (cmd === "plugin:event|unlisten") return;

    if (cmd && cmd.indexOf("browser_wv_") === 0) {
      window.__E2E_WV__.push({ cmd: cmd, args: args });
      if (cmd === "browser_wv_snapshot") return SNAPSHOT;
      if (cmd === "browser_wv_get_text") return JSON.stringify("제품 소개 페이지 본문입니다.");
      return null;
    }

    if (cmd === "send_to_agent_command") {
      var payload = JSON.parse(args.message);
      window.__E2E_OUTBOUND__.push(payload);
      if (payload && payload.type === "chat_request") {
        var rid = payload.requestId;
        var calls = window.__E2E_BROWSE_CALLS__ || [];
        var chunks = calls.map(function (c, i) {
          return { type: "app_tool_call", requestId: rid, toolCallId: "tc-b-" + (i + 1), toolName: c.tool, args: c.args };
        });
        // 취소를 재려면 턴이 진행 중이어야 한다. 끝내지 않는 모드를 둔다.
        if (!window.__E2E_NO_FINISH__) chunks.push({ type: "finish", requestId: rid });
        var d = 150;
        for (var i = 0; i < chunks.length; i++) {
          (function (c, ms) { setTimeout(function () { emitEvent("agent_response", JSON.stringify(c)); }, ms); })(chunks[i], d);
          d += 250;
        }
      }
      return null;
    }
    if (cmd === "cancel_stream") { window.__E2E_CANCELLED__.push(String(args && args.requestId)); return null; }
    if (cmd === "send_approval_response") return null;
    return undefined;
  };
})();
`;

const CONFIG = {
	provider: "gemini",
	model: "gemini-2.5-flash",
	apiKey: "e2e-mock-key",
	enableTools: true,
	locale: "ko",
	onboardingComplete: true,
};

async function boot(page: import("@playwright/test").Page) {
	await page.addInitScript(NEW_CORE_FLAG);
	await page.addInitScript(MOCK_SCRIPT);
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript({
		content: `localStorage.setItem("naia-config", ${JSON.stringify(JSON.stringify(CONFIG))});`,
	});
	await page.goto("/");
	await expect(page.locator(".chat-app")).toBeVisible({ timeout: 10_000 });
}

/** 나이아 대역이 이번 턴에 낼 도구 호출을 정한다. */
async function setCalls(
	page: import("@playwright/test").Page,
	calls: { tool: string; args: Record<string, unknown> }[],
) {
	await page.evaluate((c) => {
		(window as unknown as { __E2E_BROWSE_CALLS__?: unknown }).__E2E_BROWSE_CALLS__ = c;
	}, calls);
}

async function wvCalls(page: import("@playwright/test").Page) {
	return (await page.evaluate(
		() => (window as unknown as { __E2E_WV__?: unknown[] }).__E2E_WV__ ?? [],
	)) as { cmd: string; args: Record<string, unknown> }[];
}

async function say(page: import("@playwright/test").Page, text: string) {
	const input = page.locator(".chat-input");
	await expect(input).toBeEnabled({ timeout: 5_000 });
	await input.fill(text);
	await input.press("Enter");
}

test.describe("#499 브라우저 환경 도구 (UC-ENV-TOOL-BROWSE)", () => {
	test("(A) 브라우저 앱이 자기 도구를 agent 에 등록한다", async ({ page }) => {
		await boot(page);
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
								.__E2E_OUTBOUND__ ?? [];
						return out.some(
							(m) =>
								m?.type === "app_skills" &&
								Array.isArray(m?.tools) &&
								(m.tools as { name?: string }[]).some((t) => t?.name === "skill_browser_navigate"),
						);
					}),
				{ timeout: 15_000 },
			)
			.toBe(true);
	});

	test("(B) 나이아의 열기 요청이 실제 브라우저 명령까지 간다", async ({ page }) => {
		await boot(page);
		await setCalls(page, [
			{ tool: "skill_browser_navigate", args: { url: "https://example.com/products" } },
		]);
		await say(page, "제품 페이지 열어줘");

		await expect
			.poll(async () => (await wvCalls(page)).filter((c) => c.cmd === "browser_wv_navigate").length, {
				timeout: 15_000,
			})
			.toBeGreaterThan(0);
		const nav = (await wvCalls(page)).find((c) => c.cmd === "browser_wv_navigate");
		expect(JSON.stringify(nav?.args)).toContain("example.com/products");
	});

	test("(C) 조작은 스냅샷의 참조로 한다 — 좌표로 찍지 않는다", async ({ page }) => {
		await boot(page);
		await setCalls(page, [
			{ tool: "skill_browser_snapshot", args: {} },
			{ tool: "skill_browser_click", args: { ref: "@e2" } },
		]);
		await say(page, "로그인 버튼 눌러줘");

		await expect
			.poll(async () => (await wvCalls(page)).filter((c) => c.cmd === "browser_wv_click").length, {
				timeout: 15_000,
			})
			.toBeGreaterThan(0);

		const calls = await wvCalls(page);
		const click = calls.find((c) => c.cmd === "browser_wv_click");
		// 참조가 그대로 실려 나간다.
		expect(JSON.stringify(click?.args)).toContain("@e2");
		// 조작 명령에는 좌표가 실리지 않는다. 창 크기 조정 같은 배치 명령은 좌표를 쓰는 것이
		// 당연하므로 대상에서 뺀다 — 문제는 "요소를 좌표로 찍느냐"다.
		const INTERACTION = ["browser_wv_click", "browser_wv_fill", "browser_wv_press"];
		const withCoords = calls
			.filter((c) => INTERACTION.includes(c.cmd))
			.filter((c) => Object.keys(c.args ?? {}).some((k) => k === "x" || k === "y"));
		expect(withCoords.map((c) => c.cmd), "요소를 좌표로 찍는 경로가 열려 있다").toEqual([]);
		// 그리고 조작이 실제로 일어났어야 이 단언이 공허하지 않다.
		expect(calls.filter((c) => INTERACTION.includes(c.cmd)).length).toBeGreaterThan(0);
	});

	test("(C2) 멈추라고 하면 중단 요청이 실제로 나간다 (UC-ENV-TOOL-CANCEL)", async ({ page }) => {
		// 취소의 브라우저 쪽 증거. 터미널 쪽은 살아 있는 Herdr 로 따로 확인한다.
		// 한 번의 이동이 후속 관측 명령을 여럿 내므로 "명령 수가 안 는다"로는 잴 수 없다 —
		// 재야 하는 것은 중단 신호가 실제로 나가느냐다.
		await boot(page);
		await page.evaluate(() => {
			(window as unknown as { __E2E_NO_FINISH__?: boolean }).__E2E_NO_FINISH__ = true;
		});
		await setCalls(page, [
			{ tool: "skill_browser_navigate", args: { url: "https://example.com/slow" } },
		]);
		await say(page, "저 페이지 열어줘");

		const cancelBtn = page.locator(".chat-cancel-btn");
		await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
		await cancelBtn.click();

		await expect
			.poll(
				async () =>
					page.evaluate(
						() =>
							(
								(window as unknown as { __E2E_CANCELLED__?: string[] }).__E2E_CANCELLED__ ?? []
							).length,
					),
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(0);
	});

	test("(D) 조작 전에 관측이 먼저 일어난다 — 무엇이 달라졌는지 말할 수 있게", async ({ page }) => {
		await boot(page);
		await setCalls(page, [
			{ tool: "skill_browser_snapshot", args: {} },
			{ tool: "skill_browser_click", args: { ref: "@e1" } },
			{ tool: "skill_browser_snapshot", args: {} },
		]);
		await say(page, "제품 소개 링크 눌러줘");

		await expect
			.poll(async () => (await wvCalls(page)).filter((c) => c.cmd === "browser_wv_snapshot").length, {
				timeout: 15_000,
			})
			.toBeGreaterThanOrEqual(2);

		const seq = (await wvCalls(page)).map((c) => c.cmd);
		const firstSnap = seq.indexOf("browser_wv_snapshot");
		const click = seq.indexOf("browser_wv_click");
		const lastSnap = seq.lastIndexOf("browser_wv_snapshot");
		expect(firstSnap, "조작 전 관측이 없다").toBeGreaterThanOrEqual(0);
		expect(click, "조작이 없다").toBeGreaterThan(firstSnap);
		expect(lastSnap, "조작 후 관측이 없다").toBeGreaterThan(click);
	});
});
