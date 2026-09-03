import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { normalize, resolve } from "node:path";

function git(dir, args) {
	try {
		return execFileSync("git", ["-C", dir, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

export function validateMemoryCheckout(path, expectedCommit, expectedVersion) {
	const root = resolve(path);
	if (!existsSync(resolve(root, "package.json"))) {
		return "required local dependency missing";
	}
	const gitRoot = git(root, ["rev-parse", "--show-toplevel"]);
	if (gitRoot == null || normalize(gitRoot) !== normalize(root)) {
		return "path must be its repository root";
	}
	if (git(root, ["rev-parse", "HEAD"]) !== expectedCommit) {
		return "checkout commit mismatch";
	}
	if (git(root, ["status", "--porcelain"]) !== "") {
		return "checkout must be clean";
	}
	const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
	if (pkg.name !== "@nextain/naia-memory" || pkg.version !== expectedVersion) {
		return "package identity mismatch";
	}
	return null;
}
