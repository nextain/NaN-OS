import * as fs from "node:fs";
import * as path from "node:path";
import { type Page, expect, test } from "@playwright/test";

/**
 * Naia Shell — Playwright Screenshot Capture for Manual
 *
 * Captures all app screens (onboarding + main UI) for both Korean and English.
 * Uses mocked Tauri IPC — no real Tauri binary needed.
 *
 * Run:
 *   cd shell && pnpm test:e2e -- screenshots.spec.ts
 *
 * Screenshots saved to:
 *   project-naia.nextain.io/public/manual/ko/
 *   project-naia.nextain.io/public/manual/en/
 */

const MANUAL_BASE = path.resolve(
	import.meta.dirname,
	"../../../project-naia.nextain.io/public/manual",
);
const CAPTURE_VIEWPORT = { width: 400, height: 768 };

test.setTimeout(120_000);
test.use({ viewport: CAPTURE_VIEWPORT });
test.use({ deviceScaleFactor: 3 });

const MOCK_API_KEY = "e2e-mock-key-screenshot";

// ---- Mock skill list for SkillsTab ----
const MOCK_SKILLS = [
	{
		name: "skill_time",
		description: "현재 시간/날짜 조회",
		type: "built-in",
		tier: 0,
		source: "built-in",
	},
	{
		name: "skill_system_status",
		description: "시스템 상태 확인",
		type: "built-in",
		tier: 0,
		source: "built-in",
	},
	{
		name: "skill_memo",
		description: "메모 저장/조회/삭제",
		type: "built-in",
		tier: 1,
		source: "built-in",
	},
	{
		name: "skill_weather",
		description: "현재 날씨 조회",
		type: "built-in",
		tier: 0,
		source: "built-in",
	},
	{
		name: "skill_skill_manager",
		description: "스킬 관리 (검색/활성화/비활성화)",
		type: "built-in",
		tier: 1,
		source: "built-in",
	},
	{
		name: "execute_command",
		description: "셸 명령 실행",
		type: "gateway",
		tier: 2,
		source: "gateway",
		gatewaySkill: "execute_command",
	},
	{
		name: "write_file",
		description: "파일 쓰기",
		type: "gateway",
		tier: 2,
		source: "gateway",
		gatewaySkill: "write_file",
	},
	{
		name: "read_file",
		description: "파일 읽기",
		type: "gateway",
		tier: 1,
		source: "gateway",
		gatewaySkill: "read_file",
	},
	{
		name: "search_files",
		description: "파일 검색",
		type: "gateway",
		tier: 1,
		source: "gateway",
		gatewaySkill: "search_files",
	},
	{
		name: "list_files",
		description: "디렉토리 목록",
		type: "gateway",
		tier: 1,
		source: "gateway",
		gatewaySkill: "list_files",
	},
	{
		name: "code_review",
		description: "코드 리뷰",
		type: "gateway",
		tier: 1,
		source: "gateway",
		gatewaySkill: "code_review",
	},
	{
		name: "web_search",
		description: "웹 검색",
		type: "gateway",
		tier: 0,
		source: "gateway",
		gatewaySkill: "web_search",
	},
];

