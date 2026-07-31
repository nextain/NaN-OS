// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type Locale, setLocale, t } from "../i18n";

const locales: Locale[] = [
	"ko", "en", "ja", "zh", "fr", "de", "ru", "es", "ar", "hi", "bn", "pt", "id", "vi",
];

describe("chat output-stage translations", () => {
	it("provides all three stages in every supported Shell locale", () => {
		for (const locale of locales) {
			setLocale(locale);
			for (const key of [
				"chat.outputStage.thinking",
				"chat.outputStage.tts",
				"chat.outputStage.render",
			] as const) {
				expect(t(key).trim(), `${locale}:${key}`).not.toBe("");
			}
		}
	});

	it("uses the requested Korean stage wording", () => {
		setLocale("ko");
		expect(t("chat.outputStage.thinking")).toBe("생각 중…");
		expect(t("chat.outputStage.tts")).toBe("음성 처리 중…");
		expect(t("chat.outputStage.render")).toBe("렌더 중…");
	});
});
