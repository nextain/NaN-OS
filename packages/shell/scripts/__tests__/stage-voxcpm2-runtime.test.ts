import {
	existsSync,
	mkdtempSync,
	mkdirSync,
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

function fixture() {
	const root = mkdtempSync(resolve(tmpdir(), "naia-voxcpm2-stage-"));
	roots.push(root);
	const shellDir = resolve(root, "shell");
	const runtimeSource = resolve(root, "runtime");
	const labsService = resolve(root, "labs-service");
	for (const path of [
		resolve(shellDir, "scripts"),
		resolve(shellDir, "src-tauri/windows"),
		resolve(runtimeSource, "python/Lib/site-packages/torch"),
		resolve(runtimeSource, "python/Lib/site-packages/voxcpm"),
		resolve(runtimeSource, "python/Lib/site-packages/tensorrt"),
		resolve(runtimeSource, "python/Lib/site-packages/onnx"),
		resolve(runtimeSource, "voices"),
		labsService,
	])
		mkdirSync(path, { recursive: true });
	const contract = {
		schemaVersion: 2,
		profile: "windows_trt_6g",
		runtime: { python: "3.10.20", packages: { torch: "2.5.1+cu121" } },
		model: { id: "openbmb/VoxCPM2", revision: "revision" },
	};
	writeFileSync(
		resolve(shellDir, "scripts/voxcpm2-runtime-manifest.json"),
		JSON.stringify(contract),
	);
	writeFileSync(
		resolve(runtimeSource, "runtime-manifest.json"),
		JSON.stringify(contract),
	);
	writeFileSync(resolve(runtimeSource, "python/python.exe"), "python");
	writeFileSync(resolve(runtimeSource, "voices/default.wav"), "RIFF");
	for (const file of [
		"tts_server.py",
		"render_admission.py",
		"voxcpm2_trt.py",
		"build_voxcpm2_trt.py",
	])
		writeFileSync(resolve(labsService, file), file);
	writeFileSync(
		resolve(shellDir, "src-tauri/windows/prepare-voxcpm2-model.ps1"),
		"model-only",
	);
	writeFileSync(
		resolve(shellDir, "src-tauri/windows/voxcpm2-runtime.py"),
		"direct-runtime",
	);
	return { shellDir, runtimeSource, labsService };
}

describe("stageVoxCpm2Runtime", () => {
	it("stages a separate bundled runtime without Cascade source", () => {
		const input = fixture();
		const destination = stageVoxCpm2Runtime(input);
		expect(existsSync(resolve(destination, "python/python.exe"))).toBe(true);
		expect(existsSync(resolve(destination, "service/tts_server.py"))).toBe(true);
		expect(existsSync(resolve(destination, "voices/default.wav"))).toBe(true);
		expect(existsSync(resolve(destination, "repos"))).toBe(false);
		expect(
			readFileSync(resolve(destination, "prepare-voxcpm2-model.ps1"), "utf8"),
		).toBe("model-only");
	});

	it("fails closed when the runtime artifact version drifts", () => {
		const input = fixture();
		const artifact = resolve(input.runtimeSource, "runtime-manifest.json");
		const manifest = JSON.parse(readFileSync(artifact, "utf8"));
		manifest.runtime.python = "3.11.0";
		writeFileSync(artifact, JSON.stringify(manifest));
		expect(() => stageVoxCpm2Runtime(input)).toThrow(/does not match/);
	});
});