// ---- Mock audit data for ProgressTab ----
const MOCK_AUDIT_LOG = [
	{
		id: 1,
		timestamp: "2026-02-19T10:00:00Z",
		request_id: "r1",
		event_type: "tool_use",
		tool_name: "skill_time",
		tool_call_id: "tc1",
		tier: 0,
		success: true,
		payload: '{"args":{"timezone":"Asia/Seoul"}}',
	},
	{
		id: 2,
		timestamp: "2026-02-19T10:00:01Z",
		request_id: "r1",
		event_type: "tool_result",
		tool_name: "skill_time",
		tool_call_id: "tc1",
		tier: 0,
		success: true,
		payload: '{"output":"2026-02-19 19:00 KST"}',
	},
	{
		id: 3,
		timestamp: "2026-02-19T10:01:00Z",
		request_id: "r2",
		event_type: "tool_use",
		tool_name: "execute_command",
		tool_call_id: "tc2",
		tier: 2,
		success: true,
		payload: '{"args":{"command":"ls"}}',
	},
	{
		id: 4,
		timestamp: "2026-02-19T10:01:02Z",
		request_id: "r2",
		event_type: "tool_result",
		tool_name: "execute_command",
		tool_call_id: "tc2",
		tier: 2,
		success: true,
		payload: '{"output":"file1.txt\\nfile2.txt"}',
	},
	{
		id: 5,
		timestamp: "2026-02-19T10:02:00Z",
		request_id: "r3",
		event_type: "usage",
		tool_name: null,
		tool_call_id: null,
		tier: null,
		success: null,
		payload: '{"cost":0.003,"inputTokens":150,"outputTokens":80}',
	},
];
const MOCK_AUDIT_STATS = {
	total_events: 5,
	by_event_type: [
		["tool_use", 2],
		["tool_result", 2],
		["usage", 1],
	],
	by_tool_name: [
		["skill_time", 2],
		["execute_command", 2],
	],
	total_cost: 0.005,
};

// ---- Mock history sessions ----
const MOCK_SESSIONS = [
	{
		id: "s1",
		title: "서울 날씨 확인",
		created_at: "2026-02-19T10:00:00Z",
		updated_at: "2026-02-19T10:05:00Z",
		message_count: 4,
	},
	{
		id: "s2",
		title: "프로젝트 파일 구조 분석",
		created_at: "2026-02-18T14:00:00Z",
		updated_at: "2026-02-18T14:30:00Z",
		message_count: 8,
	},
	{
		id: "s3",
		title: "코드 리뷰 요청",
		created_at: "2026-02-17T09:00:00Z",
		updated_at: "2026-02-17T09:20:00Z",
		message_count: 6,
	},
];

