import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	type AgentInfo,
	createAgent,
	deleteAgent,
	getAgentFile,
	listAgentFiles,
	listAgents,
	setAgentFile,
	updateAgent,
} from "../agents-proxy.js";
import { createMockGateway, type MockGateway } from "./mock-gateway.js";

const MOCK_AGENTS: AgentInfo[] = [
	{
		id: "alpha",
		name: "Naia",
		description: "Default AI assistant",
		model: "gemini-2.0-flash",
		createdAt: 1700000000000,
	},
	{
		id: "researcher",
		name: "Researcher",
		description: "Research specialist",
		model: "gemini-2.0-flash",
		createdAt: 1700001000000,
	},
];

const MOCK_FILES = [
	{ path: "system-prompt.md", size: 1024 },
	{ path: "tools.json", size: 256 },
];

describe("agents-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "agents.list":
						respond.ok({ agents: MOCK_AGENTS });
						break;
					case "agents.create":
						respond.ok({
							id: `agent-${Date.now()}`,
							name: params.name,
							description: params.description || "",
							created: true,
						});
						break;
					case "agents.update":
						if (params.id === "alpha" || params.id === "researcher") {
							respond.ok({
								id: params.id,
								updated: true,
							});
						} else {
							respond.error(
								"NOT_FOUND",
								`Agent not found: ${params.id}`,
							);
						}
						break;
					case "agents.delete":
						if (params.id === "researcher") {
							respond.ok({ id: params.id, deleted: true });
						} else {
							respond.error(
								"INVALID_REQUEST",
								`Cannot delete agent: ${params.id}`,
							);
						}
						break;
					case "agents.files.list":
						respond.ok({ files: MOCK_FILES });
						break;
					case "agents.files.get":
						respond.ok({
							path: params.path,
							content: "# System Prompt\nYou are Naia.",
						});
						break;
					case "agents.files.set":
						respond.ok({ path: params.path, written: true });
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"agents.list",
					"agents.create",
					"agents.update",
					"agents.delete",
					"agents.files.list",
					"agents.files.get",
					"agents.files.set",
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

	describe("listAgents", () => {
		it("returns agent list", async () => {
			const result = await listAgents(client);

			expect(result.agents).toHaveLength(2);
			expect(result.agents[0].id).toBe("alpha");
			expect(result.agents[0].name).toBe("Naia");
			expect(result.agents[1].id).toBe("researcher");
		});
	});

	describe("createAgent", () => {
		it("creates a new agent", async () => {
			const result = await createAgent(client, {
				name: "Coder",
				description: "Coding assistant",
			});

			expect(result.created).toBe(true);
			expect(result.name).toBe("Coder");
		});
	});

	describe("updateAgent", () => {
		it("updates an agent", async () => {
			const result = await updateAgent(client, "alpha", {
				name: "Naia v2",
			});

			expect(result.updated).toBe(true);
			expect(result.id).toBe("alpha");
		});

		it("throws for unknown agent", async () => {
			await expect(
				updateAgent(client, "unknown-agent", { name: "x" }),
			).rejects.toThrow();
		});
	});

	describe("deleteAgent", () => {
		it("deletes an agent", async () => {
			const result = await deleteAgent(client, "researcher");

			expect(result.deleted).toBe(true);
		});

		it("throws for protected agent", async () => {
			await expect(deleteAgent(client, "alpha")).rejects.toThrow();
		});
	});

	describe("listAgentFiles", () => {
		it("returns file list", async () => {
			const result = await listAgentFiles(client, "alpha");

			expect(result.files).toHaveLength(2);
			expect(result.files[0].path).toBe("system-prompt.md");
		});
	});

	describe("getAgentFile", () => {
		it("returns file content", async () => {
			const result = await getAgentFile(
				client,
				"alpha",
				"system-prompt.md",
			);

			expect(result.path).toBe("system-prompt.md");
			expect(result.content).toContain("Naia");
		});
	});

	describe("setAgentFile", () => {
		it("writes file content", async () => {
			const result = await setAgentFile(
				client,
				"alpha",
				"tools.json",
				'{"tools":[]}',
			);

			expect(result.written).toBe(true);
			expect(result.path).toBe("tools.json");
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(listAgents(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
