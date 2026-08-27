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
 *   (B) 부팅 관측이 대화 요청에 environmentSurfaces 세그먼트로 실린다 — 다만 기본값에서는
 *       개수만 실리고, 나이아가 watch 로 지켜보기로 정한 뒤에야 목록이 붙는다
 *       (FR-ENV-ATTENTION.1~3). 목록을 늘 싣는 것은 요청마다 토큰과 터미널 이름을 치른다.
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

    if (cmd === "herdr_snapshot") { window.__E2E_HERDR__.push({ cmd: cmd, args: args }); return SNAPSHOT; }
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

/** 마지막 chat_request 에 실린 environmentSurfaces 세그먼트. 없으면 null. */
async function surfacesSegment(page: import("@playwright/test").Page) {
	return page.evaluate(() => {
		const out =
			(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [];
		const chats = out.filter((m) => m?.type === "chat_request");
		const chat = chats[chats.length - 1];
		const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
		return (segs.find((x) => x?.kind === "environmentSurfaces") as Record<string, unknown>) ?? null;
	});
}

/**
 * 나이아가 실제로 하는 순서 그대로 손잡이를 얻는다: watch 를 부르고, 다음 요청에 실린
 * 목록에서 읽는다. 지켜보지 않는 동안에는 손잡이가 아예 나가지 않으므로 (FR-ENV-ATTENTION.3)
 * 이 경로 말고 손잡이를 얻을 방법이 없다 — 지어내면 거절된다.
 */
async function watchThenToken(
	page: import("@playwright/test").Page,
	input: ReturnType<import("@playwright/test").Page["locator"]>,
	pick: (label: string) => boolean,
): Promise<string> {
	await setEnvCall(page, { action: "watch" });
	await input.fill("지금 뭐 하고 있는지 좀 봐줘");
	await input.press("Enter");
	// watch 도구 호출이 실제로 처리될 때까지 기다린 뒤 두 번째 요청을 보낸다.
	await page.waitForTimeout(1_500);
	await input.fill("계속 봐줘");
	await input.press("Enter");

	await expect
		.poll(
			async () => {
				const seg = await surfacesSegment(page);
				const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
				return surfaces.find((x) => pick(x.label))?.ref ?? null;
			},
			{ timeout: 10_000 },
		)
		.not.toBeNull();

	const seg = await surfacesSegment(page);
	const surfaces = (seg?.surfaces ?? []) as { ref: string; label: string }[];
	return surfaces.find((x) => pick(x.label))?.ref as string;
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

	test("(A2) 앱을 전환해도 환경 도구가 해제되지 않는다", async ({ page }) => {
		// 화면 앱은 전환 시 app_skills_clear 대상이다. 환경은 화면 앱이 아니라 상시 표면이라
		// 대상이 아니어야 하는데, 그동안 주석으로만 단언돼 있었다. 지워지면 나이아가
		// 첫 앱 전환 이후로 작업 표면을 조용히 못 보게 된다.
		await boot(page, BASE_CONFIG);
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
								.__E2E_OUTBOUND__ ?? [];
						return out.some((m) => m?.type === "app_skills" && m?.appId === "environment");
					}),
				{ timeout: 10_000 },
			)
			.toBe(true);

		const before = await page.evaluate(
			() =>
				(
					(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
						.__E2E_OUTBOUND__ ?? []
				).length,
		);

		// 앱 전환을 실제로 일으킨다. 레일 버튼을 차례로 눌러 활성 앱이 바뀌게 한다.
		const rails = page.locator("[data-app-id]");
		const count = await rails.count();
		for (let i = 0; i < Math.min(count, 4); i += 1) {
			await rails.nth(i).click({ timeout: 2_000 }).catch(() => {});
			await page.waitForTimeout(400);
		}
		await page.waitForTimeout(1_000);

		const after = await page.evaluate(() => {
			const out =
				(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
					.__E2E_OUTBOUND__ ?? [];
			return {
				total: out.length,
				clearedEnv: out.filter(
					(m) => m?.type === "app_skills_clear" && m?.appId === "environment",
				).length,
				anySwitchTraffic: out.filter(
					(m) => m?.type === "app_skills_clear" || m?.type === "app_skills",
				).length,
			};
		});

		// 전환이 실제로 일어나지 않았으면 아래 단언은 아무것도 증명하지 못한다.
		expect(
			after.total > before || after.anySwitchTraffic > 1,
			`앱 전환이 실제로 일어나지 않았다 — 이 단언은 공허하다. 레일 버튼 ${count}개`,
		).toBe(true);
		expect(after.clearedEnv, "환경 도구가 앱 전환에서 해제됐다").toBe(0);
	});

	test("(B) 지켜보지 않는 동안에는 개수만 실린다 (FR-ENV-ATTENTION.3)", async ({ page }) => {
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("지금 뭐 돌고 있어?");
		await input.press("Enter");

		await expect.poll(async () => await surfacesSegment(page), { timeout: 10_000 }).not.toBeNull();
		const segment = (await surfacesSegment(page)) as Record<string, unknown>;

		// 볼 것이 있다는 사실은 나이아에게 간다 — 그래야 스스로 부를 수 있다.
		expect(segment.omitted).toBe(2);
		// 그러나 이름도 손잡이도 가지 않는다. 이것이 늘 싣지 않는 이유다.
		expect(segment.surfaces).toEqual([]);
		expect(JSON.stringify(segment)).not.toContain("빌더");
		expect(JSON.stringify(segment)).not.toContain("alpha-adk");
		expect(JSON.stringify(segment)).not.toContain("pane-agent-1");
	});

	test("(B2) 나이아가 watch 를 부르면 다음 요청부터 목록이 실린다 (FR-ENV-ATTENTION.1)", async ({
		page,
	}) => {
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		await setEnvCall(page, { action: "watch" });
		await input.fill("내 작업 좀 따라와줘");
		await input.press("Enter");
		await page.waitForTimeout(1_500);
		await input.fill("어떻게 돼가?");
		await input.press("Enter");

		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? 0,
				{ timeout: 10_000 },
			)
			.toBe(2);
		const segment = (await surfacesSegment(page)) as Record<string, unknown>;
		const surfaces = segment.surfaces as { ref: string; label: string }[];
		expect(surfaces.map((x) => x.label)).toContain("빌더");
		// pane 어휘는 지켜보는 동안에도 뇌에 올라가지 않는다.
		expect(JSON.stringify(segment)).not.toContain("pane-agent-1");
	});

	test("(B3) unwatch 를 부르면 다시 개수만 실린다 (FR-ENV-ATTENTION.2)", async ({ page }) => {
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		await setEnvCall(page, { action: "watch" });
		await input.fill("따라와줘");
		await input.press("Enter");
		await page.waitForTimeout(1_500);

		await setEnvCall(page, { action: "unwatch" });
		await input.fill("이제 됐어");
		await input.press("Enter");
		await page.waitForTimeout(1_500);

		await input.fill("다른 얘기 하자");
		await input.press("Enter");
		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? -1,
				{ timeout: 10_000 },
			)
			.toBe(0);
		const segment = (await surfacesSegment(page)) as Record<string, unknown>;
		expect(segment.omitted, "그만 보라고 했는데 개수까지 사라졌다").toBe(2);
		expect(JSON.stringify(segment)).not.toContain("빌더");
	});

	test("(B4) 사용자가 always 로 두면 지켜보기 없이도 목록이 실린다 (FR-ENV-ATTENTION.4)", async ({
		page,
	}) => {
		await boot(page, { ...BASE_CONFIG, environmentAwareness: "always" });
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("지금 뭐 돌고 있어?");
		await input.press("Enter");

		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? 0,
				{ timeout: 10_000 },
			)
			.toBe(2);
	});

	test("(B5) 사용자가 off 로 두면 도구도 세그먼트도 없다 (FR-ENV-ATTENTION.4)", async ({ page }) => {
		await boot(page, { ...BASE_CONFIG, environmentAwareness: "off" });
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("지금 뭐 돌고 있어?");
		await input.press("Enter");

		// 요청은 실제로 나갔는데(단언이 공허하지 않다) 그 안에 표면 세그먼트가 없다.
		await expect
			.poll(
				async () =>
					page.evaluate(
						() =>
							(
								(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] })
									.__E2E_OUTBOUND__ ?? []
							).filter((m) => m?.type === "chat_request").length,
					),
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(0);
		expect(await surfacesSegment(page)).toBeNull();

		// 도구 자체가 등록되지 않는다 — 껐다는 말은 값도 안 든다는 뜻이어야 한다.
		const registered = await page.evaluate(
			() =>
				(
					(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ??
					[]
				).filter((m) => m?.type === "app_skills" && m?.appId === "environment").length,
		);
		expect(registered, "꺼 두었는데 환경 도구가 등록됐다").toBe(0);

		// 도구 호출이 억지로 들어와도 환경 명령은 나가지 않는다.
		// ⚠️ herdr_snapshot 개수로는 이것을 볼 수 없다 — 워크스페이스 앱이 사용자 자기 터미널을
		//    그리려고 같은 명령을 부른다. 끄는 것은 "나이아의 환경 인지"이지 사용자의 터미널이
		//    아니므로, 그 호출이 남아 있는 것이 정상이다.
		await setEnvCall(page, { action: "focus", surface: "s-1" });
		await input.fill("빌더 앞으로 가져와");
		await input.press("Enter");
		await page.waitForTimeout(2_000);
		const calls = (await herdrCalls(page)) as { cmd: string }[];
		expect(
			calls.filter((c) => c.cmd.startsWith("herdr_focus") || c.cmd === "herdr_run_pane"),
			`꺼 두었는데 환경 명령이 나갔다: ${JSON.stringify(calls)}`,
		).toHaveLength(0);
	});

	test("(C) app_tool_call(focus) 이 실제 herdr 명령까지 간다", async ({ page }) => {
		await boot(page, BASE_CONFIG);
		// 나이아가 실제로 하는 순서대로 손잡이를 얻는다 — 지켜보기 전에는 손잡이가 안 나간다.
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		const token = await watchThenToken(page, input, (label) => label === "빌더");

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
		const token = await watchThenToken(page, input, (label) => label !== "빌더");

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
		const token = await watchThenToken(page, input, (label) => label !== "빌더");

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
