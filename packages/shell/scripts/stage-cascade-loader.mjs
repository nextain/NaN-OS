#!/usr/bin/env node
/**
 * stage-cascade-loader — naia-omni-windows-manager 의 loader(Python 패키지)를
 * 데스크톱 배포 번들용으로 `src-tauri/cascade-loader/` 에 스테이징(임베딩).
 *
 * 왜: naia-os 가 로컬 cascade 를 띄울 때 `python -m loader launch` 를 쓰는데, 패키지 앱엔
 *     windows-manager 소스가 없다. agent(stage-agent.mjs) 와 동형으로 loader 를 앱에 동봉해
 *     **외부 adk 체크아웃 의존 없이** 자기완결적으로 구동(사용자 요구: "windows-manager 임베딩").
 *
 * loader 는 순수 stdlib(.py 파일뿐 — subprocess/socket/json/argparse). deps 설치 불필요 →
 * agent 처럼 pnpm deploy 가 아니라 단순 복사로 충분. 실제 cascade 서비스(VoxCPM2 등)는 별도
 * venv/모델(loader 가 paths 로 가리킴)이라 본 번들 범위 밖(R2.3 ops).
 *
 * 런타임 해석(lib.rs resolve_cascade_loader_dir): resource_dir/cascade-loader(번들) 가 `loader/`
 * 를 담으면 `python -m loader` 가능. dev 는 NAIA_CASCADE_LOADER_DIR(소스) 우선.
 *
 * cwd = packages/shell (tauri beforeBuildCommand / package.json 스크립트 기준).
 */
import { createHash } from "node:crypto";
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { resolve } from "node:path";

const SHELL = process.cwd(); // packages/shell
const WM = resolve(SHELL, "../../../naia-omni-windows-manager"); // 형제 repo(stage-agent 와 동일 레벨)
const SRC = resolve(WM, "loader");
const AVATAR_PRELOAD_SRC = resolve(WM, "scripts/avatar_preload.py");
const DEST_DIR = resolve(SHELL, "src-tauri/cascade-loader");
const DEST = resolve(DEST_DIR, "loader");
const AVATAR_PRELOAD_DEST = resolve(DEST_DIR, "scripts/avatar_preload.py");
const CASCADE = resolve(SHELL, "../../../naia-omni-cascade");
const LABS_SERVICE = resolve(SHELL, "../../../naia-labs/avatar/service");
const RUNTIME_DEST = resolve(SHELL, "src-tauri/cascade-runtime");
const RUNTIME_REPOS = resolve(RUNTIME_DEST, "repos/projects");
const RUNTIME_MANIFEST = resolve(
	SHELL,
	"scripts/cascade-runtime-manifest.json",
);
const RUNTIME_INSTALLER = resolve(
	SHELL,
	"src-tauri/windows/install-voxcpm2.ps1",
);

if (!existsSync(SRC) || !existsSync(AVATAR_PRELOAD_SRC)) {
	console.error(
		`[stage-cascade-loader] ❌ cascade runtime source 없음: ${!existsSync(SRC) ? SRC : AVATAR_PRELOAD_SRC}\n  → naia-os 와 naia-omni-windows-manager 를 같은 부모 폴더 아래 형제로 clone 했는지 확인하세요.`,
	);
	process.exit(1);
}

console.log(`[stage-cascade-loader] loader = ${SRC}`);
if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST_DIR, { recursive: true });
// __pycache__ 제외 복사(런타임 불요·OS 의존).
cpSync(SRC, DEST, {
	recursive: true,
	filter: (s) => !s.includes("__pycache__"),
});
mkdirSync(resolve(DEST_DIR, "scripts"), { recursive: true });
cpSync(AVATAR_PRELOAD_SRC, AVATAR_PRELOAD_DEST);