// ---- Tauri IPC Mock (extended from chat-tools.spec.ts) ----
function buildTauriMockScript(
	skillsJson: string,
	auditLogJson: string,
	auditStatsJson: string,
	sessionsJson: string,
	locale: string,
): string {
	return `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};

	window.__TAURI_INTERNALS__.metadata = {
		currentWindow: { label: "main" },
		currentWebview: { windowLabel: "main", label: "main" },
	};

	var callbacks = new Map();
	var nextCbId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
		var id = nextCbId++;
		callbacks.set(id, function(data) { if (once) callbacks.delete(id); return fn && fn(data); });
		return id;
	};
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, data) { var cb = callbacks.get(id); if (cb) cb(data); };

	var eventListeners = new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};

	function emitEvent(event, payload) {
		var handlers = eventListeners.get(event) || [];
		for (var i = 0; i < handlers.length; i++) {
			window.__TAURI_INTERNALS__.runCallback(handlers[i], { event: event, payload: payload });
		}
	}

	window.__TAURI_INTERNALS__.convertFileSrc = function(filePath, protocol) {
		protocol = protocol || "asset";
		return protocol + "://localhost/" + encodeURIComponent(filePath);
	};

	window.__NAIA_E2E__ = { emitEvent: emitEvent };

	var tcCounter = 0;

	function buildTextResponse(requestId, text) {
		return [
			{ type: "text", requestId: requestId, text: text },
			{ type: "usage", requestId: requestId, inputTokens: 10, outputTokens: 20, cost: 0.001, model: "gemini-2.5-flash" },
			{ type: "finish", requestId: requestId },
		];
	}

	function buildToolResponse(requestId, toolName, args, output, followUpText) {
		var tcId = "tc-" + (++tcCounter);
		return [
			{ type: "tool_use", requestId: requestId, toolCallId: tcId, toolName: toolName, args: args },
			{ type: "tool_result", requestId: requestId, toolCallId: tcId, toolName: toolName, output: output, success: true },
			{ type: "text", requestId: requestId, text: followUpText },
			{ type: "usage", requestId: requestId, inputTokens: 30, outputTokens: 50, cost: 0.002, model: "gemini-2.5-flash" },
			{ type: "finish", requestId: requestId },
		];
	}

	function buildApprovalResponse(requestId) {
		var tcId = "tc-" + (++tcCounter);
		return [
			{
				type: "approval_request",
				requestId: requestId,
				toolCallId: tcId,
				toolName: "execute_command",
				args: { command: "rm -rf /tmp/demo" },
				tier: 2,
				description: "Execute Command",
			},
			{ type: "finish", requestId: requestId },
		];
	}

	function getResponseChunks(requestId, userMessage) {
		var msg = (userMessage || "").toLowerCase();
		var isEn = "${locale}" === "en";
		
		if (msg.indexOf("날씨") !== -1 || msg.indexOf("weather") !== -1) {
			return buildToolResponse(requestId, "skill_weather",
				{ location: isEn ? "Seoul" : "서울" },
				JSON.stringify({ location: "Seoul", temperature: "3°C", condition: "Clear", humidity: "45%" }),
				isEn ? "Here is the current weather in Seoul. It is 3°C with clear skies! 🌤️" : "서울의 현재 날씨입니다. 기온 3°C, 맑은 하늘이에요! 🌤️");
		}
		if (msg.indexOf("시간") !== -1 || msg.indexOf("time") !== -1) {
			return buildToolResponse(requestId, "skill_time",
				{ timezone: "Asia/Seoul" },
				"2026-02-19 19:00 KST (Wednesday)",
				isEn ? "The current time is 7:00 PM on Wednesday, February 19, 2026." : "현재 시간은 2026년 2월 19일 수요일 오후 7시입니다.");
		}
		if (msg.indexOf("승인") !== -1 || msg.indexOf("approval") !== -1 || msg.indexOf("action") !== -1) {
			return buildApprovalResponse(requestId);
		}
		return buildTextResponse(requestId, isEn ? "Hello! How can I help you today? 😊" : "안녕하세요! 무엇을 도와드릴까요? 😊");
	}

	// Pre-parsed mock data
	var mockSkills = ${skillsJson};
	var mockAuditLog = ${auditLogJson};
	var mockAuditStats = ${auditStatsJson};
	var mockSessions = ${sessionsJson};

	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		if (cmd === "plugin:event|listen") {
			if (!eventListeners.has(args.event)) eventListeners.set(args.event, []);
			eventListeners.get(args.event).push(args.handler);
			return args.handler;
		}
		if (cmd === "plugin:event|emit") { emitEvent(args.event, args.payload); return null; }
		if (cmd === "plugin:event|unlisten") return;

		if (cmd === "send_to_agent_command") {
			var request = JSON.parse(args.message);
			var requestId = request.requestId;
			var lastMsg = request.messages[request.messages.length - 1];
			var chunks = getResponseChunks(requestId, lastMsg.content);
			var delay = 300;
			for (var i = 0; i < chunks.length; i++) {
				(function(chunk, d) {
					setTimeout(function() { emitEvent("agent_response", JSON.stringify(chunk)); }, d);
				})(chunks[i], delay);
				delay += 300;
			}
			return;
		}

		if (cmd === "send_approval_response") return;
		if (cmd === "cancel_stream") return;
		if (cmd === "reset_window_state") return;

		// Skills
		if (cmd === "list_skills") return mockSkills;

		// Audit / Progress
		if (cmd === "get_audit_log") return mockAuditLog;
		if (cmd === "get_audit_stats") return mockAuditStats;
		if (cmd === "get_progress_data") return { events: mockAuditLog, stats: mockAuditStats };

		// Memory / History
		if (cmd === "memory_get_sessions" || cmd === "memory_get_sessions_with_count") return mockSessions;
		if (cmd === "memory_get_last_session") return mockSessions[0] || null;
		if (cmd === "memory_create_session") return args.id;
		if (cmd === "memory_get_messages") return [];
		if (cmd === "memory_save_message") return;
		if (cmd === "memory_delete_session") return;
		if (cmd === "memory_update_title") return;
		if (cmd === "memory_update_summary") return;
		if (cmd === "memory_search") return [];
		if (cmd === "memory_search_fts") return [];
		if (cmd === "memory_get_all_facts") return [
			{ id: "f1", key: "좋아하는 색", value: "파란색", created_at: "2026-02-19T10:00:00Z" },
			{ id: "f2", key: "이름", value: "사용자", created_at: "2026-02-18T09:00:00Z" },
		];
		if (cmd === "memory_upsert_fact") return;
		if (cmd === "memory_delete_fact") return;

		// API key validation
		if (cmd === "validate_api_key") return { valid: true };

		return undefined;
	};
})();
`;
}

