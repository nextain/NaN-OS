import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createNaiaDiscordSkill, ensureDiscordAllowlisted } from "../built-in/naia-discord.js";

describe("skill_naia_discord", () => {
	const skill = createNaiaDiscordSkill();

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_naia_discord");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(true);
		expect(skill.source).toBe("built-in");
	});

	it("returns error when gateway is missing", async () => {
		const result = await skill.execute({ action: "status" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Gateway not connected");
	});

	it("returns discord status via channels.status", async () => {
		const gateway = {
			isConnected: () => true,
			availableMethods: ["channels.status"],
			request: vi.fn().mockResolvedValueOnce({
				channelOrder: ["discord", "slack"],
				channelLabels: { discord: "Discord", slack: "Slack" },
				channelAccounts: {
					discord: [{ accountId: "default", connected: true, enabled: true }],
					slack: [{ accountId: "x", connected: false, enabled: false }],
				},
			}),
		};

		const result = await skill.execute({ action: "status" }, { gateway: gateway as never });
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].id).toBe("discord");
		expect(parsed[0].resolvedUserTarget).toBeNull();
		expect(gateway.request).toHaveBeenCalledWith("channels.status", {
			probe: undefined,
		});
	});

	it("returns error when send target is missing", async () => {
		const prevToken = process.env.DISCORD_BOT_TOKEN;
		const prevTarget = process.env.DISCORD_DEFAULT_TARGET;
		const prevChannelId = process.env.DISCORD_DEFAULT_CHANNEL_ID;
		const prevUserId = process.env.DISCORD_DEFAULT_USER_ID;
		delete process.env.DISCORD_BOT_TOKEN;
		delete process.env.DISCORD_DEFAULT_TARGET;
		delete process.env.DISCORD_DEFAULT_CHANNEL_ID;
		delete process.env.DISCORD_DEFAULT_USER_ID;

		const gateway = {
			isConnected: () => true,
			availableMethods: ["send"],
			request: vi.fn(),
		};

		const result = await skill.execute(
			{ action: "send", message: "hello" },
			{ gateway: gateway as never },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("target is required");

		if (prevToken !== undefined) process.env.DISCORD_BOT_TOKEN = prevToken;
		if (prevTarget !== undefined) process.env.DISCORD_DEFAULT_TARGET = prevTarget;
		if (prevChannelId !== undefined)
			process.env.DISCORD_DEFAULT_CHANNEL_ID = prevChannelId;
		if (prevUserId !== undefined) process.env.DISCORD_DEFAULT_USER_ID = prevUserId;
	});

	it("uses DISCORD_DEFAULT_USER_ID when target args are omitted", async () => {
		const prev = process.env.DISCORD_DEFAULT_USER_ID;
		process.env.DISCORD_DEFAULT_USER_ID = "777777777777";

		const gateway = {
			isConnected: () => true,
			availableMethods: ["send"],
			request: vi.fn().mockResolvedValueOnce({
				runId: "run-env-1",
				channel: "discord",
				messageId: "m-env-1",
			}),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "hello from env target",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(true);
		expect(gateway.request).toHaveBeenCalledTimes(1);
		expect(gateway.request.mock.calls[0][1]).toMatchObject({
			channel: "discord",
			to: "user:777777777777",
			message: "hello from env target",
		});

		if (prev !== undefined) process.env.DISCORD_DEFAULT_USER_ID = prev;
		else delete process.env.DISCORD_DEFAULT_USER_ID;
	});

	it("derives user target from connected numeric discord accountId", async () => {
		const prevUser = process.env.DISCORD_DEFAULT_USER_ID;
		const prevTarget = process.env.DISCORD_DEFAULT_TARGET;
		const prevChannel = process.env.DISCORD_DEFAULT_CHANNEL_ID;
		delete process.env.DISCORD_DEFAULT_USER_ID;
		delete process.env.DISCORD_DEFAULT_TARGET;
		delete process.env.DISCORD_DEFAULT_CHANNEL_ID;

		const gateway = {
			isConnected: () => true,
			availableMethods: ["send", "channels.status"],
			request: vi
				.fn()
				.mockResolvedValueOnce({ sessions: [] }) // sessions.list (no discord sessions)
				.mockResolvedValueOnce({
					channelAccounts: {
						discord: [
							{
								accountId: "1473170396390883564",
								connected: true,
								enabled: true,
							},
						],
					},
					channelDefaultAccountId: {
						discord: "1473170396390883564",
					},
				})
				.mockResolvedValueOnce({
					runId: "run-derived-1",
					channel: "discord",
					messageId: "m-derived-1",
				}),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "hello from derived user target",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(true);
		expect(gateway.request).toHaveBeenNthCalledWith(1, "sessions.list", {});
		expect(gateway.request).toHaveBeenNthCalledWith(2, "channels.status", {});
		expect(gateway.request).toHaveBeenNthCalledWith(
			3,
			"send",
			expect.objectContaining({
				channel: "discord",
				to: "user:1473170396390883564",
				message: "hello from derived user target",
			}),
		);

		if (prevUser !== undefined) process.env.DISCORD_DEFAULT_USER_ID = prevUser;
		if (prevTarget !== undefined) process.env.DISCORD_DEFAULT_TARGET = prevTarget;
		if (prevChannel !== undefined) process.env.DISCORD_DEFAULT_CHANNEL_ID = prevChannel;
	});

	it("derives user target from discord userId field even when accountId is non-numeric", async () => {
		const prevUser = process.env.DISCORD_DEFAULT_USER_ID;
		const prevTarget = process.env.DISCORD_DEFAULT_TARGET;
		const prevChannel = process.env.DISCORD_DEFAULT_CHANNEL_ID;
		delete process.env.DISCORD_DEFAULT_USER_ID;
		delete process.env.DISCORD_DEFAULT_TARGET;
		delete process.env.DISCORD_DEFAULT_CHANNEL_ID;

		const gateway = {
			isConnected: () => true,
			availableMethods: ["send", "channels.status"],
			request: vi
				.fn()
				.mockResolvedValueOnce({ sessions: [] }) // sessions.list (no discord sessions)
				.mockResolvedValueOnce({
					channelAccounts: {
						discord: [
							{
								accountId: "default",
								userId: "1473170396390883564",
								connected: true,
								enabled: true,
							},
						],
					},
					channelDefaultAccountId: {
						discord: "default",
					},
				})
				.mockResolvedValueOnce({
					runId: "run-derived-userid-1",
					channel: "discord",
					messageId: "m-derived-userid-1",
				}),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "hello from derived explicit userId",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(true);
		expect(gateway.request).toHaveBeenNthCalledWith(1, "sessions.list", {});
		expect(gateway.request).toHaveBeenNthCalledWith(2, "channels.status", {});
		expect(gateway.request).toHaveBeenNthCalledWith(
			3,
			"send",
			expect.objectContaining({
				channel: "discord",
				to: "user:1473170396390883564",
				message: "hello from derived explicit userId",
			}),
		);

		if (prevUser !== undefined) process.env.DISCORD_DEFAULT_USER_ID = prevUser;
		if (prevTarget !== undefined) process.env.DISCORD_DEFAULT_TARGET = prevTarget;
		if (prevChannel !== undefined) process.env.DISCORD_DEFAULT_CHANNEL_ID = prevChannel;
	});

	it("strips emotion tags from Discord messages before sending", async () => {
		const gateway = {
			isConnected: () => true,
			availableMethods: ["send"],
			request: vi.fn().mockResolvedValueOnce({
				runId: "run-strip-1",
				channel: "discord",
				messageId: "m-strip-1",
			}),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "[THINK] 음, 생각해볼게요...",
				channelId: "12345",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(true);
		expect(gateway.request.mock.calls[0][1].message).toBe("음, 생각해볼게요...");
	});

	it("strips multiple emotion tags from message", async () => {
		const gateway = {
			isConnected: () => true,
			availableMethods: ["send"],
			request: vi.fn().mockResolvedValueOnce({
				runId: "run-strip-2",
				channel: "discord",
				messageId: "m-strip-2",
			}),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "[HAPPY] 좋은 아침! [NEUTRAL] 오늘 날씨 좋네요",
				channelId: "12345",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(true);
		expect(gateway.request.mock.calls[0][1].message).toBe("좋은 아침! 오늘 날씨 좋네요");
	});

	it("preserves emoji in Discord messages", async () => {
		const gateway = {
			isConnected: () => true,
			availableMethods: ["send"],
			request: vi.fn().mockResolvedValueOnce({
				runId: "run-emoji-1",
				channel: "discord",
				messageId: "m-emoji-1",
			}),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "[HAPPY] 좋은 아침이에요! 😊 오늘도 화이팅! ✨",
				channelId: "12345",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(true);
		expect(gateway.request.mock.calls[0][1].message).toBe("좋은 아침이에요! 😊 오늘도 화이팅! ✨");
	});

	it("sends discord message through gateway send", async () => {
		const gateway = {
			isConnected: () => true,
			availableMethods: ["send"],
			request: vi.fn().mockResolvedValueOnce({
				runId: "run-1",
				channel: "discord",
				messageId: "m-1",
			}),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "hello from naia",
				channelId: "12345",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(true);
		expect(gateway.request).toHaveBeenCalledTimes(1);
		expect(gateway.request.mock.calls[0][0]).toBe("send");
		expect(gateway.request.mock.calls[0][1]).toMatchObject({
			channel: "discord",
			to: "channel:12345",
			message: "hello from naia",
		});
		expect(gateway.request.mock.calls[0][1].idempotencyKey).toBeTruthy();
	});

	it("returns actionable error when gateway send fails", async () => {
		const gateway = {
			isConnected: () => true,
			availableMethods: ["send"],
			request: vi.fn().mockRejectedValueOnce(new Error("Missing Access")),
		};

		const result = await skill.execute(
			{
				action: "send",
				message: "hello",
				to: "channel:123",
			},
			{ gateway: gateway as never },
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Missing Access");
		expect(result.error).toContain("numeric target IDs");
	});
});

describe("ensureDiscordAllowlisted", () => {
	let tempDir: string;
	let allowlistPath: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `naia-discord-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		allowlistPath = join(tempDir, "credentials", "discord-allowFrom.json");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates allowlist file when it does not exist", async () => {
		await ensureDiscordAllowlisted("865850174651498506", tempDir);

		expect(existsSync(allowlistPath)).toBe(true);
		const content = JSON.parse(readFileSync(allowlistPath, "utf-8"));
		expect(content).toEqual({
			version: 1,
			allowFrom: ["865850174651498506"],
		});
	});

	it("adds userId to existing allowlist", async () => {
		mkdirSync(join(tempDir, "credentials"), { recursive: true });
		writeFileSync(
			allowlistPath,
			JSON.stringify({ version: 1, allowFrom: ["111111111111"] }),
		);

		await ensureDiscordAllowlisted("222222222222", tempDir);

		const content = JSON.parse(readFileSync(allowlistPath, "utf-8"));
		expect(content.allowFrom).toEqual(["111111111111", "222222222222"]);
	});

	it("does not duplicate an already-listed userId", async () => {
		mkdirSync(join(tempDir, "credentials"), { recursive: true });
		writeFileSync(
			allowlistPath,
			JSON.stringify({ version: 1, allowFrom: ["865850174651498506"] }),
		);

		await ensureDiscordAllowlisted("865850174651498506", tempDir);

		const content = JSON.parse(readFileSync(allowlistPath, "utf-8"));
		expect(content.allowFrom).toEqual(["865850174651498506"]);
	});
});
