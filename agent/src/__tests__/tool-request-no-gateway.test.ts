/**
 * Test: tool_request works when Gateway is unavailable.
 *
 * Validates that skills like Edge TTS preview (which don't require Gateway)
 * still execute correctly when the Gateway connection fails.
 *
 * Run:
 *   pnpm exec vitest run src/__tests__/tool-request-no-gateway.test.ts
 */
import { describe, expect, it } from "vitest";
import { createTtsSkill } from "../skills/built-in/tts.js";
import { synthesizeEdgeSpeech } from "../tts/edge-tts.js";

describe("tool_request without Gateway", () => {
	it("Edge TTS preview succeeds with gateway=null", async () => {
		const skill = createTtsSkill();
		const result = await skill.execute(
			{
				action: "preview",
				provider: "edge",
				text: "게이트웨이 없이 미리듣기 테스트",
				voice: "ko-KR-SunHiNeural",
			},
			{
				gateway: undefined,
				writeLine: () => {},
				requestId: "test-no-gw",
			},
		);

		expect(result.success).toBe(true);
		expect(result.output).toBeTruthy();
		const parsed = JSON.parse(result.output);
		expect(parsed.audio).toBeTruthy();
		expect(parsed.audio.length).toBeGreaterThan(100);
		expect(parsed.format).toBe("mp3");
	}, 15000);

	it("set_provider fails gracefully with gateway=null", async () => {
		const skill = createTtsSkill();
		const result = await skill.execute(
			{ action: "set_provider", provider: "edge" },
			{
				gateway: undefined,
				writeLine: () => {},
				requestId: "test-no-gw-set",
			},
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Gateway not connected");
	});

	it("synthesizeEdgeSpeech works directly without any gateway", async () => {
		const audio = await synthesizeEdgeSpeech(
			"게이트웨이 연결 없이도 Edge TTS는 동작합니다.",
		);
		expect(audio).not.toBeNull();
		expect(audio?.length).toBeGreaterThan(100);
	}, 15000);
});
