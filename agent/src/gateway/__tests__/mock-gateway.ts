/**
 * Shared mock Gateway server for tests.
 * Automatically handles OpenClaw protocol v3 handshake:
 *   1. Sends connect.challenge on connection
 *   2. Validates connect request
 *   3. Responds with hello-ok (methods list)
 *   4. Delegates post-handshake requests to the provided handler
 */
import { randomUUID } from "node:crypto";
import { type WebSocket, WebSocketServer } from "ws";

export type RequestHandler = (
	method: string,
	params: Record<string, unknown>,
	respond: {
		ok: (payload: unknown) => void;
		error: (code: string, message: string) => void;
	},
) => void;

export interface MockGateway {
	server: WebSocketServer;
	port: number;
	close: () => void;
	/** All WebSocket clients currently connected */
	clients: Set<WebSocket>;
}

export interface MockGatewayOptions {
	methods?: string[];
}

const DEFAULT_METHODS = [
	"exec.bash",
	"agent",
	"sessions.spawn",
	"agent.wait",
	"sessions.transcript",
	"skills.invoke",
];

export function createMockGateway(
	handler: RequestHandler,
	options?: MockGatewayOptions,
): MockGateway {
	const server = new WebSocketServer({ port: 0 });
	const port = (server.address() as { port: number }).port;
	const methods = options?.methods ?? DEFAULT_METHODS;

	server.on("connection", (ws: WebSocket) => {
		// Step 1: Send connect.challenge
		const nonce = randomUUID();
		ws.send(
			JSON.stringify({
				type: "event",
				event: "connect.challenge",
				payload: { nonce },
			}),
		);

		let handshakeDone = false;

		ws.on("message", (raw) => {
			const msg = JSON.parse(raw.toString());
			if (msg.type !== "req") return;

			// Step 2: Handle connect handshake
			if (msg.method === "connect" && !handshakeDone) {
				handshakeDone = true;
				ws.send(
					JSON.stringify({
						type: "res",
						id: msg.id,
						ok: true,
						payload: {
							protocol: 3,
							features: { methods },
						},
					}),
				);
				return;
			}

			if (!handshakeDone) {
				ws.send(
					JSON.stringify({
						type: "res",
						id: msg.id,
						ok: false,
						error: {
							code: "NOT_CONNECTED",
							message: "first request must be connect",
						},
					}),
				);
				return;
			}

			// Step 3: Delegate to handler
			handler(msg.method, msg.params as Record<string, unknown>, {
				ok: (payload) => {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload,
						}),
					);
				},
				error: (code, message) => {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: false,
							error: { code, message },
						}),
					);
				},
			});
		});
	});

	return {
		server,
		port,
		close: () => server.close(),
		clients: server.clients as Set<WebSocket>,
	};
}
