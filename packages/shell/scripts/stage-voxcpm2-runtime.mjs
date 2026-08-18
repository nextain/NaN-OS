import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
/** Stage a digest-pinned standalone voxcpm2-tensorrt Windows artifact. */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SHELL = resolve(SCRIPT_DIR, "..");
const REPOSITORY = "https://github.com/nextain/voxcpm2-tensorrt";

function sha256(path) {
	if (statSync(path).size > 64 * 1024 * 1024) {
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
			throw new Error(`Could not hash large release file: ${path}`);
		return digest.toLowerCase();
	}
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function filesUnder(root, current = root) {
	return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(current, entry.name);
		return entry.isDirectory()
			? filesUnder(root, path)
			: [relative(root, path).split(sep).join("/")];
	});
}

export function verifyVoxCpm2Artifact(source, expectedManifestSha256) {
	if (!/^[a-f0-9]{64}$/i.test(expectedManifestSha256 ?? ""))
		throw new Error(
			"NAIA_VOXCPM2_TRT_ARTIFACT_SHA256 must pin the artifact manifest",
		);
	const manifestPath = resolve(source, "artifact-manifest.json");
	if (!existsSync(manifestPath))
		throw new Error("VoxCPM2 artifact manifest is missing");
	if (sha256(manifestPath) !== expectedManifestSha256.toLowerCase())
		throw new Error("VoxCPM2 artifact manifest SHA-256 mismatch");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (
		manifest.schemaVersion !== 1 ||
		manifest.profile !== "windows_trt_6g" ||
		manifest.source?.repository !== REPOSITORY ||
		!/^[a-f0-9]{40}$/.test(manifest.source?.commit ?? "")
	)
		throw new Error("VoxCPM2 artifact provenance contract is invalid");
	const runtimeManifest = resolve(source, "runtime-manifest.json");
	if (
		!existsSync(runtimeManifest) ||
		sha256(runtimeManifest) !== manifest.runtimeManifestSha256
	)
		throw new Error("VoxCPM2 runtime manifest SHA-256 mismatch");
	const packageLock = resolve(source, "runtime-package-lock.json");
	if (
		!existsSync(packageLock) ||
		sha256(packageLock) !== manifest.packageLockSha256
	)
		throw new Error("VoxCPM2 runtime package lock SHA-256 mismatch");
	const installerPackageLock = resolve(source, "installer-package-lock.json");
	if (
		!existsSync(installerPackageLock) ||
		sha256(installerPackageLock) !== manifest.installerPackageLockSha256
	)
		throw new Error("VoxCPM2 installer package lock SHA-256 mismatch");
	if (!Array.isArray(manifest.files) || manifest.files.length === 0)
		throw new Error("VoxCPM2 artifact inventory is empty");
	const expected = new Set();
	for (const item of manifest.files) {
		const path = String(item?.path ?? "").replaceAll("\\", "/");
		if (
			!path ||
			path.startsWith("/") ||
			path.split("/").includes("..") ||
			expected.has(path)
		)
			throw new Error(`VoxCPM2 artifact inventory path is invalid: ${path}`);
		expected.add(path);
		const full = resolve(source, path);
		if (!existsSync(full) || !statSync(full).isFile())
			throw new Error(`VoxCPM2 artifact file is missing: ${path}`);
		if (statSync(full).size !== item.size || sha256(full) !== item.sha256)
			throw new Error(`VoxCPM2 artifact file digest mismatch: ${path}`);
	}
	const actual = new Set(
		filesUnder(source).filter((path) => path !== "artifact-manifest.json"),
	);
	const extras = [...actual].filter((path) => !expected.has(path));
	const missing = [...expected].filter((path) => !actual.has(path));
	if (extras.length || missing.length)
		throw new Error(
			`VoxCPM2 artifact inventory mismatch: extras=${extras.length} missing=${missing.length}`,
		);
	for (const required of [
		"runtime-manifest.json",
		"runtime-package-lock.json",
		"installer-package-lock.json",
		"sbom.spdx.json",
		"THIRD_PARTY_NOTICES.md",
		"licenses/Apache-2.0.txt",
		"python/python.exe",
	])
		if (!expected.has(required))
			throw new Error(`VoxCPM2 artifact is incomplete: ${required}`);
	const compiledPrefix = "python/Lib/site-packages/voxcpm2_tensorrt/";
	const sitePackagesPrefix = "python/Lib/site-packages/";
	const compiledModules = [...expected].filter(
		(path) => path.startsWith(compiledPrefix) && path.endsWith(".pyd"),
	);
	if (compiledModules.length === 0)
		throw new Error("VoxCPM2 compiled Nextain payload is missing");
	const prohibited = [...expected].filter(
		(path) =>
			(path.startsWith(compiledPrefix) && /\.(?:py|pyc|c|pdb)$/i.test(path)) ||
			(!path.startsWith(sitePackagesPrefix) &&
				/\.(?:engine|onnx|plan)$/i.test(path)) ||
			(path.startsWith("voices/") && /\.wav$/i.test(path)),
	);
	if (prohibited.length)
		throw new Error(
			`VoxCPM2 artifact contains prohibited release files: ${prohibited.join(", ")}`,
		);
	if (manifest.voice !== null)
		throw new Error("VoxCPM2 release must not bundle an unapproved voice");
	return manifest;
}

