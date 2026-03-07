import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../client.js";
import {
	type SkillStatusInfo,
	getSkillsBins,
	getSkillsStatus,
	installSkill,
	updateSkillConfig,
} from "../skills-proxy.js";
import { type MockGateway, createMockGateway } from "./mock-gateway.js";

const MOCK_SKILLS: SkillStatusInfo[] = [
	{
		name: "web-search",
		description: "Search the web",
		eligible: true,
		missing: [],
	},
	{
		name: "screenshot",
		description: "Take a screenshot",
		eligible: false,
		missing: ["gnome-screenshot"],
	},
];

const MOCK_BINS = ["node", "python3", "ffmpeg"];

describe("skills-proxy", () => {
	let mock: MockGateway;
	let client: GatewayClient;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "skills.status":
						respond.ok({ skills: MOCK_SKILLS });
						break;
					case "skills.bins":
						respond.ok({ bins: MOCK_BINS });
						break;
					case "skills.install":
						if (params.name === "web-search") {
							respond.ok({
								installed: true,
								name: params.name,
							});
						} else {
							respond.error("INSTALL_FAILED", `Cannot install: ${params.name}`);
						}
						break;
					case "skills.update":
						respond.ok({
							updated: true,
							name: params.name,
						});
						break;
					default:
						respond.error("UNKNOWN_METHOD", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"skills.status",
					"skills.bins",
					"skills.install",
					"skills.update",
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

	describe("getSkillsStatus", () => {
		it("returns skills with eligibility info", async () => {
			const result = await getSkillsStatus(client);

			expect(result.skills).toHaveLength(2);
			expect(result.skills[0].name).toBe("web-search");
			expect(result.skills[0].eligible).toBe(true);
			expect(result.skills[1].eligible).toBe(false);
			expect(result.skills[1].missing).toContain("gnome-screenshot");
		});
	});

	describe("getSkillsBins", () => {
		it("returns list of available binaries", async () => {
			const result = await getSkillsBins(client);

			expect(result.bins).toHaveLength(3);
			expect(result.bins).toContain("node");
			expect(result.bins).toContain("python3");
		});
	});

	describe("installSkill", () => {
		it("installs a skill", async () => {
			const result = await installSkill(client, "web-search", "node-0");

			expect(result.installed).toBe(true);
			expect(result.name).toBe("web-search");
		});

		it("throws for failed install", async () => {
			await expect(
				installSkill(client, "nonexistent-skill", "node-0"),
			).rejects.toThrow();
		});
	});

	describe("updateSkillConfig", () => {
		it("updates skill configuration", async () => {
			const result = await updateSkillConfig(client, "web-search", {
				enabled: true,
			});

			expect(result.updated).toBe(true);
			expect(result.name).toBe("web-search");
		});
	});

	describe("error handling", () => {
		it("throws when client is not connected", async () => {
			const disconnected = new GatewayClient();

			await expect(getSkillsStatus(disconnected)).rejects.toThrow(
				/not connected/i,
			);
		});
	});
});
