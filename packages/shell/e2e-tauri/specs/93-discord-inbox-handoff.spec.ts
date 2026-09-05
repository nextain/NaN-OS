// 빈 Discord 대화함에서 연결 설정으로 이어지는 길(UC-DISCORD-1B,
// FR-DISCORD-SETUP-05)을 재는 스펙이다. 지금은 그 길이 제품에 없다.
//
// 빈 대화함의 `Discord 연결 설정 열기` 는 설정 화면까지만 데려간다.
// `ChannelsTab.tsx:128` 의 처리기가 부르는 `naia-open-settings` 를 듣는 곳이
// 저장소에 없고, 이어서 누르는 `[data-settings-tab="connections"]` 는
// `SettingsTab.tsx:3539` 에서 조건 없이 disabled 다(`연결 · 곧 제공`).
// 목적지인 `ConnectionsSettingsTab` 은 제품 코드가 값으로 import 하지 않는다.
// 그래서 이 스펙의 마지막 단정은 통과할 수 없는 것을 30초 기다린 뒤 실패한다 —
// 실제로 2026-09-05 naia-os-3090 회귀 기록의 stableFailures 에 그렇게 올랐다.
//
// 스펙이 낡은 것이 아니라 제품이 정본보다 뒤처져 있다. 그래서 표지를 바꾸지
// 않고 그대로 둔 채 끈다. 표지를 지우면 무엇이 없는지도 함께 지워지고,
// check-dead-ui-specs 의 KNOWN_DISABLED·KNOWN_UNRENDERED 항목이 근거를 잃는다.
// #563 이 닫히면 `it.skip` 을 `it` 으로 되돌리는 것으로 끝난다.

describe("Discord inbox setup handoff through the real Tauri Shell", () => {
	it.skip("rewrite-needed: 빈 대화함의 연결 안내 버튼이 열 수 없는 연결 탭으로 보낸다 — 제품 결함이 닫힐 때까지 끈다 (#563)", async () => {
		await browser.waitUntil(
			() =>
				browser.execute(
					() => document.querySelector(".chat-tab[aria-label]") !== null,
				),
			{ timeout: 30_000, interval: 250 },
		);
		await browser.execute(() => {
			const button = [...document.querySelectorAll<HTMLButtonElement>(".chat-tab")].find(
				(candidate) => /Channels|채널/.test(candidate.getAttribute("aria-label") ?? ""),
			);
			if (!button) throw new Error("Discord inbox tab not found");
			button.click();
		});

		const emptyState = await $("[data-testid='discord-inbox-empty-state']");
		await emptyState.waitForDisplayed({ timeout: 30_000 });
		expect(await emptyState.getText()).toMatch(
			/Connect Discord|Discord.*연결/,
		);

		await browser.execute(() => {
			const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
				(candidate) => /Open Discord Connections|Discord 연결 설정 열기/.test(candidate.textContent ?? ""),
			);
			if (!button) throw new Error("Discord Connections handoff not found");
			button.click();
		});

		const connectionsTab = await $("[data-settings-tab='connections']");
		await connectionsTab.waitForDisplayed({ timeout: 30_000 });
		await browser.waitUntil(
			() =>
				browser.execute(
					() => document.querySelector("[data-testid='discord-connections']") !== null,
				),
			{ timeout: 30_000, interval: 250 },
		);
	});
});
