/**
 * Stage the Windows VoxCPM2 TensorRT service as a product runtime.
 *
 * The release input is a prebuilt, version-pinned Python/CUDA/TensorRT payload.
 * End-user installation never downloads Python, PyTorch, or TensorRT. It only
 * downloads the pinned VoxCPM2 model and creates the GPU-specific TRT engine.
 *
 * Required build input:
 *   NAIA_VOXCPM2_TRT_RUNTIME_DIR/
 *     runtime-manifest.json
 *     python/python.exe
 *     python/Lib/site-packages/{torch,voxcpm,tensorrt,onnx,...}
 *     voices/*.wav
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SHELL = resolve(SCRIPT_DIR, "..");

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function stable(value) {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, stable(child)]),
		);
	return value;
}

function sameJson(left, right) {
	return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function stageVoxCpm2Runtime({
	shellDir = DEFAULT_SHELL,
	runtimeSource = process.env.NAIA_VOXCPM2_TRT_RUNTIME_DIR,
	labsService = resolve(shellDir, "../../../naia-labs/avatar/service"),
} = {}) {
	if (!runtimeSource)
		throw new Error(
			"NAIA_VOXCPM2_TRT_RUNTIME_DIR is required for a Windows release; runtime dependency downloads on end-user PCs are forbidden",
		);
	const source = realpathSync(runtimeSource);
	const destination = resolve(shellDir, "src-tauri/voxcpm2-runtime");
	const contractPath = resolve(shellDir, "scripts/voxcpm2-runtime-manifest.json");
	const artifactManifestPath = resolve(source, "runtime-manifest.json");
	const contract = readJson(contractPath);
	const artifact = readJson(artifactManifestPath);
	if (
		artifact.profile !== contract.profile ||
		!sameJson(artifact.runtime, contract.runtime)
	)
		throw new Error(
			"VoxCPM2 TRT runtime artifact does not match the pinned Shell runtime contract",
		);

	const required = [
		"python/python.exe",
		"python/Lib/site-packages/torch",
		"python/Lib/site-packages/voxcpm",
		"python/Lib/site-packages/tensorrt",
		"python/Lib/site-packages/onnx",
		"voices",
	];
	for (const relative of required) {
		if (!existsSync(resolve(source, relative)))
			throw new Error(`VoxCPM2 TRT runtime artifact is incomplete: ${relative}`);
	}

	for (const file of [
		"tts_server.py",
		"render_admission.py",
		"voxcpm2_trt.py",
		"build_voxcpm2_trt.py",
	]) {
		if (!existsSync(resolve(labsService, file)))
			throw new Error(`required VoxCPM2 service source missing: ${file}`);
	}

	rmSync(destination, { recursive: true, force: true });
	cpSync(resolve(source, "python"), resolve(destination, "python"), {
		recursive: true,
	});
	cpSync(resolve(source, "voices"), resolve(destination, "voices"), {
		recursive: true,
	});
	mkdirSync(resolve(destination, "service"), { recursive: true });
	for (const file of [
		"tts_server.py",
		"render_admission.py",
		"voxcpm2_trt.py",
		"build_voxcpm2_trt.py",
	])
		cpSync(resolve(labsService, file), resolve(destination, "service", file));
	cpSync(contractPath, resolve(destination, "manifest.json"));
	cpSync(
		resolve(shellDir, "src-tauri/windows/prepare-voxcpm2-model.ps1"),
		resolve(destination, "prepare-voxcpm2-model.ps1"),
	);
	cpSync(
		resolve(shellDir, "src-tauri/windows/voxcpm2-runtime.py"),
		resolve(destination, "voxcpm2-runtime.py"),
	);
	return destination;
}

const invoked = process.argv[1]
	? pathToFileURL(realpathSync(resolve(process.argv[1]))).href
	: "";
if (invoked === import.meta.url) {
	const destination = stageVoxCpm2Runtime();
	console.log(`[stage-voxcpm2-runtime] staged ${destination}`);
}
