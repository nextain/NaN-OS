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
import { stageVoxCpm2Runtime } from "../stage-voxcpm2-runtime.mjs";

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
	writeFileSync(runtimeArchive, "digest-pinned ZIP fixture");
	return {
		shellDir,
		runtimeSource,
		expectedManifestSha256: hash(manifestPath),
		runtimeArchive,
		runtimeUrl: "https://downloads.nextain.io/voxcpm2/windows_trt_6g/test.zip",
	};
}

describe("stageVoxCpm2Runtime", () => {
	it("stages only a verified download contract and installer script", () => {
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
