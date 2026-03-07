import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DeviceIdentity } from "./types.js";

/**
 * Load OpenClaw device identity from ~/.openclaw/identity/device.json.
 * Returns undefined if the file is missing, malformed, or incomplete.
 */
export function loadDeviceIdentity(): DeviceIdentity | undefined {
	const identityPath = join(homedir(), ".openclaw", "identity", "device.json");
	try {
		const raw = JSON.parse(readFileSync(identityPath, "utf-8"));
		const deviceId = raw.deviceId;
		const publicKeyPem = raw.publicKeyPem;
		const privateKeyPem = raw.privateKeyPem;

		if (
			typeof deviceId !== "string" ||
			typeof publicKeyPem !== "string" ||
			typeof privateKeyPem !== "string"
		) {
			return undefined;
		}

		return { id: deviceId, publicKey: publicKeyPem, privateKeyPem };
	} catch {
		return undefined;
	}
}
