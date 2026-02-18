import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("10 — History Tab", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should create a conversation for history", async () => {
		await sendMessage("히스토리 테스트용 메시지");
		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should switch to history tab and show sessions", async () => {
		// Click history tab (4th tab)
		const historyTab = await $(S.historyTab);
		await historyTab.waitForClickable({ timeout: 10_000 });
		await historyTab.click();

		// Wait for history items to appear
		await browser.waitUntil(
			async () => {
				return browser.execute(
					(sel: string) => document.querySelectorAll(sel).length > 0,
					S.historyItem,
				);
			},
			{ timeout: 15_000, timeoutMsg: "No history items appeared" },
		);

		const count = await browser.execute(
			(sel: string) => document.querySelectorAll(sel).length,
			S.historyItem,
		);
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it("should mark current session in history", async () => {
		const hasCurrent = await browser.execute(
			() => !!document.querySelector(".history-item.current"),
		);
		expect(hasCurrent).toBe(true);
	});

	it("should start new conversation and see it in history", async () => {
		// Switch back to chat tab
		const chatTab = await $(S.chatTab);
		await chatTab.click();

		await browser.pause(500);

		// Create new conversation
		const newChatBtn = await $(S.newChatBtn);
		await newChatBtn.waitForClickable({ timeout: 10_000 });
		await newChatBtn.click();

		// Wait for messages to clear
		await browser.waitUntil(
			async () => {
				const count = await browser.execute(
					(sel: string) => document.querySelectorAll(sel).length,
					S.userMessage,
				);
				return count === 0;
			},
			{ timeout: 10_000 },
		);

		// Send a message in new conversation
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 10_000 });
		await sendMessage("두 번째 대화 메시지");

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);

		// Switch to history tab
		const historyTab = await $(S.historyTab);
		await historyTab.click();

		// Should now have at least 2 sessions
		await browser.waitUntil(
			async () => {
				const count = await browser.execute(
					(sel: string) => document.querySelectorAll(sel).length,
					S.historyItem,
				);
				return count >= 2;
			},
			{ timeout: 15_000, timeoutMsg: "Expected at least 2 history items" },
		);
	});

	it("should load previous session from history", async () => {
		// Click the first non-current history item to load it
		await browser.execute(() => {
			const items = document.querySelectorAll(".history-item:not(.current)");
			if (items.length > 0) {
				const mainArea = items[0].querySelector(
					".history-item-main",
				) as HTMLElement;
				if (mainArea) mainArea.click();
			}
		});

		// Should switch to chat tab and show restored messages
		await browser.waitUntil(
			async () => {
				const count = await browser.execute(
					(sel: string) => document.querySelectorAll(sel).length,
					S.userMessage,
				);
				return count >= 1;
			},
			{ timeout: 15_000, timeoutMsg: "Previous session messages not loaded" },
		);
	});

	it("should return to chat tab after loading session", async () => {
		// Chat input should be visible and enabled
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 10_000 });
	});
});
