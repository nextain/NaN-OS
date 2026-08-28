// harness/orchestration-live — 실제 프로세스가 도는 작업자 어댑터. node 전용.
//
// 지금까지 이 포트에는 실제 구현이 없었고 대역만 있었다. 대역 작업자는 우리가 정한 상태를
// 그대로 돌려주므로 "작업자가 정말 돌았고 증거를 남겼는가"를 증명하지 못한다.
//
// ⚠️ provider 는 `shell` 만 쓴다. 코딩 모델을 띄우지 않는다 — 사용자의 자격증명과 비용이
//    걸리는 일이라 이 검증의 목적이 아니다. 필요한 것은 "실제 프로세스가 자기 소유 경로
//    안에서 일하고 산출물을 남긴다"이고, 그것은 shell 작업자로 충분히 성립한다.
// ⚠️ 모든 작업은 호출자가 준 임시 디렉터리 안에서만 한다.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  DelegationBrief,
  WorkerAssignment,
  WorkerReport,
  WorkerState,
} from "../../main/domain/orchestration.js";
import type { IssueTrackerPort, SpaceBindingPort, WorkerAdapterPort } from "../../main/ports/orchestration.js";
import type { IssueBinding } from "../../main/domain/orchestration.js";

/** 이슈를 파일로 남기는 추적기. 이름을 두 번 만들지 않는다. */
export function fileIssueTracker(root: string): IssueTrackerPort {
  return {
    async ensureIssue(title: string): Promise<string> {
      const path = resolve(root, "issues.json");
      const store = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, string>) : {};
      if (!store[title]) {
        store[title] = `issue-${Object.keys(store).length + 1}`;
        writeFileSync(path, JSON.stringify(store, null, 2), "utf8");
      }
      return store[title] as string;
    },
  };
}

/** 결속을 파일로 남기는 저장소. 재시작을 넘어 남는다. */
export function fileSpaceBindings(root: string): SpaceBindingPort {
  const path = resolve(root, "bindings.json");
  const read = (): IssueBinding[] => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as IssueBinding[]) : []);
  return {
    async bind(binding: IssueBinding): Promise<void> {
      const all = read();
      all.push(binding);
      writeFileSync(path, JSON.stringify(all, null, 2), "utf8");
    },
    async list(): Promise<readonly IssueBinding[]> {
      return read();
    },
  };
}

interface RunningWorker {
  readonly assignment: WorkerAssignment;
  readonly brief: DelegationBrief;
  state: WorkerState;
  readonly outputPath: string;
  readonly pid: number | null;
  exitCode: number | null;
}

/**
 * 실제 프로세스로 도는 작업자.
 * 작업자는 자기 소유 경로 안에만 쓴다 — 밖으로 쓰려 하면 시작 자체를 거부한다.
 */
export class LiveShellWorkerAdapter implements WorkerAdapterPort {
  private readonly workers = new Map<string, RunningWorker>();

  constructor(private readonly root: string) {}

  async start(assignment: WorkerAssignment, brief: DelegationBrief): Promise<WorkerState> {
    if (assignment.provider !== "shell") {
      // 코딩 모델은 이 어댑터가 띄우지 않는다. 띄운 척도 하지 않는다.
      this.workers.set(assignment.workerId, {
        assignment,
        brief,
        state: "failed",
        outputPath: "",
        pid: null,
        exitCode: null,
      });
      return "failed";
    }
    const owned = assignment.ownedPaths[0] ?? assignment.workerId;
    const target = resolve(this.root, owned, `${assignment.workerId}.out`);
    if (!target.startsWith(resolve(this.root) + "/")) {
      throw new Error(`소유 경로 밖: ${owned}`);
    }
    mkdirSync(dirname(target), { recursive: true });

    // 실제로 일을 하는 프로세스.
    //
    // ⚠️ 셸을 거치지 않는다. 앞서 `sh -c` 에 작업자 식별자를 문자열로 끼워 넣었는데,
    //    식별자에 셸 메타문자가 들어오면 소유 경로 검사를 통과하고도 그 밖에서 명령이
    //    돌 수 있었다(2026-08-27 적대리뷰가 지적한 실제 결함). 고정 실행 파일에 인자
    //    배열로만 넘긴다 — 이 슬라이스가 코어에 요구하는 규칙과 같은 규칙이다.
    if (/[^A-Za-z0-9._-]/.test(assignment.workerId)) {
      throw new Error(`작업자 식별자에 쓸 수 없는 문자가 있다: ${assignment.workerId}`);
    }
    // ⚠️ 산출물은 *작업자 프로세스가* 써야 한다. 앞서는 부모 테스트가 파일을 쓰고 자식은
    //    sleep 만 했다 — 작업자 구현을 지워도 프로세스와 파일이 각각 존재해서 "작업자가
    //    일을 했다"는 주장이 반증 불가능했다(2026-08-27 7차 적대리뷰 지적).
    //    셸을 거치지 않고, 경로와 내용을 argv 로만 넘긴다.
    const child = spawn(
      process.execPath,
      [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1], process.argv[2]);",
        target,
        `${assignment.workerId} worked on ${brief.issue}\n`,
      ],
      { cwd: this.root, stdio: "ignore" },
    );
    const running: RunningWorker = {
      assignment,
      brief,
      state: "starting",
      outputPath: target,
      pid: child.pid ?? null,
      exitCode: null,
    };
    this.workers.set(assignment.workerId, running);
    const proc = child as unknown as { on(e: "close", cb: (code: number | null) => void): void };
    proc.on("close", (code) => {
      running.exitCode = code;
      running.state = code === 0 ? "finished" : "failed";
    });
    running.state = "running";
    return "running";
  }

  async observe(workerId: string): Promise<WorkerState> {
    return this.workers.get(workerId)?.state ?? "failed";
  }

  async interrupt(workerId: string): Promise<WorkerState> {
    const worker = this.workers.get(workerId);
    if (!worker) return "failed";
    if (worker.pid !== null && worker.state === "running") {
      try {
        process.kill(worker.pid, "SIGTERM");
      } catch {
        // 이미 끝났으면 그만이다.
      }
    }
    worker.state = "replaced";
    return worker.state;
  }

  /**
   * 보고 수집. 증거는 실제 산출물에서 나온다 — 작업자의 말이 아니다.
   * 작업자가 완료를 주장하고 권한을 더 달라고 해도 그대로 실어 올린다(판정은 코어 몫).
   */
  async collect(workerId: string): Promise<WorkerReport> {
    const worker = this.workers.get(workerId);
    if (!worker) return { workerId, evidence: [], claimsIssueComplete: false, requestedTiers: [] };
    const evidence = existsSync(worker.outputPath)
      ? [`${worker.outputPath}: ${readFileSync(worker.outputPath, "utf8").trim()}`]
      : [];
    return {
      workerId,
      evidence,
      // 실제 작업자는 늘 다 했다고 말한다. 그 말이 판정에 쓰이지 않는지가 요점이다.
      claimsIssueComplete: true,
      requestedTiers: ["production"],
    };
  }

  /** 프로세스가 끝날 때까지 기다린다. 테스트가 상태를 확정적으로 보기 위해. */
  async settle(workerId: string, timeoutMs = 10_000): Promise<WorkerState> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const state = await this.observe(workerId);
      if (state === "finished" || state === "failed" || state === "replaced") return state;
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.observe(workerId);
  }
}
