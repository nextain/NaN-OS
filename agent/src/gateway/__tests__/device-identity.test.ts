import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceIdentity } from "../types.js";

// We'll mock os.homedir to point to a temp directory
vi.mock("node:os", async () => {
	const actual = await vi.importActual("node:os");
	return { ...actual, homedir: vi.fn() };
});

import { homedir } from "node:os";
import { loadDeviceIdentity } from "../device-identity.js";

describe("loadDeviceIdentity", () => {
	let tempHome: string;

	beforeEach(() => {
		tempHome = mkdtempSync("/tmp/device-identity-test-");
		vi.mocked(homedir).mockReturnValue(tempHome);
	});

	afterEach(() => {
		rmSync(tempHome, { recursive: true, force: true });
	});

	it("loads valid device identity from ~/.openclaw/identity/device.json", () => {
		const identityDir = join(tempHome, ".openclaw", "identity");
		mkdirSync(identityDir, { recursive: true });
		writeFileSync(
			join(identityDir, "device.json"),
			JSON.stringify({
				version: 1,
				deviceId: "abc123",
				publicKeyPem:
					"-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----\n",
				privateKeyPem:
					"-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
			}),
		);

		const identity = loadDeviceIdentity();
		expect(identity).toBeDefined();
		expect(identity?.id).toBe("abc123");
		expect(identity?.publicKey).toContain("PUBLIC KEY");
		expect(identity?.privateKeyPem).toContain("PRIVATE KEY");
	});

	it("returns undefined when identity file does not exist", () => {
		const identity = loadDeviceIdentity();
		expect(identity).toBeUndefined();
	});

	it("returns undefined for malformed JSON", () => {
		const identityDir = join(tempHome, ".openclaw", "identity");
		mkdirSync(identityDir, { recursive: true });
		writeFileSync(join(identityDir, "device.json"), "not json");

		const identity = loadDeviceIdentity();
		expect(identity).toBeUndefined();
	});

	it("returns undefined when required fields are missing", () => {
		const identityDir = join(tempHome, ".openclaw", "identity");
		mkdirSync(identityDir, { recursive: true });
		writeFileSync(
			join(identityDir, "device.json"),
			JSON.stringify({ version: 1 }),
		);

		const identity = loadDeviceIdentity();
		expect(identity).toBeUndefined();
	});
});
