import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("16 — skill_weather", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });

		// Pre-approve skill_weather
		await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			if (!raw) return;
			const config = JSON.parse(raw);
			const allowed = config.allowedTools || [];
			if (!allowed.includes("skill_weather")) {
				allowed.push("skill_weather");
			}
			config.allowedTools = allowed;
			localStorage.setItem("cafelua-config", JSON.stringify(config));
		});
	});

	it("should get weather for Seoul", async () => {
		await sendMessage(
			"서울 날씨 알려줘. skill_weather 도구를 반드시 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Should mention temperature or weather condition
		expect(text).toMatch(/°C|도|날씨|맑|흐|비|눈|temperature|weather/i);
	});

	it("should get weather for another city", async () => {
		await sendMessage(
			"도쿄 날씨는? skill_weather 도구를 사용해서 알려줘.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/°C|도|날씨|Tokyo|도쿄/i);
	});
});
