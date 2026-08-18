#!/usr/bin/env node
/**
 * Stage the legacy generic Cascade compatibility bundle used by its existing
 * developer and avatar flows. This path intentionally preserves the historical
 * Cascade-owned VoxCPM2 pieces until that product is migrated separately.
 * Windows standalone local voice is packaged independently by
 * stage-voxcpm2-runtime.mjs and never consumes this bundle.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const shell = process.cwd();
const manager = resolve(shell, "../../../naia-omni-windows-manager");
const loaderSource = resolve(manager, "loader");
const preloadSource = resolve(manager, "scripts/avatar_preload.py");
const destinationRoot = resolve(shell, "src-tauri/cascade-loader");
const loaderDestination = resolve(destinationRoot, "loader");
const preloadDestination = resolve(
	destinationRoot,
	"scripts/avatar_preload.py",
);
const cascadeSource = resolve(shell, "../../../naia-omni-cascade");
const labsServiceSource = resolve(shell, "../../../naia-labs/avatar/service");
const runtimeDestination = resolve(shell, "src-tauri/cascade-runtime");
const runtimeRepos = resolve(runtimeDestination, "repos/projects");

for (const required of [loaderSource, preloadSource]) {
	if (!existsSync(required))
		throw new Error(`required Cascade loader source missing: ${required}`);
}

for (const required of [
	resolve(cascadeSource, "services"),
	resolve(cascadeSource, "output_cascade"),
	resolve(cascadeSource, "assets/ref_audio"),
	resolve(labsServiceSource, "tts_server.py"),
	resolve(labsServiceSource, "render_admission.py"),
	resolve(labsServiceSource, "voxcpm2_trt.py"),
	resolve(labsServiceSource, "voxcpm2_int8.py"),
	resolve(labsServiceSource, "build_voxcpm2_trt.py"),
	resolve(shell, "src-tauri/windows/voxcpm2-runtime.py"),
]) {
	if (!existsSync(required))
		throw new Error(`required legacy Cascade asset missing: ${required}`);
}

rmSync(destinationRoot, { recursive: true, force: true });
mkdirSync(resolve(destinationRoot, "scripts"), { recursive: true });
cpSync(loaderSource, loaderDestination, {
	recursive: true,
	filter: (source) => !source.includes("__pycache__"),
});
cpSync(preloadSource, preloadDestination);

// Preserve the generic Cascade supervisor payload as its own compatibility
// resource. It is never consumed by the direct Windows VoxCPM2 commands.
rmSync(runtimeDestination, { recursive: true, force: true });
const cascadeDestination = resolve(runtimeRepos, "naia-omni-cascade");
mkdirSync(resolve(cascadeDestination, "assets"), { recursive: true });
const sourceFilter = (source) =>
	!source.includes("__pycache__") && !source.includes(".pytest_cache");
cpSync(
	resolve(cascadeSource, "services"),
	resolve(cascadeDestination, "services"),
	{
		recursive: true,
		filter: sourceFilter,
	},
);
cpSync(
	resolve(cascadeSource, "output_cascade"),
	resolve(cascadeDestination, "output_cascade"),
	{ recursive: true, filter: sourceFilter },
);
cpSync(
	resolve(cascadeSource, "assets/ref_audio"),
	resolve(cascadeDestination, "assets/ref_audio"),
	{ recursive: true },
);
cpSync(
	resolve(cascadeSource, "assets/ref_audio"),
	resolve(runtimeDestination, "voices"),
	{ recursive: true },
);
const labsDestination = resolve(runtimeRepos, "naia-labs/avatar/service");
mkdirSync(labsDestination, { recursive: true });
for (const file of [
	"tts_server.py",
	"render_admission.py",
	"voxcpm2_trt.py",
	"voxcpm2_int8.py",
	"build_voxcpm2_trt.py",
]) {
	copyFileSync(
		resolve(labsServiceSource, file),
		resolve(labsDestination, file),
	);
}
copyFileSync(
	resolve(shell, "src-tauri/windows/voxcpm2-runtime.py"),
	resolve(runtimeDestination, "voxcpm2-runtime.py"),
);
copyFileSync(
	resolve(shell, "scripts/voxcpm2-runtime-manifest.json"),
	resolve(runtimeDestination, "manifest.json"),
);

for (const file of [
	"__init__.py",
	"__main__.py",
	"cli.py",
	"launcher.py",
	"service_plan.py",
	"capabilities.py",
	"vram_budget.py",
	"manifest.py",
	"paths.py",
]) {
	if (!existsSync(resolve(loaderDestination, file)))
		throw new Error(`staged Cascade loader is incomplete: ${file}`);
}

console.log(`[stage-cascade-loader] staged loader only: ${loaderDestination}`);
