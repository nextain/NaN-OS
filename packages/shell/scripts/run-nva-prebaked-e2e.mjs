import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const shellDir = resolve(import.meta.dirname, "..");
const nvaSource =
	process.env.NAIA_E2E_NVA_SOURCE ??
	resolve(shellDir, "../../../../naia-settings/nva-files/naia-prebaked");
const manifestPath = resolve(nvaSource, "manifest.json");
const idlePath = resolve(nvaSource, "clips/body.webm");
if (!existsSync(manifestPath) || !existsSync(idlePath)) {
	throw new Error(
		"Set NAIA_E2E_NVA_SOURCE to a pre-baked NVA bundle with manifest.json and clips/body.webm",
	);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.vrm_slots?.profile?.generation_mode !== "prebaked_webm_only") {
	throw new Error("NVA E2E source is not a prebaked_webm_only bundle");
}
const sourceDigest = createHash("sha256")
	.update(readFileSync(manifestPath))
	.update(readFileSync(idlePath))
	.digest("hex");
console.log(`[nva-prebaked-e2e] source=${nvaSource} digest=${sourceDigest}`);

const env = {
	...process.env,
	NAIA_E2E_PREBAKED_NVA: "1",
	NAIA_E2E_NVA_SOURCE: nvaSource,
};
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("pnpm executable path is unavailable");
for (const args of [
	["run", "build:e2e:tauri"],
	["exec", "wdio", "run", "e2e-tauri/wdio.conf.nva-prebaked.ts"],
]) {
	const result = spawnSync(process.execPath, [pnpmCli, ...args], {
		cwd: shellDir,
		env,
		stdio: "inherit",
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}
