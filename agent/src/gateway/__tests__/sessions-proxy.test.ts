import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	type SessionInfo,
	compactSession,
	deleteSession,
	listSessions,
	patchSession,
	previewSession,
	resetSession,
} from "../sessions-proxy.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_SESSIONS: SessionInfo[] = [
	{
		key: "sess-abc-123",
		label: "Weather check",
		createdAt: 1700000000000,
		messageCount: 4,
		status: "completed",
	},
	{
		key: "sess-def-456",
		label: "File search",
		createdAt: 1700001000000,
		messageCount: 8,
		status: "completed",
	},
];

describe("sessions-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "sessions.list":
						respond.ok({ sessions: MOCK_SESSIONS });
						break;
					case "sessions.delete":
						if (params.key === "sess-abc-123") {
							respond.ok({ deleted: true, key: params.key });
						} else {
							respond.error("NOT_FOUND", `Session not found: ${params.key}`);
						}
						break;
					case "sessions.compact":
						respond.ok({
							compacted: true,
							key: params.key,
							removedMessages: 3,
						});
						break;
					case "sessions.preview":
						respond.ok({
							key: params.key,
							summary: "Discussion about weather",
						});
						break;
					case "sessions.patch":
						respond.ok({ key: params.key, patched: true });
						break;
					case "sessions.reset":
						respond.ok({ key: params.key, reset: true });
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"sessions.list",
					"sessions.delete",
					"sessions.compact",
					"sessions.preview",
					"sessions.patch",
					"sessions.reset",
				],
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

	describe("listSessions", () => {
		it("returns session list", async () => {
			const result = await listSessions(client);

			expect(result.sessions).toHaveLength(2);
			expect(result.sessions[0].key).toBe("sess-abc-123");
			expect(result.sessions[0].label).toBe("Weather check");
			expect(result.sessions[1].messageCount).toBe(8);
		});
	});

	describe("deleteSession", () => {
		it("deletes a session", async () => {
			const result = await deleteSession(client, "sess-abc-123");

			expect(result.deleted).toBe(true);
			expect(result.key).toBe("sess-abc-123");
		});

		it("throws for unknown session", async () => {
			await expect(deleteSession(client, "unknown-key")).rejects.toThrow();
		});
	});

	describe("compactSession", () => {
		it("compacts a session", async () => {
			const result = await compactSession(client, "sess-def-456");

			expect(result.compacted).toBe(true);
			expect(result.removedMessages).toBe(3);
		});
	});

	describe("previewSession", () => {
		it("returns session preview/summary", async () => {
			const result = await previewSession(client, "sess-abc-123");

			expect(result.key).toBe("sess-abc-123");
			expect(result.summary).toBe("Discussion about weather");
		});
	});

	describe("patchSession", () => {
		it("patches a session", async () => {
			const result = await patchSession(client, "sess-abc-123", {
				label: "Updated label",
			});

			expect(result.patched).toBe(true);
			expect(result.key).toBe("sess-abc-123");
		});
	});

	describe("resetSession", () => {
		it("resets a session", async () => {
			const result = await resetSession(client, "sess-abc-123");

			expect(result.reset).toBe(true);
			expect(result.key).toBe("sess-abc-123");
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(listSessions(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
