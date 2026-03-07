import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type ChannelAccount,
	type ChannelsStatusResult,
	getChannelsStatus,
	logoutChannel,
} from "../channels-proxy.js";
import { GatewayClient } from "../client.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_STATUS_RESPONSE: ChannelsStatusResult = {
	ts: Date.now(),
	channelOrder: ["discord", "slack", "telegram"],
	channelLabels: {
		discord: "Discord",
		slack: "Slack",
		telegram: "Telegram",
	},
	channels: {},
	channelAccounts: {
		discord: [
			{
				accountId: "discord-bot-1",
				name: "NanBot",
				enabled: true,
				connected: true,
				running: true,
			},
		],
		slack: [
			{
				accountId: "slack-bot-1",
				name: "NanSlack",
				enabled: true,
				connected: false,
				running: false,
				lastError: "Token expired",
			},
		],
		telegram: [],
	},
	channelDefaultAccountId: {
		discord: "discord-bot-1",
		slack: "slack-bot-1",
	},
};

describe("channels-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "channels.status":
						respond.ok(MOCK_STATUS_RESPONSE);
						break;
					case "channels.logout":
						if (params.channel === "discord" || params.channel === "slack") {
							respond.ok({
								channel: params.channel,
								accountId: params.accountId || "default",
								cleared: true,
								loggedOut: true,
							});
						} else {
							respond.error(
								"INVALID_REQUEST",
								`Unknown channel: ${params.channel}`,
							);
						}
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: ["exec.bash", "channels.status", "channels.logout"],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	describe("getChannelsStatus", () => {
		it("returns parsed channel status with accounts", async () => {
			const result = await getChannelsStatus(client);

			expect(result.channelOrder).toEqual(["discord", "slack", "telegram"]);
			expect(result.channelLabels.discord).toBe("Discord");
			expect(result.channelAccounts.discord).toHaveLength(1);
			expect(result.channelAccounts.discord[0].accountId).toBe("discord-bot-1");
			expect(result.channelAccounts.discord[0].connected).toBe(true);
		});

		it("includes disconnected channels with error info", async () => {
			const result = await getChannelsStatus(client);

			const slackAccounts = result.channelAccounts.slack;
			expect(slackAccounts).toHaveLength(1);
			expect(slackAccounts[0].connected).toBe(false);
			expect(slackAccounts[0].lastError).toBe("Token expired");
		});

		it("handles channels with no accounts", async () => {
			const result = await getChannelsStatus(client);

			expect(result.channelAccounts.telegram).toEqual([]);
		});
	});

	describe("logoutChannel", () => {
		it("logs out a channel successfully", async () => {
			const result = await logoutChannel(client, "discord");

			expect(result.cleared).toBe(true);
			expect(result.loggedOut).toBe(true);
			expect(result.channel).toBe("discord");
		});

		it("logs out with specific accountId", async () => {
			const result = await logoutChannel(client, "slack", "slack-bot-1");

			expect(result.cleared).toBe(true);
			expect(result.channel).toBe("slack");
		});

		it("throws error for unknown channel", async () => {
			await expect(logoutChannel(client, "unknown-channel")).rejects.toThrow();
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(getChannelsStatus(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
