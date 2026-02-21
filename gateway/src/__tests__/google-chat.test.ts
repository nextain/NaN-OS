import { describe, expect, it, vi } from "vitest";
import { GoogleChatAdapter } from "../channels/google-chat.js";
import type { ChannelMessage, ChannelResponse } from "../channels/types.js";

describe("GoogleChatAdapter", () => {
	it("creates with config", () => {
		const adapter = new GoogleChatAdapter({
			projectId: "test-project",
			port: 8090,
		});
		expect(adapter.platform).toBe("google-chat");
		expect(adapter.isConnected()).toBe(false);
	});

	it("registers message handler", () => {
		const adapter = new GoogleChatAdapter({
			projectId: "test-project",
			port: 8090,
		});
		const handler = vi.fn();
		adapter.onMessage(handler);
	});

	it("parses Google Chat webhook payload correctly", () => {
		const adapter = new GoogleChatAdapter({
			projectId: "test-project",
			port: 8090,
		});

		const payload = {
			type: "MESSAGE",
			message: {
				name: "spaces/abc/messages/msg-1",
				text: "hello alpha",
				sender: {
					name: "users/user-1",
					displayName: "Test User",
					type: "HUMAN",
				},
				space: {
					name: "spaces/abc",
					type: "DM",
				},
				createTime: "2026-02-18T10:00:00Z",
			},
		};

		const parsed = adapter.parseWebhookPayload(payload);
		expect(parsed).toBeDefined();
		expect(parsed!.platform).toBe("google-chat");
		expect(parsed!.text).toBe("hello alpha");
		expect(parsed!.userId).toBe("users/user-1");
		expect(parsed!.isDM).toBe(true);
		expect(parsed!.channelId).toBe("spaces/abc");
	});

	it("ignores non-MESSAGE event types", () => {
		const adapter = new GoogleChatAdapter({
			projectId: "test-project",
			port: 8090,
		});

		const payload = {
			type: "ADDED_TO_SPACE",
			space: { name: "spaces/abc" },
		};

		const parsed = adapter.parseWebhookPayload(payload);
		expect(parsed).toBeUndefined();
	});

	it("ignores bot messages", () => {
		const adapter = new GoogleChatAdapter({
			projectId: "test-project",
			port: 8090,
		});

		const payload = {
			type: "MESSAGE",
			message: {
				name: "spaces/abc/messages/msg-2",
				text: "I am a bot",
				sender: {
					name: "users/bot-1",
					displayName: "Bot",
					type: "BOT",
				},
				space: {
					name: "spaces/abc",
					type: "ROOM",
				},
				createTime: "2026-02-18T10:00:00Z",
			},
		};

		const parsed = adapter.parseWebhookPayload(payload);
		expect(parsed).toBeUndefined();
	});

	it("formats response for Google Chat API", () => {
		const adapter = new GoogleChatAdapter({
			projectId: "test-project",
			port: 8090,
		});

		const response: ChannelResponse = {
			channelId: "spaces/abc",
			text: "Hello! I'm Naia.",
			replyToId: "spaces/abc/messages/msg-1",
		};

		const formatted = adapter.formatResponse(response);
		expect(formatted.text).toBe("Hello! I'm Naia.");
		expect(formatted.thread?.name).toBe("spaces/abc/messages/msg-1");
	});
});
