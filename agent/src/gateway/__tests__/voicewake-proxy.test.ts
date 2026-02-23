import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	getVoiceWakeTriggers,
	setVoiceWakeTriggers,
} from "../voicewake-proxy.js";
import { createMockGateway, type MockGateway } from "./mock-gateway.js";

describe("voicewake-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "voicewake.get":
						respond.ok({
							triggers: ["낸", "openclaw", "hey alpha"],
						});
						break;
					case "voicewake.set":
						if (
							!params.triggers ||
							!Array.isArray(params.triggers)
						) {
							respond.error(
								"INVALID_REQUEST",
								"triggers must be an array",
							);
						} else {
							respond.ok({ triggers: params.triggers });
						}
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: ["exec.bash", "voicewake.get", "voicewake.set"],
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

	describe("getVoiceWakeTriggers", () => {
		it("returns current wake triggers", async () => {
			const result = await getVoiceWakeTriggers(client);

			expect(result.triggers).toEqual(["낸", "openclaw", "hey alpha"]);
		});
	});

	describe("setVoiceWakeTriggers", () => {
		it("sets new triggers", async () => {
			const result = await setVoiceWakeTriggers(client, [
				"낸",
				"Naia",
			]);

			expect(result.triggers).toEqual(["낸", "Naia"]);
		});

		it("allows empty trigger list (falls back to defaults)", async () => {
			const result = await setVoiceWakeTriggers(client, []);

			expect(result.triggers).toEqual([]);
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(
				getVoiceWakeTriggers(disconnected),
			).rejects.toThrow(/not connected/i);
		});
	});
});
