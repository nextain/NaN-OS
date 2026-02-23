import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotifyDiscordSkill } from "../built-in/notify-discord.js";

// Mock notify-config
vi.mock("../built-in/notify-config.js", () => ({
	getNotifyWebhookUrl: vi.fn(),
}));

import { getNotifyWebhookUrl } from "../built-in/notify-config.js";

const mockGetUrl = vi.mocked(getNotifyWebhookUrl);
const skill = createNotifyDiscordSkill();

describe("skill_notify_discord", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_notify_discord");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	it("returns error when message is empty", async () => {
		const result = await skill.execute({ message: "" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("message is required");
	});

	it("returns error when message is missing", async () => {
		const result = await skill.execute({}, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("message is required");
	});

	it("returns error when webhook URL is not configured", async () => {
		mockGetUrl.mockResolvedValueOnce(null);

		const result = await skill.execute({ message: "hello" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("webhook");
	});

	it("sends message via webhook with Discord payload format", async () => {
		mockGetUrl.mockResolvedValueOnce(
			"https://discord.com/api/webhooks/123/abc",
		);
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const result = await skill.execute(
			{ message: "Deploy complete" },
			{},
		);
		expect(result.success).toBe(true);
		expect(result.output).toContain("Discord");

		expect(fetchSpy).toHaveBeenCalledWith(
			"https://discord.com/api/webhooks/123/abc",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"Content-Type": "application/json",
				}),
			}),
		);

		// Verify Discord payload uses "content" not "text"
		const call = fetchSpy.mock.calls[0];
		const body = JSON.parse(call[1]!.body as string);
		expect(body.content).toBe("Deploy complete");
		expect(body.text).toBeUndefined();
	});

	it("sends message with optional username", async () => {
		mockGetUrl.mockResolvedValueOnce(
			"https://discord.com/api/webhooks/123/abc",
		);
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const result = await skill.execute(
			{ message: "Alert!", username: "NaiaBot" },
			{},
		);
		expect(result.success).toBe(true);

		const call = fetchSpy.mock.calls[0];
		const body = JSON.parse(call[1]!.body as string);
		expect(body.content).toBe("Alert!");
		expect(body.username).toBe("NaiaBot");
	});

	it("handles webhook 500 error", async () => {
		mockGetUrl.mockResolvedValueOnce(
			"https://discord.com/api/webhooks/123/abc",
		);
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("Internal Server Error", { status: 500 }),
		);

		const result = await skill.execute({ message: "test" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("500");
	});

	it("handles network error", async () => {
		mockGetUrl.mockResolvedValueOnce(
			"https://discord.com/api/webhooks/123/abc",
		);
		vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
			new Error("Network error"),
		);

		const result = await skill.execute({ message: "test" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Network error");
	});

	it("tries Gateway relay first when gateway is available", async () => {
		const mockGateway = {
			isConnected: () => true,
			request: vi.fn().mockResolvedValueOnce({ success: true }),
			availableMethods: ["skills.invoke"],
		};

		const result = await skill.execute({ message: "via gateway" }, {
			gateway: mockGateway as never,
		});
		expect(result.success).toBe(true);
		expect(mockGateway.request).toHaveBeenCalledWith("skills.invoke", {
			skill: "discord",
			args: { message: "via gateway" },
		});
	});

	it("falls back to direct webhook when Gateway relay fails", async () => {
		const mockGateway = {
			isConnected: () => true,
			request: vi.fn().mockRejectedValueOnce(new Error("not found")),
			availableMethods: ["skills.invoke"],
		};

		mockGetUrl.mockResolvedValueOnce(
			"https://discord.com/api/webhooks/123/abc",
		);
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("ok", { status: 200 }),
		);

		const result = await skill.execute({ message: "fallback test" }, {
			gateway: mockGateway as never,
		});
		expect(result.success).toBe(true);
		expect(result.output).toContain("Discord");
	});
});
