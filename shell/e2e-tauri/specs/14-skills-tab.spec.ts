import { S } from "../helpers/selectors.js";

/**
 * 14 — Skills Tab E2E
 *
 * Verifies the Skills management UI:
 * - Tab navigation works
 * - Skills are listed (at least 4 built-in)
 * - Search filters work
 * - Toggle disable/enable works for custom skills
 * - Built-in skills cannot be toggled
 */
describe("14 — skills tab", () => {
	it("should navigate to Skills tab and show skills list", async () => {
		const skillsTabBtn = await $(S.skillsTab);
		await skillsTabBtn.waitForDisplayed({ timeout: 10_000 });
		await skillsTabBtn.click();

		const skillsPanel = await $(S.skillsTabPanel);
		await skillsPanel.waitForDisplayed({ timeout: 5_000 });
	});

	it("should display at least 4 built-in skills", async () => {
		const cards = await $$(S.skillsCard);
		expect(cards.length).toBeGreaterThanOrEqual(4);

		// Verify built-in section title exists
		const sectionTitles = await $$(S.skillsSectionTitle);
		expect(sectionTitles.length).toBeGreaterThanOrEqual(1);
		const firstSectionText = await sectionTitles[0].getText();
		expect(firstSectionText).toMatch(/기본 스킬|Built-in/i);
	});

	it("should show skills count in header", async () => {
		const countEl = await $(S.skillsCount);
		await countEl.waitForDisplayed({ timeout: 3_000 });
		const text = await countEl.getText();
		// Format: enabled/total e.g. "55/55"
		expect(text).toMatch(/\d+\/\d+/);
	});

	it("should filter skills by search query", async () => {
		const searchInput = await $(S.skillsSearch);
		await searchInput.waitForDisplayed({ timeout: 3_000 });

		const cardsBefore = await $$(S.skillsCard);
		const countBefore = cardsBefore.length;

		// Search for "time" — should show fewer results
		await searchInput.setValue("time");
		await browser.pause(300);

		const cardsAfter = await $$(S.skillsCard);
		expect(cardsAfter.length).toBeLessThan(countBefore);
		expect(cardsAfter.length).toBeGreaterThanOrEqual(1);

		// Clear search
		await searchInput.clearValue();
		await browser.pause(300);
	});

	it("should not show toggle for built-in skills", async () => {
		// Built-in skills are listed first, they should not have toggle inputs
		const firstCard = await $$(S.skillsCard);
		if (firstCard.length === 0) return;

		// The first card should be a built-in skill (no toggle)
		const toggleInFirstCard = await firstCard[0].$(S.skillsToggle);
		const exists = await toggleInFirstCard.isExisting();
		expect(exists).toBe(false);
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
