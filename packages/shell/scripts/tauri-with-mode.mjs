#!/usr/bin/env node
/**
 * tauri-with-mode.mjs (new-naia) — Tauri의 운영/로컬 연결 모드 래퍼.
 *
 * 옛 old-naia-os/scripts/tauri-with-mode.mjs 의 새-구조 이식판.
 * 추가 책임(new-naia-os 는 항상 새 코어 + 분리 에이전트이므로):
 *   - VITE_NAIA_NEW_CORE=1        (셸 채팅을 이식 코어 경유)
 *   - NAIA_AGENT_STANDALONE=1     (Rust 가 임베디드 대신 외부 에이전트 스폰)
 *   - NAIA_AGENT_SCRIPT=../naia-agent/scripts/builds/agent-stdio-entry.mjs
 *   - GDK_BACKEND=x11 (Linux — WebKitGTK XReparentWindow embedding)
 * 그 위에 .env.{mode} 의 VITE_* 를 주입(URL 등은 .env 파일에만, 여기 하드코딩 없음).
 * 호출자(run-new-core-dev.sh 등)가 이미 설정한 값은 보존(?? 기본값).
 *
 * prod 모드는 dev-gateway 변수를 강제 제거 — stale 셸 env 가 prod 로그인 사용자를 dev 게이트웨이로
 * 라우팅(401)하지 못하게.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { platform } from "node:os";
import { dirname, resolve } from "node:path";
import { REQUIRED_AGENT_COMMIT, REQUIRED_PROTO_SHA256 } from "./agent-pairing.mjs";

const mode = process.argv[2] === "prod" ? "prod" : "dev";

const HERE = import.meta.dirname; // packages/shell/scripts
const SHELL = resolve(HERE, ".."); // packages/shell
const OS_ROOT = resolve(SHELL, "..", ".."); // new-naia-os
const STATIC_AGENT_CANDIDATES = [
	resolve(OS_ROOT, "..", "naia-agent"),
	resolve(OS_ROOT, "..", "..", "naia-agent"),
	resolve(OS_ROOT, "..", "..", "..", ".agents", "work", "naia-agent-issue-388-proto"),
	resolve(OS_ROOT, "..", "..", ".agents", "work", "naia-agent-issue-388-proto"),
];
const AGENT_WORKTREE_ROOTS = [
	resolve(OS_ROOT, "..", "naia-agent-worktrees"),
	resolve(OS_ROOT, "..", "..", "naia-agent-worktrees"),
];

function gitOutput(dir, args) {
	const r = spawnSync(
		"git",
		["-C", dir, ...args],
		{ encoding: "utf8", shell: false },
	);
	if (r.status !== 0) return null;
	return r.stdout.trim();
}

function hasRequiredAgentCommit(dir) {
	return gitOutput(dir, ["rev-parse", "HEAD"]) === REQUIRED_AGENT_COMMIT;
}

function isCleanProto(dir) {
	return gitOutput(dir, ["status", "--porcelain", "--", "src/main/adapters/grpc/naia_agent.proto"]) === "";
}

function isCleanAgentEntrypoint(dir) {
	return gitOutput(dir, ["status", "--porcelain", "--", "scripts/builds/agent-stdio-entry.mjs"]) === "";
}

function isCleanCheckout(dir) {
	return gitOutput(dir, ["status", "--porcelain"]) === "";
}

function sha256File(path) {
	return createHash("sha256")
		.update(readFileSync(path, "utf8").replace(/\r\n/g, "\n"))
		.digest("hex");
}

function isPairedAgentCheckout(dir) {
	return (
		existsSync(resolve(dir, "scripts/builds/agent-stdio-entry.mjs")) &&
		existsSync(resolve(dir, "src/main/adapters/grpc/naia_agent.proto")) &&
		hasRequiredAgentCommit(dir) &&
		isCleanProto(dir) &&
		isCleanAgentEntrypoint(dir) &&
		isCleanCheckout(dir) &&
		sha256File(resolve(dir, "src/main/adapters/grpc/naia_agent.proto")) ===
			REQUIRED_PROTO_SHA256
	);
}

function agentCandidates() {
	const candidates = [...STATIC_AGENT_CANDIDATES];
	for (const root of AGENT_WORKTREE_ROOTS) {
		if (!existsSync(root)) continue;
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			if (entry.isDirectory()) candidates.push(resolve(root, entry.name));
		}
	}
	return [...new Set(candidates)];
}

function firstPairedAgentCheckout() {
	for (const dir of agentCandidates()) {
		if (isPairedAgentCheckout(dir)) return dir;
	}
	return null;
}

const WINDOWS_MANAGER = resolve(OS_ROOT, "..", "naia-omni-windows-manager");

const env = { ...process.env };

// ── 새 코어 + 분리 에이전트 (new-naia-os 불변) ──
env.VITE_NAIA_NEW_CORE = env.VITE_NAIA_NEW_CORE ?? "1";
env.NAIA_AGENT_STANDALONE = env.NAIA_AGENT_STANDALONE ?? "1";
// Tauri의 내부 Vite 화면은 loopback IPv4에만 바인딩한다. `localhost`가 IPv6 ::1로
// 해석되는 환경에서 listen EPERM/연결 불일치가 나지 않게 하되, 호출자 명시값은 보존한다.
env.TAURI_DEV_HOST = env.TAURI_DEV_HOST ?? "127.0.0.1";

function gitDirForPath(path) {
	let dir = resolve(path);
	if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
	const root = gitOutput(dir, ["rev-parse", "--show-toplevel"]);
	if (!root) throw new Error(`Path is not inside a git checkout: ${path}`);
	return root.replaceAll("\\", "/");
}

function validateAgentEnvPair(agentScript, protoDir) {
	if (!existsSync(agentScript)) throw new Error(`NAIA_AGENT_SCRIPT not found: ${agentScript}`);
	if (!existsSync(resolve(protoDir, "naia_agent.proto"))) {
		throw new Error(`NAIA_AGENT_PROTO_DIR missing naia_agent.proto: ${protoDir}`);
	}
	const scriptRoot = gitDirForPath(agentScript);
	const protoRoot = gitDirForPath(protoDir);
	if (scriptRoot !== protoRoot) {
		throw new Error(`NAIA_AGENT_SCRIPT and NAIA_AGENT_PROTO_DIR must come from the same checkout: ${scriptRoot} !== ${protoRoot}`);
	}
	if (resolve(agentScript).replaceAll("\\", "/") !== resolve(scriptRoot, "scripts/builds/agent-stdio-entry.mjs").replaceAll("\\", "/")) {
		throw new Error(`NAIA_AGENT_SCRIPT must be scripts/builds/agent-stdio-entry.mjs from the paired checkout: ${agentScript}`);
	}
	if (resolve(protoDir).replaceAll("\\", "/") !== resolve(scriptRoot, "src/main/adapters/grpc").replaceAll("\\", "/")) {
		throw new Error(`NAIA_AGENT_PROTO_DIR must be src/main/adapters/grpc from the paired checkout: ${protoDir}`);
	}
	if (gitOutput(scriptRoot, ["rev-parse", "HEAD"]) !== REQUIRED_AGENT_COMMIT) {
		throw new Error(`Paired naia-agent checkout must be exactly ${REQUIRED_AGENT_COMMIT}: ${scriptRoot}`);
	}
	if (!isCleanProto(scriptRoot)) {
		throw new Error(`Paired naia-agent proto must be clean: ${scriptRoot}`);
	}
	if (!isCleanAgentEntrypoint(scriptRoot)) {
		throw new Error(`Paired naia-agent entrypoint must be clean: ${scriptRoot}`);
	}
	if (!isCleanCheckout(scriptRoot)) {
		throw new Error(`Paired naia-agent checkout must be clean: ${scriptRoot}`);
	}
	if (sha256File(resolve(protoDir, "naia_agent.proto")) !== REQUIRED_PROTO_SHA256) {
		throw new Error(`Paired naia-agent proto SHA256 must be ${REQUIRED_PROTO_SHA256}: ${protoDir}`);
	}
}

function applyPairedAgentEnv(targetEnv) {
	const explicitScript = targetEnv.NAIA_AGENT_SCRIPT;
	const explicitProtoDir = targetEnv.NAIA_AGENT_PROTO_DIR;
	if (explicitScript || explicitProtoDir) {
		if (!explicitScript || !explicitProtoDir) {
			throw new Error("NAIA_AGENT_SCRIPT and NAIA_AGENT_PROTO_DIR must be provided together");
		}
		validateAgentEnvPair(explicitScript, explicitProtoDir);
		return gitDirForPath(explicitScript);
	}

	const pairedAgent = firstPairedAgentCheckout();
	if (!pairedAgent) {
		throw new Error(
			`No paired naia-agent checkout contains ${REQUIRED_AGENT_COMMIT} with both agent-stdio-entry.mjs and naia_agent.proto`,
		);
	}
	targetEnv.NAIA_AGENT_SCRIPT = resolve(
		pairedAgent,
		"scripts/builds/agent-stdio-entry.mjs",
	);
	targetEnv.NAIA_AGENT_PROTO_DIR = resolve(
		pairedAgent,
		"src/main/adapters/grpc",
	);
	validateAgentEnvPair(
		targetEnv.NAIA_AGENT_SCRIPT,
		targetEnv.NAIA_AGENT_PROTO_DIR,
	);
	return pairedAgent;
}

// ── 로컬 cascade loader (dev): 소스 sibling repo(loader/ 포함 dir) 를 가리킨다.
// 패키지 빌드는 stage-cascade-loader.mjs 가 src-tauri/cascade-loader 로 동봉(resource_dir 해석).
env.NAIA_CASCADE_LOADER_DIR = env.NAIA_CASCADE_LOADER_DIR ?? WINDOWS_MANAGER;
// Linux GTK 백엔드: 옛 naia-os 는 x11 무조건 강제(WebKitGTK XReparentWindow embedding).
// 그러나 XWayland 없는 순수 Wayland 세션(KDE Plasma 등, DISPLAY 비어있음)에선 x11 백엔드가
// 붙을 X 가 없어 GTK init 패닉(2026-06-13 실측: 루크 KDE Wayland tauri:dev 기동 불가).
// → X 가 실제로 있을 때만 x11, 아니면 wayland. 호출자 명시값(GDK_BACKEND)은 보존.
if (platform() === "linux") {
	const hasX = !!(env.DISPLAY && env.DISPLAY.trim());
	env.GDK_BACKEND = env.GDK_BACKEND ?? (hasX ? "x11" : "wayland");
	// Wayland 백엔드: WebKitGTK DMABUF 렌더 버그(빈 화면) 회피로 소프트웨어 렌더 강제.
	// (2026-06-13: 이걸 떼고 하드웨어 GL 로 시도했더니 루크 환경에서 *오히려 더 느렸음* → 기동 지연의 원인은
	// GL 모드가 아니었다. 따라서 DMABUF off 유지가 그나마 나음. 기동 ~90초 지연(webview JS 스레드 블록 — set_root/
	// start_watch invoke 응답 지연, Rust 핸들러는 ms=0)은 *별개 미해결 이슈*: 후보 = browser child webview 생성/
	// WebKit GStreamer 미디어 init(GstIntRange 경고)/세션 누적 stray 프로세스. docs/progress 참조.)
	env.WEBKIT_DISABLE_DMABUF_RENDERER = env.WEBKIT_DISABLE_DMABUF_RENDERER ?? "1";
}

// ── prod: 호출 셸의 stale 로컬 URL 강제 제거 ──
// 운영 모드의 명시적 URL override 는 아래에서 읽는 .env.prod 로만 허용한다. 이렇게 해야
// 개발 셸에 남은 localhost web/gateway 변수가 운영 로그인·크레딧 요청을 로컬로 돌리지 않는다.
if (mode === "prod") {
	Reflect.deleteProperty(env, "VITE_NAIA_USE_DEV_GATEWAY");
	Reflect.deleteProperty(env, "VITE_NAIA_DEV_GATEWAY_URL");
	Reflect.deleteProperty(env, "VITE_NAIA_GATEWAY_URL");
	Reflect.deleteProperty(env, "VITE_NAIA_WEB_BASE_URL");
}

/** 최소 KEY=VALUE env 파일 파서(주석·빈줄 skip, 따옴표 제거). */
function loadEnvFile(path) {
	const vars = {};
	for (const raw of readFileSync(path, "utf8").split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let val = line.slice(eq + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		if (key) vars[key] = val;
	}
	return vars;
}

const envPath = resolve(SHELL, `.env.${mode}`);
if (existsSync(envPath)) {
	let n = 0;
	for (const [k, v] of Object.entries(loadEnvFile(envPath))) {
		if (
			(k === "NAIA_AGENT_SCRIPT" || k === "NAIA_AGENT_PROTO_DIR") &&
			env[k]
		) {
			continue;
		}
		env[k] = v;
		n++;
	}
	process.stdout.write(`[tauri-with-mode] ${mode.toUpperCase()} — .env.${mode} 에서 ${n}개 주입\n`);
} else {
	process.stdout.write(`[tauri-with-mode] ${mode.toUpperCase()} — .env.${mode} 없음; config 기본값 사용\n`);
}

const pairedAgent = applyPairedAgentEnv(env);
// The Tauri process runs the compiled agent entrypoint. Always build the exact
// paired source before development so a clean checkout cannot start with a
// missing or stale dist/ tree.
// Disable pnpm's project-local CLI auto-download for this cross-repository
// build. A partial package-manager cache can otherwise resolve the paired
// agent's declared pnpm version to a stale CLI even when the caller already
// runs a compatible pnpm 10 installation.
const agentBuildEnv = {
	...env,
	npm_config_manage_package_manager_versions: "false",
	npm_config_package_manager_strict_version: "false",
};
const agentBuild = spawnSync("pnpm", ["run", "build"], {
	cwd: pairedAgent,
	env: agentBuildEnv,
	stdio: "inherit",
	shell: process.platform === "win32",
});
if (agentBuild.status !== 0 || !existsSync(resolve(pairedAgent, "dist/main/composition/index.js"))) {
	throw new Error(`Paired naia-agent build failed or did not produce dist/main/composition/index.js: ${pairedAgent}`);
}
process.stdout.write(`[tauri-with-mode] new core=${env.VITE_NAIA_NEW_CORE}, agent=${env.NAIA_AGENT_SCRIPT}, proto=${env.NAIA_AGENT_PROTO_DIR}\n`);

const r = spawnSync("pnpm", ["run", "tauri", "dev"], { env, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
