import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyVoxCpm2Artifact } from "./stage-voxcpm2-runtime.mjs";

function sha256(path) {
	if (statSync(path).size <= 64 * 1024 * 1024)
		return createHash("sha256").update(readFileSync(path)).digest("hex");
	const result = spawnSync(
		"powershell.exe",
		[
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"(Get-FileHash -LiteralPath $args[0] -Algorithm SHA256).Hash.ToLowerInvariant()",
			path,
		],
		{ encoding: "utf8", windowsHide: true },
	);
	const digest = result.stdout?.trim();
	if (result.status !== 0 || !/^[a-f0-9]{64}$/i.test(digest ?? ""))
		throw new Error(`Could not hash VoxCPM2 archive: ${path}`);
	return digest.toLowerCase();
}

export function packageVoxCpm2Runtime({
	runtimeSource = process.env.NAIA_VOXCPM2_TRT_RUNTIME_DIR,
	expectedManifestSha256 = process.env.NAIA_VOXCPM2_TRT_ARTIFACT_SHA256,
	output = process.env.NAIA_VOXCPM2_TRT_ARCHIVE,
	tar = process.env.NAIA_SYSTEM_TAR || "tar.exe",
} = {}) {
	if (!runtimeSource)
		throw new Error("NAIA_VOXCPM2_TRT_RUNTIME_DIR is required");
	if (!output) throw new Error("NAIA_VOXCPM2_TRT_ARCHIVE is required");
	const source = realpathSync(runtimeSource);
	verifyVoxCpm2Artifact(source, expectedManifestSha256);
	const destination = resolve(output);
	const pending = `${destination}.pending`;
	mkdirSync(dirname(destination), { recursive: true });
	rmSync(pending, { force: true });
	const result = spawnSync(
		tar,
		["-a", "-c", "-f", pending, "-C", source, "."],
		{ encoding: "utf8", windowsHide: true },
	);
	if (result.status !== 0 || !existsSync(pending)) {
		rmSync(pending, { force: true });
		throw new Error(
			`VoxCPM2 ZIP64 packaging failed (${result.status}): ${result.stderr || result.stdout}`,
		);
	}
	if (statSync(pending).size === 0) {
		rmSync(pending, { force: true });
		throw new Error("VoxCPM2 archive is empty");
	}
	rmSync(destination, { force: true });
	renameSync(pending, destination);
	return {
		path: destination,
		bytes: statSync(destination).size,
		sha256: sha256(destination),
	};
}

const invoked = process.argv[1]
	? pathToFileURL(realpathSync(resolve(process.argv[1]))).href
	: "";
if (invoked === import.meta.url)
	console.log(JSON.stringify(packageVoxCpm2Runtime(), null, 2));