function getTauriMock(locale: string) {
	return buildTauriMockScript(
		JSON.stringify(MOCK_SKILLS),
		JSON.stringify(MOCK_AUDIT_LOG),
		JSON.stringify(MOCK_AUDIT_STATS),
		JSON.stringify(MOCK_SESSIONS),
		locale,
	);
}

// ---- Screenshot helpers ----
function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
}

async function capture(page: Page, dir: string, name: string) {
	ensureDir(dir);
	const filepath = path.join(dir, `${name}.png`);
	await page.screenshot({ path: filepath, fullPage: false });
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tabCandidates(
	locale: string,
	tab: "chat" | "history" | "progress" | "skills" | "settings",
): string[] {
	if (tab === "chat") {
		return locale === "ko"
			? ["채팅", "Chat", "progress.tabChat", "chat"]
			: ["Chat", "채팅", "progress.tabChat", "chat"];
	}
	if (tab === "history") {
		return locale === "ko"
			? ["기록", "History", "history.tabHistory", "history"]
			: ["History", "기록", "history.tabHistory", "history"];
	}
	if (tab === "progress") {
		return locale === "ko"
			? ["작업", "Progress", "progress.tabProgress", "query_stats"]
			: ["Progress", "작업", "progress.tabProgress", "query_stats"];
	}
	if (tab === "skills") {
		return locale === "ko"
			? ["스킬", "Skills", "skills.tabSkills", "extension"]
			: ["Skills", "스킬", "skills.tabSkills", "extension"];
	}
	return locale === "ko"
		? ["설정", "Settings", "settings.title", "settings"]
		: ["Settings", "설정", "settings.title", "settings"];
}

async function clickTab(
	page: Page,
	locale: string,
	tab: "chat" | "history" | "progress" | "skills" | "settings",
) {
	const tabs = page.locator(".chat-tabs .chat-tab");
	await expect(tabs.first()).toBeVisible({ timeout: 10_000 });

	for (const label of tabCandidates(locale, tab)) {
		const matcher = new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, "i");
		const candidate = tabs.filter({ hasText: matcher }).first();
		if ((await candidate.count()) > 0) {
			await candidate.click();
			return;
		}
	}

	const indexMap = {
		chat: 0,
		history: 1,
		progress: 2,
		skills: 3,
		settings: 4,
	} as const;
	const index = indexMap[tab];
	if ((await tabs.count()) > index) {
		await tabs.nth(index).click();
		return;
	}

	const names = (await tabs.allTextContents()).map((s) => s.trim()).join(", ");
	throw new Error(
		`Tab not found: ${tab} (locale=${locale}), available=[${names}]`,
	);
}

