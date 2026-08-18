import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
/** Stage a digest-pinned standalone voxcpm2-tensorrt Windows artifact. */
import {
	closeSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	readSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SHELL = resolve(SCRIPT_DIR, "..");
const REPOSITORY = "https://github.com/nextain/voxcpm2-tensorrt";
const ACTIVATION_CONTRACT_PATH = resolve(
	DEFAULT_SHELL,
	"src-tauri/voxcpm2-activation-contract.json",
);

export function readVoxCpm2ActivationContract(
	path = ACTIVATION_CONTRACT_PATH,
) {
	const contract = JSON.parse(readFileSync(path, "utf8"));
	if (
		contract.schemaVersion !== 1 ||
		contract.profile !== "windows_trt_6g" ||
		!Array.isArray(contract.artifact?.requiredFiles) ||
		!Array.isArray(contract.artifact?.requiredDirectories) ||
		!Array.isArray(contract.artifact?.compiledModules) ||
		!Array.isArray(contract.payload?.requiredFiles) ||
		!Array.isArray(contract.payload?.requiredDirectories) ||
		!Array.isArray(contract.runtime?.referenceVoices) ||
		contract.runtime.referenceVoices.length < 1 ||
		contract.runtime.referenceVoices.filter((voice) => voice.default).length !== 1 ||
		contract.runtime.referenceVoices.some(
			(voice) =>
				!/^[-\w.]+\.wav$/iu.test(voice.id) ||
				!/^https:\/\//iu.test(voice.url) ||
				!/^[a-f\d]{64}$/iu.test(voice.sha256) ||
				!Number.isSafeInteger(voice.bytes) ||
				voice.bytes <= 0,
		)
	)
		throw new Error("VoxCPM2 activation contract is invalid");
	return contract;
}

export function voxCpm2ArtifactActivationFailures(
	source,
	contract = readVoxCpm2ActivationContract(),
) {
	const failures = [];
	for (const path of contract.artifact.requiredFiles) {
		const candidate = resolve(source, path);
		if (!existsSync(candidate) || !statSync(candidate).isFile())
			failures.push(`missing file: ${path}`);
	}
	for (const path of contract.artifact.requiredDirectories) {
		const candidate = resolve(source, path);
		if (!existsSync(candidate) || !statSync(candidate).isDirectory())
			failures.push(`missing directory: ${path}`);
	}
	for (const compiled of contract.artifact.compiledModules) {
		const directory = resolve(source, compiled.directory);
		const prefix = `${compiled.module}.`;
		const suffix = `.${compiled.extension}`.toLowerCase();
		const present =
			existsSync(directory) &&
			statSync(directory).isDirectory() &&
			readdirSync(directory, { withFileTypes: true }).some(
				(entry) =>
					entry.isFile() &&
					entry.name.startsWith(prefix) &&
					entry.name.toLowerCase().endsWith(suffix),
			);
		if (!present)
			failures.push(
				`missing compiled module: ${compiled.directory}/${compiled.module}.*.${compiled.extension}`,
			);
	}
	return failures;
}

export function voxCpm2PayloadFileActivationFailures(
	root,
	contract = readVoxCpm2ActivationContract(),
) {
	return contract.payload.requiredFiles
		.filter((path) => {
			const candidate = resolve(root, path);
			return !existsSync(candidate) || !statSync(candidate).isFile();
		})
		.map((path) => `missing payload file: ${path}`);
}

export function verifyVoxCpm2ArchiveActivationContract({
	archive,
	tar = process.env.NAIA_SYSTEM_TAR || "tar.exe",
	contract = readVoxCpm2ActivationContract(),
	expectedFiles,
	expectedManifestSha256,
	expectedUnpackedBytes,
} = {}) {
	const inspected = spawnSync(tar, ["-tvf", basename(archive)], {
		encoding: "utf8",
		windowsHide: true,
		cwd: dirname(archive),
		maxBuffer: 64 * 1024 * 1024,
	});
	if (inspected.status !== 0)
		throw new Error(
			`VoxCPM2 ZIP64 activation audit failed (${inspected.status}): ${inspected.stderr || inspected.stdout}`,
		);
	const entries = String(inspected.stdout ?? "")
		.split(/\r?\n/u)
		.map((line) => {
			const match = line.match(
				/^\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\d+\s+\d+\s+\S+\s+(.+)$/u,
			);
			if (!match) return null;
			return {
				size: Number(match[1]),
				path: match[2].trim().replaceAll("\\", "/").replace(/^\.\//u, ""),
			};
		})
		.filter((entry) => entry?.path);
	const fileEntries = entries.filter((entry) => !entry.path.endsWith("/"));
	const files = new Set(fileEntries.map((entry) => entry.path));
	const directories = new Set(
		entries
			.filter((entry) => entry.path.endsWith("/"))
			.map((entry) => entry.path.slice(0, -1)),
	);
	const failures = [];
	for (const path of contract.artifact.requiredFiles)
		if (!files.has(path)) failures.push(`missing file: ${path}`);
	for (const path of contract.artifact.requiredDirectories)
		if (!directories.has(path)) failures.push(`missing directory: ${path}`);
	for (const compiled of contract.artifact.compiledModules) {
		const prefix = `${compiled.directory}/${compiled.module}.`;
		const suffix = `.${compiled.extension}`.toLowerCase();
		if (
			![...files].some(
				(path) => path.startsWith(prefix) && path.toLowerCase().endsWith(suffix),
			)
		)
			failures.push(
				`missing compiled module: ${compiled.directory}/${compiled.module}.*.${compiled.extension}`,
			);
	}
	if (expectedFiles) {
		const expected = new Set(expectedFiles);
		const extras = [...files].filter((path) => !expected.has(path));
		const missing = [...expected].filter((path) => !files.has(path));
		if (extras.length || missing.length)
			failures.push(
				`archive/source inventory mismatch: extras=${extras.length} missing=${missing.length}`,
			);
	}
	if (
		Number.isFinite(expectedUnpackedBytes) &&
		fileEntries.reduce((total, entry) => total + entry.size, 0) !==
			expectedUnpackedBytes
	)
		failures.push("archive/source unpacked byte count mismatch");
	if (expectedManifestSha256) {
		const manifest = spawnSync(
			tar,
			["-xOf", basename(archive), "artifact-manifest.json"],
			{
				windowsHide: true,
				cwd: dirname(archive),
				maxBuffer: 16 * 1024 * 1024,
			},
		);
		const actualManifestSha256 =
			manifest.status === 0
				? createHash("sha256").update(manifest.stdout).digest("hex")
				: "";
		if (
			actualManifestSha256.toLowerCase() !== expectedManifestSha256.toLowerCase()
		)
			failures.push("embedded artifact-manifest SHA-256 mismatch");
	}
	if (failures.length)
		throw new Error(
			`VoxCPM2 archive cannot pass runtime activation: ${failures.join("; ")}`,
		);
	return { files: files.size, directories: directories.size };
}

function sha256(path) {
	// Chunked synchronous hashing: handles multi-GB release files without
	// loading them whole (readFileSync caps out around 2 GiB) and without the
	// PowerShell child the previous large-file branch used — Windows
	// PowerShell 5.1 does not feed trailing positional arguments to a
	// -Command script's $args, so that branch always threw
	// "Could not hash large release file" on the release machine.
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
	const activationFailures = voxCpm2ArtifactActivationFailures(source);
	if (activationFailures.length)
		throw new Error(
			`VoxCPM2 artifact cannot pass runtime activation: ${activationFailures.join("; ")}`,
		);
	return manifest;
}

export function stageVoxCpm2Runtime({
	shellDir = DEFAULT_SHELL,
	runtimeSource = process.env.NAIA_VOXCPM2_TRT_RUNTIME_DIR,
	expectedManifestSha256 = process.env.NAIA_VOXCPM2_TRT_ARTIFACT_SHA256,
	runtimeArchive = process.env.NAIA_VOXCPM2_TRT_ARCHIVE,
	runtimeUrl = process.env.NAIA_VOXCPM2_TRT_DOWNLOAD_URL,
	tar = process.env.NAIA_SYSTEM_TAR || "tar.exe",
} = {}) {
	if (!runtimeSource)
		throw new Error(
			"NAIA_VOXCPM2_TRT_RUNTIME_DIR is required for a Windows release",
		);
	const source = realpathSync(runtimeSource);
	const activationContract = readVoxCpm2ActivationContract(
		resolve(shellDir, "src-tauri/voxcpm2-activation-contract.json"),
	);
	const defaultVoice = activationContract.runtime.referenceVoices.find(
		(voice) => voice.default,
	);
	const configSource = readFileSync(resolve(shellDir, "src/lib/config.ts"), "utf8");
	const chatSource = readFileSync(
		resolve(shellDir, "src/components/ChatArea.tsx"),
		"utf8",
	);
	if (!configSource.includes(JSON.stringify(defaultVoice.url)))
		throw new Error(
			"Shell preview default URL differs from the Naia Host activation contract",
		);
	if (!chatSource.includes(JSON.stringify(defaultVoice.id)))
		throw new Error(
			"Shell synthesis default voice id differs from the Naia Host activation contract",
		);
	verifyVoxCpm2Artifact(source, expectedManifestSha256);
	if (!runtimeArchive)
		throw new Error(
			"NAIA_VOXCPM2_TRT_ARCHIVE is required for a Windows release",
		);
	const archive = realpathSync(runtimeArchive);
	if (!statSync(archive).isFile())
		throw new Error("VoxCPM2 download archive is not a file");
	const inventory = filesUnder(source);
	const unpackedBytes = inventory.reduce(
		(total, path) => total + statSync(resolve(source, path)).size,
		0,
	);
	verifyVoxCpm2ArchiveActivationContract({
		archive,
		tar,
		expectedFiles: inventory,
		expectedManifestSha256,
		expectedUnpackedBytes: unpackedBytes,
	});
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
	const downloadManifest = {
		schemaVersion: 1,
		profile: "windows_trt_6g",
		artifactManifestSha256: expectedManifestSha256.toLowerCase(),
		archive: {
			url: parsedUrl.href,
			sha256: sha256(archive),
			bytes: statSync(archive).size,
			unpackedBytes,
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
	copyFileSync(
		resolve(shellDir, "src-tauri/voxcpm2-activation-contract.json"),
		resolve(pending, "voxcpm2-activation-contract.json"),
	);
	const payloadFailures = voxCpm2PayloadFileActivationFailures(pending);
	if (payloadFailures.length)
		throw new Error(
			`VoxCPM2 staged payload cannot pass runtime activation: ${payloadFailures.join("; ")}`,
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
