import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function resolvePnpmInvocation(packageManager) {
	if (packageManager === undefined) {
		return { command: "pnpm", prefixArgs: [] };
	}
	const match = /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(packageManager);
	if (!match) {
		throw new Error(`unsupported packageManager: ${JSON.stringify(packageManager)}`);
	}
	return { command: "corepack", prefixArgs: [`pnpm@${match[1]}`] };
}

export function projectPnpmInvocation(projectDir) {
	const manifest = JSON.parse(readFileSync(resolve(projectDir, "package.json"), "utf8"));
	return resolvePnpmInvocation(manifest.packageManager);
}

export function runProjectPnpm(args, projectDir, env = process.env) {
	const invocation = projectPnpmInvocation(projectDir);
	const result = spawnSync(invocation.command, [...invocation.prefixArgs, ...args], {
		cwd: projectDir,
		env: { ...env, CI: "true" },
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`package manager exited with status ${result.status}: ${invocation.command} ${[...invocation.prefixArgs, ...args].join(" ")}`,
		);
	}
	return result;
}
