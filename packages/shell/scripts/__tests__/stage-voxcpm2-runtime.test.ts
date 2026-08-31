import { createHash } from "node:crypto";
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
import { afterEach, describe, expect, it } from "vitest";
import {
	packageVoxCpm2Runtime,
} from "../package-voxcpm2-runtime.mjs";
import {
	DEFAULT_VOXCPM2_TRT_DOWNLOAD_URL,
	readVoxCpm2ActivationContract,
	stageVoxCpm2Runtime,
	verifyVoxCpm2ArchiveActivationContract,
	voxCpm2ArtifactActivationFailures,
	voxCpm2PayloadFileActivationFailures,
} from "../stage-voxcpm2-runtime.mjs";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function hash(path: string) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixture() {
	const root = mkdtempSync(resolve(tmpdir(), "naia-voxcpm2-stage-"));
	roots.push(root);
	const shellDir = resolve(root, "shell");
	const runtimeSource = resolve(root, "runtime");
	for (const path of [
		resolve(shellDir, "src-tauri"),
		resolve(shellDir, "src-tauri/windows"),
		resolve(shellDir, "src/lib"),
		resolve(shellDir, "src/components"),
		resolve(runtimeSource, "python/Lib/site-packages/voxcpm2_tensorrt"),
		resolve(runtimeSource, "python/Lib/site-packages/onnx/backend/test/data"),
		resolve(runtimeSource, "python/Lib/site-packages/scipy/io/tests/data"),
		resolve(runtimeSource, "voices"),
		resolve(runtimeSource, "licenses"),
	])
		mkdirSync(path, { recursive: true });
	writeFileSync(
		resolve(shellDir, "src-tauri/windows/prepare-voxcpm2-model.ps1"),
		"shell orchestration",
	);
	writeFileSync(
		resolve(shellDir, "src-tauri/voxcpm2-activation-contract.json"),
		readFileSync(
			resolve(process.cwd(), "src-tauri/voxcpm2-activation-contract.json"),
		),
	);
	writeFileSync(
		resolve(shellDir, "src/lib/config.ts"),
		'export const DEFAULT_VOICE_REF_URL = "https://stnaiapub83b29893.blob.core.windows.net/ref-audio/cc0/cc0-ko-female-01.wav";',
	);
	writeFileSync(
		resolve(shellDir, "src/components/ChatArea.tsx"),
		'return "cc0-ko-female-01.wav";',
	);
	const runtimeManifest = resolve(runtimeSource, "runtime-manifest.json");
	writeFileSync(
		runtimeManifest,
		JSON.stringify({ schemaVersion: 3, profile: "windows_trt_6g" }),
	);
	const packageLock = resolve(runtimeSource, "runtime-package-lock.json");
	writeFileSync(
		packageLock,
		JSON.stringify({ schemaVersion: 1, python: "3.10.20", packages: {} }),
	);
	const installerPackageLock = resolve(
		runtimeSource,
		"installer-package-lock.json",
	);
	writeFileSync(
		installerPackageLock,
		JSON.stringify({
			schemaVersion: 1,
			python: "3.10.20",
			packages: { "tensorrt-cu12": "10.3.0" },
			policy: "automatic-installer-only",
		}),
	);
	writeFileSync(resolve(runtimeSource, "python/python.exe"), "python");
	writeFileSync(
		resolve(
			runtimeSource,
			"python/Lib/site-packages/onnx/backend/test/data/model.onnx",
		),
		"third-party conformance fixture",
	);
	writeFileSync(
		resolve(
			runtimeSource,
			"python/Lib/site-packages/scipy/io/tests/data/test.wav",
		),
		"third-party audio fixture",
	);
	writeFileSync(
		resolve(
			runtimeSource,
			"python/Lib/site-packages/voxcpm2_tensorrt/http_server.cp310-win_amd64.pyd",
		),
		"compiled runtime",
	);
	writeFileSync(
		resolve(runtimeSource, "sbom.spdx.json"),
		'{"spdxVersion":"SPDX-2.3"}',
	);
	writeFileSync(resolve(runtimeSource, "THIRD_PARTY_NOTICES.md"), "notices");
	writeFileSync(
		resolve(runtimeSource, "licenses/Apache-2.0.txt"),
		"Apache-2.0",
	);
	const paths = [
		"runtime-manifest.json",
		"runtime-package-lock.json",
		"installer-package-lock.json",
		"sbom.spdx.json",
		"THIRD_PARTY_NOTICES.md",
		"licenses/Apache-2.0.txt",
		"python/python.exe",
		"python/Lib/site-packages/onnx/backend/test/data/model.onnx",
		"python/Lib/site-packages/scipy/io/tests/data/test.wav",
		"python/Lib/site-packages/voxcpm2_tensorrt/http_server.cp310-win_amd64.pyd",
	];
	const manifest = {
		schemaVersion: 1,
		profile: "windows_trt_6g",
		runtimeManifestSha256: hash(runtimeManifest),
		packageLockSha256: hash(packageLock),
		installerPackageLockSha256: hash(installerPackageLock),
		source: {
			repository: "https://github.com/nextain/voxcpm2-tensorrt",
			commit: "a".repeat(40),
		},
		files: paths.map((path) => ({
			path,
			size: readFileSync(resolve(runtimeSource, path)).length,
			sha256: hash(resolve(runtimeSource, path)),
		})),
		voice: null,
	};
	const manifestPath = resolve(runtimeSource, "artifact-manifest.json");
	writeFileSync(manifestPath, JSON.stringify(manifest));
	const runtimeArchive = resolve(root, "voxcpm2-runtime.zip");
	const tar = process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";
	packageVoxCpm2Runtime({
		runtimeSource,
		expectedManifestSha256: hash(manifestPath),
		output: runtimeArchive,
		tar,
	});
	return {
		shellDir,
		runtimeSource,
		expectedManifestSha256: hash(manifestPath),
		runtimeArchive,
		runtimeUrl: "https://downloads.nextain.io/voxcpm2/windows_trt_6g/test.zip",
		tar,
		verifyRemoteDownload: () => {},
	};
}

