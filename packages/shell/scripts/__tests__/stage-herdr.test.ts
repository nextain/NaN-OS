import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	HERDR_VERSION,
	HERDR_MSVC_DLLS,
	stageMsvcRuntimeBesideHerdr,
} from "../stage-herdr.mjs";

describe("stage-herdr MSVC runtime placement (#447)", () => {
	it("pins the current stable Herdr release", () => {
		expect(HERDR_VERSION).toBe("0.8.2");
	});

	it("stages vcruntime140.dll and its companions beside herdr.exe", () => {
		const root = mkdtempSync(resolve(tmpdir(), "naia-stage-herdr-"));
		const resources = resolve(root, "resources");
		const herdr = resolve(resources, "herdr");
		const systemRoot = resolve(root, "Windows");
		const system32 = resolve(systemRoot, "System32");
		try {
			mkdirSync(herdr, { recursive: true });
			mkdirSync(system32, { recursive: true });
			writeFileSync(resolve(herdr, "herdr.exe"), "herdr-fixture");
			for (const dll of HERDR_MSVC_DLLS) {
				writeFileSync(resolve(system32, dll), `system:${dll}`);
			}
			writeFileSync(resolve(resources, "vcruntime140.dll"), "staged:redist");

			const staged = stageMsvcRuntimeBesideHerdr({
				platform: "win32",
				resourcesDir: resources,
				destinationDir: herdr,
				systemRoot,
			});

			expect(existsSync(resolve(herdr, "herdr.exe"))).toBe(true);
			expect(staged).toEqual(HERDR_MSVC_DLLS.map((dll) => resolve(herdr, dll)));
			expect(readFileSync(resolve(herdr, "vcruntime140.dll"), "utf8")).toBe(
				"staged:redist",
			);
			for (const dll of ["msvcp140.dll", "vcruntime140_1.dll"]) {
				expect(readFileSync(resolve(herdr, dll), "utf8")).toBe(`system:${dll}`);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