function makeConfig(locale: string) {
	return {
		provider: "gemini",
		model: "gemini-2.5-flash",
		apiKey: MOCK_API_KEY,
		agentName: "Naia",
		userName: locale === "ko" ? "사용자" : "User",
		vrmModel: "/avatars/01-Sendagaya-Shino-uniform.vrm",
		persona: "Friendly AI companion",
		enableTools: true,
		locale,
		onboardingComplete: true,
		gatewayUrl: "ws://localhost:18789",
		gatewayToken: "mock-token",
	};
}

// 폰트와 아이콘이 100% 렌더링될 때까지 기다립니다 (Material Symbols의 X박스 문제 해결용)
async function ensureIconsLoaded(page: Page) {
	await page.waitForLoadState("networkidle");

	// 브라우저 내부적으로 모든 폰트가 로드되었는지 확인
	await page.evaluate(async () => {
		await document.fonts.ready;
	});

	// CSS에서 로드되는 아이콘 폰트가 화면에 완전히 그려질 때까지 강제로 추가 대기
	await page.waitForTimeout(6000);
}

// ---- Onboarding Screenshots ----
async function captureOnboarding(page: Page, dir: string, locale: string) {
	await page.addInitScript(getTauriMock(locale));
	await page.addInitScript((loc: string) => {
		localStorage.setItem("naia-config", JSON.stringify({ locale: loc }));
	}, locale);

	await page.goto("/");
	const overlay = page.locator(".onboarding-overlay");
	await expect(overlay).toBeVisible({ timeout: 15_000 });

	await ensureIconsLoaded(page);

	// Step 1: Provider selection
	await expect(page.locator(".onboarding-content")).toBeVisible({
		timeout: 5_000,
	});
	await capture(page, dir, "onboarding-provider");

	const providerCard = page.locator(".onboarding-provider-card").first();
	if (await providerCard.isVisible()) {
		await providerCard.click();
	}
	await page.locator(".onboarding-next-btn").click();
	await page.waitForTimeout(300);

	// Step 2: API Key
	await expect(page.locator(".onboarding-input")).toBeVisible({
		timeout: 5_000,
	});
	const apiInput = page.locator(".onboarding-input");
	if (await apiInput.isVisible()) {
		await apiInput.fill("AIzaSyxxxxxxxxxxxxxxxxxxxxxxxx");
		await page.waitForTimeout(200);
	}
	await capture(page, dir, "onboarding-apikey");
	await page.locator(".onboarding-next-btn").click();
	await page.waitForTimeout(300);

	// Step 3: Agent Name
	const agentInput = page.locator(".onboarding-input");
	await expect(agentInput).toBeVisible({ timeout: 5_000 });
	await agentInput.fill("Naia");
	await page.waitForTimeout(200);
	await capture(page, dir, "onboarding-agent-name");
	await page.locator(".onboarding-next-btn").click();
	await page.waitForTimeout(300);

	// Step 4: User Name
	const userInput = page.locator(".onboarding-input");
	await expect(userInput).toBeVisible({ timeout: 5_000 });
	await userInput.fill(locale === "ko" ? "사용자" : "User");
	await page.waitForTimeout(200);
	await capture(page, dir, "onboarding-user-name");
	await page.locator(".onboarding-next-btn").click();
	await page.waitForTimeout(300);

	// Step 5: Character (VRM selection) - Wait for canvas/images
	const vrmCard = page.locator(".onboarding-vrm-card");
	await expect(vrmCard.first()).toBeVisible({ timeout: 10_000 });
	await page.waitForTimeout(4000); // Wait enough for VRM thumbnails or canvas to render
	await capture(page, dir, "onboarding-character");
	await vrmCard.first().click();
	await page.locator(".onboarding-next-btn").click();
	await page.waitForTimeout(300);

	// Step 6: Personality
	const personalityCard = page.locator(".onboarding-personality-card");
	await expect(personalityCard.first()).toBeVisible({ timeout: 5_000 });
	await page.waitForTimeout(300);
	await capture(page, dir, "onboarding-personality");
	await personalityCard.first().click();
	await page.locator(".onboarding-next-btn").click();
	await page.waitForTimeout(300);

	// Step 6.5: Messenger Integration
	const messengerBtn = page.locator(".onboarding-next-btn");
	await expect(messengerBtn).toBeVisible({ timeout: 5_000 });
	await page.waitForTimeout(300);
	await capture(page, dir, "onboarding-messenger");
	await messengerBtn.click();
	await page.waitForTimeout(300);

	// Step 7: Complete
	await page.waitForTimeout(500);
	await capture(page, dir, "onboarding-complete");
}

