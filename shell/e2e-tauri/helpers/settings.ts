import { S } from "./selectors.js";

/**
 * Retry-safe browser.refresh() — WebKitGTK may throw UND_ERR_HEADERS_TIMEOUT.
 */
export async function safeRefresh(maxAttempts = 3): Promise<void> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			await browser.refresh();
			return;
		} catch {
			if (attempt === maxAttempts - 1) throw new Error(`browser.refresh() failed after ${maxAttempts} attempts`);
			await browser.pause(2_000);
		}
	}
}

/**
 * Enable tools + pre-approve specific tools in localStorage config.
 * Only refreshes the page when config actually changed.
 */
export async function enableToolsForSpec(tools: string[]): Promise<void> {
	const needsRefresh = await browser.execute((toolNames: string[]) => {
		const raw = localStorage.getItem("naia-config");
		const config = raw ? JSON.parse(raw) : {};
		let changed = false;

		if (!config.enableTools) {
			config.enableTools = true;
			changed = true;
		}

		const disabled = Array.isArray(config.disabledSkills)
			? config.disabledSkills
			: [];
		const newDisabled = disabled.filter(
			(s: string) => !toolNames.includes(s),
		);
		if (newDisabled.length !== disabled.length) {
			config.disabledSkills = newDisabled;
			changed = true;
		}

		const allowed = config.allowedTools || [];
		for (const t of toolNames) {
			if (!allowed.includes(t)) {
				allowed.push(t);
				changed = true;
			}
		}
		config.allowedTools = allowed;
		localStorage.setItem("naia-config", JSON.stringify(config));

		return changed;
	}, tools);

	if (needsRefresh) {
		// Retry refresh — WebKitGTK may throw UND_ERR_HEADERS_TIMEOUT intermittently
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				await browser.refresh();
				break;
			} catch {
				if (attempt === 2) throw new Error("browser.refresh() failed after 3 attempts");
				await browser.pause(2_000);
			}
		}
		// Wait for app to fully load after refresh
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	}
}

/**
 * Fill the settings tab and save, then switch to chat tab.
 * Assumes the settings tab is already visible.
 */
export async function configureSettings(opts: {
	provider: string;
	apiKey: string;
	gatewayUrl: string;
	gatewayToken: string;
}): Promise<void> {
	// Provider
	const providerSelect = await $(S.providerSelect);
	await providerSelect.waitForDisplayed({ timeout: 10_000 });
	await providerSelect.selectByAttribute("value", opts.provider);

	// API Key — use JS native setter (WebDriver setValue may not trigger React state in WebKitGTK)
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			if (!el) throw new Error(`API key input ${sel} not found`);
			el.scrollIntoView({ block: "center" });
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			if (setter) setter.call(el, val);
			else el.value = val;
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		S.apiKeyInput,
		opts.apiKey,
	);

	// Enable tools — use JS click (WebDriver click fails on off-screen checkboxes in WebKitGTK)
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLInputElement | null;
		if (el && !el.checked) {
			el.click();
		}
	}, S.toolsToggle);

	// Gateway URL — use JS to set value (may be off-screen in tab layout)
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			if (!el) return;
			el.scrollIntoView({ block: "center" });
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			if (setter) setter.call(el, val);
			else el.value = val;
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		S.gatewayUrlInput,
		opts.gatewayUrl,
	);

	// Gateway Token
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			if (!el) return;
			el.scrollIntoView({ block: "center" });
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			if (setter) setter.call(el, val);
			else el.value = val;
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		S.gatewayTokenInput,
		opts.gatewayToken,
	);

	// Save — use JS click
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (el) {
			el.scrollIntoView({ block: "center" });
			el.click();
		}
	}, S.settingsSaveBtn);

	// Switch to chat tab
	const chatTab = await $(S.chatTab);
	await chatTab.click();

	// Wait for chat input to become visible
	const chatInput = await $(S.chatInput);
	await chatInput.waitForDisplayed({ timeout: 10_000 });
}

/** Navigate to the Settings tab and wait for render. */
export async function navigateToSettings(): Promise<void> {
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (el) el.click();
	}, S.settingsTabBtn);
	await browser.pause(500);
}

/** Scroll a specific element into view. */
export async function scrollToSection(selector: string): Promise<void> {
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel);
		if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
	}, selector);
	await browser.pause(300);
}

/** Set an input/textarea value using React-compatible native setter. */
export async function setNativeValue(selector: string, value: string): Promise<void> {
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
			if (!el) return;
			el.scrollIntoView({ block: "center" });
			const proto = el instanceof HTMLTextAreaElement
				? HTMLTextAreaElement.prototype
				: HTMLInputElement.prototype;
			const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
			if (setter) setter.call(el, val);
			else el.value = val;
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		selector,
		value,
	);
}

/** Click an element by selector using browser.execute (reliable in WebKitGTK). */
export async function clickBySelector(selector: string): Promise<void> {
	await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (el) el.click();
	}, selector);
}

const API_KEY = process.env.CAFE_E2E_API_KEY || process.env.GEMINI_API_KEY || "";

/**
 * Ensure the app is ready: bypass onboarding, set base config, wait for tabs.
 * Safe to call multiple times — skips if already configured.
 */
export async function ensureAppReady(): Promise<void> {
	const alreadyConfigured = await browser.execute(() => {
		const raw = localStorage.getItem("naia-config");
		if (!raw) return false;
		const config = JSON.parse(raw);
		return !!config.onboardingComplete && !!config.apiKey;
	});

	if (!alreadyConfigured) {
		await browser.execute((key: string) => {
			const existing = localStorage.getItem("naia-config");
			const config = existing ? JSON.parse(existing) : {};
			Object.assign(config, {
				provider: config.provider || "gemini",
				model: config.model || "gemini-2.5-flash",
				apiKey: config.apiKey || key,
				agentName: config.agentName || "Naia",
				userName: config.userName || "Tester",
				vrmModel: config.vrmModel || "/avatars/Sendagaya-Shino-dark-uniform.vrm",
				persona: config.persona || "Friendly AI companion",
				enableTools: true,
				locale: config.locale || "ko",
				onboardingComplete: true,
			});
			localStorage.setItem("naia-config", JSON.stringify(config));
		}, API_KEY);
		// Retry refresh — WebKitGTK may throw UND_ERR_HEADERS_TIMEOUT intermittently
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				await browser.refresh();
				break;
			} catch {
				if (attempt === 2) throw new Error("browser.refresh() failed after 3 attempts in ensureAppReady");
				await browser.pause(2_000);
			}
		}
	}

	// Wait for app + tabs to be ready
	const appRoot = await $(S.appRoot);
	await appRoot.waitForDisplayed({ timeout: 15_000 });
	await browser.waitUntil(
		async () => browser.execute(
			(sel: string) => !document.querySelector(sel),
			S.onboardingOverlay,
		),
		{ timeout: 15_000 },
	);
	await browser.waitUntil(
		async () => browser.execute(
			() => document.querySelectorAll(".chat-tabs .chat-tab").length >= 8,
		),
		{ timeout: 15_000 },
	);
}
