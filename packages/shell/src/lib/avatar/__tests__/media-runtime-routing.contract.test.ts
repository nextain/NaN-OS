import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sentenceRoutingSource(): string {
	const chatArea = readFileSync(
		resolve(__dirname, "../../../components/ChatArea.tsx"),
		"utf8",
	);
	const start = chatArea.indexOf("function sendSentenceToTts");
	const end = chatArea.indexOf("function cleanupPipeline", start);
	expect(start).toBeGreaterThanOrEqual(0);
	expect(end).toBeGreaterThan(start);
	return chatArea.slice(start, end);
}

describe("Naia Media Runtime speech routing contract", () => {
	it("routes active video-avatar speech to text once before Shell synthesis", () => {
		const source = sentenceRoutingSource();
		const runtimeCall = source.indexOf("cascadeAvatar.speak(clean)");
		const shellSynthesis = source.indexOf("synthesizeTts({");

		expect(runtimeCall).toBeGreaterThanOrEqual(0);
		expect(shellSynthesis).toBeGreaterThan(runtimeCall);
		expect(source.slice(runtimeCall, shellSynthesis)).toContain("return;");
	});

	it("does not resend synthesized PCM/WAV through the supplied-audio path", () => {
		const source = sentenceRoutingSource();

		expect(source).not.toContain("speakAudio(");
		expect(source).not.toContain('encoding: "LINEAR16"');
	});
});
