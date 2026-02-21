import { describe, expect, it, vi } from "vitest";
import { DiscordAdapter } from "../channels/discord.js";
import type { ChannelMessage, ChannelResponse } from "../channels/types.js";

// Mock discord.js — we don't want real bot connections in tests
vi.mock("discord.js", async () => {
	const { EventEmitter } = await import("node:events");

	class MockClient extends EventEmitter {
		user = { id: "bot-123", tag: "Naia#0001" };
		login = vi.fn().mockResolvedValue("token");
		destroy = vi.fn().mockResolvedValue(undefined);
		isReady = vi.fn().mockReturnValue(true);
	}

	return {
		Client: MockClient,
		GatewayIntentBits: {
			Guilds: 1,
			GuildMessages: 2,
			MessageContent: 4,
			DirectMessages: 8,
		},
		Partials: {
			Channel: 0,
			Message: 1,
		},
	};
});

describe("DiscordAdapter", () => {
	it("creates with config", () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: true,
		});
		expect(adapter.platform).toBe("discord");
		expect(adapter.isConnected()).toBe(false);
	});

	it("starts and connects", async () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: true,
		});
		await adapter.start();
		expect(adapter.isConnected()).toBe(true);
	});

	it("stops and disconnects", async () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: true,
		});
		await adapter.start();
		await adapter.stop();
		expect(adapter.isConnected()).toBe(false);
	});

	it("registers message handler", () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: true,
		});
		const handler = vi.fn();
		adapter.onMessage(handler);
		// Handler registration should not throw
	});

	it("parses DM messages correctly", async () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: false,
		});

		let capturedMsg: ChannelMessage | undefined;
		adapter.onMessage(async (msg) => {
			capturedMsg = msg;
			return { channelId: msg.channelId, text: "reply" };
		});

		await adapter.start();

		// Simulate a DM message via the mock client
		const mockMessage = {
			id: "msg-1",
			content: "hello alpha",
			author: { id: "user-1", username: "testuser", bot: false },
			channel: { id: "dm-chan-1", type: 1, send: vi.fn() },
			guild: null,
			createdTimestamp: Date.now(),
			reply: vi.fn(),
			mentions: { has: vi.fn().mockReturnValue(false) },
		};

		adapter.handleMessageCreate(mockMessage as any);

		// Wait for async handler
		await new Promise((r) => setTimeout(r, 50));

		expect(capturedMsg).toBeDefined();
		expect(capturedMsg!.platform).toBe("discord");
		expect(capturedMsg!.isDM).toBe(true);
		expect(capturedMsg!.text).toBe("hello alpha");
		expect(capturedMsg!.userId).toBe("user-1");
	});

	it("ignores bot messages", async () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: false,
		});

		let called = false;
		adapter.onMessage(async (msg) => {
			called = true;
			return { channelId: msg.channelId, text: "reply" };
		});

		await adapter.start();

		const botMessage = {
			id: "msg-2",
			content: "I am a bot",
			author: { id: "bot-456", username: "otherbot", bot: true },
			channel: { id: "chan-1", type: 0, send: vi.fn() },
			guild: { id: "guild-1" },
			createdTimestamp: Date.now(),
			reply: vi.fn(),
			mentions: { has: vi.fn().mockReturnValue(false) },
		};

		adapter.handleMessageCreate(botMessage as any);
		await new Promise((r) => setTimeout(r, 50));

		expect(called).toBe(false);
	});

	it("allows DM messages even when mentionOnly=true", async () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: true,
		});

		let capturedMsg: ChannelMessage | undefined;
		adapter.onMessage(async (msg) => {
			capturedMsg = msg;
			return { channelId: msg.channelId, text: "reply" };
		});

		await adapter.start();

		// DM message (guild=null) — should pass even with mentionOnly
		const dmMsg = {
			id: "msg-dm",
			content: "hello via DM",
			author: { id: "user-3", username: "dmuser", bot: false },
			channel: { id: "dm-chan-2", type: 1, send: vi.fn() },
			guild: null,
			createdTimestamp: Date.now(),
			reply: vi.fn(),
			mentions: { has: vi.fn().mockReturnValue(false) },
		};

		adapter.handleMessageCreate(dmMsg as any);
		await new Promise((r) => setTimeout(r, 50));

		expect(capturedMsg).toBeDefined();
		expect(capturedMsg!.isDM).toBe(true);
		expect(capturedMsg!.text).toBe("hello via DM");
	});

	it("filters non-mentioned messages when mentionOnly=true", async () => {
		const adapter = new DiscordAdapter({
			botToken: "test-token",
			mentionOnly: true,
		});

		let called = false;
		adapter.onMessage(async (msg) => {
			called = true;
			return { channelId: msg.channelId, text: "reply" };
		});

		await adapter.start();

		// Guild message without mention
		const noMentionMsg = {
			id: "msg-3",
			content: "hello everyone",
			author: { id: "user-2", username: "testuser2", bot: false },
			channel: { id: "chan-2", type: 0, send: vi.fn() },
			guild: { id: "guild-1" },
			createdTimestamp: Date.now(),
			reply: vi.fn(),
			mentions: { has: vi.fn().mockReturnValue(false) },
		};

		adapter.handleMessageCreate(noMentionMsg as any);
		await new Promise((r) => setTimeout(r, 50));

		expect(called).toBe(false);
	});
});
