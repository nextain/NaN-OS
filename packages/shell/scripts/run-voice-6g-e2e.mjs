import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const shellDir = resolve(import.meta.dirname, "..");
const candidates = [
	process.env.NAIA_E2E_VRM_SOURCE,
	resolve(
		shellDir,
		"../../../../naia-settings/vrm-files/01-OL_Woman.vrm",
	),
	resolve(homedir(), ".naia/vrm-files/01-OL_Woman.vrm"),
].filter(Boolean);
const vrmSource = candidates.find((candidate) => existsSync(candidate));
if (!vrmSource) {
	throw new Error(
		"Set NAIA_E2E_VRM_SOURCE to a real VRM before running the 6GB Shell acceptance",
	);
}
const expectedVrmSha256 =
	"2a0ccd84880b03d7b65503d8b6287f7a97f3bb4fab70a5fd0a47b433c97827f5";
const actualVrmSha256 = createHash("sha256")
	.update(readFileSync(vrmSource))
	.digest("hex");
if (actualVrmSha256 !== expectedVrmSha256) {
	throw new Error(
		`01-OL_Woman.vrm SHA-256 mismatch: expected ${expectedVrmSha256}, got ${actualVrmSha256}`,
	);
}

const env = {
	...process.env,
	NAIA_E2E_VOICE_6G: "1",
	NAIA_E2E_VRM_SOURCE: vrmSource,
};
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("pnpm executable path is unavailable");

for (const args of [
	["run", "build:e2e:tauri"],
	["exec", "wdio", "run", "e2e-tauri/wdio.conf.voice-6g.ts"],
]) {
	const result = spawnSync(process.execPath, [pnpmCli, ...args], {
		cwd: shellDir,
		env,
		stdio: "inherit",
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}
