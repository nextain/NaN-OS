import { describe, expect, it } from "vitest";
import { createWindowsUpdaterManifest } from "../create-windows-updater-manifest.mjs";

describe("createWindowsUpdaterManifest", () => {
	it("uses the default Tauri v2 Windows target and canonical NSIS artifact", () => {
		const manifest = createWindowsUpdaterManifest({
			version: "v0.2.0",
			pubDate: "2026-08-19T13:00:00Z",
			notes: "Signed updater recovery",
			baseUrl: "https://github.com/nextain/naia-shell/releases/download/v0.2.0/",
			nsisPath: "C:\\release\\Naia-Shell-x86_64-setup.exe",
			nsisSignature: "nsis-signature",
		});

		expect(manifest.version).toBe("0.2.0");
		expect(manifest.platforms).toEqual({
			"windows-x86_64": {
				signature: "nsis-signature",
				url: "https://github.com/nextain/naia-shell/releases/download/v0.2.0/Naia-Shell-x86_64-setup.exe",
			},
		});
	});

	it("rejects an empty signature", () => {
		expect(() =>
			createWindowsUpdaterManifest({
				version: "0.2.0",
				pubDate: "2026-08-19T13:00:00Z",
				baseUrl: "https://example.invalid/v0.2.0",
				nsisPath: "Naia.exe",
				nsisSignature: "",
			}),
		).toThrow("NSIS signature is required");
	});
});