// ---- Main App Screenshots ----
async function captureMainApp(page: Page, dir: string, locale: string) {
	await page.addInitScript(getTauriMock(locale));
	await page.addInitScript(
		(configJson: string) => {
			localStorage.setItem("naia-config", configJson);
		},
		JSON.stringify(makeConfig(locale)),
	);

	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 15_000 });

	// Wait VERY explicitly for Material Icons / Web Fonts to load
	await ensureIconsLoaded(page);

	// 1. Main screen
	await capture(page, dir, "main-screen");

	// 2. Chat with text input
	const chatInput = page.locator(".chat-input");
	await expect(chatInput).toBeEnabled({ timeout: 5_000 });
	await chatInput.fill(
		locale === "ko" ? "서울 날씨 알려줘" : "What's the weather in Seoul?",
	);
	await page.waitForTimeout(500);
	await capture(page, dir, "chat-text");

	// 2-1. Voice input UI (mic button visible)
	const micBtn = page.locator(".chat-mic-btn");
	if (await micBtn.isVisible()) {
		await micBtn.hover();
		await page.waitForTimeout(150);
		await capture(page, dir, "chat-voice");
	}

	// 3. Send message and capture response
	await chatInput.press("Enter");
	await page.waitForTimeout(3000); // give time to finish streaming mock response
	await capture(page, dir, "chat-response");

	// 3-1. Tool execution display (expand tool card)
	const toolHeader = page.locator(".tool-activity-header").first();
	if (await toolHeader.isVisible()) {
		await toolHeader.click();
		await page.waitForTimeout(500);
		await capture(page, dir, "chat-tool");
	}

	// 3-2. Cost dashboard
	const sessionCost = page.locator(".cost-badge.session-cost").first();
	if (await sessionCost.isVisible()) {
		await sessionCost.click();
		await page.waitForTimeout(500);
		await capture(page, dir, "chat-cost");
	}

	// [Approval capture removed due to flakiness]

	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 15_000 });
	await ensureIconsLoaded(page);

	// 4. History tab
	await clickTab(page, locale, "history");
	await page.waitForTimeout(500);
	await capture(page, dir, "history-tab");

	// 5. Progress tab
	await clickTab(page, locale, "progress");
	await expect(page.locator(".work-progress-panel")).toBeVisible({
		timeout: 10_000,
	});
	await page.waitForFunction(
		() => {
			return (
				document.querySelectorAll(".work-progress-stat").length > 0 ||
				document.querySelectorAll(".work-progress-event").length > 0
			);
		},
		{ timeout: 10_000 },
	);
	await page.waitForTimeout(500);
	await capture(page, dir, "progress-tab");

	// Progress 탭 전환 후 간헐적으로 헤더 탭 DOM이 사라져 이후 클릭이 실패한다.
	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 15_000 });
	await ensureIconsLoaded(page);

	// 6. Skills tab
	await clickTab(page, locale, "skills");
	await page.waitForTimeout(500);
	await capture(page, dir, "skills-tab");

	// 7. Skills card expanded
	const skillCard = page.locator(".skill-card").first();
	if (await skillCard.isVisible()) {
		const header = skillCard.locator(".skill-card-header");
		if (await header.isVisible()) {
			await header.click();
			await page.waitForTimeout(300);
			await capture(page, dir, "skills-card");
			await header.click();
		}
	}

	// 8. Settings tab
	await clickTab(page, locale, "settings");
	await page.waitForTimeout(1000);
	await capture(page, dir, "settings-overview");

	// 9. Settings — Theme section
	await page.evaluate(() => {
		const el = document.querySelector(".theme-picker");
		if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-theme");

	// 10. Settings — Avatar section
	await page.evaluate(() => {
		const el = document.querySelector(".vrm-picker");
		if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-avatar");

	// 11. Settings — Persona section
	await page.evaluate(() => {
		const dividers = document.querySelectorAll(".settings-section-divider");
		for (const d of dividers) {
			if (
				d.textContent?.includes("페르소나") ||
				d.textContent?.includes("Persona")
			) {
				d.scrollIntoView({ behavior: "instant", block: "start" });
				break;
			}
		}
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-persona");

	// 12. Settings — AI section
	await page.evaluate(() => {
		const dividers = document.querySelectorAll(".settings-section-divider");
		for (const d of dividers) {
			if (
				d.textContent?.includes("AI") ||
				d.textContent?.includes("Provider")
			) {
				d.scrollIntoView({ behavior: "instant", block: "start" });
				break;
			}
		}
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-ai");

	// 13. Settings — Voice section
	await page.evaluate(() => {
		const dividers = document.querySelectorAll(".settings-section-divider");
		for (const d of dividers) {
			if (d.textContent?.includes("음성") || d.textContent?.includes("Voice")) {
				d.scrollIntoView({ behavior: "instant", block: "start" });
				break;
			}
		}
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-voice");

	// 14. Settings — Tools section
	await page.evaluate(() => {
		const dividers = document.querySelectorAll(".settings-section-divider");
		for (const d of dividers) {
			if (d.textContent?.includes("도구") || d.textContent?.includes("Tools")) {
				d.scrollIntoView({ behavior: "instant", block: "start" });
				break;
			}
		}
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-tools");

	// 14-1. Settings — Device & Wake Word (New)
	await page.evaluate(() => {
		const dividers = document.querySelectorAll(".settings-section-divider");
		for (const d of dividers) {
			if (
				d.textContent?.includes("기기") ||
				d.textContent?.includes("호출어") ||
				d.textContent?.includes("Device") ||
				d.textContent?.includes("Wake")
			) {
				d.scrollIntoView({ behavior: "instant", block: "start" });
				break;
			}
		}
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-device");

	// 15. Settings — Lab section
	await page.evaluate(() => {
		const dividers = document.querySelectorAll(".settings-section-divider");
		for (const d of dividers) {
			if (d.textContent?.includes("Lab")) {
				d.scrollIntoView({ behavior: "instant", block: "start" });
				return;
			}
		}
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-lab");

	// 16. Settings — Memory section
	await page.evaluate(() => {
		const dividers = document.querySelectorAll(".settings-section-divider");
		for (const d of dividers) {
			if (
				d.textContent?.includes("기억") ||
				d.textContent?.includes("Memory")
			) {
				d.scrollIntoView({ behavior: "instant", block: "start" });
				break;
			}
		}
	});
	await page.waitForTimeout(500);
	await capture(page, dir, "settings-memory");

	// 17. Tab bar layout (back to chat)
	// await clickTab(page, locale, "chat");
	// await page.waitForTimeout(300);
	// await capture(page, dir, "tabs-layout");
}

// ---- Test Suites ----

for (const locale of ["ko", "en"] as const) {
	const dir = path.join(MANUAL_BASE, locale);
	const label = locale === "ko" ? "한국어" : "English";

	test.describe(`Manual Screenshots — ${label}`, () => {
		test(`onboarding flow (${locale})`, async ({ page }) => {
			await captureOnboarding(page, dir, locale);
		});

		test(`main app screens (${locale})`, async ({ page }) => {
			await captureMainApp(page, dir, locale);
		});
	});
}
