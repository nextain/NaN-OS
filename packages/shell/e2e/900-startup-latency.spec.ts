import { expect, test } from "@playwright/test";

/**
 * 앱이 뜨기까지 걸리는 시간에 한도를 건다.
 *
 * 왜 필요한가: 이 저장소의 성능 축은 크기만 잠겨 있다. bundle-budget 이
 * 진입 스크립트와 배포본 크기를 막지만, 시간은 어디에도 한도가 없다. 지금은
 * 타임아웃이 사실상의 한도이고, 그것은 "안 죽었다" 만 말한다. 번들이 커지지
 * 않으면서도 초기화가 느려지는 회귀는 아무것도 잡지 못한다.
 *
 * 무엇을 재는가: 페이지를 열고 셸의 첫 화면이 보일 때까지의 벽시계 시간.
 * 러너 성능은 실행마다 흔들리므로 세 번 재서 중앙값을 쓴다. 한 번의 튐으로
 * 붉어지면 사람은 곧 이 테스트를 꺼 버린다.
 *
 * 한도는 어떻게 정했나: 이 기계에서 실측한 값에 넉넉한 여유를 얹었다. 목적은
 * 지금 속도를 지키는 것이 아니라 배가 느려지는 회귀를 잡는 것이다.
 */

const TAURI_MOCK = `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = {
		currentWindow: { label: "main" },
		currentWebview: { windowLabel: "main", label: "main" },
	};

	// Record every invoke so the test can assert which Tauri commands fire
	window.__INVOKE_LOG__ = [];

	var callbacks = new Map();
	var nextCbId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
		var id = nextCbId++;
		callbacks.set(id, function(data) { if (once) callbacks.delete(id); return fn && fn(data); });
		return id;
	};
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, data) {
		var cb = callbacks.get(id);
		if (cb) cb(data);
	};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};

	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		window.__INVOKE_LOG__.push({ cmd: cmd, args: args ?? null, t: Date.now() });

		// Safe defaults
		if (cmd === "plugin:event|listen") return 1;
		if (cmd === "plugin:event|unlisten") return undefined;
		if (cmd === "plugin:window|show") return undefined;
		if (cmd === "plugin:window|inner_size") return { width: 1024, height: 768 };
		if (cmd === "plugin:store|load") return undefined;
		if (cmd === "plugin:store|get") return undefined;
		if (cmd === "plugin:store|set") return undefined;
		if (cmd === "plugin:store|save") return undefined;
		if (cmd === "plugin:store|entries") return [];
		if (cmd === "plugin:store|has") return false;
		if (cmd === "plugin:updater|check") return undefined;
		if (cmd === "plugin:path|resolve_directory") return "/tmp/naia-mock-home";
		if (cmd === "plugin:path|join") return (args.paths || []).filter(Boolean).join("/");
		if (cmd === "workspace_detect_adk_root") return null;
		if (cmd === "app_list_installed") return [];
		if (cmd === "send_to_agent_command") return undefined;
		if (cmd === "frontend_log") return undefined;
		if (cmd === "read_text_file") return "";
		if (cmd === "list_directory") return [];
		if (cmd === "exists") return false;
		// Default: log + return undefined so React doesn't crash on missing handler
		return undefined;
	};
})();
`;

const SET_ADK_PATH = `
localStorage.setItem("naia-adk-path", "/tmp/mock-naia-adk-workspace");
`;

const SAMPLES = 3;
// 한도를 처음에 2,000ms 로 두었는데, 이 기계 중앙값이 45~136ms 라 열다섯 배가
// 넘었다. 그 한도로는 "배 이상 느려지는 회귀를 잡는다" 는 이 스펙의 목적을
// 이룰 수 없다 — 열 배가 느려져도 통과한다.
//
// 그렇다고 실측에 바싹 붙이면 러너 성능 차이로 흔들려 곧 꺼진다. 중앙값으로
// 판정하는 것이 튐을 이미 걸러 주므로, 이 기계 최악 표본(약 750ms 콜드
// 스타트)의 두 배를 한도로 둔다. 2배 회귀는 잡고 러너 차이는 견디는 자리다.
// CI 러너에서 한 번 재 보고 흔들리면 그때 넓히되, 이유를 여기 적어라.
const STARTUP_BUDGET_MS = 1_500;

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

test("셸 첫 화면이 한도 안에 뜬다 (UC-PERF-STARTUP-LATENCY)", async ({ page }) => {
	const samples: number[] = [];
	for (let attempt = 0; attempt < SAMPLES; attempt++) {
		await page.addInitScript({ content: TAURI_MOCK });
		const started = Date.now();
		await page.goto("/");
		await expect(page.locator(".adk-setup-headline")).toBeVisible();
		samples.push(Date.now() - started);
	}
	const value = median(samples);
	console.log(`[startup-latency] 표본 ${samples.join(", ")}ms → 중앙값 ${value}ms (한도 ${STARTUP_BUDGET_MS}ms)`);
	expect(
		value,
		`셸 첫 화면까지 ${value}ms — 한도 ${STARTUP_BUDGET_MS}ms 를 넘었다. 표본 ${samples.join(", ")}`,
	).toBeLessThan(STARTUP_BUDGET_MS);
});
