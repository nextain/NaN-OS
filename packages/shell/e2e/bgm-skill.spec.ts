import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * UC8 / FR-BGM.1 — skill_youtube_bgm 배선 회귀 가드 (실 UI, 새 core).
 *
 * 왜 이 테스트가 필요한가(회귀 방지 앵커):
 *  - 구 monolith 의 BGM 스킬이 new-core 이식에서 **도구 등록 배선만 누락**됐다 —
 *    위젯(BgmPlayer)·검색 사이드카(:18791)·agent UC8 어댑터는 전부 존재했으나
 *    나이아가 BGM 존재 자체를 몰랐다. 단위테스트(executeBgmSkill)는 초록불이어도
 *    **배선이 빠지면** 회귀를 못 잡는다 → 그 두 배선을 실 UI 로 고정한다:
 *      (A) 부팅 시 App 이 skill_youtube_bgm 을 agent 에 등록(panel_skills 발신)
 *      (B) 채팅 턴 중 agent 가 panel_tool_call(skill_youtube_bgm) 을 내면
 *          ChatArea 가 dispatch → 위젯이 실제로 재생 상태로 전환(.bgm-icon--playing)
 *
 * 환경: 실제 vite dev(localhost:1420). Tauri IPC 는 addInitScript 로 mock(React 마운트 전).
 *  - 데모와 동일하게 새 core(__NAIA_NEW_CORE__=true).
 *  - send_to_agent_command payload 를 __E2E_OUTBOUND__ 에 기록(부팅 panel_skills 캡처).
 *  - chat_request 수신 시 agent 대역으로 panel_tool_call(skill_youtube_bgm, play+videoId — 사이드카 불요)
 *    + finish 를 agent_response 로 emit. dispatch → executeBgmSkill → bgm_youtube_play 이벤트 → 위젯 반응.
 */

const NEW_CORE_FLAG = `window.__NAIA_NEW_CORE__ = true; window.__E2E_OUTBOUND__ = [];`;

