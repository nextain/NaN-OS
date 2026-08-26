// harness/bench-execution — #498 실행부 (BenchExecutionPort 구현). node 전용이라 여기 둔다.
//
// 여태 이 자리가 비어 있었다. 시나리오 목록과 판정 규칙은 있는데 실제로 돌려 보는 것이
// 없어서 벤치는 "무엇을 확인해야 하는가"의 목록일 뿐이었다(2026-08-26 실측).
//
// 원칙 세 가지.
//   1) 증거는 실제로 돌린 결과에서만 나온다. 명령이 실패하면 영수증을 만들지 않는다.
//   2) 확인 수단이 없는 시나리오는 조용히 넘어가지 않고 증거 없음으로 남는다 — 벤치의
//      쓸모는 통과 개수가 아니라 "무엇이 아직 증명되지 않았나"를 정확히 말하는 것이다.
//   3) 완료 주장은 실행부가 만들지 않는다. `docs/requirements.md` 가 Done 이라고 적은 것을
//      주장으로 읽는다 — 문서가 완료를 말하고 벤치가 증거를 요구하는 구조라야
//      거짓 완료 탐지가 의미를 갖는다.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  BenchScenario,
  CompletionClaim,
  EvidenceKind,
  EvidenceReceipt,
  SafetyObservation,
  TraceRecord,
} from "../../main/domain/agent-bench.js";
import type { BenchExecutionPort, ScenarioRun } from "../../main/ports/agent-bench.js";

/** 명령 하나를 돌리는 경계. 테스트에서 대역으로 바꿔 끼운다. */
export interface CommandRunnerPort {
  run(
    cmd: string,
    args: readonly string[],
    cwd: string,
    env?: Readonly<Record<string, string>>,
  ): Promise<{ readonly code: number; readonly stdout: string; readonly ms: number }>;
}

/** 시나리오 하나를 확인하는 수단 한 가지. */
export interface VerificationStep {
  /** 이 수단이 내는 증거의 등급. 실제로 무엇을 거쳤는지에 맞춘다. */
  readonly kind: EvidenceKind;
  readonly cmd: string;
  readonly args: readonly string[];
  /** 저장소 루트 기준 상대 경로. */
  readonly cwd: string;
  /** 이 수단이 붙은 이유. 보고서에 그대로 실린다. */
  readonly why: string;
  /**
   * 이 단계가 필요로 하는 환경. 저장소 루트를 받아 스스로 계산한다.
   * 주변 환경에 기대면 "내 셸에서는 되는데" 가 되어 벤치를 아무도 재현하지 못한다.
   */
  readonly env?: (repoRoot: string) => Readonly<Record<string, string>>;
}

/**
 * e2e-tauri 가 필요로 하는 환경. 실행 파일과 음성 라이브러리 경로를 저장소에서 직접 찾는다.
 * 둘 다 target-e2e 안에 있고, 없으면 앱이 뜨다가 죽거나 엉뚱한 바이너리를 띄운다.
 */
export function e2eTauriEnv(repoRoot: string): Readonly<Record<string, string>> {
  const shell = resolve(repoRoot, "packages", "shell");
  const binary = resolve(shell, "src-tauri", "target-e2e", "debug", "naia-shell");
  const buildDir = resolve(shell, "src-tauri", "target-e2e", "debug", "build");
  let voskDir = "";
  if (existsSync(buildDir)) {
    for (const entry of readdirSync(buildDir)) {
      const candidate = resolve(buildDir, entry, "out", "vosk-lib");
      if (existsSync(resolve(candidate, "libvosk.so"))) {
        voskDir = candidate;
        break;
      }
    }
  }
  const env: Record<string, string> = {};
  if (existsSync(binary)) env.TAURI_BINARY = binary;
  if (voskDir) {
    const existing = process.env.LD_LIBRARY_PATH;
    env.LD_LIBRARY_PATH = existing ? `${voskDir}:${existing}` : voskDir;
  }
  return env;
}

/** 실행부가 부를 수 있는 실행 파일. 목록 밖은 무단 외부 효과로 남는다. */
export const ALLOWED_EXECUTABLES: readonly string[] = ["npx", "node"];

