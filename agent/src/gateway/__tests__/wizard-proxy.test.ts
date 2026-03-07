import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	cancelWizard,
	getWizardStatus,
	nextWizardStep,
	startWizard,
} from "../wizard-proxy.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

describe("wizard-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, _params, respond) => {
				switch (method) {
					case "wizard.start":
						respond.ok({
							started: true,
							step: "welcome",
							totalSteps: 5,
						});
						break;
					case "wizard.next":
						respond.ok({
							step: "provider",
							stepIndex: 2,
							totalSteps: 5,
						});
						break;
					case "wizard.cancel":
						respond.ok({ cancelled: true });
						break;
					case "wizard.status":
						respond.ok({
							active: true,
							step: "provider",
							stepIndex: 2,
							totalSteps: 5,
						});
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"wizard.start",
					"wizard.next",
					"wizard.cancel",
					"wizard.status",
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

	describe("startWizard", () => {
		it("starts the wizard", async () => {
			const result = await startWizard(client);

			expect(result.started).toBe(true);
			expect(result.step).toBe("welcome");
		});
	});

	describe("nextWizardStep", () => {
		it("advances to next step", async () => {
			const result = await nextWizardStep(client, {});

			expect(result.step).toBe("provider");
			expect(result.stepIndex).toBe(2);
		});
	});

	describe("cancelWizard", () => {
		it("cancels the wizard", async () => {
			const result = await cancelWizard(client);

			expect(result.cancelled).toBe(true);
		});
	});

	describe("getWizardStatus", () => {
		it("returns wizard status", async () => {
			const result = await getWizardStatus(client);

			expect(result.active).toBe(true);
			expect(result.step).toBe("provider");
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(startWizard(disconnected)).rejects.toThrow(/not connected/i);
		});
	});
});
