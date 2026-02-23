import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createVoiceWakeSkill } from "../built-in/voicewake.js";
import type { SkillDefinition } from "../types.js";

describe("skill_voicewake", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "voicewake.get":
						respond.ok({
							triggers: ["낸", "openclaw"],
						});
						break;
					case "voicewake.set":
						respond.ok({ triggers: params.triggers });
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: ["exec.bash", "voicewake.get", "voicewake.set"],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createVoiceWakeSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_voicewake");
		expect(skill.tier).toBe(0);
		expect(skill.requiresGateway).toBe(true);
		expect(skill.source).toBe("built-in");
	});

	it("returns current triggers", async () => {
		const result = await skill.execute(
			{ action: "get" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.triggers).toEqual(["낸", "openclaw"]);
	});

	it("sets new triggers", async () => {
		const result = await skill.execute(
			{ action: "set", triggers: ["낸", "Naia", "hey alpha"] },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.triggers).toEqual(["낸", "Naia", "hey alpha"]);
	});

	it("requires triggers for set action", async () => {
		const result = await skill.execute(
			{ action: "set" },
			{ gateway: client },
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("triggers");
	});

	it("returns error without gateway", async () => {
		const result = await skill.execute({ action: "get" }, {});

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
