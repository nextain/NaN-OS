import { expect, test, type Page } from "@playwright/test";
import { WATCH_TURN_BUDGET } from "@nextain/naia-os-core/composition";
import { SEED_ADK_PATH, TAURI_BASE_MOCK_FALLBACK } from "./helpers/tauri-base-mock";

/**
 * #502 — 실시간 음성 경로의 주의 수명주기 (FR-ENV-ATTENTION.7).
 *
 * 왜 이 파일이 따로 있는가: 지켜보기 예산을 gRPC 대화 경로에서만 깎고 있었다.
 * 그런데 음성 도구 호출은 같은 dispatch 를 타므로 음성 중에도 나이아가 watch 를 켤 수
 * 있다. 그러면 음성으로 켠 지켜보기가 예산을 쓰지 않고 남아, "켜 둔 채 잊는 것을 막는다"는
 * 규칙이 지원되는 대화 경로 하나에서 성립하지 않게 된다 (2026-08-27 9차 적대리뷰 지적).
 *
 * 여기서 재는 것은 음성 턴이 실제로 예산을 쓰는가다. 음성 경로 자체는 표면 목록을
 * 싣지 않으므로, 예산이 줄었는지는 음성을 끝낸 뒤의 텍스트 요청에서 확인한다.
 */

const VOICE_ATTENTION_MOCK = `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = {
		currentWindow: { label: "main" },
		currentWebview: { windowLabel: "main", label: "main" },
	};
	var callbacks = new Map(); var nextCbId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
		var id = nextCbId++;
		callbacks.set(id, function(d) { if (once) callbacks.delete(id); return fn && fn(d); });
		return id;
	};
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, d) { var cb = callbacks.get(id); if (cb) cb(d); };
	window.__TAURI_INTERNALS__.callbacks = callbacks;
	var eventListeners = new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};
	function emitEvent(event, payload) {
		var hs = eventListeners.get(event) || [];
		for (var i = 0; i < hs.length; i++) window.__TAURI_INTERNALS__.runCallback(hs[i], { event: event, payload: payload });
	}
	window.__TAURI_INTERNALS__.convertFileSrc = function(f, p) { return (p || "asset") + "://localhost/" + encodeURIComponent(f); };

	window.__NAIA_E2E__ = { realtimeSent: [], lastWs: null, toolRequests: [], outbound: [] };

	// ---- WebSocket mock — ONLY /v1/realtime (naia-omni). Everything else
	// (vite HMR ws://localhost:1420/...) must use the real WebSocket, or vite's
	// client breaks ("(intermediate value) is not iterable") and lastWs gets
	// clobbered by the HMR socket. ----
	var OrigWS = window.WebSocket;
	function MockRealtimeWS(url) {
		var self = this; self.url = url; self.readyState = 0;
		self.onopen = null; self.onmessage = null; self.onerror = null; self.onclose = null;
		self.send = function(data) { window.__NAIA_E2E__.realtimeSent.push(data); };
		self.close = function() { self.readyState = 3; if (self.onclose) self.onclose({ code: 1000, reason: "", wasClean: true }); };
		window.__NAIA_E2E__.lastWs = self;
		setTimeout(function() {
			self.readyState = 1;
			if (self.onopen) self.onopen();
			// direct mode (no naiaKey) sends no setup; server greets with session.created
			setTimeout(function() { if (self.onmessage) self.onmessage({ data: JSON.stringify({ type: "session.created" }) }); }, 20);
		}, 10);
		return self;
	}
	window.WebSocket = function(url, protocols) {
		if (String(url).indexOf("/v1/realtime") !== -1) return new MockRealtimeWS(url);
		return protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
	};
	window.WebSocket.prototype = OrigWS.prototype;
	window.WebSocket.OPEN = OrigWS.OPEN; window.WebSocket.CLOSED = OrigWS.CLOSED;
	window.WebSocket.CONNECTING = OrigWS.CONNECTING; window.WebSocket.CLOSING = OrigWS.CLOSING;
	window.__NAIA_E2E__.emitRealtime = function(msg) {
		var ws = window.__NAIA_E2E__.lastWs;
		if (ws && ws.onmessage) ws.onmessage({ data: typeof msg === "string" ? msg : JSON.stringify(msg) });
	};

	// ---- mic / audio mock ----
	if (!navigator.mediaDevices) navigator.mediaDevices = {};
	navigator.mediaDevices.getUserMedia = function() {
		return Promise.resolve({ getTracks: function() { return [{ stop: function() {} }]; }, getAudioTracks: function() { return [{ stop: function() {} }]; } });
	};
	function MockAudioCtx() { this.sampleRate = 48000; this.state = "running"; this.currentTime = 0; this.destination = {}; }
	MockAudioCtx.prototype.createMediaStreamSource = function() { return { connect: function() {}, disconnect: function() {} }; };
	MockAudioCtx.prototype.createScriptProcessor = function() { return { connect: function() {}, disconnect: function() {}, onaudioprocess: null }; };
	MockAudioCtx.prototype.createBuffer = function(c, l, r) { return { getChannelData: function() { return new Float32Array(l || 1); }, duration: 0, length: l || 1, sampleRate: r || 48000 }; };
	MockAudioCtx.prototype.createBufferSource = function() { return { buffer: null, connect: function() {}, start: function() {}, stop: function() {}, onended: null }; };
	MockAudioCtx.prototype.resume = function() { return Promise.resolve(); };
	MockAudioCtx.prototype.close = function() { return Promise.resolve(); };
	window.AudioContext = MockAudioCtx; window.webkitAudioContext = MockAudioCtx;

	// ---- invoke ----
	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		if (cmd === "plugin:event|listen") { if (!eventListeners.has(args.event)) eventListeners.set(args.event, []); eventListeners.get(args.event).push(args.handler); return args.handler; }
		if (cmd === "plugin:event|emit") { emitEvent(args.event, args.payload); return null; }
		if (cmd === "plugin:event|unlisten") return;
		if (cmd === "herdr_snapshot") {
			return { panes: [
				{ pane_id: "pane-agent-1", label: "빌더", agent: "codex", agent_status: "working", focused: true },
				{ pane_id: "pane-term-1", terminal_title_stripped: "zsh — alpha-adk", focused: false }
			] };
		}
		if (cmd && cmd.indexOf("herdr_") === 0) return { ok: true };
		if (cmd === "send_to_agent_command") {
			var req = JSON.parse(args.message);
			window.__NAIA_E2E__.outbound.push(req);
			if (req.type === "tool_request" && req.toolName === "skill_environment") {
				// 뇌가 앱 소유 도구라고 판정해 되돌려 보내는 흐름을 그대로 흉내낸다.
				var erid = req.requestId;
				setTimeout(function() {
					emitEvent("agent_response", JSON.stringify({
						type: "app_tool_call", requestId: erid, toolCallId: "tc-env",
						toolName: "skill_environment", args: req.args,
					}));
				}, 20);
				return;
			}
			if (req.type === "app_tool_result") {
				var arid = req.requestId;
				setTimeout(function() {
					emitEvent("agent_response", JSON.stringify({
						type: "tool_result", requestId: arid, toolCallId: "tc-env",
						toolName: "skill_environment", success: req.success === true, output: req.result || "",
					}));
					setTimeout(function() {
						emitEvent("agent_response", JSON.stringify({ type: "finish", requestId: arid }));
					}, 10);
				}, 20);
				return;
			}
			if (req.type === "skill_list") {
				// Voice startup queries agent skills — answer immediately (empty)
				// so fetchAgentSkills doesn't 10s-timeout and stall the connect.
				var slid = req.requestId;
				setTimeout(function() {
					emitEvent("agent_response", JSON.stringify({ type: "skill_list_response", requestId: slid, tools: [] }));
				}, 20);
				return;
			}
			if (req.type === "tool_request") {
				window.__NAIA_E2E__.toolRequests.push({ toolName: req.toolName, args: req.args });
				var rid = req.requestId;
				setTimeout(function() {
					emitEvent("agent_response", JSON.stringify({
						type: "tool_result", requestId: rid, toolCallId: "tc",
						toolName: req.toolName, success: true, output: "검색 결과: 오늘 뉴스 3건",
					}));
					// directToolCall stores tool_result, resolves on finish — mirror it.
					setTimeout(function() {
						emitEvent("agent_response", JSON.stringify({ type: "finish", requestId: rid }));
					}, 10);
				}, 40);
			}
			return;
		}
		if (cmd === "cancel_stream") return;
		if (cmd === "get_progress_data") return { events: [], stats: { totalCost: 0, messageCount: 0, toolCount: 0, errorCount: 0 } };
		if (cmd === "plugin:store|load") return 1;
		if (cmd === "plugin:store|get") return [null, false];
		if (cmd.indexOf("plugin:store|") === 0) return null;
		// memory / audit / misc — keep buildMemoryContext + startup from hanging
		if (cmd === "init_audit_db" || cmd === "init_memory_db") return;
		if (cmd === "query_events") return [];
		if (cmd === "get_all_facts") return [];
		if (cmd === "upsert_fact") return;
		if (cmd === "recall_memory" || cmd === "search_memory") return [];
		if (cmd === "check_gateway_health") return false;
		if (cmd === "get_log_path") return "/tmp/naia-test.log";
		if (cmd === "sync_openclaw_config") return;
		if (cmd === "get_window_state") return { width: 800, height: 600, x: 0, y: 0 };
		if (cmd === "save_window_state") return;
		if (cmd.indexOf("plugin:dialog|") === 0) return null;
		if (cmd.indexOf("plugin:opener|") === 0) return null;
		if (cmd.indexOf("plugin:window|") === 0) return null;
		if (cmd.indexOf("plugin:deep-link|") === 0) return [];
		return undefined;
	};
})();
`;