// play+videoId 경로 = 사이드카(:18791) 미접촉(검색 skip) → 헤르메틱.
const BGM_TOOL_ARGS = [
	{ action: "play", videoId: "e2evid001", title: "E2E First Track" },
	{ action: "play", videoId: "e2evid001", title: "E2E Same Track Replay" },
];

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
  window.__NAIA_E2E__ = {
    emitEvent: emitEvent,
  };

  window.__TAURI_INTERNALS__.invoke = async function (cmd, args) {
    if (cmd === "plugin:event|listen") {
      if (!eventListeners.has(args.event)) eventListeners.set(args.event, []);
      eventListeners.get(args.event).push(args.handler);
      return args.handler;
    }
    if (cmd === "plugin:event|emit") { emitEvent(args.event, args.payload); return null; }
    if (cmd === "plugin:event|unlisten") return;

    if (cmd === "send_to_agent_command") {
      var payload = JSON.parse(args.message);
      window.__E2E_OUTBOUND__.push(payload);
      // 채팅 턴 중 agent 가 BGM 도구를 부르는 상황 재현: chat_request 의 requestId 로
      // panel_tool_call(skill_youtube_bgm) → finish. requestId 일치라야 handleChunk 가 처리(실 계약).
      if (payload && payload.type === "chat_request") {
        var rid = payload.requestId;
        var requestedTracks = Array.isArray(window.__E2E_SOAK_TRACKS__)
          ? window.__E2E_SOAK_TRACKS__
          : [
              { action: "play", videoId: "e2evid001", title: "E2E First Track" },
              { action: "play", videoId: "e2evid001", title: "E2E Same Track Replay" }
            ];
        var chunks = requestedTracks.map(function (track, index) {
          return { type: "panel_tool_call", requestId: rid, toolCallId: "tc-bgm-" + (index + 1), toolName: "skill_youtube_bgm", args: track };
        });
        chunks.push(
          { type: "text", requestId: rid, text: "재생을 요청했어요. 실제 재생이 확인되면 곡을 소개할게요." },
          { type: "finish", requestId: rid }
        );
        var d = 150;
        for (var i = 0; i < chunks.length; i++) {
          (function (c, ms) { setTimeout(function () { emitEvent("agent_response", JSON.stringify(c)); }, ms); })(chunks[i], d);
          d += 200;
        }
      }
      return null;
    }
    if (cmd === "cancel_stream" || cmd === "send_approval_response") return null;
    return undefined; // → TAURI_BASE_MOCK_FALLBACK 가 부트 기본값 처리
  };
})();
`;

function configScript(cfg: Record<string, unknown>): string {
	return `localStorage.setItem("naia-config", ${JSON.stringify(JSON.stringify(cfg))});`;
}

test.describe("UC8 BGM 스킬 배선 (FR-BGM.1)", () => {
	const iframeRequests: Array<{
		referer: string;
		url: string;
		videoId: string;
		requestedAt: number;
	}> = [];
	test.beforeEach(async ({ page }) => {
		iframeRequests.length = 0;
		// Deterministic local iframe: this e2e never contacts YouTube.
		await page.route(
			"https://www.youtube-nocookie.com/embed/**",
			async (route) => {
				const requestUrl = route.request().url();
				const videoId = decodeURIComponent(new URL(requestUrl).pathname.split("/").at(-1) ?? "");
				iframeRequests.push({
					referer: route.request().headers().referer ?? "",
					url: requestUrl,
					videoId,
					requestedAt: Date.now(),
				});
				const soakDurationMs = Number(/^soak-(\d+)-/.exec(videoId)?.[1] ?? 0);
				const fixtureBody = videoId.startsWith("error-")
					? `<!doctype html><script>
					parent.postMessage(JSON.stringify({ event: "onReady" }), "*");
					setTimeout(() => parent.postMessage(JSON.stringify({ event: "onError", info: 150 }), "*"), 700);
				</script>`
					: videoId.startsWith("hold-")
						? `<!doctype html><script>
						parent.postMessage(JSON.stringify({ event: "onReady" }), "*");
						setTimeout(() => parent.postMessage(JSON.stringify({ event: "onStateChange", info: 1 }), "*"), 700);
					</script>`
					: soakDurationMs > 0
					? `<!doctype html><script>
					const durationMs = ${soakDurationMs};
					const mediaDuration = durationMs >= 6000 ? 3600 : Math.max(30, Math.round(durationMs / 10));
					const send = (event, info) => parent.postMessage(JSON.stringify({ event, info }), "*");
					send("onReady");
					const startedAt = Date.now();
					setTimeout(() => {
						send("onStateChange", 1);
						const progress = setInterval(() => {
							const elapsed = Math.min(durationMs, Date.now() - startedAt);
							send("infoDelivery", {
								currentTime: mediaDuration * elapsed / durationMs,
								duration: mediaDuration,
							});
						}, 100);
						setTimeout(() => {
							clearInterval(progress);
							send("infoDelivery", { currentTime: mediaDuration, duration: mediaDuration });
							send("onStateChange", 0);
							send("onStateChange", 0);
						}, durationMs);
					}, 700);
				</script>`
					: `<!doctype html><script>
					parent.postMessage(JSON.stringify({ event: "onReady" }), "*");
					setTimeout(() => parent.postMessage(JSON.stringify({ event: "onStateChange", info: 1 }), "*"), 700);
					setTimeout(() => parent.postMessage(JSON.stringify({ event: "onStateChange", info: 0 }), "*"), 1500);
				</script>`;
				await route.fulfill({
					contentType: "text/html",
					body: fixtureBody,
				});
			},
		);
		await page.addInitScript(NEW_CORE_FLAG);
		await page.addInitScript(MOCK_SCRIPT);
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		await page.addInitScript({
			content: configScript({
				provider: "gemini",
				model: "gemini-2.5-flash",
				apiKey: "e2e-mock-key",
				enableTools: true,
				locale: "ko",
				onboardingComplete: true,
			}),
		});
		await page.goto("/");
		await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 10_000 });
	});

	test("(A) 부팅 시 skill_youtube_bgm 이 agent 에 등록된다(panel_skills 발신)", async ({
		page,
	}) => {
		// App 부팅 effect 의 sendPanelSkills 가 outbound 에 쌓일 때까지 대기.
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(window as unknown as { __E2E_OUTBOUND__?: unknown[] })
								.__E2E_OUTBOUND__ ?? [];
						return out.some(
							(m) =>
								m &&
								typeof m === "object" &&
								(m as { type?: string }).type === "panel_skills" &&
								(m as { appId?: string }).appId === "bgm-widget" &&
								Array.isArray((m as { tools?: unknown[] }).tools) &&
								(m as { tools: { name?: string }[] }).tools.some(
									(t) => t?.name === "skill_youtube_bgm",
								),
						);
					}),
				{ timeout: 10_000 },
			)
			.toBe(true);
	});

	test("(B) 채팅 턴 중 panel_tool_call(skill_youtube_bgm) → 위젯이 실제 재생 상태로 전환", async ({
		page,
	}) => {
		// BGM 위젯이 마운트돼 있고 아직 재생 아님(초기).
		await expect(page.locator(".bgm-player")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator(".bgm-icon--playing")).toHaveCount(0);

		// 채팅 전송 → mock 이 chat_request 의 requestId 로 panel_tool_call 발신 → dispatch → 재생.
		const input = page.locator(".chat-input");
		await expect(input).toBeEnabled({ timeout: 5_000 });
		await input.fill("잔잔한 음악 틀어줘");
		await input.press("Enter");

		const registrationOrder = await page.evaluate(() => {
			const out =
				(
					window as unknown as {
						__E2E_OUTBOUND__?: Array<Record<string, unknown>>;
					}
				).__E2E_OUTBOUND__ ?? [];
			const chatIndex = out.findIndex((message) => message.type === "chat_request");
			const registrations = out
				.map((message, index) => ({ message, index }))
				.filter(
					({ message }) =>
						message.type === "panel_skills" && message.appId === "bgm-widget",
				);
			return {
				chatIndex,
				registrationCount: registrations.length,
				latestRegistrationIndex: registrations.at(-1)?.index ?? -1,
			};
		});
		expect(registrationOrder.registrationCount).toBeGreaterThanOrEqual(2);
		expect(registrationOrder.latestRegistrationIndex).toBeLessThan(
			registrationOrder.chatIndex,
		);

		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const out =
							(
								window as unknown as {
									__E2E_OUTBOUND__?: Array<Record<string, unknown>>;
								}
							).__E2E_OUTBOUND__ ?? [];
						return (
							out.find((message) => message.type === "panel_tool_result")
								?.result ?? null
						);
					}),
				{ timeout: 10_000 },
			)
			.not.toBeNull();
		const toolResult = await page.evaluate(() => {
			const out =
				(
					window as unknown as {
						__E2E_OUTBOUND__?: Array<Record<string, unknown>>;
					}
				).__E2E_OUTBOUND__ ?? [];
			return String(
				out.find((message) => message.type === "panel_tool_result")?.result ??
					"",
			);
		});
		expect(JSON.parse(toolResult)).toMatchObject({
			playback: { status: "requested" },
			announceTrack: false,
		});
		expect(JSON.parse(toolResult)).not.toHaveProperty("title");

		const toolResults = await page.evaluate(() => {
			const out =
				(
					window as unknown as {
						__E2E_OUTBOUND__?: Array<Record<string, unknown>>;
					}
				).__E2E_OUTBOUND__ ?? [];
			return out
				.filter((message) => message.type === "panel_tool_result")
				.map((message) => JSON.parse(String(message.result)));
		});
		expect(toolResults).toHaveLength(2);
		expect(toolResults[1]).toMatchObject({
			queued: { position: 1, selected: { videoId: "e2evid001" } },
			announceTrack: false,
		});

		// 배선 end-to-end 입증: dispatch → executeBgmSkill → bgm_youtube_play → BgmPlayer 재생.
		// Replacing the iframe is only a request. The fixture has not reported
		// `playing` at this point, so the compact player must not claim it.
		await page.waitForTimeout(250);
		await expect(page.locator(".bgm-icon--playing")).toHaveCount(0);

		await expect(page.locator(".bgm-icon--playing")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.locator(".bgm-track-name")).toContainText(
			"E2E First Track",
		);

		// The fixture ends the first iframe. Only then may the queued second track
		// replace it and become visibly playing.
		await expect(page.locator(".bgm-track-name")).toContainText(
			"E2E Same Track Replay",
			{ timeout: 15_000 },
		);
		const iframe = page.locator(".app-bg-iframe");
		await expect(iframe).toHaveAttribute("referrerpolicy", "origin");
		expect(iframeRequests.length).toBeGreaterThanOrEqual(2);
		const shellOrigin = await page.evaluate(() => window.location.origin);
		expect(
			iframeRequests.every(
				(request) =>
					request.referer.length > 0 &&
					new URL(request.referer).origin === shellOrigin,
			),
		).toBe(true);
		const playbackAttempts = iframeRequests.map(
			(request) => new URL(request.url).searchParams.get("naiaPlayback"),
		);
		expect(new Set(playbackAttempts).size).toBeGreaterThanOrEqual(2);
	});

	test("재생 불가 후보를 인지하면 준비된 다음 곡으로 자동 전환한다", async ({
		page,
	}) => {
		await page.evaluate(() => {
			(
				window as typeof window & {
					__E2E_SOAK_TRACKS__?: Array<Record<string, unknown>>;
				}
			).__E2E_SOAK_TRACKS__ = [
				{ action: "play", videoId: "error-unavailable", title: "Unavailable Track" },
				{ action: "play", videoId: "hold-fallback", title: "Fallback Track" },
			];
		});
		const input = page.locator(".chat-input");
		await expect(page.locator(".bgm-player")).toBeVisible({ timeout: 10_000 });
		await expect(input).toBeEnabled({ timeout: 10_000 });
		await input.fill("요청한 음악을 틀어줘");
		await input.press("Enter");

		const player = page.locator(".bgm-player");
		await page.waitForTimeout(2_000);
		const outbound = await page.evaluate(
			() =>
				(window as unknown as { __E2E_OUTBOUND__?: Array<Record<string, unknown>> })
					.__E2E_OUTBOUND__ ?? [],
		);
		expect(outbound.map((message) => message.type)).toContain("panel_tool_result");
		const panelResults = outbound.filter(
			(message) => message.type === "panel_tool_result",
		);
		expect(panelResults).toHaveLength(2);
		expect(panelResults.map((message) => JSON.parse(String(message.result)))).toMatchObject([
			{ selected: { videoId: "error-unavailable" } },
			{ queued: { selected: { videoId: "hold-fallback" } } },
		]);
		expect(iframeRequests.map((request) => request.videoId)).toContain(
			"error-unavailable",
		);
		await expect(player).toHaveAttribute(
			"data-bgm-current-title",
			"Fallback Track",
			{ timeout: 15_000 },
		);
		await expect(player).toHaveAttribute("data-bgm-playback-status", "playing", {
			timeout: 15_000,
		});
		expect(iframeRequests.map((request) => request.videoId).slice(-2)).toEqual([
			"error-unavailable",
			"hold-fallback",
		]);
	});

	test("음악 중 일반 대화가 끼어도 BGM을 교체하거나 멈추지 않는다", async ({
		page,
	}) => {
		await page.evaluate(() => {
			(
				window as typeof window & {
					__E2E_SOAK_TRACKS__?: Array<Record<string, unknown>>;
				}
			).__E2E_SOAK_TRACKS__ = [
				{ action: "play", videoId: "hold-conversation", title: "Conversation Bed" },
			];
		});
		const input = page.locator(".chat-input");
		await expect(page.locator(".bgm-player")).toBeVisible({ timeout: 10_000 });
		await expect(input).toBeEnabled({ timeout: 10_000 });
		await input.fill("음악 틀어줘");
		await input.press("Enter");
		const player = page.locator(".bgm-player");
		await expect(player).toHaveAttribute("data-bgm-playback-status", "playing", {
			timeout: 15_000,
		});
		const attemptsBeforeConversation = iframeRequests.length;

		await page.evaluate(() => {
			(
				window as typeof window & {
					__E2E_SOAK_TRACKS__?: Array<Record<string, unknown>>;
				}
			).__E2E_SOAK_TRACKS__ = [];
		});
		await input.fill("그런데 오늘 일정은 어때?");
		await input.press("Enter");
		await page.waitForTimeout(1_000);
		await expect(player).toHaveAttribute("data-bgm-current-title", "Conversation Bed");
		await expect(player).toHaveAttribute("data-bgm-playback-status", "playing");
		expect(iframeRequests).toHaveLength(attemptsBeforeConversation);
	});

	test("음성 도구 흐름으로 즐겨찾기를 등록하고 다시 재생한다", async ({ page }) => {
		const input = page.locator(".chat-input");
		await expect(page.locator(".bgm-player")).toBeVisible({ timeout: 10_000 });
		await expect(input).toBeEnabled({ timeout: 10_000 });
		await page.evaluate(() => {
			(
				window as typeof window & {
					__E2E_SOAK_TRACKS__?: Array<Record<string, unknown>>;
				}
			).__E2E_SOAK_TRACKS__ = [
				{ action: "play", videoId: "hold-favorite", title: "Favorite Track" },
				{ action: "favorite_add" },
			];
		});
		await input.fill("첫 번째 음악 명령을 실행해줘");
		await input.press("Enter");
		await expect
			.poll(() =>
				page.evaluate(() => {
					const favorites = JSON.parse(
						localStorage.getItem("yt-bgm-favorites") ?? "[]",
					) as Array<{ id: string }>;
					return favorites.map((item) => item.id);
				}),
			)
			.toContain("hold-favorite");

		await page.evaluate(() => {
			(
				window as typeof window & {
					__E2E_SOAK_TRACKS__?: Array<Record<string, unknown>>;
				}
			).__E2E_SOAK_TRACKS__ = [
				{ action: "play", videoId: "hold-other", title: "Other Track", replace: true },
				{ action: "favorites_play" },
			];
		});
		await input.fill("두 번째 음악 명령을 실행해줘");
		await input.press("Enter");
		await expect(page.locator(".bgm-player")).toHaveAttribute(
			"data-bgm-current-title",
			"Favorite Track",
			{ timeout: 15_000 },
		);
	});

	test("가변 길이 10곡을 종료 기준으로 연속 재생하고 긴 곡 관측을 5초 넘게 유지한다", async ({
		page,
	}) => {
		test.setTimeout(60_000);
		const runtimeErrors: string[] = [];
		page.on("pageerror", (error) =>
			runtimeErrors.push(error.stack ?? error.message),
		);
		page.on("console", (message) => {
			if (message.type() === "error") runtimeErrors.push(message.text());
		});
		const tracks = [
			{ videoId: "soak-6200-0", title: "Long 60 Minute Mix" },
			{ videoId: "soak-250-1", title: "Short Track 1" },
			{ videoId: "soak-1700-2", title: "Medium Track 2" },
			{ videoId: "soak-400-3", title: "Short Track 3" },
			{ videoId: "soak-2300-4", title: "Long Track 4" },
			{ videoId: "soak-300-5", title: "Short Track 5" },
			{ videoId: "soak-1200-6", title: "Medium Track 6" },
			{ videoId: "soak-700-7", title: "Short Track 7" },
			{ videoId: "soak-1900-8", title: "Medium Track 8" },
			{ videoId: "soak-500-9", title: "Final Track 9" },
		];
		const player = page.locator(".bgm-player");
		await page.evaluate((queuedTracks) => {
			(
				window as typeof window & {
					__E2E_SOAK_TRACKS__?: Array<Record<string, unknown>>;
				}
			).__E2E_SOAK_TRACKS__ = queuedTracks.map((track) => ({
				action: "play",
				...track,
			}));
		}, tracks);
		const input = page.locator(".chat-input");
		await input.fill("가변 길이 라디오 장기 재생");
		await input.press("Enter");

		await expect(player).toHaveAttribute("data-bgm-current-title", tracks[0].title);
		await expect(player).toHaveAttribute("data-bgm-queue-length", "9");
		await page.waitForTimeout(5_300);
		await expect(player).toHaveAttribute("data-bgm-playback-status", "playing");
		expect(Number(await player.getAttribute("data-bgm-current-time"))).toBeGreaterThan(0);
		expect(Number(await player.getAttribute("data-bgm-duration"))).toBe(3600);

		for (const track of tracks.slice(1)) {
			await expect(player).toHaveAttribute("data-bgm-current-title", track.title, {
				timeout: 10_000,
			});
		}
		await expect(player).toHaveAttribute("data-bgm-playback-status", "ended", {
			timeout: 10_000,
		});
		await expect(player).toHaveAttribute("data-bgm-queue-length", "0");
		expect(iframeRequests.map((request) => request.videoId)).toEqual(
			tracks.map((track) => track.videoId),
		);
		const playbackAttempts = iframeRequests.map(
			(request) => new URL(request.url).searchParams.get("naiaPlayback"),
		);
		expect(new Set(playbackAttempts).size).toBe(tracks.length);
		for (let index = 0; index < iframeRequests.length - 1; index += 1) {
			const durationMs = Number(
				/^soak-(\d+)-/.exec(iframeRequests[index].videoId)?.[1] ?? 0,
			);
			expect(
				iframeRequests[index + 1].requestedAt
					- iframeRequests[index].requestedAt,
			).toBeGreaterThanOrEqual(durationMs);
		}
		const bgmRuntimeErrors = runtimeErrors.filter(
			(error) =>
				!error.includes("BrowserCenterArea.tsx")
				&& !error.includes("AvatarCanvas")
				&& !error.includes("net::ERR_CONNECTION_REFUSED"),
		);
		expect(bgmRuntimeErrors).toEqual([]);
	});
});
