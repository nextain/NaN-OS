import { describe, expect, it } from "vitest";
import {
	findPrebakedSpeech,
	isPrebakedNvaManifest,
	localizedNvaSpeech,
	resolveNvaLocale,
	type NvaManifest,
} from "../nva";

const manifest = {
	nva_version: "0.2",
	canvas: { width: 406, height: 720 },
	animations: { idle: { clip: "idle.webm", loop: true } },
	vrm_slots: {
		profile: { generation_mode: "prebaked_webm_only", default_locale: "ko-KR", available_locales: ["ko-KR", "en-US"] },
		speech: {
			greeting: {
				text: "안녕하세요.",
				clip: "ko.webm",
				by_locale: { "en-US": { text: "Hello.", clip: "en.webm" } },
			},
		},
	},
} as NvaManifest;

describe("pre-baked NVA manifest", () => {
	it("detects the web-player generation profile", () => expect(isPrebakedNvaManifest(manifest)).toBe(true));
	it("uses language-compatible and default locale fallback", () => {
		expect(resolveNvaLocale(manifest, "en-GB")).toBe("en-US");
		expect(resolveNvaLocale(manifest, "ja-JP")).toBe("ko-KR");
	});
	it("selects localized clips by normalized utterance text", () => {
		expect(findPrebakedSpeech(manifest, "HELLO!", "en-US")?.localized.clip).toBe("en.webm");
		expect(localizedNvaSpeech(manifest, manifest.vrm_slots!.speech!.greeting, "ja-JP").clip).toBe("ko.webm");
	});

	it("accepts the ADK v0.2 speech_clips bundle shape", () => {
		const adkManifest = {
			nva_version: "0.2",
			canvas: { width: 720, height: 1280 },
			animations: {
				idle: { clip: "clips/idle.webm", loop: true },
				talking: { clip: "clips/speech-ko.mp4", loop: true, can_talk: true },
			},
			speech_clips: {
				"speech-ko": {
					clip: "clips/speech-ko.mp4",
					locale: "ko-KR",
					text: "안녕하세요.",
					audio: "embedded",
				},
			},
		} as NvaManifest;

		expect(isPrebakedNvaManifest(adkManifest)).toBe(true);
		expect(resolveNvaLocale(adkManifest, "ko")).toBe("ko-KR");
		expect(
			findPrebakedSpeech(adkManifest, "안녕하세요!", "ko-KR")?.localized
				.clip,
		).toBe("clips/speech-ko.mp4");
	});
});
