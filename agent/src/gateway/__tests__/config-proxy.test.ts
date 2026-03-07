import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	getConfig,
	getConfigSchema,
	listModels,
	patchConfig,
	setConfig,
} from "../config-proxy.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_CONFIG = {
	provider: "gemini",
	model: "gemini-2.5-flash",
	ttsEnabled: true,
};

const MOCK_SCHEMA = {
	type: "object",
	properties: {
		provider: { type: "string" },
		model: { type: "string" },
	},
};

const MOCK_MODELS = [
	{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
	{ id: "grok-3-mini", name: "Grok 3 Mini", provider: "xai" },
];

describe("config-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "config.get":
						respond.ok(MOCK_CONFIG);
						break;
					case "config.set":
						respond.ok({ updated: true });
						break;
					case "config.patch":
						respond.ok({ patched: true });
						break;
					case "config.schema":
						respond.ok(MOCK_SCHEMA);
						break;
					case "models.list":
						respond.ok({ models: MOCK_MODELS });
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"config.get",
					"config.set",
					"config.patch",
					"config.schema",
					"models.list",
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

	describe("getConfig", () => {
		it("returns gateway config", async () => {
			const result = await getConfig(client);

			expect(result.provider).toBe("gemini");
			expect(result.ttsEnabled).toBe(true);
		});
	});

	describe("setConfig", () => {
		it("updates gateway config", async () => {
			const result = await setConfig(client, { model: "grok-3" });

			expect(result.updated).toBe(true);
		});
	});

	describe("patchConfig", () => {
		it("patches gateway config", async () => {
			const result = await patchConfig(client, { ttsEnabled: false });

			expect(result.patched).toBe(true);
		});
	});

	describe("getConfigSchema", () => {
		it("returns config schema", async () => {
			const result = await getConfigSchema(client);

			expect(result.type).toBe("object");
			expect(result.properties).toBeDefined();
		});
	});

	describe("listModels", () => {
		it("returns available models", async () => {
			const result = await listModels(client);

			expect(result.models).toHaveLength(2);
			expect(result.models[0].id).toBe("gemini-2.5-flash");
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(getConfig(disconnected)).rejects.toThrow(/not connected/i);
		});
	});
});