async function emitRealtime(page: Page, msg: Record<string, unknown>) {
	await page.evaluate(
		(m) => (window as unknown as { __NAIA_E2E__: { emitRealtime: (x: unknown) => void } }).__NAIA_E2E__.emitRealtime(m),
		msg,
	);
}

/** 마지막 chat_request 에 실린 표면 세그먼트. 없으면 null. */
async function surfacesSegment(page: Page) {
	return page.evaluate(() => {
		const out = (window as unknown as { __NAIA_E2E__: { outbound: Record<string, unknown>[] } }).__NAIA_E2E__.outbound;
		const chats = out.filter((m) => m?.type === "chat_request");
		const chat = chats[chats.length - 1];
		const segs = (chat?.environmentSegments ?? []) as Record<string, unknown>[];
		return (segs.find((x) => x?.kind === "environmentSurfaces") as Record<string, unknown>) ?? null;
	});
}

async function startVoice(page: Page) {
	const voiceBtn = page.locator(".chat-voice-btn");
	await expect(voiceBtn).toBeVisible({ timeout: 10_000 });
	await voiceBtn.click();
	await expect(voiceBtn).toHaveClass(/active/, { timeout: 10_000 });
	return voiceBtn;
}

/** 음성에서 나이아가 도구를 부른다. 뇌 대역이 app_tool_call 로 되돌려 보낸다. */
async function voiceToolCall(page: Page, args: Record<string, unknown>) {
	await emitRealtime(page, {
		type: "response.function_call_arguments.done",
		call_id: `tc_${Date.now()}`,
		name: "skill_environment",
		arguments: JSON.stringify(args),
	});
	await page.waitForTimeout(600);
}