export function stageVoxCpm2Runtime({
	shellDir = DEFAULT_SHELL,
	runtimeSource = process.env.NAIA_VOXCPM2_TRT_RUNTIME_DIR,
	expectedManifestSha256 = process.env.NAIA_VOXCPM2_TRT_ARTIFACT_SHA256,
	runtimeArchive = process.env.NAIA_VOXCPM2_TRT_ARCHIVE,
	runtimeUrl = process.env.NAIA_VOXCPM2_TRT_DOWNLOAD_URL,
} = {}) {
	if (!runtimeSource)
		throw new Error(
			"NAIA_VOXCPM2_TRT_RUNTIME_DIR is required for a Windows release",
		);
	const source = realpathSync(runtimeSource);
	verifyVoxCpm2Artifact(source, expectedManifestSha256);
	if (!runtimeArchive)
		throw new Error(
			"NAIA_VOXCPM2_TRT_ARCHIVE is required for a Windows release",
		);
	const archive = realpathSync(runtimeArchive);
	if (!statSync(archive).isFile())
		throw new Error("VoxCPM2 download archive is not a file");
	let parsedUrl;
	try {
		parsedUrl = new URL(runtimeUrl);
	} catch {
		throw new Error("NAIA_VOXCPM2_TRT_DOWNLOAD_URL must be a valid HTTPS URL");
	}
	if (
		parsedUrl.protocol !== "https:" ||
		parsedUrl.username ||
		parsedUrl.password
	)
		throw new Error("VoxCPM2 download URL must use credential-free HTTPS");
	const inventory = filesUnder(source);
	const downloadManifest = {
		schemaVersion: 1,
		profile: "windows_trt_6g",
		artifactManifestSha256: expectedManifestSha256.toLowerCase(),
		archive: {
			url: parsedUrl.href,
			sha256: sha256(archive),
			bytes: statSync(archive).size,
			unpackedBytes: inventory.reduce(
				(total, path) => total + statSync(resolve(source, path)).size,
				0,
			),
			files: inventory.length,
		},
	};
	const destination = resolve(shellDir, "src-tauri/voxcpm2-runtime");
	const pending = `${destination}.pending`;
	rmSync(pending, { recursive: true, force: true });
	mkdirSync(pending, { recursive: true });
	copyFileSync(
		resolve(shellDir, "src-tauri/windows/prepare-voxcpm2-model.ps1"),
		resolve(pending, "prepare-voxcpm2-model.ps1"),
	);
	writeFileSync(
		resolve(pending, "download-manifest.json"),
		`${JSON.stringify(downloadManifest, null, 2)}\n`,
	);
	rmSync(destination, { recursive: true, force: true });
	renameSync(pending, destination);
	return destination;
}

const invoked = process.argv[1]
	? pathToFileURL(realpathSync(resolve(process.argv[1]))).href
	: "";
if (invoked === import.meta.url)
	console.log(`[stage-voxcpm2-runtime] staged ${stageVoxCpm2Runtime()}`);
