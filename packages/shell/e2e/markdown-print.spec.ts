import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("Markdown print media paginates long code and contains wide tables", async ({ page }) => {
	await page.setContent(`
		<div id="root"><div class="workspace-editor__preview">
			<table><tbody><tr><td>${"very-long-cell-".repeat(80)}</td><td>value</td></tr></tbody></table>
			<pre>${Array.from({ length: 220 }, (_, i) => `line ${i} ${"x".repeat(100)}`).join("\n")}</pre>
			<div class="workspace-editor__mermaid"><svg viewBox="0 0 1200 600"></svg></div>
		</div></div>`);
	await page.addStyleTag({ content: readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8") });
	await page.emulateMedia({ media: "print" });

	const layout = await page.evaluate(() => {
		const preview = document.querySelector(".workspace-editor__preview") as HTMLElement;
		const pre = document.querySelector("pre") as HTMLElement;
		const table = document.querySelector("table") as HTMLElement;
		return {
			preBreak: getComputedStyle(pre).breakInside,
			preWrap: getComputedStyle(pre).whiteSpace,
			tableLayout: getComputedStyle(table).tableLayout,
			overflow: preview.scrollWidth - preview.clientWidth,
			height: preview.scrollHeight,
		};
	});
	expect(layout.preBreak).toBe("auto");
	expect(layout.preWrap).toBe("pre-wrap");
	expect(layout.tableLayout).toBe("fixed");
	expect(layout.overflow).toBeLessThanOrEqual(1);
	expect(layout.height).toBeGreaterThan(1200);
});
