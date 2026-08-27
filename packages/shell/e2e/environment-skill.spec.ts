import { expect, test } from "@playwright/test";
import { WATCH_TURN_BUDGET } from "@nextain/naia-os-core/composition";
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
  window.__E2E_SNAPSHOT__ = { panes: [
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

    if (cmd === "herdr_snapshot") {
      window.__E2E_HERDR__.push({ cmd: cmd, args: args });
      if (window.__E2E_SNAPSHOT_FAIL__) throw new Error("herdr is not running");
      return window.__E2E_SNAPSHOT__;
    }
    if (cmd && cmd.indexOf("herdr_") === 0) {
      window.__E2E_HERDR__.push({ cmd: cmd, args: args });
      return { ok: true };
    }

    if (cmd === "send_to_agent_command") {
      var payload = JSON.parse(args.message);
      window.__E2E_OUTBOUND__.push(payload);
      if (payload && (payload.type === "app_skills" || payload.type === "app_skills_clear") && payload.requestId) {
        // Rust 가 gRPC 결과를 app_skills_result 로 돌려주는 흐름 (FR-ENV-ATTENTION.16).
        var arid = payload.requestId;
        var deny = window.__E2E_SKILLS_DENY__ === true;
        // 확인이 늦게 오는 상황을 만들 수 있어야, "해제 결과를 반영했는가"만 격리해 잴 수 있다.
        var delay = window.__E2E_SKILLS_ACK_DELAY__ || 10;
        setTimeout(function () {
          emitEvent("agent_response", JSON.stringify({ type: "app_skills_result", requestId: arid, ok: !deny }));
        }, delay);
      }
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

	test("(B6) 매 턴 관측을 갱신한다 — 부팅 스냅샷으로 답하지 않는다 (FR-ENV-ATTENTION.5)", async ({
		page,
	}) => {
		// 이것이 없으면 나이아는 "지금 뭐 돌고 있어"에 앱을 켠 시점의 목록으로 답한다.
		// 지켜보는 동안에는 더 나쁘다 — 계속 보고 있다고 말해 놓고 옛것을 보여 주는 셈이다.
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		await setEnvCall(page, { action: "watch" });
		await input.fill("따라와줘");
		await input.press("Enter");
		await page.waitForTimeout(1_500);

		// 부팅 뒤에 터미널 하나가 새로 열렸다.
		await page.evaluate(() => {
			(window as unknown as { __E2E_SNAPSHOT__: { panes: unknown[] } }).__E2E_SNAPSHOT__ = {
				panes: [
					{ pane_id: "pane-agent-1", label: "빌더", agent: "codex", agent_status: "working", focused: true },
					{ pane_id: "pane-term-1", terminal_title_stripped: "zsh — alpha-adk", focused: false },
					{ pane_id: "pane-term-2", terminal_title_stripped: "방금 연 터미널", focused: false },
				],
			};
		});

		await input.fill("지금은 어때?");
		await input.press("Enter");
		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? 0,
				{ timeout: 10_000 },
			)
			.toBe(3);
		const seg = (await surfacesSegment(page)) as Record<string, unknown>;
		const labels = (seg.surfaces as { label: string }[]).map((x) => x.label);
		expect(labels, "새로 연 터미널이 안 실렸다 — 옛 관측을 그대로 쓰고 있다").toContain(
			"방금 연 터미널",
		);
	});

	test("(B7) 지켜보지 않는 동안에도 개수가 최신이다 (FR-ENV-ATTENTION.5)", async ({ page }) => {
		// 개수가 틀리면 나이아가 부를 이유 자체를 잘못 판단한다.
		//
		// ⚠️ 뇌 대역이 내는 도구 호출을 unwatch 로 둔다. observe·focus·run·watch 는 실행기
		//    안에서 관측을 갱신하므로, 그것들을 쓰면 이 테스트가 "매 턴 갱신"이 아니라
		//    "도구 호출 갱신"을 재게 된다(2026-08-27 변이 탐침에서 실제로 그랬다).
		//    unwatch 만이 환경을 건드리지 않는다.
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await setEnvCall(page, { action: "unwatch" });
		await input.fill("첫 턴");
		await input.press("Enter");
		await expect.poll(async () => (await surfacesSegment(page))?.omitted ?? 0, { timeout: 10_000 }).toBe(2);

		await page.evaluate(() => {
			(window as unknown as { __E2E_SNAPSHOT__: { panes: unknown[] } }).__E2E_SNAPSHOT__ = {
				panes: [{ pane_id: "pane-agent-1", label: "빌더", agent: "codex", focused: true }],
			};
		});
		await input.fill("둘째 턴");
		await input.press("Enter");
		await expect
			.poll(async () => (await surfacesSegment(page))?.omitted ?? -1, { timeout: 10_000 })
			.toBe(1);
	});

	test("(B8) Herdr 이 죽으면 옛 목록을 계속 싣지 않는다 (FR-ENV-ATTENTION.6)", async ({ page }) => {
		// 성공→성공 전이만 재면 이 실패 양식을 못 잡는다(8차 적대리뷰 지적).
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		await setEnvCall(page, { action: "watch" });
		await input.fill("따라와줘");
		await input.press("Enter");
		await page.waitForTimeout(1_500);
		await input.fill("계속 봐줘");
		await input.press("Enter");
		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? 0,
				{ timeout: 10_000 },
			)
			.toBe(2);

		// Herdr 이 죽었다.
		await page.evaluate(() => {
			(window as unknown as { __E2E_SNAPSHOT_FAIL__?: boolean }).__E2E_SNAPSHOT_FAIL__ = true;
		});
		await setEnvCall(page, { action: "unwatch" }); // 관측을 부르지 않는 동작으로 둔다
		await input.fill("지금은?");
		await input.press("Enter");
		await expect.poll(async () => await surfacesSegment(page), { timeout: 10_000 }).toBeNull();

		// 마지막으로 본 이름이 어디에도 남지 않는다.
		const last = await page.evaluate(() => {
			const out = (window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [];
			const chats = out.filter((m) => m?.type === "chat_request");
			return JSON.stringify(chats[chats.length - 1]?.environmentSegments ?? []);
		});
		expect(last, "환경이 끊겼는데 옛 터미널 이름이 실렸다").not.toContain("빌더");
	});

	test("(B9) 나이아가 끄지 않아도 지켜보기가 저절로 풀린다 (FR-ENV-ATTENTION.7)", async ({
		page,
	}) => {
		// 모델이 unwatch 를 부르리라고 기대하는 것으로는 비용도 노출도 보장되지 않는다.
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		await setEnvCall(page, { action: "watch" });
		await input.fill("따라와줘");
		await input.press("Enter");
		await page.waitForTimeout(1_500);

		// 이후로는 환경을 건드리지 않는 동작만 낸다 — 예산만 흘러간다.
		await setEnvCall(page, { action: "unwatch2" }); // 모르는 동작 = 거절, 관측 미갱신
		let sawList = 0;
		for (let i = 0; i < WATCH_TURN_BUDGET + 2; i += 1) {
			await input.fill(`턴 ${i}`);
			await input.press("Enter");
			await page.waitForTimeout(700);
			const seg = await surfacesSegment(page);
			if (((seg?.surfaces as unknown[] | undefined)?.length ?? 0) > 0) sawList += 1;
		}
		expect(sawList, "목록이 한 번도 안 실렸다면 이 단언은 공허하다").toBeGreaterThan(0);
		const finalSeg = await surfacesSegment(page);
		expect(
			(finalSeg?.surfaces as unknown[] | undefined)?.length ?? -1,
			"예산을 다 썼는데 목록이 계속 실린다",
		).toBe(0);
	});

	test("(B10) 숨긴 것과 잘린 것을 구별해 보낸다 (FR-ENV-ATTENTION.8)", async ({ page }) => {
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("첫 턴");
		await input.press("Enter");
		await expect.poll(async () => await surfacesSegment(page), { timeout: 10_000 }).not.toBeNull();
		expect((await surfacesSegment(page))?.listWithheld, "숨긴 것인데 표시가 없다").toBe(true);

		await setEnvCall(page, { action: "watch" });
		await input.fill("보여줘");
		await input.press("Enter");
		await page.waitForTimeout(1_500);
		await input.fill("어때?");
		await input.press("Enter");
		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? 0,
				{ timeout: 10_000 },
			)
			.toBe(2);
		expect(
			(await surfacesSegment(page))?.listWithheld,
			"다 보여 주면서 숨겼다고 표시했다",
		).not.toBe(true);
	});

	test("(B11) 설정에서 끄면 같은 세션에서 바로 멈춘다 (FR-ENV-ATTENTION.4)", async ({ page }) => {
		// 서로 다른 초기 설정으로 앱을 새로 부팅해 비교하면, 실행 중 변경이 안 먹는 결함을
		// 가린다(8차 적대리뷰 지적). 한 세션 안에서 사용자가 실제로 바꾸는 흐름을 잰다.
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("첫 턴");
		await input.press("Enter");
		await expect.poll(async () => await surfacesSegment(page), { timeout: 10_000 }).not.toBeNull();

		// 사용자가 설정 화면에서 직접 끈다.
		await page.getByRole("button", { name: /^(Settings|설정)$/ }).click();
		await page.locator('[data-settings-tab="brain"]').click();
		const selector = page.locator("#environment-awareness");
		await expect(selector, "설정 화면에 작업 표면 인지 항목이 없다").toBeVisible({ timeout: 5_000 });
		await selector.selectOption("off");

		// 도구가 해제된다 — 재부팅을 기다리지 않는다.
		await expect
			.poll(
				async () =>
					page.evaluate(
						() =>
							((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
								.filter((m) => m?.type === "app_skills_clear" && m?.appId === "environment").length,
					),
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(0);

		// 그리고 다음 요청부터 표면이 실리지 않는다.
		const before = await page.evaluate(
			() =>
				((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
					.filter((m) => m?.type === "chat_request").length,
		);
		await page.getByRole("button", { name: /^(Settings|설정)$/ }).click();
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("끈 뒤 턴");
		await input.press("Enter");
		await expect
			.poll(
				async () =>
					page.evaluate(
						() =>
							((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
								.filter((m) => m?.type === "chat_request").length,
					),
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(before);
		expect(await surfacesSegment(page), "껐는데 표면이 계속 실린다").toBeNull();
	});

	test("(B12) always 를 쓰는 동안 잠복한 지켜보기가 소진되지 않는다 (FR-ENV-ATTENTION.7)", async ({
		page,
	}) => {
		// always 에서도 턴을 세면, 사용자가 auto 로 되돌릴 때 나이아가 끈 적 없는데
		// 목록이 사라진다 (2026-08-27 13차 적대리뷰 지적).
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		// auto 에서 나이아가 켠다.
		await setEnvCall(page, { action: "watch" });
		await input.fill("따라와줘");
		await input.press("Enter");
		await page.waitForTimeout(1_500);

		// 사용자가 always 로 바꾼 뒤 예산을 넘길 만큼 대화한다.
		await page.evaluate(() => {
			const raw = localStorage.getItem("naia-config");
			const cfg = raw ? JSON.parse(raw) : {};
			cfg.environmentAwareness = "always";
			localStorage.setItem("naia-config", JSON.stringify(cfg));
		});
		await setEnvCall(page, { action: "unknown_action" }); // 환경을 안 건드리는 호출
		for (let i = 0; i < WATCH_TURN_BUDGET + 3; i += 1) {
			await input.fill(`턴 ${i}`);
			await input.press("Enter");
			await page.waitForTimeout(500);
		}

		// 다시 auto 로 되돌린다.
		await page.evaluate(() => {
			const raw = localStorage.getItem("naia-config");
			const cfg = raw ? JSON.parse(raw) : {};
			cfg.environmentAwareness = "auto";
			localStorage.setItem("naia-config", JSON.stringify(cfg));
		});
		await input.fill("이제 어때?");
		await input.press("Enter");
		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? -1,
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(0);
	});

	test("(B13) 실제 대화 요청의 바이트로 절감을 잰다 (FR-ENV-ATTENTION.15)", async ({ page }) => {
		// 코어 세그먼트 객체의 JSON 크기를 재는 것은 재료를 재는 것이다. 사용자가 문제 삼은
		// 것은 요청마다 뇌로 가는 비용이므로, 실제로 나간 chat_request 에서 재야 한다
		// (2026-08-27 14차 적대리뷰 지적).
		await boot(page, { ...BASE_CONFIG, environmentAwareness: "always" });
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		// 표면을 12개로 늘려 의미 있는 크기를 만든다.
		await page.evaluate(() => {
			(window as unknown as { __E2E_SNAPSHOT__: { panes: unknown[] } }).__E2E_SNAPSHOT__ = {
				panes: Array.from({ length: 12 }, (_, i) => ({
					pane_id: `p${i}`,
					label: `사내-저장소-${i}-빌드-감시`,
					...(i % 2 === 0 ? { agent: "codex" } : {}),
					focused: i === 0,
				})),
			};
		});

		/** 마지막 chat_request 안에서 표면 세그먼트가 실제로 차지한 바이트. */
		const surfaceBytes = async () =>
			page.evaluate(() => {
				const out =
					(window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [];
				const chats = out.filter((m) => m?.type === "chat_request");
				const segs = (chats[chats.length - 1]?.environmentSegments ?? []) as Record<string, unknown>[];
				const seg = segs.find((x) => x?.kind === "environmentSurfaces");
				return seg ? new TextEncoder().encode(JSON.stringify(seg)).length : 0;
			});

		await setEnvCall(page, { action: "unknown_action" }); // 환경을 안 건드리는 호출
		await input.fill("늘 켬에서 한 턴");
		await input.press("Enter");
		await expect.poll(async () => await surfaceBytes(), { timeout: 10_000 }).toBeGreaterThan(1_000);
		const alwaysBytes = await surfaceBytes();

		// 같은 세션에서 auto 로 바꾼다. 지켜보기는 꺼져 있다.
		await page.evaluate(() => {
			const raw = localStorage.getItem("naia-config");
			const cfg = raw ? JSON.parse(raw) : {};
			cfg.environmentAwareness = "auto";
			localStorage.setItem("naia-config", JSON.stringify(cfg));
		});
		await input.fill("자동에서 한 턴");
		await input.press("Enter");
		await expect
			.poll(async () => await surfaceBytes(), { timeout: 10_000 })
			.toBeLessThan(alwaysBytes / 2);
		const autoBytes = await surfaceBytes();

		// 실측 근거: 표면 12개 기준 1187 → 77 바이트. 실제 wire 에서도 그 자리에 있어야 한다.
		expect(alwaysBytes, `목록 전송이 예상보다 작다: ${alwaysBytes}`).toBeGreaterThan(1_000);
		expect(autoBytes, `숨김 전송이 부풀었다: ${autoBytes}`).toBeLessThanOrEqual(100);
		expect(autoBytes, `숨김 세그먼트가 사라졌다: ${autoBytes}`).toBeGreaterThan(0);
	});

	test("(B14) 도구 등록이 전달되지 않으면 환경을 싣지 않는다 (FR-ENV-ATTENTION.16)", async ({
		page,
	}) => {
		// 등록이 안 갔는데 개수를 실으면, 안내가 "environment 도구를 불러라"라고 말한다 —
		// 나이아에게 없는 도구다. 못 하는 것을 하라고 시키는 셈이다
		// (2026-08-28 16차 적대리뷰 지적).
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });

		// 먼저 정상 상태를 확인한다 — 아래 단언이 공허하지 않게.
		await input.fill("정상 턴");
		await input.press("Enter");
		await expect.poll(async () => await surfacesSegment(page), { timeout: 10_000 }).not.toBeNull();

		// 이제 등록 전달이 실패한다(agent 재시작·연결 단절과 같은 상황).
		//
		// 뇌가 등록을 거절한다 — 큐잉은 되지만 gRPC 가 실패하는 상황이다.
		// 이것이 실제 실패 양식이다. 큐잉만 막는 것으로는 17차 적대리뷰가 짚은
		// "예약됨을 전달됨으로 읽는" 문제를 재지 못한다.
		//
		// ⚠️ 셸은 확인을 기다리지 않는다(기다리면 확인이 없을 때 모든 대화가 시간초과만큼
		//    멈춘다 — 실제로 그렇게 만들어 12건이 깨졌다). 그래서 거절이 반영되기까지 한
		//    턴이 걸린다. 알고 감수한 한계이고 요구사항에도 적어 두었다. 그 턴을 흘려보낸다.
		await page.evaluate(() => {
			(window as unknown as { __E2E_SKILLS_DENY__?: boolean }).__E2E_SKILLS_DENY__ = true;
		});
		await input.fill("거절이 반영되는 턴");
		await input.press("Enter");
		await page.waitForTimeout(1_200);
		const before = await page.evaluate(
			() =>
				((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
					.filter((m) => m?.type === "chat_request").length,
		);
		await input.fill("등록 실패 턴");
		await input.press("Enter");

		// 대화는 그대로 나간다 — 환경 실패가 대화를 막지 않는다.
		await expect
			.poll(
				async () =>
					page.evaluate(
						() =>
							((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
								.filter((m) => m?.type === "chat_request").length,
					),
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(before);
		// 그런데 표면은 실리지 않는다.
		expect(
			await surfacesSegment(page),
			"도구가 없는데 표면을 실어 없는 도구를 부르라고 안내했다",
		).toBeNull();
	});

	test("(B15) 껐다 다시 켠 뒤 등록이 실패하면 첫 턴부터 표면이 안 실린다 (FR-ENV-ATTENTION.17)", async ({
		page,
	}) => {
		// 해제 결과를 상태에 반영하지 않으면, 다시 켰을 때 낡은 참으로 첫 턴에 표면을
		// 실어 보낸다 (2026-08-28 18차 적대리뷰 지적).
		await boot(page, BASE_CONFIG);
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("정상 턴");
		await input.press("Enter");
		await expect.poll(async () => await surfacesSegment(page), { timeout: 10_000 }).not.toBeNull();

		// 사용자가 끈다 (해제는 성공한다).
		await page.getByRole("button", { name: /^(Settings|설정)$/ }).click();
		await page.locator('[data-settings-tab="brain"]').click();
		const selector = page.locator("#environment-awareness");
		await expect(selector).toBeVisible({ timeout: 5_000 });
		await selector.selectOption("off");
		await page.waitForTimeout(600);

		// 다시 켜는데, 이번에는 뇌가 등록을 거절하고 그 확인이 늦게 온다.
		//
		// ⚠️ 확인이 빨리 오면 다시 켜는 경로가 스스로 false 로 만들어, 해제 결과를 버렸는지
		//    아닌지를 구별할 수 없다 — 실제로 그렇게 공허했다(2026-08-28 변이 탐침).
		//    확인을 늦추면 첫 턴은 오직 "해제 결과가 반영됐는가"에만 달린다.
		await page.evaluate(() => {
			const w = window as unknown as { __E2E_SKILLS_DENY__?: boolean; __E2E_SKILLS_ACK_DELAY__?: number };
			w.__E2E_SKILLS_DENY__ = true;
			w.__E2E_SKILLS_ACK_DELAY__ = 5_000;
		});
		await selector.selectOption("auto");
		await page.waitForTimeout(600);
		await page.getByRole("button", { name: /^(Settings|설정)$/ }).click();

		const before = await page.evaluate(
			() =>
				((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
					.filter((m) => m?.type === "chat_request").length,
		);
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("다시 켠 뒤 첫 턴");
		await input.press("Enter");
		await expect
			.poll(
				async () =>
					page.evaluate(
						() =>
							((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
								.filter((m) => m?.type === "chat_request").length,
					),
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(before);
		expect(
			await surfacesSegment(page),
			"해제 결과를 버려 낡은 참으로 첫 턴에 표면을 실었다",
		).toBeNull();
	});

	test("(B16) 도구 사용이 꺼져 있으면 표면을 싣지 않는다 (FR-ENV-ATTENTION.19)", async ({
		page,
	}) => {
		// 개수만 보내는 안내는 "필요하면 도구를 불러라"라고 말한다. 그런데 전역 도구가
		// 꺼져 있으면 나이아는 부를 수 없다 — 닫힌 길을 가리키는 셈이다
		// (2026-08-28 19차 적대리뷰 지적).
		await boot(page, { ...BASE_CONFIG, enableTools: false });
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("도구 꺼진 턴");
		await input.press("Enter");

		// 요청은 실제로 나간다 — 단언이 공허하지 않다.
		await expect
			.poll(
				async () =>
					page.evaluate(
						() =>
							((window as unknown as { __E2E_OUTBOUND__?: Record<string, unknown>[] }).__E2E_OUTBOUND__ ?? [])
								.filter((m) => m?.type === "chat_request").length,
					),
				{ timeout: 10_000 },
			)
			.toBeGreaterThan(0);
		expect(
			await surfacesSegment(page),
			"도구를 부를 수 없는데 표면을 실어 부르라고 안내했다",
		).toBeNull();
	});

	test("(B17) 도구가 꺼져 있어도 always 는 목록을 보낸다 — 사용자 정책이 이긴다 (FR-ENV-ATTENTION.20)", async ({
		page,
	}) => {
		// 막아야 하는 것은 "개수만 보내고 도구를 부르라고 안내하는 것"이다. 목록 자체는
		// 도구 없이도 쓸모가 있다 — 나이아가 무엇이 돌고 있는지 말해 줄 수는 있다.
		// 두 규칙(사용자 정책 우선 / 도구 꺼짐)이 충돌하는 조합을 여기서 정한다
		// (2026-08-28 21차 적대리뷰 지적).
		await boot(page, { ...BASE_CONFIG, enableTools: false, environmentAwareness: "always" });
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("도구는 껐지만 늘 보내기");
		await input.press("Enter");

		await expect
			.poll(
				async () => ((await surfacesSegment(page))?.surfaces as unknown[] | undefined)?.length ?? 0,
				{ timeout: 10_000 },
			)
			.toBe(2);
		// 그리고 이때는 "숨겼다"는 표시가 붙지 않는다 — 실제로 다 보냈으니까.
		expect((await surfacesSegment(page))?.listWithheld).not.toBe(true);
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
