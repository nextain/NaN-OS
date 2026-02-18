import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("11 — Cost Dashboard", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should show cost badge after a message exchange", async () => {
		// Send a message to generate cost data
		await sendMessage("비용 테스트 메시지");
		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);

		// Cost badge should appear (shows session cost)
		await browser.waitUntil(
			async () => {
				return browser.execute(
					(sel: string) => !!document.querySelector(sel),
					S.costBadge,
				);
			},
			{
				timeout: 10_000,
				timeoutMsg: "Cost badge did not appear after message exchange",
			},
		);
	});

	it("should toggle cost dashboard on badge click", async () => {
		// Click cost badge to open dashboard
		const costBadge = await $(S.costBadge);
		await costBadge.click();

		// Cost dashboard should appear
		const dashboard = await $(S.costDashboard);
		await dashboard.waitForDisplayed({ timeout: 10_000 });

		// Cost table should be present
		const hasTable = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.costTable,
		);
		expect(hasTable).toBe(true);
	});

	it("should display cost data in table", async () => {
		// Table should have rows (thead + at least 1 tbody row + tfoot)
		const rowCount = await browser.execute(() => {
			const table = document.querySelector(".cost-table");
			if (!table) return 0;
			return table.querySelectorAll("tr").length;
		});
		// At least: 1 header + 1 data + 1 footer = 3 rows
		expect(rowCount).toBeGreaterThanOrEqual(3);
	});

	it("should close cost dashboard on second badge click", async () => {
		const costBadge = await $(S.costBadge);
		await costBadge.click();

		// Dashboard should disappear
		await browser.waitUntil(
			async () => {
				return browser.execute(
					(sel: string) => !document.querySelector(sel),
					S.costDashboard,
				);
			},
			{ timeout: 5_000, timeoutMsg: "Cost dashboard did not close" },
		);
	});
});
