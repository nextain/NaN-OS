/** Gateway WebSocket protocol frame types */

export interface GatewayRequest {
	type: "req";
	id: string;
	method: string;
	params: unknown;
}

export interface GatewayResponseOk {
	type: "res";
	id: string;
	ok: true;
	payload: unknown;
}

export interface GatewayResponseError {
	type: "res";
	id: string;
	ok: false;
	error: { code: string; message: string };
}

export type GatewayResponse = GatewayResponseOk | GatewayResponseError;

export interface GatewayEvent {
	type: "event" | "evt";
	event: string;
	payload?: unknown;
	seq?: number;
}

export type GatewayFrame = GatewayRequest | GatewayResponse | GatewayEvent;

/** Device identity for Gateway authentication */
export interface DeviceIdentity {
	id: string;
	publicKey: string;
	privateKeyPem: string;
}

/** Options for GatewayClient.connect() */
export interface GatewayConnectOptions {
	token: string;
	clientId?: string;
	platform?: string;
	mode?: string;
	version?: string;
	role?: string;
	scopes?: string[];
	device?: DeviceIdentity;
}
