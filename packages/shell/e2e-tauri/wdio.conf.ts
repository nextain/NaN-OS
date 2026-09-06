import type { ChildProcess } from "node:child_process";
import { execSync, spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { connect, createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { execPath } from "node:process";
import { resolvePairedAgent } from "../scripts/agent-pairing.mjs";
import { reclaimLeakedAgentChild as reclaimAgentChild } from "./agent-child-lease.js";
import { reclaimSidecarForRuntimeDir } from "./bgm-sidecar-lease.mjs";
import { applyHarnessXdg } from "./e2e-xdg.mjs";
import { harnessHerdrSessionName } from "./herdr-session.mjs";
import { startNotifyWebhookStub } from "./notify-webhook-stub.mjs";
import {
	CREDENTIALED_KEY_ENV,
	CREDENTIALED_MAIN_MODEL,
	CREDENTIALED_MAIN_PROVIDER,
	credentialedSeedAvailable,
	credentialedSeedOptionsFromEnv,
	seedCredentialedAdk,
} from "./credentialed-adk-seed.js";

// Enable debug logging for Tauri app — Rust logs all agent events to stderr + naia.log
process.env.CAFE_DEBUG_E2E = "1";
process.env.NAIA_E2E_MODE = "1";
// E2E mock: bypass GitHub clone + agent-kill-before-delete so ADK setup
// scenarios run in milliseconds without network/process flakiness (#328).
process.env.NAIA_E2E_MOCK_CLONE = "1";
// Load shell/.env.e2e first (e2e-only knobs like VITE_NAIA_DEV_GATEWAY_URL),
// then shell/.env (shared defaults). first-match-wins per key so .env.e2e
// values take precedence. Keeping the dev-gateway URL out of .env is what
// prevents `pnpm run tauri:dev` from breaking a prod OAuth login (#333).
function loadEnvFile(filePath: string): void {
	try {
		const content = readFileSync(filePath, "utf-8");
		for (const line of content.split("\n")) {
			const match = line.match(/^([^#=]+)=(.*)$/);
			if (match) {
				const key = match[1].trim();
				const rawVal = match[2].trim();
				const val = rawVal.replace(/^['"]|['"]$/g, "");
				if (!process.env[key]) process.env[key] = val;
			}
		}
	} catch {
		/* file not found — keep going */
	}
}
loadEnvFile(resolve(import.meta.dirname, "../.env.e2e"));
loadEnvFile(resolve(import.meta.dirname, "../.env"));

// ── Platform constants ────────────────────────────────────────────────────────
// Linux uses WebKit2GTK + WebKitWebDriver; Windows uses WebView2 + msedgedriver.
// Keep Linux behavior identical to the original config and branch for win32.
const IS_WINDOWS = process.platform === "win32";
const EXE = IS_WINDOWS ? ".exe" : "";

// #539(Windows): TIME_WAIT 페어가 최대 4분간 같은 포트의 Rust rebind 를 막는다.
// 워커(runner 프로세스)마다 포트를 달리해 이전 실행·이전 세션과 절대 겹치지 않게 한다.
// 아래 실행 자리(runtime dir)도 이 포트로 이름을 나눠, 동시에 도는 묶음끼리
// 서로의 리스를 밟지 않게 한다 — 전용 설정 둘이 쓰는 규칙과 같다.
const IN_APP_PORT = IS_WINDOWS ? 4450 + (process.pid % 37) : 4448;

// ── e2e 실행 자리 격리 ────────────────────────────────────────────────────────
// Rust 는 CAFE_DEBUG_E2E=1 일 때 로그(lib.rs log_dir)와 실행 중 리스·PID(lib.rs
// run_dir/agent_child_lease_path)를 `NAIA_E2E_RUNTIME_DIR` 아래에 둔다. 전용 설정
// 둘(codex-e2e-environment.ts, radio-queue-e2e-environment.ts)은 이미 그 변수를
// 잡는데 **이 기본 설정만 빠져 있었다**. 그래서 이 설정으로 도는 스펙 백여 개가
// 운영 앱과 같은 `~/.naia/run`·`~/.naia/logs` 를 썼다.
//
// 그 대가가 둘이었다. 하나, 앞 스펙의 에이전트 자식이 리스를 쥔 채 살아남으면
// 다음 스펙의 셸이 `agent-core not available: agent_lease_live_blocked` 로 뇌 없이
// 돌았다(이 기계에 그렇게 고아가 된 에이전트가 30개 쌓여 있었다). 둘, "`~/.naia`
// 에는 `adk-path` 하나만" 이라는 규칙을 회귀가 돌 때마다 다시 어겼다.
//
// 자리는 **OS 임시 디렉터리 아래**다. 저장소 안에 두면 `git add` 에 딸려 들어가고
// (실제로 그 사고가 있었다), 홈 아래에 두면 규칙 위반이 그대로다.
const E2E_RUNTIME_PARENT = resolve(tmpdir());
const E2E_RUNTIME_NAME = `naia-shell-e2e-${IN_APP_PORT}`;
const E2E_RUNTIME_DIR = resolve(E2E_RUNTIME_PARENT, E2E_RUNTIME_NAME);
// 밖에서 이미 정해 넣었으면 그것이 정본이다 — 감싸는 러너가 자기 자리를 주는
// 경우를 덮어쓰면, 그 러너는 자기가 정리할 곳이 아닌 데를 보게 된다.
const OWNS_RUNTIME_DIR = !process.env.NAIA_E2E_RUNTIME_DIR?.trim();
if (OWNS_RUNTIME_DIR) process.env.NAIA_E2E_RUNTIME_DIR = E2E_RUNTIME_DIR;
// 자리는 여기서 만들지 않는다. import 만으로 디렉터리가 생기면 계약 테스트가
// 파일시스템을 더럽힌다. 실제로 만드는 것은 onPrepare 와 Rust 의 create_dir_all.

// 앱 프로필(WebKit 의 localStorage·IndexedDB, audit.db)도 그 자리 아래로 옮긴다.
// 안 옮기면 `~/.config/com.naia.shell.e2e/` 에 남아 스펙 사이·실행 사이에 상태가
// 살아남는다 — 자세한 이유는 `e2e-xdg.mjs` 머리말. 값은 여기서 세우고 자리는
// onPrepare 가 만든다.
const HARNESS_XDG = applyHarnessXdg();

// ── 자격증명 등급의 살아 있는 기본 공급자 (#547) ──────────────────────────────
// 에이전트는 셸이 실어 보내는 provider 를 gRPC 경계에서 버리고, 워크스페이스의
// `naia-settings/config.json` 으로 활성 공급자를 재구성한다. 그러니 e2e 가 자기
// 워크스페이스를 갖지 않으면 에이전트는 사람이 쓰던 실제 ADK 의 설정을 읽고,
// 갖더라도 아무것도 심지 않으면 죽은 값을 물고 `fetch failed` 로 끝난다.
//
// 게이트웨이 키가 환경에 있을 때에만(= 자격증명 등급일 때에만) 실행 자리 아래에
// 워크스페이스를 하나 만들고 거기에 살아 있는 공급자를 심는다. 키가 없으면 아무것도
// 하지 않는다 — 결정론 등급은 예전 그대로 돈다.
//
// 밖에서 이미 `NAIA_E2E_ADK_PATH` 를 준 경우(전용 설정, 감싸는 러너)에는 손대지
// 않는다. 그쪽이 자기 워크스페이스의 주인이다.
const SEEDED_ADK_PATH = resolve(
	process.env.NAIA_E2E_RUNTIME_DIR ?? E2E_RUNTIME_DIR,
	"adk",
);
const SEEDS_CREDENTIALED_ADK =
	!process.env.NAIA_E2E_ADK_PATH?.trim() && credentialedSeedAvailable();
if (SEEDS_CREDENTIALED_ADK) {
	process.env.NAIA_E2E_ADK_PATH = SEEDED_ADK_PATH;
	// ensureAppReady 의 폴백(`NAIA_E2E_ADK_FIXTURE`, 기본값은 형제 naia-adk)이
	// 격리와 어긋나면 화면만 다른 워크스페이스를 가리킨다.
	process.env.NAIA_E2E_ADK_FIXTURE ??= SEEDED_ADK_PATH;
	// 이 설정은 워커에서도 다시 읽히는데, 그때는 위 경로가 이미 환경에 있어
	// `SEEDS_CREDENTIALED_ADK` 가 거짓이 된다. 그러면 스펙 앞에서 키를 실어 주는
	// 대목이 통째로 건너뛰어지고, 실패는 401 이라는 엉뚱한 모습으로만 보인다
	// (실측). 심었다는 사실 자체를 환경에 남겨 워커가 같은 판단을 하게 한다.
	process.env.NAIA_E2E_CREDENTIALED_SEED = "1";
	// 조건부로만 합성되는 도구의 전제를 세운다 (#567 재조준). 어댑터는 배선돼
	// 있는데 이 값이 없으면 그 도구가 목록에 오르지 않아, 모델이 "그런 도구가
	// 없다" 고 답한다 — 배선 부재와 구별되지 않는 모습이다. 목록의 정본은
	// `harness-provided-env.mjs` 이고 러너의 선별도 같은 곳을 본다.
	//
	// `shell_exec` 는 격리 실행 자리 아래(`allowRoots = adkPath`)로만 나간다.
	process.env.NAIA_SHELL_TOOL = "1";
	process.env.NAIA_E2E_NOTIFY_LOG = resolve(
		process.env.NAIA_E2E_RUNTIME_DIR ?? E2E_RUNTIME_DIR,
		"notify-received.jsonl",
	);
}
/** 이 실행이 격리 ADK 에 살아 있는 공급자를 심었는가 — 런처와 워커가 같이 본다. */
const CREDENTIALED_SEED_ACTIVE = process.env.NAIA_E2E_CREDENTIALED_SEED === "1";

// 네이티브(Rust)는 e2e 에서 NAIA_E2E_ADK_PATH 를 워크스페이스 정본으로 삼는다
// (lib.rs current_adk_path/spawn_adk_path_snapshot). 그런데 화면(웹) 쪽은
// localStorage 의 `naia-adk-path` 를 쓰고, 그 값을 e2e 환경에 맞춰 다시 묶는 코드는
// App.tsx 에서 VITE_NAIA_E2E_MODE=1 일 때만 돈다. 그 두 변수를 여기서 같이 넘겨 주지
// 않으면, WebKit 프로필에 남아 있던 이전 실행(예: codex-live 격리 워크스페이스)의 경로가
// 그대로 살아남아 화면은 그 경로에 설정을 쓰고 에이전트는 다른 워크스페이스를 읽는다.
// 그러면 UI 에서 고른 provider 가 에이전트에 영영 닿지 않는다.
if (process.env.NAIA_E2E_ADK_PATH?.trim()) {
	process.env.VITE_NAIA_E2E_MODE = "1";
	process.env.VITE_NAIA_E2E_ADK_PATH = process.env.NAIA_E2E_ADK_PATH.trim();
	// App.tsx 는 온보딩 전이면 VITE_NAIA_E2E_PROVIDER/MODEL 로 화면 설정을 채우고,
	// 기본값이 `ollama/e2e` 다 — 이 기계에 없는 서버다. 심은 공급자와 같은 값을 준다.
	if (CREDENTIALED_SEED_ACTIVE) {
		process.env.VITE_NAIA_E2E_PROVIDER ??= CREDENTIALED_MAIN_PROVIDER;
		process.env.VITE_NAIA_E2E_MODEL ??= CREDENTIALED_MAIN_MODEL;
	}
}

/** 지울 수 있는 것은 이 설정이 이름까지 정한 자리뿐이다. */
function assertOwnedRuntimeDir(): string {
	const candidate = resolve(E2E_RUNTIME_DIR);
	if (
		!OWNS_RUNTIME_DIR ||
		dirname(candidate) !== E2E_RUNTIME_PARENT ||
		basename(candidate) !== E2E_RUNTIME_NAME
	) {
		throw new Error(`Refusing to clean a non-E2E path: ${candidate}`);
	}
	return candidate;
}

const SHELL_DIR = resolve(import.meta.dirname, "..");
// 짝 저장소를 찾는 규칙은 빌드와 하나여야 한다 (#539). 빌드가 어느 워크트리를
// 골라 바이너리에 박아 두면, 실행이 다른 것을 넘길 때 앱이 자기 짝이 아니라며
// 거절한다. 예전에는 두 규칙이 달라 그 어긋남이 실제로 났다.
const {
	pairedAgent: PAIRED_AGENT_DIR,
	agentScript: PAIRED_AGENT_SCRIPT,
	agentProtoDir: PAIRED_AGENT_PROTO_DIR,
} = resolvePairedAgent();
// The test launches the debug executable directly, bypassing tauri-with-mode.
// Inject the same verified pair used by `pnpm run tauri:dev`; without this the
// app opens but deliberately disables chat because no agent script is present.
process.env.NAIA_AGENT_SCRIPT = PAIRED_AGENT_SCRIPT;
process.env.NAIA_AGENT_PROTO_DIR = PAIRED_AGENT_PROTO_DIR;
// `build:e2e:tauri` 는 개발 타깃과 섞이지 않도록 target-e2e 에 짓는다 (#539).
// 여기서 개발 타깃을 띄우면 지금 고친 코드가 아니라 예전 빌드를 재게 된다 —
// 실제로 짝 저장소가 어긋난 것처럼 보이던 실패가 이것이었다.
const E2E_TARGET_DIR = resolve(
	process.env.NAIA_E2E_TARGET_DIR ?? resolve(SHELL_DIR, "src-tauri/target-e2e"),
);
const TAURI_BINARY = process.env.TAURI_BINARY
	? resolve(process.env.TAURI_BINARY)
	: resolve(E2E_TARGET_DIR, `debug/naia-shell${EXE}`);

// Vosk 의 공유 라이브러리는 빌드 산출물 안에 놓인다. 기본 타깃에서는 바이너리
// 옆으로 복사되지만 e2e 타깃에서는 그렇지 않아, 앱이 libvosk.so 를 못 찾고
// 세션 생성 단계에서 죽는다 (#539). 그 자리를 로더에게 알려 준다.
if (!IS_WINDOWS) {
	const buildDir = resolve(E2E_TARGET_DIR, "debug", "build");
	if (existsSync(buildDir)) {
		for (const entry of readdirSync(buildDir)) {
			const candidate = resolve(buildDir, entry, "out", "vosk-lib");
			if (!existsSync(resolve(candidate, "libvosk.so"))) continue;
			const existing = process.env.LD_LIBRARY_PATH ?? "";
			process.env.LD_LIBRARY_PATH = existing
				? `${candidate}:${existing}`
				: candidate;
			break;
		}
	}
}
const TAURI_DRIVER = resolve(homedir(), `.cargo/bin/tauri-driver${EXE}`);
const NATIVE_DRIVER = IS_WINDOWS
	? resolve(SHELL_DIR, "e2e-tauri/.drivers/msedgedriver.exe")
	: "/usr/bin/WebKitWebDriver";
// Run Vite via node directly — avoids `pnpm.cmd` (which Windows' CreateProcess
// refuses to spawn without a shell, producing `spawn EINVAL`) and also avoids
// the `shell:true + args[]` DEP0190 warning introduced in Node 22.
const VITE_ENTRY = resolve(SHELL_DIR, "node_modules/vite/bin/vite.js");
/**
 * dev 서버는 e2e 바이너리가 실제로 찾아가는 주소에 떠야 한다.
 * 그 주소의 정본은 `tauri.e2e.conf.json` 의 devUrl 이므로 거기서 읽는다 — 여기 상수로
 * 적어 두면 둘이 갈라진다(2026-08-26: conf 는 1420 에 띄우는데 바이너리는 1422 를 봤다).
 *
 * ⚠️ 호스트도 맞춰야 한다. Vite 는 기본으로 `[::1]`(IPv6) 에만 바인드하는데 devUrl 이
 *    `127.0.0.1`(IPv4) 이면 앱이 붙지 못하고 about:blank 에 머문다. 그러면 origin 이 null 이라
 *    Tauri IPC 가 모든 호출을 "Origin header is not a valid URL" 로 거절한다 —
 *    실패가 스펙이 아니라 하네스에서 나므로 원인을 찾기 어렵다.
 */
const E2E_DEV_URL = new URL(
	(
		JSON.parse(
			readFileSync(
				resolve(SHELL_DIR, "src-tauri", "tauri.e2e.conf.json"),
				"utf8",
			),
		) as { build?: { devUrl?: string } }
	).build?.devUrl ?? "http://127.0.0.1:1420",
);
const VITE_PORT = Number(E2E_DEV_URL.port || "1420");
const VITE_HOST = E2E_DEV_URL.hostname;

let tauriDriver: ChildProcess;
let notifyStub: Awaited<ReturnType<typeof startNotifyWebhookStub>> | undefined;

/** #539(Windows 인앱): 앱 트리를 강제 종료하고 4448 이 실제로 닫힐 때까지 기다린다.
 *  agent-core/node 자식이 소켓을 물고 늦게 죽어 10초 대기로는 모자라다. */
async function forceFreeInAppPort(): Promise<void> {
	try {
		execSync("taskkill /F /T /IM naia-shell.exe", { stdio: "ignore" });
	} catch {
		// 살아 있는 인스턴스가 없으면 taskkill 이 비영으로 끝난다 — 정상.
	}
	for (let attempt = 0; attempt < 30; attempt++) {
		const open = await new Promise<boolean>((done) => {
			const socket = connect({ host: "127.0.0.1", port: 4448 }, () => {
				socket.destroy();
				done(true);
			});
			socket.once("error", () => done(false));
			socket.setTimeout(500, () => {
				socket.destroy();
				done(false);
			});
		});
		if (!open) return;
		await new Promise((wait) => setTimeout(wait, 1_000));
	}
	throw new Error("in-app WebDriver port never freed");
}
let viteServer: ChildProcess;
let permissionPoller: { dispose: () => void } | undefined;

// ── Process cleanup helpers ───────────────────────────────────────────────────

/**
 * Kill processes by image name.
 * Linux: `pkill [-9] -x <name>` (matches the executable name exactly).
 * Windows: `taskkill /F /IM <name>.exe` (matches against image name only).
 *
 * Always swallows errors — "no such process" is the common case.
 */
/**
 * 앞선 실행이 흘린 agent 자식을 회수한다 (#541).
 *
 * 셸은 종료해도 자기가 띄운 agent 를 함께 데려가지 못할 때가 있다. 그 고아가
 * lease 를 쥔 채 남으면 다음 실행의 셸이 `agent_lease_live_blocked` 로 대화를
 * 아예 못 하고, 화면에는 스킬 등록 실패로만 보인다 — 원인과 증상이 멀다.
 *
 * lease 파일이 가리키는 것만 정리한다. 이름으로 훑어 죽이면 사람이 쓰고 있는
 * 앱의 agent 까지 잡는다.
 */
/** 실행 자리의 리스가 가리키는 agent 자식을 회수한다. 회수했으면 한 줄 남긴다. */
// 전용 설정(wdio.conf.chat.ts)이 이 이름을 import 하는데 export 가 아니어서 그쪽
// afterSession 이 매번 `is not a function` 으로 죽었다 — 처음 쓰일 때부터 그랬다.
// 계약(e2e-inherited-conf-contracts)이 이제 "가져가는 이름은 내보낸다" 를 잰다.
export function reclaimLeakedAgentChild(): boolean {
	// 격리한 실행 자리의 리스만 본다. 홈의 리스를 보면 사람이 지금 쓰고 있는
	// 앱의 에이전트를 잡는다 — 그 자리는 더 이상 e2e 의 것이 아니다.
	const outcome = reclaimAgentChild(
		process.env.NAIA_E2E_RUNTIME_DIR ?? E2E_RUNTIME_DIR,
	);
	if (outcome.reclaimed) {
		console.log(
			`[e2e] reclaimed leaked agent child (pid ${outcome.pid}, ${outcome.reason})`,
		);
	}
	return outcome.reclaimed;
}

/**
 * 이 실행 자리를 물고 있던 BGM 사이드카를 회수한다 (#577).
 *
 * 에이전트 자식과 같은 자리에서, 같은 순서로 돈다 — 자리를 지우기 **전에**.
 * 자리를 먼저 지우면 `bgm-server.pid` 가 함께 사라져 고아를 가리키던 단서가
 * 없어진다. 실측에서 그렇게 남은 사이드카가 여덟이었다.
 *
 * 자리와 표식과 환경이 모두 맞을 때에만 손댄다. 이름으로 훑지 않는다.
 */
function reclaimLeakedBgmSidecar(): boolean {
	const outcome = reclaimSidecarForRuntimeDir(
		process.env.NAIA_E2E_RUNTIME_DIR ?? E2E_RUNTIME_DIR,
	);
	if (outcome.reclaimed) {
		console.log(
			`[e2e] reclaimed leaked BGM sidecar (pid ${outcome.pid}, ${outcome.reason})`,
		);
	}
	return outcome.reclaimed;
}

function killByName(name: string, force = false): void {
	try {
		if (IS_WINDOWS) {
			const exe = name.endsWith(".exe") ? name : `${name}.exe`;
			execSync(`taskkill /F /IM ${exe}`, { stdio: "ignore" });
		} else {
			const flag = force ? "-9 " : "";
			// Never use `-f` here. Every WDIO worker command line contains the
			// repository path `.../naia-shell/...`, so broad matching kills the
			// Node worker itself before it can report a test result.
			execSync(`pkill ${flag}-x ${name} 2>/dev/null || true`, {
				stdio: "ignore",
			});
		}
	} catch {
		/* ignore — no matching processes */
	}
}

/**
 * Kill processes listening on a TCP port.
 * Linux: kill only the listening process. Matching every socket also matches
 * the WDIO worker's outbound connection and kills the test reporter itself.
 * Windows: parse `netstat -ano -p tcp` and `taskkill /F /PID`.
 */
function killByPort(port: number): void {
	try {
		if (IS_WINDOWS) {
			const out = execSync("netstat -ano -p tcp", {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			const pids = new Set<string>();
			for (const rawLine of out.split(/\r?\n/)) {
				const line = rawLine.trim();
				// e.g. "TCP    0.0.0.0:4444   0.0.0.0:0   LISTENING   12345"
				const match = line.match(/^TCP\s+\S+:(\d+)\s+\S+\s+\S+\s+(\d+)$/);
				if (match && Number(match[1]) === port) pids.add(match[2]);
			}
			for (const pid of pids) {
				try {
					execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
				} catch {
					/* ignore */
				}
			}
		} else {
			execSync(
				`lsof -tiTCP:${port} -sTCP:LISTEN | xargs -r kill -9 2>/dev/null || true`,
				{ stdio: "ignore" },
			);
		}
	} catch {
		/* ignore */
	}
}

/** Wait until a port is accepting connections. */
function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
	return new Promise((ok, fail) => {
		const deadline = Date.now() + timeoutMs;
		const tryConnect = () => {
			const hosts = ["127.0.0.1", "::1", "localhost"] as const;
			let attempts = hosts.length;
			let connected = false;
			for (const host of hosts) {
				const sock = connect(port, host);
				sock.once("connect", () => {
					if (connected) return;
					connected = true;
					sock.destroy();
					ok();
				});
				sock.once("error", () => {
					sock.destroy();
					attempts -= 1;
					if (connected) return;
					if (attempts > 0) return;
					if (Date.now() > deadline) {
						fail(new Error(`Port ${port} not ready within ${timeoutMs}ms`));
					} else {
						setTimeout(tryConnect, 500);
					}
				});
			}
		};
		tryConnect();
	});
}

/** Wait until a previously-owned test port is actually released before reuse. */
function waitForPortClosed(port: number, timeoutMs = 10_000): Promise<void> {
	return new Promise((ok, fail) => {
		const deadline = Date.now() + timeoutMs;
		const tryConnect = () => {
			const sock = connect(port, "127.0.0.1");
			sock.once("connect", () => {
				sock.destroy();
				if (Date.now() > deadline) {
					fail(
						new Error(`Port ${port} was not released within ${timeoutMs}ms`),
					);
				} else {
					setTimeout(tryConnect, 150);
				}
			});
			sock.once("error", () => {
				sock.destroy();
				ok();
			});
		};
		tryConnect();
	});
}

/**
 * 심은 공급자에 쓸 게이트웨이 키를 에이전트에 실어 준다 (#547).
 *
 * 이것을 함수로 빼 둔 이유가 있다. 이 설정을 상속하면서 `before()` 만 갈아
 * 끼우는 설정이 있는데(wdio.conf.chat.ts), 그러면 키 전달이 통째로 빠진다.
 * 그 설정이 실제로 401 을 받았다 — 시딩은 상속되는데 키는 안 실린 것이다.
 * 상속하는 쪽이 자기 `before()` 에서 이 하나만 부르면 된다.
 */
export async function deliverCredentialedGatewayKey(): Promise<void> {
	// 심은 공급자에 쓸 게이트웨이 키를 에이전트에 실어 준다 (#547).
	//
	// config.json 의 `credentialRef` 만으로는 부족하다. 에이전트는 매 턴
	// `credentials.get(provider)` 를 설정 위에 덮어쓰는데, 리눅스에서 그것은 OS
	// 키체인(`secret-tool`)을 본다. 그 기계에 게이트웨이 키가 하나 남아 있으면
	// 그 값이 이겨서, 우리가 심은 키 대신 남의 키로 게이트웨이를 두드리다 401 을
	// 받는다(실측). 로그인 경로와 같은 wire(`creds_update`)로 보내면 그 덮어쓰기
	// 자체를 런타임 overlay 로 눌러, 어느 기계에서도 같은 키를 쓴다.
	//
	// 키는 이 프로세스의 환경에서 곧장 실려 파일에 남지 않는다. 스펙이 스스로
	// 다른 provider 로 갈아타면 그쪽 슬롯을 쓰므로 충돌하지 않는다.
	if (CREDENTIALED_SEED_ACTIVE) {
		// `browser.execute` 는 동기 실행이라 async 콜백의 promise 를 기다리지
		// 않는다. 결과를 창에 남기고 그것이 나타날 때까지 기다린다 — 안 그러면
		// 키가 닿았는지 모르는 채로 스펙이 시작하고, 실패는 401 이라는 엉뚱한
		// 모습으로 나타난다.
		await browser.execute(
			(message: string) => {
				const shell = window as unknown as {
					__TAURI_INTERNALS__?: {
						invoke: (command: string, value: unknown) => Promise<unknown>;
					};
					__naiaE2eCredsSeed?: string;
				};
				shell.__naiaE2eCredsSeed = "pending";
				const invoke = shell.__TAURI_INTERNALS__?.invoke;
				if (!invoke) {
					shell.__naiaE2eCredsSeed = "error: Tauri invoke unavailable";
					return;
				}
				invoke("send_to_agent_command", { message }).then(
					() => {
						shell.__naiaE2eCredsSeed = "ok";
					},
					(error: unknown) => {
						shell.__naiaE2eCredsSeed = `error: ${String(error)}`;
					},
				);
			},
			JSON.stringify({
				type: "creds_update",
				// 심을 때 고른 provider 와 같아야 한다. 환경으로 바꿔 끼웠는데
				// 키를 기본 provider 슬롯에 넣으면 그 키가 영영 안 쓰인다.
				provider:
					credentialedSeedOptionsFromEnv().provider ??
					CREDENTIALED_MAIN_PROVIDER,
				naiaKey: process.env[CREDENTIALED_KEY_ENV] ?? "",
			}),
		);
		let credsSeedState = "pending";
		await browser.waitUntil(
			async () => {
				credsSeedState = await browser.execute(
					() =>
						(window as unknown as { __naiaE2eCredsSeed?: string })
							.__naiaE2eCredsSeed ?? "pending",
				);
				return credsSeedState !== "pending";
			},
			{
				timeout: 15_000,
				timeoutMsg: "creds_update(게이트웨이 키) 가 에이전트에 닿지 않았다",
			},
		);
		if (credsSeedState !== "ok") {
			// 이 실패는 대개 키 문제가 아니라 **뇌가 없다** 는 뜻이다. 네이티브가 앞
			// 세션이 흘린 리스 때문에 agent 를 안 띄우면(`agent_lease_live_blocked`)
			// 이 wire 가 곧장 막히고 재시작마저 억제(cooldown)에 걸린다. 이름을 그대로
			// 두면 다음 사람이 자격증명을 뒤진다 — 실제로 그렇게 한 번 샜다.
			throw new Error(
				`creds_update failed: ${credsSeedState}` +
					(/restart debounced|not running|died/.test(credsSeedState)
						? " — 이 세션은 agent 없이 떴다. 앞 세션의 agent 자식이 리스를 쥐고" +
							" 있었을 가능성이 크다 (naia.log 의 agent_lease_live_blocked)."
						: ""),
			);
		}
		console.log("[e2e] gateway key delivered to agent (creds_update)");
		await browser.pause(500);
	}
}

/**
 * 실행이 남긴 herdr 세션 서버를 내린다.
 *
 * 셸은 워크스페이스를 열 때 이 세션의 헤드리스 서버를 띄우는데, 그 서버는 앱이
 * 꺼져도 남는다(그것이 herdr 의 뜻이다 — 세션은 오래 산다). 하네스 세션은 오래
 * 살 이유가 없으므로 실행 자리와 함께 지운다. 안 지우면 실행마다 서버 하나와
 * `~/.config/herdr/sessions/` 아래 디렉터리 하나가 쌓인다.
 */
function stopHarnessHerdrSession(): void {
	const runtimeDir = process.env.NAIA_E2E_RUNTIME_DIR;
	if (!OWNS_RUNTIME_DIR || !runtimeDir) return;
	const session = harnessHerdrSessionName(runtimeDir);
	for (const args of [
		["--session", session, "server", "stop"],
		["session", "delete", session],
	]) {
		try {
			spawnSync("herdr", args, { stdio: "ignore", timeout: 10_000 });
		} catch {
			// herdr 이 없는 기계에서는 할 일이 없다.
		}
	}
}

export const config = {
	runner: "local" as const,

	specs: ["./specs/**/*.spec.ts"],
	maxInstances: 1,
	capabilities: [
		{
			maxInstances: 1,
			// ★ WebKitWebDriver(webkit2gtk 2.52.3)는 wdio 9 가 W3C 세션에 자동 활성하는 BiDi 프로토콜을
			//   제대로 지원 안 해, 응답이 깨진 JSON 으로 와 `Could not parse response body`(JSON.parse 실패)로
			//   모든 execute/세션이 깨진다 → classic WebDriver 만 쓰도록 강제(BiDi 비활성). e2e-tauri 핵심 fix.
			"wdio:enforceWebDriverClassic": true,
			// 헤드리스(cage/WebKitWebDriver)에서 browser.refresh()/url() 의 page-load 대기가
			// 완료 응답을 못 받아 "aborted due to timeout" 으로 세션이 끊기는 문제 → 'eager' 로
			// DOMContentLoaded 까지만 대기(전체 load 이벤트 대기 안 함). 준비 판정은 명시적 waitUntil 이 담당.
			pageLoadStrategy: "eager",
			// #539: Windows 는 인앱 WebDriver(tauri_plugin_wdio_webdriver)에 붙는다 —
			// msedgedriver 는 WebView2 의 DevToolsActivePort 를 찾지 못해 세션을 못 연다.
			// Linux 는 WebKitWebDriver 가 정상이라 tauri-driver 경유를 유지한다.
			...(IS_WINDOWS
				? { browserName: "tauri" }
				: { "tauri:options": { application: TAURI_BINARY } }),
		},
	],

	logLevel: "warn",
	bail: 0,
	waitforTimeout: 30_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 3,
	// Node 26 exposes its global fetch dispatcher through an undici compatibility
	// wrapper. webdriverio 9 precomputes Content-Length before that wrapper, which
	// rejects the otherwise valid session request as UND_ERR_INVALID_ARG. Let fetch
	// compute the byte length from the unchanged JSON body instead.
	transformRequest: (request) => {
		request.headers.delete("Content-Length");
		return request;
	},

	port: IN_APP_PORT,
	hostname: "127.0.0.1",

	framework: "mocha",
	mochaOpts: {
		ui: "bdd",
		timeout: 180_000,
	},

	reporters: ["spec"],

	async onPrepare() {
		// Kill orphaned processes from previous runs
		killByPort(1420);
		killByPort(VITE_PORT);
		killByPort(4448);
		killByPort(4449);
		killByName("tauri-driver");
		if (IS_WINDOWS) {
			killByName("msedgedriver");
		} else {
			killByName("WebKitWebDriver");
		}
		killByName("naia-shell");
		// 회수가 먼저다. 자리를 먼저 비우면 앞 실행이 흘린 리스가 사라져,
		// 고아를 가리키던 유일한 단서를 우리가 지우게 된다.
		reclaimLeakedAgentChild();
		reclaimLeakedBgmSidecar();
		if (OWNS_RUNTIME_DIR) {
			const owned = assertOwnedRuntimeDir();
			rmSync(owned, {
				recursive: true,
				force: true,
				maxRetries: 10,
				retryDelay: 200,
			});
			mkdirSync(owned, { recursive: true });
			console.log(`[e2e] isolated runtime dir: ${owned}`);
		}
		if (HARNESS_XDG) {
			// 실행 자리를 비운 **다음**에 만든다. 순서가 뒤집히면 방금 만든 자리를
			// 우리가 지운다. 앱이 기동하기 전에 있어야 WebKit 이 프로필을 거기 만든다.
			for (const dir of Object.values(HARNESS_XDG)) {
				mkdirSync(dir, { recursive: true });
			}
			console.log(`[e2e] isolated app profile: ${HARNESS_XDG.XDG_CONFIG_HOME}`);
		}
		if (SEEDS_CREDENTIALED_ADK) {
			// 실행 자리를 비운 **다음**에 심는다. 순서가 뒤집히면 방금 심은 것을
			// 우리가 지운다.
			const seeded = seedCredentialedAdk(
				SEEDED_ADK_PATH,
				credentialedSeedOptionsFromEnv(),
			);
			console.log(
				`[e2e] credentialed live provider seeded: ${seeded.provider}/${seeded.model}` +
					` (key from $${seeded.credentialRefEnv}) → ${seeded.configPath}`,
			);
		}
		if (CREDENTIALED_SEED_ACTIVE) {
			// 받는 쪽이 있어야 `notify` 가 합성된다. 주소는 무작위 포트라 여기서
			// 정해 환경에 넣는다 — 워커와 앱은 이 환경을 물려받는다.
			notifyStub = await startNotifyWebhookStub(
				process.env.NAIA_E2E_NOTIFY_LOG as string,
			);
			process.env.NAIA_NOTIFY_SLACK_WEBHOOK = notifyStub.urlFor("slack");
			process.env.NAIA_NOTIFY_DISCORD_WEBHOOK = notifyStub.urlFor("discord");
			console.log(`[e2e] notify webhook stub on 127.0.0.1:${notifyStub.port}`);
		}
		await waitForPortClosed(1420);
		await waitForPortClosed(VITE_PORT);
		if (!IS_WINDOWS) {
			await waitForPortClosed(4448);
			await waitForPortClosed(4449);
		}

		// Start Vite dev server (debug binary loads from devUrl localhost:1420).
		viteServer = spawn(execPath, [VITE_ENTRY, "--host", VITE_HOST], {
			cwd: SHELL_DIR,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				BROWSER: "none",
				PLAYWRIGHT_PORT: String(VITE_PORT),
			},
		});
		viteServer.stdout?.on("data", (d: Buffer) => {
			const line = d.toString();
			if (line.includes("error") || line.includes("Error")) {
				process.stderr.write(`[vite] ${line}`);
			}
		});
		viteServer.stderr?.on("data", (d: Buffer) =>
			process.stderr.write(`[vite:err] ${d.toString()}`),
		);
		await waitForPort(VITE_PORT, 30_000);
		console.log(
			`[e2e] Vite dev server started on ${VITE_HOST}:${VITE_PORT} (devUrl=${E2E_DEV_URL.href})`,
		);
	},

	async beforeSession() {
		// The native drivers are an external boundary. Clear only leftovers before
		// creating a fresh session; the previous session is never killed mid-start.
		killByName("naia-shell", true);
		if (!IS_WINDOWS) killByName("naia-node", true);
		// 앱을 죽이면 그 agent 자식은 고아가 되고, 리스는 그 PID 를 계속 가리킨다.
		// 다음 세션의 네이티브는 그 리스를 보고 agent 를 아예 안 띄운다
		// (`agent_lease_live_blocked`). 그래서 **여기서**, 앱을 띄우기 전에
		// 회수한다. onPrepare 한 번으로는 스펙 사이를 못 막는다 — 실측에서
		// 서른여덟 중 서른일곱이 뇌 없이 돌았다.
		reclaimLeakedAgentChild();
		killByName("tauri-driver", true);
		if (IS_WINDOWS) killByName("msedgedriver", true);
		else killByName("WebKitWebDriver", true);
		if (!IS_WINDOWS) {
			killByPort(4448);
			killByPort(4449);
			await waitForPortClosed(4448);
			await waitForPortClosed(4449);
		}

		if (IS_WINDOWS) {
			// #539: 인앱 WebDriver — 앱이 곧 서버다. 세션 삭제가 앱을 끝내 주지
			// 않으므로(구 tauri-driver 와 다름) 스폰 직전 강제 정리로 4448 을 비운다.
			await forceFreeInAppPort();
			tauriDriver = spawn(TAURI_BINARY, [], {
				stdio: [null, process.stdout, process.stderr],
				env: {
					...process.env,
					RUST_LOG: process.env.RUST_LOG ?? "tauri_plugin_wdio_webdriver=debug",
					TAURI_WEBDRIVER_PORT: String(IN_APP_PORT),
				},
			});
		} else {
			tauriDriver = spawn(
				TAURI_DRIVER,
				["--port", "4448", "--native-driver", NATIVE_DRIVER],
				{
					stdio: [null, process.stdout, process.stderr],
					env: {
						...process.env,
						RUST_LOG: process.env.RUST_LOG ?? "tauri_driver=debug",
					},
				},
			);
		}
		await waitForPort(IN_APP_PORT, 30_000);
	},

	async before() {
		// Each spec runs in its own session (fresh app).
		// On Windows/WebView2 the session returns before the webview has
		// navigated from about:blank to devUrl — touching localStorage on an
		// opaque origin throws "Access is denied". Wait until the document is
		// on an http origin AND localStorage is actually writable before any
		// spec-level hook runs. Linux/WebKitGTK already blocks on navigation
		// so this wait is a no-op there.
		await browser.waitUntil(
			async () => {
				try {
					return await browser.execute(() => {
						if (!document.location.href.startsWith("http")) return false;
						try {
							const probe = "__naia_e2e_probe__";
							localStorage.setItem(probe, "1");
							localStorage.removeItem(probe);
							return true;
						} catch {
							return false;
						}
					});
				} catch {
					return false;
				}
			},
			{
				timeout: 30_000,
				timeoutMsg:
					"webview never reached an http origin with writable localStorage",
			},
		);

		// Ensure base config is set so the app bypasses onboarding.
		const { ensureAppReady } = await import("./helpers/settings.js");
		await ensureAppReady();

		await deliverCredentialedGatewayKey();

		// Auto-approve permission modals globally for all specs.
		// Prevents tool-call hangs when AI tries to use a tool not yet approved.
		const { autoApprovePermissions } = await import("./helpers/permissions.js");
		permissionPoller = autoApprovePermissions();
	},

	after() {
		permissionPoller?.dispose();
		permissionPoller = undefined;
	},

	async afterSession() {
		// 객체 리터럴에 같은 키가 둘이면 뒤엣것만 남는다. #539 의 윈도우 인앱 포트
		// 해제가 별도 afterSession 에 있다가 이 훅에 덮여 한 번도 돌지 않았다 —
		// 그래서 훅은 하나뿐이어야 하고, 그 검사는 계약 테스트가 맡는다.
		// The service owns the driver processes. Only clean the app/legacy child
		// after a session so the next native spec starts from a known state.
		if (!IS_WINDOWS) {
			killByName("naia-node");
		}
		killByName("naia-shell");
		// 앱이 죽은 직후가 고아를 잡기 가장 쉬운 때다. 다음 세션이 시작할 때
		// 한 번 더 보지만, 여기서 걷어 두면 그 대기가 짧아진다.
		reclaimLeakedAgentChild();
		if (IS_WINDOWS) {
			killByName("msedgedriver");
		} else {
			killByName("WebKitWebDriver");
		}
		killByName("tauri-driver");
		killByPort(4448);
		killByPort(4449);
		// #539(Windows 인앱): 세션이 끝나도 앱 프로세스는 남는다 — 직접 끝낸다.
		if (IS_WINDOWS) {
			await forceFreeInAppPort();
		}
	},

	async onComplete() {
		viteServer?.kill();
		await notifyStub?.close();
		stopHarnessHerdrSession();
		// 붉은 실행의 로그·리스를 볼 수 있어야 원인을 가린다. codex 전용 설정과
		// 같은 손잡이를 쓴다.
		if (!OWNS_RUNTIME_DIR) return;
		if (process.env.NAIA_E2E_KEEP_ARTIFACTS === "1") {
			process.stderr.write(
				`[e2e] preserving isolated runtime dir ${E2E_RUNTIME_DIR}\n`,
			);
			return;
		}
		try {
			rmSync(assertOwnedRuntimeDir(), {
				recursive: true,
				force: true,
				maxRetries: 10,
				retryDelay: 200,
			});
		} catch (error) {
			process.stderr.write(
				`[e2e] deferred cleanup for ${E2E_RUNTIME_DIR}: ${String(error)}\n`,
			);
		}
	},
};