/** 음성 턴 하나가 끝난다. */
async function voiceTurnEnd(page: Page) {
	await emitRealtime(page, { type: "response.done", response: {} });
	await page.waitForTimeout(120);
}

async function textTurn(page: Page, text: string) {
	const input = page.locator(".chat-input");
	await expect(input).toBeEnabled({ timeout: 10_000 });
	await input.fill(text);
	await input.press("Enter");
	await page.waitForTimeout(900);
}

test.describe("#502 음성 경로도 주의 예산을 쓴다 (FR-ENV-ATTENTION.7)", () => {
	// ⚠️ 변이 탐침을 돌릴 때: 소스를 바꾼 직후 첫 실행은 dev 서버가 옛 모듈을 물고 있어
	//    바뀌기 전 결과가 나온다(2026-08-27 실측 — 복원 직후 실패가 남아 오판할 뻔했다).
	//    변이·복원 각각 두 번씩 돌려 안정된 값을 봐야 한다.

	test.beforeEach(async ({ page }) => {
		await page.addInitScript(VOICE_ATTENTION_MOCK);
		await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
		await page.addInitScript({ content: SEED_ADK_PATH });
		await page.addInitScript(
			(cfg: string) => localStorage.setItem("naia-config", cfg),
			JSON.stringify({
				provider: "vllm",
				model: "naia-0.9-omni-24g",
				vllmHost: "ws://localhost:8000",
				enableTools: true,
				locale: "ko",
				onboardingComplete: true,
			}),
		);
		await page.goto("/");
		await expect(page.locator(".chat-app")).toBeVisible({ timeout: 10_000 });
	});

	test("대조군 — 음성 턴이 적으면 지켜보기가 살아남아 목록이 실린다", async ({ page }) => {
		// 이 대조군이 없으면 아래 본 시험의 '목록 없음'이 예산 때문인지
		// watch 가 아예 안 켜진 것인지 구별할 수 없다.
		const btn = await startVoice(page);
		await voiceToolCall(page, { action: "watch" });
		await voiceTurnEnd(page);
		await voiceTurnEnd(page);
		await btn.click();

		await textTurn(page, "이제 텍스트로");
		const seg = await surfacesSegment(page);
		expect(
			(seg?.surfaces as unknown[] | undefined)?.length ?? 0,
			"음성에서 켠 지켜보기가 텍스트 경로에 이어지지 않았다 — 이 파일의 전제가 틀렸다",
		).toBeGreaterThan(0);
	});

	test("음성 도중 사용자가 끄면 그 세션의 도구 호출이 거절된다 (FR-ENV-ATTENTION.9)", async ({
		page,
	}) => {
		// 열린 실시간 세션은 연결 시점의 도구 목록을 쓴다. 중간에 끄면 모델은 여전히
		// skill_environment 를 선언받은 상태다 — 그래서 실행이 반드시 막혀야 한다.
		// 선언이 남는 것 자체는 이 슬라이스가 못 걷는 한계이고, 요구사항에 그대로 적었다.
		await startVoice(page);
		await page.evaluate(() => {
			const raw = localStorage.getItem("naia-config");
			const cfg = raw ? JSON.parse(raw) : {};
			cfg.environmentAwareness = "off";
			localStorage.setItem("naia-config", JSON.stringify(cfg));
		});

		await voiceToolCall(page, { action: "observe" });
		const herdr = await page.evaluate(
			() =>
				(window as unknown as { __NAIA_E2E__: { outbound: Record<string, unknown>[] } }).__NAIA_E2E__
					.outbound.filter((m) => m?.type === "app_tool_result"),
		);
		expect(herdr.length, "도구 결과가 아예 없다 — 호출이 안 닿았다면 이 단언은 공허하다").toBeGreaterThan(0);
		const last = herdr[herdr.length - 1] as { result?: string; success?: boolean };
		expect(String(last.result), "껐는데 관측 결과가 돌아왔다").toContain("꺼 두었다");
		expect(last.success, "거절인데 성공으로 보고했다").toBe(false);
	});

	test("음성 턴이 예산을 다 쓰면 텍스트로 돌아와도 목록이 빠진다", async ({ page }) => {
		const btn = await startVoice(page);
		await voiceToolCall(page, { action: "watch" });
		for (let i = 0; i < WATCH_TURN_BUDGET; i += 1) await voiceTurnEnd(page);
		await btn.click();

		await textTurn(page, "이제 텍스트로");
		const seg = await surfacesSegment(page);
		expect(seg, "표면 세그먼트 자체가 없다 — 관측이 안 된 것이라면 이 단언은 공허하다").not.toBeNull();
		expect(
			(seg?.surfaces as unknown[] | undefined)?.length ?? -1,
			"음성 턴이 예산을 쓰지 않아 지켜보기가 남았다",
		).toBe(0);
		expect(seg?.listWithheld).toBe(true);
	});
});
