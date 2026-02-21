import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getNotifyWebhookUrl,
	type NotifyProvider,
} from "../built-in/notify-config.js";

// Mock fs/promises for config.json reading
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";

const mockReadFile = vi.mocked(readFile);

describe("getNotifyWebhookUrl", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv, HOME: "/home/test" };
		mockReadFile.mockReset();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("returns env var for slack when SLACK_WEBHOOK_URL is set", async () => {
		process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/X";
		const url = await getNotifyWebhookUrl("slack");
		expect(url).toBe("https://hooks.slack.com/services/T/B/X");
	});

	it("returns env var for discord when DISCORD_WEBHOOK_URL is set", async () => {
		process.env.DISCORD_WEBHOOK_URL =
			"https://discord.com/api/webhooks/123/abc";
		const url = await getNotifyWebhookUrl("discord");
		expect(url).toBe("https://discord.com/api/webhooks/123/abc");
	});

	it("falls back to config.json when env var is not set", async () => {
		delete process.env.SLACK_WEBHOOK_URL;
		mockReadFile.mockResolvedValueOnce(
			JSON.stringify({
				notifications: {
					slack: { webhookUrl: "https://hooks.slack.com/from-config" },
				},
			}),
		);

		const url = await getNotifyWebhookUrl("slack");
		expect(url).toBe("https://hooks.slack.com/from-config");
		expect(mockReadFile).toHaveBeenCalledWith(
			"/home/test/.naia/config.json",
			"utf-8",
		);
	});

	it("env var takes priority over config.json", async () => {
		process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/from-env";
		const url = await getNotifyWebhookUrl("slack");
		expect(url).toBe("https://hooks.slack.com/from-env");
		// config.json should not be read
		expect(mockReadFile).not.toHaveBeenCalled();
	});

	it("returns null when neither env var nor config.json is set", async () => {
		delete process.env.SLACK_WEBHOOK_URL;
		mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));

		const url = await getNotifyWebhookUrl("slack");
		expect(url).toBeNull();
	});

	it("returns null when config.json has no matching provider", async () => {
		delete process.env.DISCORD_WEBHOOK_URL;
		mockReadFile.mockResolvedValueOnce(
			JSON.stringify({
				notifications: {
					slack: { webhookUrl: "https://hooks.slack.com/only-slack" },
				},
			}),
		);

		const url = await getNotifyWebhookUrl("discord");
		expect(url).toBeNull();
	});

	it("returns null when config.json is invalid JSON", async () => {
		delete process.env.SLACK_WEBHOOK_URL;
		mockReadFile.mockResolvedValueOnce("not valid json {{{");

		const url = await getNotifyWebhookUrl("slack");
		expect(url).toBeNull();
	});

	it("handles unknown provider gracefully", async () => {
		const url = await getNotifyWebhookUrl("telegram" as NotifyProvider);
		expect(url).toBeNull();
	});
});