// 스테이징 검증 — `python -m loader` 진입(__main__) + __init__ 이 re-export 하는 전이
// 모듈이 하나라도 빠지면 런타임 ImportError 가 나므로 빌드를 빨갛게 만든다.
for (const required of [
	resolve(CASCADE, "services"),
	resolve(CASCADE, "output_cascade"),
	resolve(CASCADE, "assets/ref_audio"),
	resolve(LABS_SERVICE, "tts_server.py"),
	resolve(LABS_SERVICE, "render_admission.py"),
	resolve(LABS_SERVICE, "voxcpm2_trt.py"),
	resolve(LABS_SERVICE, "build_voxcpm2_trt.py"),
	RUNTIME_MANIFEST,
	RUNTIME_INSTALLER,
]) {
	if (!existsSync(required))
		throw new Error(`required VoxCPM2 runtime asset missing: ${required}`);
}
rmSync(RUNTIME_DEST, { recursive: true, force: true });
const cascadeDest = resolve(RUNTIME_REPOS, "naia-omni-cascade");
mkdirSync(resolve(cascadeDest, "assets"), { recursive: true });
const runtimeSourceFilter = (source) =>
	!source.includes("__pycache__") && !source.includes(".pytest_cache");
cpSync(resolve(CASCADE, "services"), resolve(cascadeDest, "services"), {
	recursive: true,
	filter: runtimeSourceFilter,
});
cpSync(
	resolve(CASCADE, "output_cascade"),
	resolve(cascadeDest, "output_cascade"),
	{ recursive: true, filter: runtimeSourceFilter },
);
cpSync(
	resolve(CASCADE, "assets/ref_audio"),
	resolve(cascadeDest, "assets/ref_audio"),
	{ recursive: true },
);
const labsDest = resolve(RUNTIME_REPOS, "naia-labs/avatar/service");
mkdirSync(labsDest, { recursive: true });
for (const file of [
	"tts_server.py",
	"render_admission.py",
	"voxcpm2_int8.py",
	"voxcpm2_trt.py",
	"build_voxcpm2_trt.py",
])
	copyFileSync(resolve(LABS_SERVICE, file), resolve(labsDest, file));
copyFileSync(RUNTIME_MANIFEST, resolve(RUNTIME_DEST, "manifest.json"));
copyFileSync(RUNTIME_INSTALLER, resolve(RUNTIME_DEST, "install-voxcpm2.ps1"));
if (process.platform === "win32") {
	const manifest = JSON.parse(readFileSync(RUNTIME_MANIFEST, "utf8"));
	const uv = (process.env.PATH ?? "")
		.split(";")
		.map((entry) => resolve(entry, "uv.exe"))
		.find((candidate) => existsSync(candidate));
	if (!uv || !existsSync(uv))
		throw new Error("pinned uv.exe is required for Windows provisioning");
	const actual = createHash("sha256").update(readFileSync(uv)).digest("hex");
	if (actual !== manifest.uv.windowsX64Sha256)
		throw new Error(`uv.exe SHA256 mismatch: ${actual}`);
	copyFileSync(uv, resolve(RUNTIME_DEST, "uv.exe"));
}

for (const p of [
	"__init__.py",
	"__main__.py", // python -m loader 의 실제 진입점
	"__init__.py",
	"cli.py",
	"launcher.py",
	"service_plan.py",
	"capabilities.py",
	"vram_budget.py",
	"manifest.py",
	"paths.py",
]) {
	if (!existsSync(resolve(DEST, p))) {
		console.error(`[stage-cascade-loader] ❌ 스테이징 검증 실패 — 누락: ${p}`);
		process.exit(1);
	}
}
if (!existsSync(AVATAR_PRELOAD_DEST)) {
	console.error(
		"[stage-cascade-loader] ❌ 스테이징 검증 실패 — 누락: scripts/avatar_preload.py",
	);
	process.exit(1);
}
console.log(`[stage-cascade-loader] ✅ 스테이징 완료: ${DEST}`);
