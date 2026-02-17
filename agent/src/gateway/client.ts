import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type {
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

export class GatewayClient {
	private ws: WebSocket | null = null;
	private pending = new Map<string, PendingRequest>();
	private eventHandlers: EventHandler[] = [];

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	connect(url: string, _token: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(url);

			ws.on("open", () => {
				this.ws = ws;
				resolve();
			});

			ws.on("error", (err) => {
				if (!this.ws) {
					reject(err);
				}
			});

			ws.on("close", () => {
				this.ws = null;
				// Reject all pending requests
				for (const [id, req] of this.pending) {
					clearTimeout(req.timer);
					req.reject(new Error("Connection closed"));
					this.pending.delete(id);
				}
			});

			ws.on("message", (raw) => {
				let frame: GatewayFrame;
				try {
					frame = JSON.parse(raw.toString()) as GatewayFrame;
				} catch {
					return;
				}

				if (frame.type === "res") {
					this.handleResponse(frame as GatewayResponse);
				} else if (frame.type === "evt") {
					this.handleEvent(frame as GatewayEvent);
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
			pending.reject(new Error(res.error.message));
		}
	}

	private handleEvent(evt: GatewayEvent): void {
		for (const handler of this.eventHandlers) {
			handler(evt);
		}
	}
}
