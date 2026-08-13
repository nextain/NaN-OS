import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// FR-VOICE.16 Phase 2b (#420): the sentence routing policy moved from
// ChatArea.sendSentenceToTts into lib/tts/sentence-pipeline. The contract
// semantics are unchanged — this file just reads the new owner, and now ALSO
// pins ChatArea down to a pure delegation (no synthesis side channels).

function pipelineSource(): string {
	return readFileSync(
		resolve(__dirname, "../../tts/sentence-pipeline.ts"),
		"utf8",
	);
}

function chatAreaSendSentenceSource(): string {
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

describe("Shell TTS single-ownership speech routing contract", () => {
	it("only bypasses Shell synthesis for an authored NVA clip match", () => {
		const source = pipelineSource();
		const authoredClipGate = source.indexOf("hasAuthoredClip(clean)");
		const authoredClipCall = source.indexOf(".playAuthoredClip(clean");
		const shellSynthesis = source.indexOf("synthesizeTts({");

		expect(authoredClipGate).toBeGreaterThanOrEqual(0);
		expect(authoredClipCall).toBeGreaterThan(authoredClipGate);
		expect(shellSynthesis).toBeGreaterThan(authoredClipCall);
		expect(source.slice(authoredClipCall, shellSynthesis)).toContain(
			"return;",
		);
	});

	it("never lets the NVA renderer synthesize dynamic speech itself", () => {
		const source = pipelineSource();

		// The old hijack called the renderer directly with no audio for every
		// sentence, skipping Shell synthesis entirely. That path is gone.
		expect(source).not.toContain(".speak(clean, undefined");
		expect(source).not.toContain("speakAudio(");
		expect(source).not.toContain('encoding: "LINEAR16"');
	});

	it("drives NVA visual state from Shell's own playback lifecycle, not synthesis", () => {
		const source = pipelineSource();
		expect(source).toContain("setSpeakingVisual(true)");
		expect(source).toContain("setSpeakingVisual(false)");
	});

	it("ChatArea delegates every sentence to the pipeline with no side channel", () => {
		const source = chatAreaSendSentenceSource();
		expect(source).toContain("sentencePipelineRef.current?.sendSentence(");
		// Phase 3 direction pinned now: the component must not synthesize,
		// speak, or drive the renderer directly from the send path.
		expect(source).not.toContain("synthesizeTts(");
		expect(source).not.toContain("speechSynthesis");
		expect(source).not.toContain("playAuthoredClip");
	});
});