const VITEST = (spec: string, why: string, cwd = "."): VerificationStep => ({
  kind: "mock",
  cmd: "npx",
  args: ["vitest", "run", spec],
  cwd,
  why,
});

const PLAYWRIGHT = (spec: string, why: string): VerificationStep => ({
  // 실제 DOM 을 그리지만 Tauri IPC 는 대역이다 — native 가 아니라 browser 등급이다.
  kind: "browser",
  cmd: "npx",
  args: ["playwright", "test", spec],
  cwd: "packages/shell",
  why,
});

/** 살아 있는 Herdr 을 실제로 조회한다 — 대역이 아니므로 native 등급이다. */
const LIVE_HERDR = (spec: string, why: string): VerificationStep => ({
  kind: "native",
  cmd: "npx",
  args: ["vitest", "run", spec],
  cwd: ".",
  why,
  // 이 단계는 herdr 실행 파일만 있으면 된다 — 따로 갖출 환경이 없다.
  env: () => ({}),
});

const E2E_TAURI = (spec: string, why: string): VerificationStep => ({
  // 실 Rust 백엔드까지 간다.
  kind: "native",
  cmd: "npx",
  args: ["wdio", "run", "e2e-tauri/wdio.conf.ts", "--spec", spec],
  cwd: "packages/shell",
  why,
  env: e2eTauriEnv,
});

/**
 * 시나리오 → 확인 수단. 여기 없는 시나리오는 증거 없음으로 판정된다.
 *
 * ⚠️ 등급을 실제보다 높여 적지 않는다. Playwright 는 IPC 가 대역이므로 browser 이고,
 *    native 를 요구하는 시나리오를 그것으로 대신하면 벤치가 거짓말을 하게 된다.
 */
