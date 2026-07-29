import { createServer, type Server } from "node:http";
import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";

const PORT = 18089;
const requests: Array<{ path: string; auth?: string; body: Record<string, unknown> }> = [];
let server: Server;

describe("Shell → Agent → ADK → Gateway billing vertical", () => {
	before(async () => {
		server = createServer((request, response) => {
			let raw = "";
			request.setEncoding("utf8");
			request.on("data", (chunk) => { raw += chunk; });
			request.on("end", () => {
				const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
				requests.push({
					path: request.url ?? "",
					auth: request.headers["x-anyllm-key"] as string | undefined,
					body,
				});
				if (request.url !== "/v1/chat/completions") {
					response.writeHead(404).end();
					return;
				}
				response.writeHead(200, { "content-type": "application/json" });
				response.end(JSON.stringify({
					id: "e2e-provider-response",
					object: "chat.completion",
					model: "gemini-3.6-flash",
					choices: [{ index: 0, message: { role: "assistant", content: "billing vertical ok" }, finish_reason: "stop" }],
					usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
					customer_cost: "0.01050000",
					price_version_id: "pv-e2e-1",
					currency: "USD",
					settlement_status: "settled",
					gateway_request_id: body.gateway_request_id,
					gateway_attempt: body.gateway_attempt,
					billing_status: "settled",
				}));
			});
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(PORT, "127.0.0.1", resolve);
		});
	});

	after(async () => {
		await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	});

	it("uses the temporary ADK, preserves the Gateway receipt, and renders its exact customer cost", async () => {
		const authError = await browser.executeAsync((done) => {
			(window as unknown as {
				__TAURI_INTERNALS__: {
					invoke: (command: string, args: { message: string }) => Promise<void>;
				};
			}).__TAURI_INTERNALS__.invoke("send_to_agent_command", {
				message: JSON.stringify({
					type: "creds_update",
					provider: "nextain",
					naiaKey: "gw-e2e-billing-key",
				}),
			}).then(() => done()).catch((error) => done(String(error)));
		});
		expect(authError).toBeNull();
		await sendMessage("billing vertical probe");
		expect(await getLastAssistantMessage()).toContain("billing vertical ok");

		const badge = await $(".chat-message.assistant:not(.streaming) .cost-badge");
		await badge.waitForDisplayed({ timeout: 30_000 });
		expect(await badge.getText()).toContain("USD 0.01050000");
		expect(await badge.getText()).toContain("7");

		expect(requests).toHaveLength(1);
		expect(requests[0]?.path).toBe("/v1/chat/completions");
		// Compare only non-secret properties so a regression never prints a
		// credential value. The Gateway contract requires the Bearer envelope.
		expect(requests[0]?.auth?.startsWith("Bearer ")).toBe(true);
		expect(requests[0]?.auth?.endsWith("gw-e2e-billing-key")).toBe(true);
		expect(requests[0]?.body.stream).toBe(false);
		expect(requests[0]?.body.max_tokens).toBe(16000);
		expect(requests[0]?.body.gateway_attempt).toBe(1);
		expect(String(requests[0]?.body.gateway_request_id)).toMatch(/:round:1$/);
	});
});
