import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	verifyVoxCpm2Artifact,
	verifyVoxCpm2ArchiveActivationContract,
} from "./stage-voxcpm2-runtime.mjs";

function sha256(path) {
	// Chunked sync hashing — same fix as stage-voxcpm2-runtime.mjs: the old
	// PowerShell child never received the trailing positional argument in
	// Windows PowerShell 5.1, so hashing any file over 64 MiB always threw.
	const hash = createHash("sha256");
	const fd = openSync(path, "r");
	try {
		const buf = Buffer.alloc(8 * 1024 * 1024);
		let read;
		while ((read = readSync(fd, buf, 0, buf.length, null)) > 0)
			hash.update(read === buf.length ? buf : buf.subarray(0, read));
	} finally {
		closeSync(fd);
	}
	return hash.digest("hex");
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
	const manifest = verifyVoxCpm2Artifact(source, expectedManifestSha256);
	const destination = resolve(output);
	// bsdtar's -a picks the FORMAT from the -f extension. The old ".pending"
	// suffix (no extension) silently produced an uncompressed TAR that the
	// Rust installer (zip::ZipArchive) can never open — keep ".zip" last.
	const pending = `${destination}.pending.zip`;
	mkdirSync(dirname(destination), { recursive: true });
	rmSync(pending, { force: true });
	// bsdtar parses a drive-letter colon in -f as a remote host ("Cannot
	// connect to E:") — pass only the file NAME and set cwd to its directory.
	const result = spawnSync(
		tar,
		["-a", "-c", "-f", basename(pending), "-C", source, "."],
		{ encoding: "utf8", windowsHide: true, cwd: dirname(pending) },
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
	try {
		const expectedFiles = [
			"artifact-manifest.json",
			...manifest.files.map((item) => item.path.replaceAll("\\", "/")),
		];
		verifyVoxCpm2ArchiveActivationContract({
			archive: destination,
			tar,
			expectedFiles,
			expectedManifestSha256,
		});
	} catch (error) {
		rmSync(destination, { force: true });
		throw error;
	}
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
