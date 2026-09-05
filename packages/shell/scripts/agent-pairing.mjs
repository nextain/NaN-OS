import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const shellDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(shellDir, "agent-pairing.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (!/^[0-9a-f]{40}$/.test(manifest.agentCommit)) {
	throw new Error(`Invalid paired Agent commit in ${manifestPath}`);
}
if (!/^[0-9a-f]{64}$/.test(manifest.protoSha256)) {
	throw new Error(`Invalid paired Agent proto SHA256 in ${manifestPath}`);
}
if (!/^[0-9a-f]{40}$/.test(manifest.memoryCommit)) {
	throw new Error(`Invalid paired Memory commit in ${manifestPath}`);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.memoryVersion)) {
	throw new Error(`Invalid paired Memory version in ${manifestPath}`);
}

export const REQUIRED_AGENT_COMMIT = manifest.agentCommit;
export const REQUIRED_PROTO_SHA256 = manifest.protoSha256;
export const REQUIRED_MEMORY_COMMIT = manifest.memoryCommit;
export const REQUIRED_MEMORY_VERSION = manifest.memoryVersion;

/** Parse the paths emitted by `git worktree list --porcelain`. */
export function parseGitWorktreePaths(porcelain) {
	if (!porcelain) return [];
	return porcelain
		.split(/\r?\n/)
		.filter((line) => line.startsWith("worktree "))
		.map((line) => line.slice("worktree ".length).trim())
		.filter(Boolean);
}

function gitOutput(directory, args) {
	const result = spawnSync("git", ["-C", directory, ...args], {
		encoding: "utf8",
		shell: false,
	});
	return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * 핀된 커밋을 담은 깨끗한 naia-agent 체크아웃을 찾는다 (#539).
 *
 * 빌드와 실행이 각자 계산하던 것을 한곳으로 모은다. 예전에는 두 규칙이 달라
 * 빌드가 어느 워크트리를 골라 바이너리에 박아 두면 실행은 다른 것을 넘겨,
 * 앱이 자기 짝이 아니라며 거절했다. 같은 답을 써야 그 어긋남이 생기지 않는다.
 *
 * 찾는 곳: `NAIA_E2E_AGENT_ROOT` → 워크트리 모음 디렉터리 → 주 저장소의 git
 * 워크트리 목록. 모음 디렉터리는 저장소 배치마다 다르므로 여러 후보를 본다.
 */
export function resolvePairedAgent(options = {}) {
	const explicit = options.explicit ?? process.env.NAIA_E2E_AGENT_ROOT;
	const worktreeRoots = options.worktreeRoots ?? [
		process.env.NAIA_AGENT_WORKTREES_DIR,
		resolve(shellDir, "..", "..", "naia-agent-worktrees"),
		resolve(shellDir, "..", "..", "..", "..", "naia-agent-worktrees"),
	].filter(Boolean);
	const primaryRoots = options.primaryRoots ?? [
		resolve(shellDir, "..", "..", "..", "naia-agent"),
		resolve(shellDir, "..", "..", "..", "..", "naia-agent"),
	];

	const candidates = [];
	if (explicit) {
		candidates.push(resolve(explicit));
	} else {
		for (const root of worktreeRoots) {
			if (!existsSync(root)) continue;
			for (const entry of readdirSync(root, { withFileTypes: true })) {
				if (entry.isDirectory()) candidates.push(resolve(root, entry.name));
			}
		}
		for (const primary of primaryRoots) {
			if (!existsSync(primary)) continue;
			candidates.push(
				...parseGitWorktreePaths(
					gitOutput(primary, ["worktree", "list", "--porcelain"]),
				),
			);
		}
	}

	// 후보가 여럿이면 어느 것을 골라도 계약상 같지만, **같은 것을 골라야**
	// 한다. 빌드가 고른 것이 바이너리에 박히고 실행이 그것과 대조하기 때문이다.
	// 경로 순으로 정렬해 두 쪽이 같은 답을 얻게 한다.
	for (const pairedAgent of [...new Set(candidates)].sort()) {
		const agentScript = resolve(
			pairedAgent,
			"scripts/builds/agent-stdio-entry.mjs",
		);
		const agentProtoDir = resolve(pairedAgent, "src/main/adapters/grpc");
		const proto = resolve(agentProtoDir, "naia_agent.proto");
		if (!existsSync(agentScript) || !existsSync(proto)) continue;
		if (gitOutput(pairedAgent, ["rev-parse", "HEAD"]) !== REQUIRED_AGENT_COMMIT)
			continue;
		// 크래시 복구 lease 는 순수 런타임 산출물이라 더러움으로 세지 않는다.
		const porcelain = gitOutput(pairedAgent, ["status", "--porcelain"]);
		const dirty =
			porcelain == null ||
			porcelain
				.split("\n")
				.filter((line) => line.trim() !== "")
				.some(
					(line) =>
						!/\.agents[\\/]session-contracts[\\/]\.recovery[\\/]/.test(line),
				);
		if (dirty) continue;
		const protoHash = createHash("sha256")
			.update(readFileSync(proto, "utf8").replace(/\r\n/g, "\n"))
			.digest("hex");
		if (protoHash !== REQUIRED_PROTO_SHA256) continue;
		return { pairedAgent, agentScript, agentProtoDir };
	}
	throw new Error(
		`No clean paired naia-agent checkout contains ${REQUIRED_AGENT_COMMIT}` +
			(explicit ? ` under ${explicit}` : ` under ${worktreeRoots.join(", ")}`),
	);
}

/**
 * e2e 전용 빌드 산출 자리.
 *
 * 왜 여기에 두는가: 이 계산이 빌드 스크립트 안에만 있어서, 회귀 러너의 전제
 * 검사는 리눅스 자리(`target-e2e`)를 하드코딩하고 있었다. 그래서 Windows 는
 * 빌드에 성공하고도 러너가 "바이너리 없음" 으로 실행을 거부했다 — 그 기계가
 * 회귀 기록을 한 번도 남기지 못한 진짜 원인이다. 자리를 계산하는 곳이 둘이면
 * 반드시 갈라진다.
 *
 * MSVC 의 FileTracker 와 CMake 스크래치는 보통 워크트리 깊이에서도 실패한다.
 * 그래서 Windows 에서만 짧은 자리를 쓰고, 부르는 쪽은 환경 변수로 바꿀 수 있다.
 */
export function e2eTargetDir(shellDir) {
	if (process.env.NAIA_E2E_TARGET_DIR) return resolve(process.env.NAIA_E2E_TARGET_DIR);
	return process.platform === "win32"
		? resolve(`C:/tmp/naia-shell-e2e-${REQUIRED_AGENT_COMMIT.slice(0, 7)}`)
		: resolve(shellDir, "src-tauri", "target-e2e");
}

/** 그 자리의 실행 파일. 확장자는 플랫폼이 정한다. */
export function e2eBinaryPath(shellDir) {
	return resolve(
		e2eTargetDir(shellDir),
		"debug",
		process.platform === "win32" ? "naia-shell.exe" : "naia-shell",
	);
}
