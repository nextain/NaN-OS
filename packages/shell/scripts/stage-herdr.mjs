/**
 * Stage a pinned Herdr standalone release into `src-tauri/resources/herdr/` so
 * the Windows installer bundles it and a fresh install needs no separately
 * installed Herdr (the embedded Workspace resolves it via resource_dir first,
 * PATH fallback — see herdr/config.rs `init_herdr_bin`).
 *
 * The Windows release is a directory (`herdr.exe` + `conpty/` ConPTY runtime +
 * THIRD-PARTY-NOTICES), so the whole directory is copied — herdr.exe finds its
 * sibling `conpty/` next to it under the resource dir.
 *
 * Source = Herdr's own package-manager standalone release layout
 * (`~/.herdr/packages/standalone/releases/<version>-<triple>/`), or the
 * `HERDR_RELEASE_DIR` override. Output is gitignored (like the Node runtime);
 * the version is pinned here to control update drift (nextain#445). Windows
 * only for now — Linux packages layer Herdr at the naia-os level.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELL = resolve(HERE, "..");
const RESOURCES = resolve(SHELL, "src-tauri", "resources");
const DEST = resolve(RESOURCES, "herdr");

/** Pinned Herdr version bundled with the app. Bump deliberately (nextain#445). */
export const HERDR_VERSION = "0.8.0-preview.2026-08-04-d78e3d3b5126";
const TARGET_TRIPLE = "x86_64-pc-windows-msvc";

/** Absolute path to the pinned Herdr release directory to bundle. */
export function herdrReleaseDir() {
	if (process.env.HERDR_RELEASE_DIR) {
		return resolve(process.env.HERDR_RELEASE_DIR);
	}
	return resolve(
		homedir(),
		".herdr",
		"packages",
		"standalone",
		"releases",
		`${HERDR_VERSION}-${TARGET_TRIPLE}`,
	);
}

/** True when the pinned release (with herdr.exe) is available to stage. */
export function herdrReleasePresent() {
	return existsSync(resolve(herdrReleaseDir(), "herdr.exe"));
}

function main() {
	const src = herdrReleaseDir();
	if (!existsSync(resolve(src, "herdr.exe"))) {
		console.error(
			`[stage-herdr] pinned Herdr ${HERDR_VERSION} not found at ${src}\n` +
				"  Install that exact Herdr version on the build machine, or set " +
				"HERDR_RELEASE_DIR to a directory containing herdr.exe + conpty/.",
		);
		process.exit(1);
	}
	mkdirSync(RESOURCES, { recursive: true });
	rmSync(DEST, { recursive: true, force: true });
	cpSync(src, DEST, { recursive: true });
	if (!existsSync(resolve(DEST, "herdr.exe"))) {
		console.error(
			`[stage-herdr] copy failed — ${resolve(DEST, "herdr.exe")} missing`,
		);
		process.exit(1);
	}
	console.log(`[stage-herdr] bundled Herdr ${HERDR_VERSION} → ${DEST}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