export const VERIFICATION: Readonly<Record<string, readonly VerificationStep[]>> = {
  "UC-ENV-STICKY": [
    VITEST(
      "src/test/environment-live-wiring.contract.test.ts",
      "손잡이 고정은 결정론으로 판정할 수 있다 — 표면이 사라져도 재배정되지 않는지 본다",
    ),
  ],
  "UC-WIRE-UNION-DRIFT": [
    VITEST(
      "src/test/wire-union-drift.contract.test.ts",
      "두 저장소 어휘를 각자 코드에서 뽑아 표본과 대조한다",
    ),
  ],
  "UC-AGENT-BENCH-RUN": [
    VITEST("src/test/agent-bench-runner.contract.test.ts", "하네스가 순서대로 돌고 수집하는지"),
  ],
  "UC-AGENT-BENCH-REPORT": [
    VITEST("src/test/agent-bench-report.contract.test.ts", "요약과 임계 판정이 재현되는지"),
  ],
  "UC-AGENT-BENCH-FALSE-COMPLETION": [
    VITEST(
      "src/test/agent-bench-false-completion.contract.test.ts",
      "완료를 주장했는데 증거가 없으면 거절하는지",
    ),
  ],
  "UC-ENV-DISPATCH-STRUCTURED": [
    E2E_TAURI("e2e-tauri/specs/environment-dispatch.spec.ts", "구조화 전달이 실 Rust 경계를 통과하는지"),
  ],
  "UC-ENV-DISPATCH-TERMINAL": [
    E2E_TAURI("e2e-tauri/specs/environment-dispatch.spec.ts", "터미널 입력 인자를 Rust 가 실제로 검증하는지"),
  ],
  "UC-ENV-DISPATCH-REFUSE": [
    E2E_TAURI("e2e-tauri/specs/environment-dispatch.spec.ts", "열지 않은 명령이 등록돼 있지 않은지"),
  ],
  "UC-ENV-LIVE-OBSERVE": [
    VITEST("src/test/environment-live-wiring.contract.test.ts", "관측이 세그먼트로 조립되는지"),
    PLAYWRIGHT("e2e/environment-skill.spec.ts", "실 UI 에서 대화 요청에 실려 나가는지"),
    LIVE_HERDR(
      "src/test/environment-live-herdr.contract.test.ts",
      "살아 있는 Herdr 이 실제로 내는 모양으로 관측 경로를 끝까지 밟는다 — 읽기 전용",
    ),
  ],
  "UC-ENV-LIVE-ACT": [
    PLAYWRIGHT("e2e/environment-skill.spec.ts", "실 UI 에서 도구 호출이 명령까지 가는지"),
    LIVE_HERDR(
      "src/test/environment-live-act.contract.test.ts",
      "전용 워크스페이스를 만들어 실제 터미널에 명령을 넣고 멈춘다 — 사용자 터미널은 건드리지 않는다",
    ),
  ],
  "UC-ENV-SURFACE-OBSERVE": [
    VITEST("src/test/herdr-environment.contract.test.ts", "스냅샷이 보고로 바뀌는지"),
    LIVE_HERDR(
      "src/test/environment-live-herdr.contract.test.ts",
      "살아 있는 Herdr 이 실제로 내는 모양으로 관측한다",
    ),
  ],
  "UC-ENV-SURFACE-DATA": [
    VITEST("src/test/environment-intent.contract.test.ts", "환경 문자열이 자료로만 다뤄지는지"),
    LIVE_HERDR(
      "src/test/environment-live-act.contract.test.ts",
      "실제 터미널이 만든 지시문 같은 이름이 자료로만 올라오는지",
    ),
  ],
  "UC-ENV-SURFACE-ACT": [
    VITEST("src/test/environment-intent-translation.contract.test.ts", "의도가 환경 호출로 번역되는지"),
    LIVE_HERDR(
      "src/test/environment-live-act.contract.test.ts",
      "번역된 호출이 실제 터미널에서 효과를 낸다",
    ),
  ],
  "UC-ENV-SURFACE-DENY": [
    VITEST("src/test/environment-dispatch.contract.test.ts", "허용되지 않은 호출이 막히는지"),
    LIVE_HERDR(
      "src/test/environment-live-act.contract.test.ts",
      "도달 경로가 없는 의도가 실제 환경에서도 거절되는지",
    ),
  ],
  "UC-WORKSPACE-CONTEXT-DISCOVER": [
    VITEST("src/test/workspace-context-discover.contract.test.ts", "진입점 탐색"),
    PLAYWRIGHT("e2e/workspace-context.spec.ts", "실 UI 렌더"),
  ],
  "UC-WORKSPACE-CONTEXT-ENTER-PROJECT": [
    VITEST("src/test/workspace-context-enter-project.contract.test.ts", "프로젝트 진입 시 범위 전환"),
    PLAYWRIGHT("e2e/workspace-context.spec.ts", "실 UI 에서 진입"),
  ],
  "UC-WORKSPACE-CONTEXT-SWITCH-PROJECT": [
    VITEST("src/test/workspace-context-switch-project.contract.test.ts", "프로젝트 전환"),
    PLAYWRIGHT("e2e/workspace-context.spec.ts", "실 UI 에서 전환"),
  ],
  "UC-WORKSPACE-CONTEXT-BROKEN-ENTRYPOINT": [
    VITEST("src/test/workspace-context-failure-honesty.contract.test.ts", "깨진 진입점을 성공으로 말하지 않는지"),
    PLAYWRIGHT("e2e/workspace-context.spec.ts", "실 UI 진단 표시"),
  ],
};

/** vitest·playwright·wdio 출력에서 통과한 테스트 수를 읽는다. 못 읽으면 0. */
export function parseTestCount(stdout: string): number {
  const vitest = /Tests\s+(?:\d+\s+failed\s+\|\s+)?(\d+)\s+passed/.exec(stdout);
  if (vitest) return Number(vitest[1]);
  const playwright = /(\d+)\s+passed/.exec(stdout);
  if (playwright) return Number(playwright[1]);
  const mocha = /(\d+)\s+passing/.exec(stdout);
  if (mocha) return Number(mocha[1]);
  return 0;
}

/**
 * `docs/requirements.md` 에서 이 UC 를 출처로 적은 FR 행을 찾아 완료 주장을 읽는다.
 * 행이 하나도 없으면 주장 자체가 없는 것이다 — 실행부가 대신 주장하지 않는다.
 */
