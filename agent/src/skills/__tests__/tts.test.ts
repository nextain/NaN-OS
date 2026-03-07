import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type MockGateway,
	createMockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { GatewayClient } from "../../gateway/client.js";
import { createTtsSkill } from "../built-in/tts.js";
import type { SkillDefinition } from "../types.js";

describe("skill_tts", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "tts.status":
						respond.ok({
							enabled: true,
							provider: "openai",
							auto: "off",
							mode: "final",
						});
						break;
					case "tts.providers":
						respond.ok([
							{
								id: "openai",
								label: "OpenAI",
								configured: true,
								voices: ["alloy", "nova"],
							},
							{
								id: "edge",
								label: "Edge TTS",
								configured: true,
								voices: ["ko-KR-SunHiNeural"],
							},
						]);
						break;
					case "tts.setProvider":
						respond.ok({
							provider: params.provider,
							applied: true,
						});
						break;
					case "tts.enable":
						respond.ok({ enabled: true });
						break;
					case "tts.disable":
						respond.ok({ enabled: false });
						break;
					case "tts.convert":
						respond.ok({
							audio: "base64-test-audio",
							format: "mp3",
							durationMs: 1200,
						});
						break;
					case "config.get":
						respond.ok({
							exists: true,
							hash: "abc123",
							config: {},
						});
						break;
					case "config.patch":
						respond.ok({ ok: true });
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"tts.status",
					"tts.providers",
					"tts.setProvider",
					"tts.enable",
					"tts.disable",
					"tts.convert",
					"config.get",
					"config.patch",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createTtsSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_tts");
		expect(skill.tier).toBe(0);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	it("returns TTS status", async () => {
		const result = await skill.execute(
			{ action: "status" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.enabled).toBe(true);
		expect(parsed.provider).toBe("openai");
	});

	it("returns available providers", async () => {
		const result = await skill.execute(
			{ action: "providers" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed).toHaveLength(2);
		expect(parsed[0].id).toBe("openai");
	});

	it("sets provider", async () => {
		const result = await skill.execute(
			{ action: "set_provider", provider: "edge" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.provider).toBe("edge");
		expect(parsed.applied).toBe(true);
	});

	it("requires provider for set_provider action", async () => {
		const result = await skill.execute(
			{ action: "set_provider" },
			{ gateway: client },
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("provider is required");
	});

	it("sets auto mode", async () => {
		const result = await skill.execute(
			{ action: "set_auto", auto: "tagged" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.auto).toBe("tagged");
	});

	it("requires auto for set_auto action", async () => {
		const result = await skill.execute(
			{ action: "set_auto" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("auto is required");
	});

	it("sets output mode", async () => {
		const result = await skill.execute(
			{ action: "set_mode", mode: "all" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.mode).toBe("all");
	});

	it("requires mode for set_mode action", async () => {
		const result = await skill.execute(
			{ action: "set_mode" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("mode is required");
	});

	it("enables TTS", async () => {
		const result = await skill.execute(
			{ action: "enable" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.enabled).toBe(true);
	});

	it("disables TTS", async () => {
		const result = await skill.execute(
			{ action: "disable" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.enabled).toBe(false);
	});

	it("converts text to speech", async () => {
		const result = await skill.execute(
			{ action: "convert", text: "테스트 음성" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.audio).toBe("base64-test-audio");
		expect(parsed.format).toBe("mp3");
	});

	it("requires text for convert action", async () => {
		const result = await skill.execute(
			{ action: "convert" },
			{ gateway: client },
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("text is required");
	});

	it("returns error without gateway", async () => {
		const result = await skill.execute({ action: "status" }, {});

		expect(result.success).toBe(false);
		expect(result.error).toContain("Gateway not connected");
	});

	it("returns error for unknown action", async () => {
		const result = await skill.execute(
			{ action: "invalid" },
			{ gateway: client },
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown action");
	});
});
