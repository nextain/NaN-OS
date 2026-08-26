import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * #502 실배선 — skill_environment 배선 가드 (실 UI, FR-ENV-LIVE.1·3·4).
 *
 * 왜 이 테스트가 필요한가: 관측·번역·전달은 단위 테스트가 초록불이어도 **배선이 빠지면**
 * 나이아가 작업 표면의 존재 자체를 모른다. 실제로 이 슬라이스는 계약·UC·FE·테스트와
 * Rust 명령 경계까지 다 있는데 프로덕션 호출자가 0이었다(2026-08-26 실측).
 * 그래서 세 배선을 실 UI 로 고정한다:
 *   (A) 부팅 시 App 이 skill_environment 를 agent 에 등록(app_skills 발신)
 *   (B) 부팅 관측이 대화 요청에 environmentSurfaces 세그먼트로 실린다
 *   (C) app_tool_call(skill_environment, focus) → ChatArea dispatch → 실제 herdr_* 명령 호출
 *       + 터미널 입력은 설정이 꺼져 있으면 명령이 나가지 않는다
 *
 * Tauri IPC 는 addInitScript 로 mock. herdr_snapshot 이 고정 pane 목록을 낸다.
 */

const NEW_CORE_FLAG =
	"window.__NAIA_NEW_CORE__ = true; window.__E2E_OUTBOUND__ = []; window.__E2E_HERDR__ = [];";

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

  // 살아 있는 Herdr 대역. 에이전트가 붙은 pane 하나 + 일반 터미널 하나.
  var SNAPSHOT = { panes: [
    { pane_id: "pane-agent-1", label: "빌더", agent: "codex", agent_status: "working", focused: true },
    { pane_id: "pane-term-1", terminal_title_stripped: "zsh — alpha-adk", focused: false }
  ] };

  window.__TAURI_INTERNALS__.invoke = async function (cmd, args) {
    if (cmd === "plugin:event|listen") {
      if (!eventListeners.has(args.event)) eventListeners.set(args.event, []);
      eventListeners.get(args.event).push(args.handler);
      return args.handler;
    }
    if (cmd === "plugin:event|emit") { emitEvent(args.event, args.payload); return null; }
    if (cmd === "plugin:event|unlisten") return;

    if (cmd === "herdr_snapshot") return SNAPSHOT;
    if (cmd && cmd.indexOf("herdr_") === 0) {
      window.__E2E_HERDR__.push({ cmd: cmd, args: args });
      return { ok: true };
    }

    if (cmd === "send_to_agent_command") {
      var payload = JSON.parse(args.message);
      window.__E2E_OUTBOUND__.push(payload);
      if (payload && payload.type === "chat_request") {
        var rid = payload.requestId;
        var call = window.__E2E_ENV_CALL__ || { action: "focus", surface: "s-1" };
        var chunks = [
          { type: "app_tool_call", requestId: rid, toolCallId: "tc-env-1", toolName: "skill_environment", args: call },
          { type: "finish", requestId: rid }
        ];
        var d = 150;
        for (var i = 0; i < chunks.length; i++) {
          (function (c, ms) { setTimeout(function () { emitEvent("agent_response", JSON.stringify(c)); }, ms); })(chunks[i], d);
          d += 200;
        }
      }
      return null;
    }
    if (cmd === "cancel_stream" || cmd === "send_approval_response") return null;
    return undefined;
  };
})();
`;

function configScript(cfg: Record<string, unknown>): string {
	return `localStorage.setItem("naia-config", ${JSON.stringify(JSON.stringify(cfg))});`;
}

const BASE_CONFIG = {
	provider: "gemini",
	model: "gemini-2.5-flash",
	apiKey: "e2e-mock-key",
	enableTools: true,
	locale: "ko",
	onboardingComplete: true,
};

async function boot(page: import("@playwright/test").Page, cfg: Record<string, unknown>) {
	await page.addInitScript(NEW_CORE_FLAG);
	await page.addInitScript(MOCK_SCRIPT);
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript({ content: configScript(cfg) });
	await page.goto("/");
	await expect(page.locator(".chat-app")).toBeVisible({ timeout: 10_000 });
}

/** 뇌 대역이 낼 도구 호출을 바꾼다. chat_request 전에 심어야 한다. */
async function setEnvCall(page: import("@playwright/test").Page, call: Record<string, unknown>) {
	await page.evaluate((c) => {
		(window as unknown as { __E2E_ENV_CALL__?: unknown }).__E2E_ENV_CALL__ = c;
	}, call);
}

async function herdrCalls(page: import("@playwright/test").Page) {
	return page.evaluate(
		() => (window as unknown as { __E2E_HERDR__?: unknown[] }).__E2E_HERDR__ ?? [],
	);
}

test.describe("#502 환경 스킬 배선 (FR-ENV-LIVE)", () => {
	test("(A) 부팅 시 skill_environment 가 agent 에 등록된다", async ({ page }) => {
		await boot(page, BASE_CONFIG);
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
								m?.appId === "environment" &&
								Array.isArray(m?.tools) &&
								(m.tools as { name?: string }[]).some((t) => t?.name === "skill_environment"),
						);
					}),
				{ timeout: 10_000 },
			)
			.toBe(true);
	});

	test("(B) 관측이 대화 요청에 environmentSurfaces 로 실린다", async ({ page }) => {
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("지금 뭐 돌고 있어?");
		await input.press("Enter");

		const segment = await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
								.__E2E_OUTBOUND__ ?? [];
						const chat = out.find((m) => m?.type === "chat_request");
						const segs = (chat?.environmentSegments ?? []) as { kind?: string }[];
						return segs.find((s) => s?.kind === "environmentSurfaces") ?? null;
					}),
				{ timeout: 10_000 },
			)
			.not.toBeNull()
			.then(() =>
				page.evaluate(() => {
					const out =
						(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
							.__E2E_OUTBOUND__ ?? [];
					const chat = out.find((m) => m?.type === "chat_request");
					const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
					return segs.find((s) => s?.kind === "environmentSurfaces") as Record<string, unknown>;
				}),
			);

		const surfaces = segment.surfaces as { ref: string; label: string }[];
		expect(surfaces.length).toBe(2);
		expect(surfaces.map((s) => s.label)).toContain("빌더");
		// pane 어휘는 뇌에 올라가지 않는다.
		expect(JSON.stringify(segment)).not.toContain("pane-agent-1");
	});

	test("(C) app_tool_call(focus) 이 실제 herdr 명령까지 간다", async ({ page }) => {
		await boot(page, BASE_CONFIG);
		// 부팅 관측이 발행한 손잡이를 실제 요청에서 읽어 쓴다 — 손잡이를 지어내지 않는다.
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("첫 관측");
		await input.press("Enter");
		const token = await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
								.__E2E_OUTBOUND__ ?? [];
						const chat = out.find((m) => m?.type === "chat_request");
						const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
						const seg = segs.find((s) => s?.kind === "environmentSurfaces");
						const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
						return surfaces.find((s) => s.label === "빌더")?.ref ?? null;
					}),
				{ timeout: 10_000 },
			)
			.not.toBeNull()
			.then(() =>
				page.evaluate(() => {
					const out =
						(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
							.__E2E_OUTBOUND__ ?? [];
					const chat = out.find((m) => m?.type === "chat_request");
					const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
					const seg = segs.find((s) => s?.kind === "environmentSurfaces");
					const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
					return surfaces.find((s) => s.label === "빌더")?.ref as string;
				}),
			);

		await setEnvCall(page, { action: "focus", surface: token });
		await input.fill("저 빌더 앞으로 가져와");
		await input.press("Enter");

		// 부팅 때 이미 herdr 호출이 몇 건 쌓여 있으므로 총 개수로 기다리면 즉시 통과한다.
		// 기다려야 하는 것은 focus 그 자체다.
		await expect
			.poll(
				async () =>
					((await herdrCalls(page)) as { cmd: string }[]).filter(
						(c) => c.cmd === "herdr_focus_agent",
					).length,
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(0);
		const calls = (await herdrCalls(page)) as { cmd: string; args: Record<string, unknown> }[];
		const focus = calls.find((c) => c.cmd === "herdr_focus_agent");
		expect(focus, `herdr_focus_agent 가 안 나갔다. 실제: ${JSON.stringify(calls)}`).toBeDefined();
		expect(focus?.args?.paneId).toBe("pane-agent-1");
	});

	test("(D) 터미널 입력이 꺼져 있으면 명령이 나가지 않는다 (FR-ENV-LIVE.4)", async ({ page }) => {
		await boot(page, BASE_CONFIG); // environmentTerminalInput 미설정 = 꺼짐
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("첫 관측");
		await input.press("Enter");
		const token = await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
								.__E2E_OUTBOUND__ ?? [];
						const chat = out.find((m) => m?.type === "chat_request");
						const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
						const seg = segs.find((s) => s?.kind === "environmentSurfaces");
						const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
						return surfaces.find((s) => s.label !== "빌더")?.ref ?? null;
					}),
				{ timeout: 10_000 },
			)
			.not.toBeNull()
			.then(() =>
				page.evaluate(() => {
					const out =
						(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
							.__E2E_OUTBOUND__ ?? [];
					const chat = out.find((m) => m?.type === "chat_request");
					const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
					const seg = segs.find((s) => s?.kind === "environmentSurfaces");
					const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
					return surfaces.find((s) => s.label !== "빌더")?.ref as string;
				}),
			);

		await setEnvCall(page, { action: "run", surface: token, request: "ls" });
		await input.fill("저기서 ls 실행해");
		await input.press("Enter");

		// 도구 결과가 돌아올 시간을 준 뒤에도 herdr_run_pane 이 없어야 한다.
		await page.waitForTimeout(2_000);
		const calls = (await herdrCalls(page)) as { cmd: string }[];
		expect(
			calls.filter((c) => c.cmd === "herdr_run_pane"),
			`권한이 꺼져 있는데 명령이 나갔다: ${JSON.stringify(calls)}`,
		).toHaveLength(0);
	});

	test("(E) 터미널 입력을 켜면 같은 요청이 실제로 나간다", async ({ page }) => {
		// (D) 의 거절이 권한 때문임을 증명한다 — 다른 이유로 막힌 것을 권한으로 오해하지 않게.
		await boot(page, { ...BASE_CONFIG, environmentTerminalInput: true });
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("첫 관측");
		await input.press("Enter");
		const token = await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
								.__E2E_OUTBOUND__ ?? [];
						const chat = out.find((m) => m?.type === "chat_request");
						const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
						const seg = segs.find((s) => s?.kind === "environmentSurfaces");
						const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
						return surfaces.find((s) => s.label !== "빌더")?.ref ?? null;
					}),
				{ timeout: 10_000 },
			)
			.not.toBeNull()
			.then(() =>
				page.evaluate(() => {
					const out =
						(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
							.__E2E_OUTBOUND__ ?? [];
					const chat = out.find((m) => m?.type === "chat_request");
					const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
					const seg = segs.find((s) => s?.kind === "environmentSurfaces");
					const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
					return surfaces.find((s) => s.label !== "빌더")?.ref as string;
				}),
			);

		await setEnvCall(page, { action: "run", surface: token, request: "ls" });
		await input.fill("저기서 ls 실행해");
		await input.press("Enter");

		await expect
			.poll(
				async () =>
					((await herdrCalls(page)) as { cmd: string }[]).filter(
						(c) => c.cmd === "herdr_run_pane",
					).length,
				{ timeout: 10_000 },
			)
			.toBe(1);
		const run = ((await herdrCalls(page)) as { cmd: string; args: Record<string, unknown> }[]).find(
			(c) => c.cmd === "herdr_run_pane",
		);
		expect(run?.args?.command).toBe("ls");
		expect(run?.args?.paneId).toBe("pane-term-1");
	});
});