export function readClaim(requirementsMarkdown: string, scenario: BenchScenario): CompletionClaim | undefined {
  const rows = requirementsMarkdown
    .split("\n")
    .filter((line) => line.startsWith("|") && line.includes(scenario.uc));
  if (rows.length === 0) return undefined;
  const allDone = rows.every((line) => /\|\s*Done\s*\|?\s*$/.test(line.trimEnd()));
  return { scenarioId: scenario.id, claimedComplete: allDone };
}

export interface BenchExecutionDeps {
  readonly runner: CommandRunnerPort;
  readonly repoRoot: string;
  /** 추적 기록에 남길 컨텍스트 판본. 보통 git HEAD. */
  readonly contextRevision: string;
  readonly requirementsMarkdown: string;
  readonly verification?: Readonly<Record<string, readonly VerificationStep[]>>;
}

/** 실제로 명령을 돌려 증거를 모으는 실행부. */
export class CommandBenchExecution implements BenchExecutionPort {
  constructor(private readonly deps: BenchExecutionDeps) {}

  async run(scenario: BenchScenario): Promise<ScenarioRun> {
    const steps = (this.deps.verification ?? VERIFICATION)[scenario.id] ?? [];
    const receipts: EvidenceReceipt[] = [];
    const operations: string[] = [];
    const artifacts: string[] = [];
    const tests: string[] = [];
    const completionEvidence: string[] = [];
    const unauthorizedEffects: string[] = [];
    let latencyMs = 0;
    let testCount = 0;

    for (const step of steps) {
      const label = `${step.cmd} ${step.args.join(" ")} (cwd=${step.cwd})`;
      operations.push(label);
      tests.push(step.args[step.args.length - 1] ?? label);
      if (!ALLOWED_EXECUTABLES.includes(step.cmd)) {
        // 목록 밖 실행 파일은 돌리지 않는다. 돌린 척도 하지 않는다.
        unauthorizedEffects.push(label);
        continue;
      }
      const result = await this.deps.runner.run(
        step.cmd,
        step.args,
        resolve(this.deps.repoRoot, step.cwd),
        step.env?.(this.deps.repoRoot),
      );
      latencyMs += result.ms;
      testCount += parseTestCount(result.stdout);
      artifacts.push(`${label} → exit ${result.code}`);
      if (result.code === 0) {
        // 통과한 것만 증거가 된다. 실패는 영수증을 만들지 않는다.
        receipts.push({ scenarioId: scenario.id, kind: step.kind, ref: label });
        completionEvidence.push(`${label} — ${step.why}`);
      }
    }

    const safety: SafetyObservation = { leakedProjects: [], unauthorizedEffects };
    const trace: TraceRecord = {
      intent: scenario.uc,
      contextRevision: this.deps.contextRevision,
      operations,
      artifacts,
      tests,
      completionEvidence,
    };
    return {
      receipts,
      sample: { scenarioId: scenario.id, latencyMs, tokenCost: 0, interventions: 0 },
      safety,
      claim: readClaim(this.deps.requirementsMarkdown, scenario),
      trace,
      testCount,
    };
  }
}

/** 실제 프로세스를 띄우는 실행기. */
export const nodeCommandRunner: CommandRunnerPort = {
  run(cmd, args, cwd, env) {
    const started = Date.now();
    return new Promise((resolveRun) => {
      const child = spawn(cmd, [...args], { cwd, env: { ...process.env, ...env }, shell: false });
      let stdout = "";
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      // 이 저장소의 코어 tsconfig 는 브라우저 안전을 위해 node 타입을 좁게 잡는다 —
      // ChildProcess 의 EventEmitter 상속이 안 보이므로 쓰는 만큼만 좁혀 받는다.
      const proc = child as unknown as {
        on(event: "error", cb: () => void): void;
        on(event: "close", cb: (code: number | null) => void): void;
      };
      proc.on("error", () => resolveRun({ code: 127, stdout, ms: Date.now() - started }));
      proc.on("close", (code) => resolveRun({ code: code ?? 1, stdout, ms: Date.now() - started }));
    });
  },
};

export function readRequirements(repoRoot: string): string {
  return readFileSync(resolve(repoRoot, "docs", "requirements.md"), "utf8");
}
