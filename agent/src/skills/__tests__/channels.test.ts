import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createChannelsSkill } from "../built-in/channels.js";
import type { SkillDefinition } from "../types.js";

describe("skill_channels", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "channels.status":
						respond.ok({
							ts: Date.now(),
							channelOrder: ["discord", "slack"],
							channelLabels: {
								discord: "Discord",
								slack: "Slack",
							},
							channels: {
								discord: {
									configured: true,
									running: true,
									lastError: null,
								},
							},
							channelAccounts: {
								discord: [
									{
										accountId: "bot-1",
										name: "NanBot",
										enabled: true,
										connected: false,
									},
								],
								slack: [
									{
										accountId: "slack-1",
										name: "NanSlack",
										enabled: false,
										connected: false,
										lastError: "Token expired",
									},
								],
							},
							channelDefaultAccountId: {
								discord: "bot-1",
								slack: "slack-1",
							},
						});
						break;
					case "channels.logout":
						respond.ok({
							channel: params.channel,
							accountId: params.accountId || "default",
							cleared: true,
							loggedOut: true,
						});
						break;
					case "web.login.start":
						respond.ok({
							qrCode: "data:image/png;base64,mock-qr",
							expiresAt: Date.now() + 120_000,
						});
						break;
					case "web.login.wait":
						respond.ok({ connected: true });
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"channels.status",
					"channels.logout",
					"web.login.start",
					"web.login.wait",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createChannelsSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_channels");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(true);
		expect(skill.source).toBe("built-in");
	});

	it("returns channel status summary", async () => {
		const result = await skill.execute(
			{ action: "status" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed).toHaveLength(2);
		expect(parsed[0].id).toBe("discord");
		expect(parsed[0].label).toBe("Discord");
		// Discord bot channels are treated as connected when configured/running.
		expect(parsed[0].accounts[0].connected).toBe(true);
		expect(parsed[1].accounts[0].lastError).toBe("Token expired");
	});

	it("logs out a channel", async () => {
		const result = await skill.execute(
			{ action: "logout", channel: "discord" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.cleared).toBe(true);
	});

	it("requires channel for logout", async () => {
		const result = await skill.execute(
			{ action: "logout" },
			{ gateway: client },
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("channel is required");
	});

	it("starts web login", async () => {
		const result = await skill.execute(
			{ action: "login_start" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.qrCode).toContain("mock-qr");
	});

	it("waits for web login", async () => {
		const result = await skill.execute(
			{ action: "login_wait" },
			{ gateway: client },
		);

		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.connected).toBe(true);
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
