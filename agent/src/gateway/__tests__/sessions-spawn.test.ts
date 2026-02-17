import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import { executeSessionsSpawn } from "../sessions-spawn.js";
import { createMockGateway, type MockGateway } from "./mock-gateway.js";

let mock: MockGateway;
let client: GatewayClient;

/** Track every Gateway RPC method called, in order */
let methodCalls: string[];
/** Track params for each method call */
let paramsByMethod: Record<string, Record<string, unknown>>;

beforeAll(async () => {
	mock = createMockGateway((method, params, respond) => {
		methodCalls.push(method);
		paramsByMethod[method] = params;

		switch (method) {
			case "sessions.spawn": {
				respond.ok({
					runId: "run-abc-123",
					sessionKey: `subagent:${crypto.randomUUID()}`,
				});
				break;
			}
			case "agent.wait": {
				respond.ok({ status: "completed" });
				break;
			}
			case "sessions.transcript": {
				respond.ok({
					messages: [
						{ role: "assistant", content: "Sub-agent result here" },
					],
				});
				break;
			}
			default: {
				respond.error("UNKNOWN", `Unknown method: ${method}`);
			}
		}
	});

	client = new GatewayClient();
	await client.connect(`ws://127.0.0.1:${mock.port}`, { token: "test-token" });
});

beforeEach(() => {
	methodCalls = [];
	paramsByMethod = {};
});

afterAll(() => {
	client.close();
	mock.close();
});

describe("executeSessionsSpawn", () => {
	it("calls RPCs in correct order: spawn → wait → transcript", async () => {
		await executeSessionsSpawn(client, { task: "Analyze the log files" });
		expect(methodCalls).toEqual([
			"sessions.spawn",
			"agent.wait",
			"sessions.transcript",
		]);
	});

	it("returns output from sub-agent transcript", async () => {
		const result = await executeSessionsSpawn(client, {
			task: "Summarize the README",
		});
		expect(result.success).toBe(true);
		expect(result.output).toContain("Sub-agent result here");
	});

	it("passes task and label to sessions.spawn params", async () => {
		await executeSessionsSpawn(client, {
			task: "Check disk usage",
			label: "disk-check",
		});
		const spawnParams = paramsByMethod["sessions.spawn"];
		expect(spawnParams).toBeDefined();
		expect(spawnParams.task).toBe("Check disk usage");
		expect(spawnParams.label).toBe("disk-check");
	});

	it("passes sessionKey from spawn to transcript request", async () => {
		await executeSessionsSpawn(client, { task: "Check system status" });
		const transcriptParams = paramsByMethod["sessions.transcript"];
		expect(transcriptParams).toBeDefined();
		expect(typeof transcriptParams.key).toBe("string");
		expect((transcriptParams.key as string).startsWith("subagent:")).toBe(true);
	});

	it("handles agent.wait timeout error", async () => {
		const timeoutMock = createMockGateway((method, _params, respond) => {
			if (method === "sessions.spawn") {
				respond.ok({ runId: "timeout-run", sessionKey: "subagent:timeout" });
			} else if (method === "agent.wait") {
				respond.error("TIMEOUT", "Agent run timed out");
			}
		});

		const timeoutClient = new GatewayClient();
		await timeoutClient.connect(`ws://127.0.0.1:${timeoutMock.port}`, {
			token: "test-token",
		});

		const result = await executeSessionsSpawn(timeoutClient, {
			task: "Long running task",
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("timed out");

		timeoutClient.close();
		timeoutMock.close();
	});

	it("returns error when Gateway is not connected", async () => {
		const disconnected = new GatewayClient();
		const result = await executeSessionsSpawn(disconnected, {
			task: "This should fail",
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("not connected");
	});
});
