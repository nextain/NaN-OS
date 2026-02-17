import { createPrivateKey, randomUUID, sign } from "node:crypto";
import WebSocket from "ws";
import type {
	GatewayConnectOptions,
	GatewayEvent,
	GatewayFrame,
	GatewayRequest,
	GatewayResponse,
} from "./types.js";

type EventHandler = (event: GatewayEvent) => void;

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;

export class GatewayRequestError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "GatewayRequestError";
		this.code = code;
	}
}

export class GatewayClient {
	private ws: WebSocket | null = null;
	private pending = new Map<string, PendingRequest>();
	private eventHandlers: EventHandler[] = [];
	private _availableMethods: string[] = [];

	get availableMethods(): string[] {
		return this._availableMethods;
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Connect to OpenClaw Gateway with protocol v3 handshake.
	 *
	 * Flow:
	 * 1. Open WebSocket
	 * 2. Receive connect.challenge event (nonce)
	 * 3. Sign nonce with Ed25519 device key (if provided)
	 * 4. Send connect request (auth + client + role + scopes + device)
	 * 5. Receive hello-ok response (methods + features)
	 */
	connect(url: string, options: GatewayConnectOptions): Promise<void> {
		const {
			token,
			clientId = "cli",
			platform = "linux",
			mode = "cli",
			version = "0.1.0",
			role = "operator",
			scopes = [
				"operator.read",
				"operator.write",
				"operator.admin",
				"operator.approvals",
			],
			device,
		} = options;

		return new Promise((resolve, reject) => {
			const ws = new WebSocket(url);
			let settled = false;

			const handshakeTimer = setTimeout(() => {
				if (!settled) {
					settled = true;
					ws.close();
					reject(new Error("Handshake timed out"));
				}
			}, HANDSHAKE_TIMEOUT_MS);

			const settle = (err?: Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(handshakeTimer);
				if (err) {
					ws.close();
					reject(err);
				} else {
					resolve();
				}
			};

			ws.on("error", (err) => {
				settle(err instanceof Error ? err : new Error(String(err)));
			});

			ws.on("close", () => {
				if (!settled) {
					settle(new Error("Connection closed during handshake"));
				}
				this.ws = null;
				for (const [id, req] of this.pending) {
					clearTimeout(req.timer);
					req.reject(new Error("Connection closed"));
					this.pending.delete(id);
				}
			});

			let handshakeDone = false;
			let connectId: string | null = null;

			ws.on("message", (raw) => {
				let frame: Record<string, unknown>;
				try {
					frame = JSON.parse(raw.toString());
				} catch {
					return;
				}

				// --- Handshake phase ---
				if (!handshakeDone) {
					// Step 2: Receive connect.challenge
					if (
						frame.event === "connect.challenge" &&
						typeof (frame.payload as Record<string, unknown>)?.nonce ===
							"string"
					) {
						const challengeNonce = (
							frame.payload as Record<string, unknown>
						).nonce as string;

						// Step 3: Build connect params
						connectId = randomUUID();
						const connectParams: Record<string, unknown> = {
							auth: { token },
							minProtocol: 3,
							maxProtocol: 3,
							client: {
								id: clientId,
								platform,
								mode,
								version,
							},
							role,
							scopes,
						};

						// Sign structured payload with device Ed25519 key
						// Gateway expects: v2|deviceId|clientId|mode|role|scopes|signedAtMs|token|nonce
						if (device) {
							const signedAt = Date.now();
							let signature = "";
							try {
								const payload = [
									"v2",
									device.id,
									clientId,
									mode,
									role,
									scopes.join(","),
									String(signedAt),
									token,
									challengeNonce,
								].join("|");
								const key = createPrivateKey(
									device.privateKeyPem,
								);
								signature = sign(
									null,
									Buffer.from(payload, "utf8"),
									key,
								).toString("base64url");
							} catch {
								// If signing fails, send without signature
							}
							const deviceParams: Record<string, unknown> = {
								id: device.id,
								publicKey: device.publicKey,
								signedAt,
								nonce: challengeNonce,
							};
							if (signature) {
								deviceParams.signature = signature;
							}
							connectParams.device = deviceParams;
						}

						const connectReq: GatewayRequest = {
							type: "req",
							id: connectId,
							method: "connect",
							params: connectParams,
						};
						ws.send(JSON.stringify(connectReq));
						return;
					}

					// Step 5: Receive hello-ok / error
					if (frame.type === "res" && frame.id === connectId) {
						if (frame.ok) {
							const payload = frame.payload as Record<
								string,
								unknown
							>;
							const features = payload?.features as
								| Record<string, unknown>
								| undefined;
							this._availableMethods =
								(features?.methods as string[]) || [];
							handshakeDone = true;
							this.ws = ws;
							settle();
						} else {
							const error = frame.error as
								| { message: string }
								| undefined;
							settle(
								new Error(
									error?.message ||
										"Gateway handshake failed",
								),
							);
						}
						return;
					}
					return;
				}

				// --- Normal operation phase ---
				const typed = frame as unknown as GatewayFrame;
				if (typed.type === "res") {
					this.handleResponse(typed as GatewayResponse);
				} else if (typed.type === "event" || typed.type === "evt") {
					this.handleEvent(typed as GatewayEvent);
				}
			});
		});
	}

	request(method: string, params: unknown): Promise<unknown> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("Not connected to gateway"));
		}

		const id = randomUUID();
		const req: GatewayRequest = { type: "req", id, method, params };

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Request ${method} timed out`));
			}, REQUEST_TIMEOUT_MS);

			this.pending.set(id, { resolve, reject, timer });
			this.ws!.send(JSON.stringify(req));
		});
	}

	onEvent(handler: EventHandler): void {
		this.eventHandlers.push(handler);
	}

	close(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	private handleResponse(res: GatewayResponse): void {
		const pending = this.pending.get(res.id);
		if (!pending) return;

		clearTimeout(pending.timer);
		this.pending.delete(res.id);

		if (res.ok) {
			pending.resolve(res.payload);
		} else {
			pending.reject(
				new GatewayRequestError(res.error.code, res.error.message),
			);
		}
	}

	private handleEvent(evt: GatewayEvent): void {
		for (const handler of this.eventHandlers) {
			handler(evt);
		}
	}
}