describe("stageVoxCpm2Runtime", () => {
	it("pins the production R2 URL and verifies its remote byte contract", () => {
		expect(DEFAULT_VOXCPM2_TRT_DOWNLOAD_URL).toBe(
			"https://pub-a587c16974874fc9a168d2a281801a23.r2.dev/windows_trt_6g/releases/0.2.1/voxcpm2-runtime-win-trt6g.zip",
		);
		const source = fixture();
		const calls: Array<[string, number]> = [];
		stageVoxCpm2Runtime({
			...source,
			verifyRemoteDownload: (url: string, bytes: number) =>
				calls.push([url, bytes]),
		});
		expect(calls).toEqual([
			[source.runtimeUrl, readFileSync(source.runtimeArchive).length],
		]);
	});

	it("fails release staging when the public download probe fails", () => {
		expect(() =>
			stageVoxCpm2Runtime({
				...fixture(),
				verifyRemoteDownload: () => {
					throw new Error("HEAD returned HTTP 401");
				},
			}),
		).toThrow(/HTTP 401/);
	});

	it("pins, verifies, and atomically installs every approved Shell reference voice", () => {
		const installer = readFileSync(
			resolve(process.cwd(), "src-tauri/windows/prepare-voxcpm2-model.ps1"),
			"utf8",
		);
		expect(installer).toContain("Test-ReferenceVoice");
		expect(installer).toContain("Invoke-WebRequest");
		expect(installer).toContain("Get-FileHash");
		expect(installer).toContain("$ReferenceVoices");
		expect(installer).toContain("foreach ($Voice in $ReferenceVoices)");
		expect(installer).toContain("$VoicePending");
		expect(installer).toContain("referenceVoices = @(");
		const devLauncher = readFileSync(
			resolve(process.cwd(), "scripts/tauri-with-mode.mjs"),
			"utf8",
		);
		expect(devLauncher).toContain(
			'resolve(SHELL, "src-tauri/voxcpm2-activation-contract.json")',
		);
		expect(devLauncher).toContain(
			'resolve(devVoxCpm2Bundle, "voxcpm2-activation-contract.json")',
		);
	});

	it("audits every runtime activation prerequisite before release staging", () => {
		const source = fixture();
		expect(voxCpm2ArtifactActivationFailures(source.runtimeSource)).toEqual([]);

		rmSync(
			resolve(
				source.runtimeSource,
				"python/Lib/site-packages/voxcpm2_tensorrt/http_server.cp310-win_amd64.pyd",
			),
			{ force: true },
		);
		writeFileSync(
			resolve(
				source.runtimeSource,
				"python/Lib/site-packages/voxcpm2_tensorrt/unrelated.cp310-win_amd64.pyd",
			),
			"compiled but not the server entry point",
		);
		expect(voxCpm2ArtifactActivationFailures(source.runtimeSource)).toEqual([
			"missing compiled module: python/Lib/site-packages/voxcpm2_tensorrt/http_server.*.pyd",
		]);
		expect(readVoxCpm2ActivationContract().payload.requiredDirectories).toEqual([
			"artifact/voices",
		]);
		const referenceVoices =
			readVoxCpm2ActivationContract().runtime.referenceVoices;
		expect(referenceVoices.map((voice) => voice.id)).toEqual([
			"cc0-ko-female-01.wav",
			"cc0-ko-female-02.wav",
			"cc0-ko-female-03.wav",
			"cc0-ko-male-01.wav",
			"cc0-ko-male-02.wav",
			"cc0-ko-male-03.wav",
			"cc0-ko-male-04.wav",
			"cc0-ko-male-05.wav",
		]);
		expect(referenceVoices.filter((voice) => voice.default)).toEqual([
			expect.objectContaining({
				id: "cc0-ko-female-01.wav",
				sha256:
					"b90fd1a86ff8fb74c2e165894c6728d07f16cb69c501f00302d8e25c53805c09",
				bytes: 193550,
			}),
		]);
	});

	it("audits the completed ZIP64 archive before it can become a release input", () => {
		const source = fixture();
		const output = resolve(source.runtimeSource, "..", "release-runtime.zip");
		const tar =
			process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";
		const packaged = packageVoxCpm2Runtime({
			runtimeSource: source.runtimeSource,
			expectedManifestSha256: source.expectedManifestSha256,
			output,
			tar,
		});
		expect(packaged.path).toBe(output);
		expect(
			verifyVoxCpm2ArchiveActivationContract({ archive: output, tar }),
		).toMatchObject({ files: 11 });
	});

	it("rejects a selected ZIP produced from a different artifact manifest", () => {
		const selected = fixture();
		const stale = fixture();
		const staleManifestPath = resolve(
			stale.runtimeSource,
			"artifact-manifest.json",
		);
		const staleManifest = JSON.parse(readFileSync(staleManifestPath, "utf8"));
		staleManifest.source.commit = "b".repeat(40);
		writeFileSync(staleManifestPath, JSON.stringify(staleManifest));
		stale.expectedManifestSha256 = hash(staleManifestPath);
		packageVoxCpm2Runtime({
			runtimeSource: stale.runtimeSource,
			expectedManifestSha256: stale.expectedManifestSha256,
			output: stale.runtimeArchive,
			tar:
				process.platform === "win32"
					? "C:\\Windows\\System32\\tar.exe"
					: "tar",
		});

		expect(() =>
			stageVoxCpm2Runtime({
				...selected,
				runtimeArchive: stale.runtimeArchive,
			}),
		).toThrow(/embedded artifact-manifest SHA-256 mismatch/);
	});

	it("checks every tracked payload file and keeps installer builds on stage-runtime", () => {
		const source = fixture();
		const contract = readVoxCpm2ActivationContract();
		contract.payload.requiredFiles.push("future-installer-helper.ps1");
		expect(
			voxCpm2PayloadFileActivationFailures(
				resolve(source.shellDir, "src-tauri/windows"),
				contract,
			),
		).toEqual([
			"missing payload file: voxcpm2-activation-contract.json",
			"missing payload file: future-installer-helper.ps1",
		]);
		const packageJson = JSON.parse(
			readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
		);
		expect(packageJson.scripts["tauri:installer"]).toContain(
			"scripts/stage-runtime.mjs",
		);
		expect(packageJson.scripts["tauri:installer"]).not.toContain(
			"tauri-with-mode.mjs build",
		);
		const stageRuntime = readFileSync(
			resolve(process.cwd(), "scripts/stage-runtime.mjs"),
			"utf8",
		);
		expect(stageRuntime).toContain(
			"voxcpm2_upgrade_rejects_default_only_payload_control_files",
		);
	});

	it("stages the verified download, installer, and default voice contracts", () => {
		const source = fixture();
		const destination = stageVoxCpm2Runtime(source);
		expect(existsSync(resolve(destination, "artifact"))).toBe(false);
		const download = JSON.parse(
			readFileSync(resolve(destination, "download-manifest.json"), "utf8"),
		);
		expect(download).toMatchObject({
			schemaVersion: 1,
			profile: "windows_trt_6g",
			artifactManifestSha256: source.expectedManifestSha256,
			archive: {
				url: source.runtimeUrl,
				sha256: hash(source.runtimeArchive),
				bytes: readFileSync(source.runtimeArchive).length,
			},
		});
		expect(download.archive.files).toBeGreaterThan(0);
		expect(download.archive.unpackedBytes).toBeGreaterThan(0);
		expect(
			readFileSync(resolve(destination, "prepare-voxcpm2-model.ps1"), "utf8"),
		).toBe("shell orchestration");
		expect(
			JSON.parse(
				readFileSync(
					resolve(destination, "voxcpm2-activation-contract.json"),
					"utf8",
				),
			).runtime.referenceVoices[0],
		).toMatchObject({
			id: "cc0-ko-female-01.wav",
			default: true,
		});
		expect(existsSync(resolve(destination, "service"))).toBe(false);
		expect(existsSync(resolve(destination, "repos"))).toBe(false);
	});

	it("rejects a non-HTTPS release URL", () => {
		expect(() =>
			stageVoxCpm2Runtime({
				...fixture(),
				runtimeUrl: "http://downloads.nextain.io/runtime.zip",
			}),
		).toThrow(/credential-free HTTPS/);
	});

	it("rejects drift between preview, synthesis, and installer voice defaults", () => {
		const previewDrift = fixture();
		writeFileSync(
			resolve(previewDrift.shellDir, "src/lib/config.ts"),
			'export const DEFAULT_VOICE_REF_URL = "https://example.invalid/other.wav";',
		);
		expect(() => stageVoxCpm2Runtime(previewDrift)).toThrow(
			/preview default URL differs/,
		);

		const synthesisDrift = fixture();
		writeFileSync(
			resolve(synthesisDrift.shellDir, "src/components/ChatArea.tsx"),
			'return "other.wav";',
		);
		expect(() => stageVoxCpm2Runtime(synthesisDrift)).toThrow(
			/synthesis default voice id differs/,
		);
	});

	it("rejects Nextain source and bundled voices", () => {
		const source = fixture();
		writeFileSync(
			resolve(
				source.runtimeSource,
				"python/Lib/site-packages/voxcpm2_tensorrt/http_server.py",
			),
			"source",
		);
		expect(() => stageVoxCpm2Runtime(source)).toThrow(/inventory mismatch/);

		const voice = fixture();
		writeFileSync(resolve(voice.runtimeSource, "voices/default.wav"), "RIFF");
		expect(() => stageVoxCpm2Runtime(voice)).toThrow(/inventory mismatch/);
	});

	it("fails closed on an external manifest digest mismatch", () => {
		expect(() =>
			stageVoxCpm2Runtime({
				...fixture(),
				expectedManifestSha256: "0".repeat(64),
			}),
		).toThrow(/SHA-256 mismatch/);
	});

	it("fails closed on tampering and unlisted files", () => {
		const tampered = fixture();
		writeFileSync(
			resolve(tampered.runtimeSource, "python/python.exe"),
			"changed",
		);
		expect(() => stageVoxCpm2Runtime(tampered)).toThrow(/digest mismatch/);
		const extra = fixture();
		writeFileSync(resolve(extra.runtimeSource, "extra.py"), "unexpected");
		expect(() => stageVoxCpm2Runtime(extra)).toThrow(/inventory mismatch/);
	});

	it("fails closed when the complete distribution lock drifts", () => {
		const drifted = fixture();
		writeFileSync(
			resolve(drifted.runtimeSource, "runtime-package-lock.json"),
			"{}",
		);
		expect(() => stageVoxCpm2Runtime(drifted)).toThrow(
			/package lock SHA-256 mismatch/,
		);
	});
});
