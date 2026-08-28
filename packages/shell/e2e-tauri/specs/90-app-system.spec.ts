import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";

const SHOT = "/tmp/app-system-screenshots";

/** Click a app tab by its app id (data-app-id attribute) */
async function clickAppTab(appId: string): Promise<boolean> {
	return browser.execute((id: string) => {
		const btn = document.querySelector(
			`.app-bar-tab[data-app-id="${id}"]`,
		) as HTMLButtonElement | null;
		if (btn) {
			btn.click();
			return true;
		}
		return false;
	}, appId);
}

/** Click the remove button of a app by its app id */
async function clickAppRemove(appId: string): Promise<boolean> {
	return browser.execute((id: string) => {
		const wrapper = document.querySelector(
			`.app-bar-tab-wrapper[data-app-id="${id}"]`,
		);
		const btn = wrapper?.querySelector(
			".app-bar-tab-remove",
		) as HTMLButtonElement | null;
		if (btn) {
			btn.click();
			return true;
		}
		return false;
	}, appId);
}

describe("90 — App System (AppBar + sample-note AI interaction)", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
		await $(S.appRoot).waitForDisplayed({ timeout: 15_000 });
		await browser.pause(500);
	});

	it("01 — AppBar is visible", async () => {
		const modeBar = await $(S.modeBar);
		await modeBar.waitForDisplayed({ timeout: 10_000 });
		await browser.saveScreenshot(`${SHOT}/01-appbar.png`);
	});

	it("02 — built-in apps appear in AppBar (browser, workspace)", async () => {
		const appIds = await browser.execute(() => {
			return Array.from(
				document.querySelectorAll(".app-bar-tab[data-app-id]"),
			).map((el) => el.getAttribute("data-app-id") ?? "");
		});
		expect(appIds).toContain("browser");
		expect(appIds).toContain("workspace");
	});

	it("03 — sample-note app appears in AppBar", async () => {
		const appIds = await browser.execute(() => {
			return Array.from(
				document.querySelectorAll(".app-bar-tab[data-app-id]"),
			).map((el) => el.getAttribute("data-app-id") ?? "");
		});
		expect(appIds).toContain("sample-note");
		await browser.saveScreenshot(`${SHOT}/03-sample-note-in-appbar.png`);
	});

	it("04 — clicking sample-note tab opens SampleNoteApp", async () => {
		const clicked = await clickAppTab("sample-note");
		expect(clicked).toBe(true);
		await browser.pause(500);

		const app = await $(S.sampleNoteApp);
		await app.waitForDisplayed({ timeout: 5_000 });
		await browser.saveScreenshot(`${SHOT}/04-sample-note-app-open.png`);
	});

	it("05 — AI can write to sample-note app", async () => {
		await sendMessage(
			"지금 열려있는 sample-note 메모장에 'E2E test note content' 라고 적어줘.",
		);
		await waitForToolSuccess();

		const lastTool = await browser.execute(() => {
			const items = document.querySelectorAll(".tool-activity[data-tool-name]");
			if (items.length > 0) {
				return items[items.length - 1]?.getAttribute("data-tool-name") ?? "";
			}
			const labels = document.querySelectorAll(".tool-activity .tool-name");
			return labels[labels.length - 1]?.textContent?.trim() ?? "";
		});
		expect(lastTool).toMatch(/skill_note_write/i);

		await browser.saveScreenshot(`${SHOT}/05-note-write.png`);
	});

	it("06 — note textarea reflects the written content", async () => {
		const value = await browser.execute(() => {
			const ta = document.querySelector(
				".sample-note-app__editor",
			) as HTMLTextAreaElement | null;
			return ta?.value ?? ta?.textContent ?? "";
		});
		expect(value).toMatch(/E2E test note content/i);
	});

	it("07 — AI can read note from sample-note app", async () => {
		await sendMessage("방금 sample-note 메모장에 뭐가 적혀있어?");
		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"메모장에 뭐가 적혀있는지 물어봤다",
			"AI가 'E2E test note content'를 포함한 노트 내용을 알려줬으면 PASS. 도구 오류나 내용 없음이면 FAIL",
		);
		await browser.saveScreenshot(`${SHOT}/07-note-read.png`);
	});

	it("08 — built-in apps have no remove button", async () => {
		const builtInHasRemove = await browser.execute(() => {
			for (const appId of ["browser", "workspace"]) {
				const wrapper = document.querySelector(
					`.app-bar-tab-wrapper[data-app-id="${appId}"]`,
				);
				if (wrapper?.querySelector(".app-bar-tab-remove")) return true;
			}
			return false;
		});
		expect(builtInHasRemove).toBe(false);
	});

	it("09 — sample-note has a remove button", async () => {
		const hasRemove = await browser.execute(() => {
			const wrapper = document.querySelector(
				`.app-bar-tab-wrapper[data-app-id="sample-note"]`,
			);
			return !!wrapper?.querySelector(".app-bar-tab-remove");
		});
		expect(hasRemove).toBe(true);
	});

	it("10 — removing sample-note tab removes it from AppBar", async () => {
		const tabsBefore = await browser.execute(() => {
			return document.querySelectorAll(".app-bar-tab[data-app-id]").length;
		});

		const removed = await clickAppRemove("sample-note");
		expect(removed).toBe(true);

		await browser.pause(500);

		const tabsAfter = await browser.execute(() => {
			return document.querySelectorAll(".app-bar-tab[data-app-id]").length;
		});
		expect(tabsAfter).toBe(tabsBefore - 1);

		const stillPresent = await browser.execute(() => {
			return !!document.querySelector(
				`.app-bar-tab[data-app-id="sample-note"]`,
			);
		});
		expect(stillPresent).toBe(false);

		await browser.saveScreenshot(`${SHOT}/10-sample-note-removed.png`);
	});
});
