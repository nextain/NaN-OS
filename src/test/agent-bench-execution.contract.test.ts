// #498 실행부 계약 테스트 — 실제로 돌려 증거를 모으는 부분이 정직한가.
//
// 여기서 지키려는 것은 하나다: 벤치가 자기에게 유리하게 보고하지 않는다.
// 실패한 명령은 증거가 되지 않고, 확인 수단이 없으면 없다고 말하고,
// 등급을 실제보다 높여 적지 않는다.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALLOWED_EXECUTABLES,
  CommandBenchExecution,
  VERIFICATION,
  parseTestCount,
  readClaim,
  MISSING_SPECS,
  type CommandRunnerPort,
  type VerificationStep,
} from "./harness/bench-execution.js";
import { DEFERRED_SCENARIOS, parseScenarios, ownedByEpic, allHeadings } from "./harness/agent-bench-scenarios.js";
import { judge } from "../main/domain/agent-bench.js";
import type { BenchScenario } from "../main/domain/agent-bench.js";

const DOC = resolve(__dirname, "..", "..", "docs", "user-scenarios.md");
const REQ = resolve(__dirname, "..", "..", "docs", "requirements.md");
const markdown = readFileSync(DOC, "utf8");
const requirements = readFileSync(REQ, "utf8");

function runner(codes: readonly number[], stdout = "  ✓ 샘플 케이스 (1ms)"): CommandRunnerPort & { calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    run: async (cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      const code = codes[i] ?? 0;
      i += 1;
      return { code, stdout, ms: 10 };
    },
  };
}

const scenario = (id: string, overrides: Partial<BenchScenario> = {}): BenchScenario => ({
  id,
  uc: id,
  gate: "native",
  requiredEvidence: ["native"],
  ...overrides,
});

function exec(deps: {
  runner: CommandRunnerPort;
  verification?: Readonly<Record<string, readonly VerificationStep[]>>;
  requirementsMarkdown?: string;
}) {
  return new CommandBenchExecution({
    runner: deps.runner,
    repoRoot: resolve(__dirname, "..", ".."),
    contextRevision: "abc1234",
    requirementsMarkdown: deps.requirementsMarkdown ?? requirements,
    verification: deps.verification,
  });
}

const STEP: VerificationStep = {
  kind: "native",
  cmd: "npx",
  args: ["wdio", "run", "x.conf.ts"],
  cwd: "packages/shell",
  why: "실 백엔드 확인",
  // 케이스 선택자가 없는 단계는 증거를 만들지 않는다 — 대역 단계도 예외가 아니다.
  cases: ["샘플 케이스"],
};

describe("실패는 증거가 되지 않는다", () => {
  it("명령이 통과하면 영수증이 생긴다", async () => {
    const r = runner([0]);
    const out = await exec({ runner: r, verification: { S: [STEP] } }).run(scenario("S"));
    expect(out.receipts).toHaveLength(1);
    expect(out.receipts[0]?.kind).toBe("native");
  });

  it("명령이 실패하면 영수증이 없다 — 돌렸다는 사실이 증거가 아니다", async () => {
    const r = runner([1]);
    const out = await exec({ runner: r, verification: { S: [STEP] } }).run(scenario("S"));
    expect(r.calls, "명령은 실제로 돌았다").toHaveLength(1);
    expect(out.receipts, "실패했는데 증거가 생겼다").toHaveLength(0);
  });

  it("여러 수단 중 통과한 것만 증거가 된다", async () => {
    const r = runner([0, 1]);
    const out = await exec({
      runner: r,
      verification: { S: [STEP, { ...STEP, kind: "browser", args: ["playwright", "test", "y"], cases: ["샘플 케이스"] }] },
    }).run(scenario("S"));
    expect(out.receipts.map((x) => x.kind)).toEqual(["native"]);
  });
});

describe("확인 수단이 없으면 없다고 말한다", () => {
  it("목록에 없는 시나리오는 영수증이 하나도 없다", async () => {
    const r = runner([0]);
    const out = await exec({ runner: r, verification: {} }).run(scenario("없는것"));
    expect(out.receipts).toEqual([]);
    expect(r.calls, "확인 수단이 없는데 뭔가를 돌렸다").toEqual([]);
  });

  it("아무도 완료라고 안 했으면 미주장으로 거절된다", async () => {
    // 도메인 규칙: 완료 주장이 없으면 증거 축은 아예 보지 않는다(unclaimed).
    // 증거 없음은 "완료라고 적혀 있는데 증거가 없을 때" 나오는 사유다.
    const s = scenario("없는것");
    const out = await exec({ runner: runner([0]), verification: {} }).run(s);
    const verdict = judge({
      scenario: s,
      receipts: out.receipts,
      claim: out.claim,
      baseline: { testCount: 0 },
      currentTestCount: out.testCount,
      safety: out.safety,
      trace: out.trace,
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reasons).toContain("unclaimed");
  });

  it("완료라고 적혀 있는데 확인 수단이 없으면 증거 없음으로 거절된다", async () => {
    const s = scenario("S");
    const out = await exec({
      runner: runner([0]),
      verification: {},
      requirementsMarkdown: "| FR-X | 뭐 | S | 검증 | Done |",
    }).run(s);
    const verdict = judge({
      scenario: s,
      receipts: out.receipts,
      claim: out.claim,
      baseline: { testCount: 0 },
      currentTestCount: out.testCount,
      safety: out.safety,
      trace: out.trace,
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reasons).toContain("no-evidence");
    expect(verdict.reasons).toContain("false-completion");
  });
});

describe("등급을 실제보다 높여 적지 않는다", () => {
  it("Playwright 단계는 browser 등급이다 — IPC 가 대역이므로 native 가 아니다", () => {
    for (const steps of Object.values(VERIFICATION)) {
      for (const step of steps) {
        if (step.args.includes("playwright")) expect(step.kind).toBe("browser");
        if (step.args.includes("wdio")) expect(step.kind).toBe("native");
      }
    }
  });

  it("native 를 자처하는 vitest 단계는 건너뛸 수 없어야 한다", () => {
    // 등급은 어떤 실행기로 띄우느냐가 아니라 무엇을 실제로 건드리느냐로 정해진다.
    // vitest 로 살아 있는 Herdr 을 조회하는 단계는 native 가 맞다. 다만 그런 단계가
    // 환경이 없을 때 건너뛰면 통과로 보이고, 그건 거짓 증거다 — 그 경로를 막는다.
    const root = resolve(__dirname, "..", "..");
    for (const [id, steps] of Object.entries(VERIFICATION)) {
      for (const step of steps) {
        if (step.kind !== "native" || !step.args.includes("vitest")) continue;
        const spec = step.args[step.args.length - 1] as string;
        const body = readFileSync(resolve(root, step.cwd, spec), "utf8");
        expect(body, `${id} 의 native 단계(${spec})가 건너뛸 수 있다`).not.toContain("skipIf");
      }
    }
  });

  it("mock 등급이 아닌 단계가 하나 이상이다 — 전부 결정론이면 벤치가 무의미하다", () => {
    const kinds = Object.values(VERIFICATION).flat().map((s) => s.kind);
    expect(kinds.filter((k) => k !== "mock").length).toBeGreaterThan(0);
  });

  it("native 를 요구하는 시나리오가 browser 증거만으로 통과하지 못한다", async () => {
    const s = scenario("S", { requiredEvidence: ["native"] });
    const out = await exec({
      runner: runner([0]),
      verification: { S: [{ ...STEP, kind: "browser", args: ["playwright", "test", "y"], cases: ["샘플 케이스"] }] },
      requirementsMarkdown: "| FR-X | 뭐 | S | t | Done |",
    }).run(s);
    const verdict = judge({
      scenario: s,
      receipts: out.receipts,
      claim: out.claim,
      baseline: { testCount: 0 },
      currentTestCount: out.testCount,
      safety: out.safety,
      trace: out.trace,
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reasons).toContain("false-completion");
  });
});

describe("완료 주장은 실행부가 만들지 않는다", () => {
  it("요구사항 문서가 Done 이라고 적으면 그것이 주장이다", () => {
    const claim = readClaim("| FR-A | 설명 | UC-X | 검증 | Done |", scenario("UC-X"));
    expect(claim?.claimedComplete).toBe(true);
  });

  it("한 행이라도 Pending 이면 완료 주장이 아니다", () => {
    const claim = readClaim(
      "| FR-A | 설명 | UC-X | 검증 | Done |\n| FR-B | 설명 | UC-X | 검증 | Pending |",
      scenario("UC-X"),
    );
    expect(claim?.claimedComplete).toBe(false);
  });

  it("문서에 행이 없으면 주장 자체가 없다 — 실행부가 대신 주장하지 않는다", () => {
    expect(readClaim("| FR-A | 설명 | UC-다른것 | 검증 | Done |", scenario("UC-X"))).toBeUndefined();
  });
});

describe("실행 파일 허용 목록", () => {
  it("목록 밖 실행 파일은 돌리지 않고 무단 효과로 남는다", async () => {
    const r = runner([0]);
    const out = await exec({
      runner: r,
      verification: { S: [{ ...STEP, cmd: "rm" }] },
    }).run(scenario("S"));
    expect(r.calls, "허용 목록 밖인데 실행됐다").toEqual([]);
    // 안전 관측에는 잔재 감사 결과도 함께 실린다 — 개수가 아니라 이 사건이 실렸는지를 본다.
    expect(out.safety.unauthorizedEffects.join(" ")).toContain("rm");
  });

  it("목록이 비어 있지 않다 — 공허하게 통과하지 않게", () => {
    expect(ALLOWED_EXECUTABLES.length).toBeGreaterThan(0);
  });
});

describe("테스트 수 읽기", () => {
  it("vitest 출력에서 읽는다", () => {
    expect(parseTestCount("      Tests  835 passed (835)")).toBe(835);
  });

  it("실패가 섞인 vitest 출력에서도 통과 수를 읽는다", () => {
    expect(parseTestCount("      Tests  12 failed | 1697 passed | 21 skipped (1730)")).toBe(1697);
  });

  it("playwright 출력에서 읽는다", () => {
    expect(parseTestCount("  6 passed (10.9s)")).toBe(6);
  });

  it("mocha(e2e-tauri) 출력에서 읽는다", () => {
    expect(parseTestCount("[wry] 16 passing (660ms)")).toBe(16);
  });

  it("못 읽으면 0 — 지어내지 않는다", () => {
    expect(parseTestCount("아무 말")).toBe(0);
  });
});

describe("확인 수단 목록이 시나리오와 어긋나지 않는다", () => {
  const scenarios = parseScenarios(markdown);

  it("목록의 모든 항목이 실제 시나리오다 — 죽은 항목이 없다", () => {
    const ids = new Set(scenarios.map((s) => s.id));
    expect(Object.keys(VERIFICATION).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("에픽 시나리오를 실제로 읽어 왔다", () => {
    expect(allHeadings(markdown).filter(ownedByEpic).length).toBeGreaterThan(10);
  });

  it("확인 수단이 붙은 시나리오가 하나 이상이다 — 전부 미검증이면 벤치가 무의미하다", () => {
    expect(Object.keys(VERIFICATION).length).toBeGreaterThan(0);
  });

  it("모든 단계가 가리키는 파일이 실제로 있다", () => {
    // 시나리오 id 만 검사하면 명령이 없는 파일을 가리켜도 통과한다. 실제로 그랬다 —
    // 첫 실행에서 workspace-context.contract.test.ts 를 가리켰는데 그런 파일이 없었고,
    // 벤치는 "확인 수단이 실패했다"고만 말해 원인이 안 보였다(2026-08-26).
    const root = resolve(__dirname, "..", "..");
    const missing: string[] = [];
    for (const [id, steps] of Object.entries(VERIFICATION)) {
      for (const step of steps) {
        const spec = step.args[step.args.length - 1] as string;
        if (!spec.includes("/")) continue; // 파일 경로가 아닌 인자는 건너뛴다
        if (!existsSync(resolve(root, step.cwd, spec))) missing.push(`${id} → ${step.cwd}/${spec}`);
      }
    }
    expect(missing, "확인 수단이 없는 파일을 가리킨다").toEqual([]);
  });

  it("실 백엔드 단계는 필요한 환경을 스스로 갖춘다", () => {
    // 주변 환경에 기대면 "내 셸에서는 되는데" 가 되어 아무도 재현하지 못한다.
    for (const steps of Object.values(VERIFICATION)) {
      for (const step of steps) {
        if (step.kind === "native") {
          expect(step.env, "native 단계인데 환경을 스스로 갖추지 않는다").toBeDefined();
        }
      }
    }
  });

  it("모든 단계가 이유를 적었다", () => {
    for (const steps of Object.values(VERIFICATION)) {
      for (const step of steps) expect(step.why.length).toBeGreaterThan(5);
    }
  });
});

describe("문서와 하네스가 어긋나면 드러난다", () => {
  const scenarios = parseScenarios(markdown);

  it("문서가 선언한 확인 수단 파일이 전부 실제로 있다", () => {
    // 문서 표가 썩어도 벤치는 "확인 수단이 없다"로만 보고한다 — 구현이 없는 것과
    // 표가 낡은 것은 완전히 다른 상태인데 구분이 안 된다. 여기서 표 쪽을 잡는다.
    expect(MISSING_SPECS, "문서가 없는 파일을 확인 수단으로 선언한다").toEqual([]);
  });

  it("확인 수단이 하나도 없는 시나리오를 이름으로 안다", () => {
    // 없는 것 자체는 사실일 수 있다. 다만 몇 개인지가 아니라 무엇인지 알아야 한다.
    const orphans = scenarios.filter((sc) => (VERIFICATION[sc.id] ?? []).length === 0).map((sc) => sc.id);
    // 확인 수단 없는 시나리오는 유예로 *이름을 걸어* 선언한 것만 허용한다.
    // 조용히 비어 있는 것과 "왜 아직 안 됐는지 적어 둔 것"은 다르다.
    expect(orphans.sort(), `확인 수단 없는 시나리오: ${orphans.join(", ")}`).toEqual(
      Object.keys(DEFERRED_SCENARIOS).sort(),
    );
  });

  it("유예 선언에 사유가 적혀 있다 — 이름만 걸어 두고 넘어가지 않는다", () => {
    for (const [id, reason] of Object.entries(DEFERRED_SCENARIOS)) {
      expect(reason.length, `${id} 에 사유가 없다`).toBeGreaterThan(20);
    }
  });

  it("문서에서 실제로 수단을 읽어 왔다 — 손으로 적은 것만 있는 게 아니다", () => {
    const fromDoc = Object.values(VERIFICATION)
      .flat()
      .filter((step) => step.why.includes("Test Coverage Map"));
    expect(fromDoc.length).toBeGreaterThan(15);
  });
});

describe("모든 단계가 시나리오 케이스를 지목한다", () => {
  it("케이스 선택자가 없는 단계가 없다", () => {
    // 선택자가 없으면 파일 안의 무관한 테스트로 시나리오가 증명된다.
    const naked: string[] = [];
    for (const [id, steps] of Object.entries(VERIFICATION)) {
      for (const step of steps) {
        if ((!step.cases || step.cases.length === 0) && (!step.anyCases || step.anyCases.length === 0)) {
          naked.push(`${id} → ${step.cwd}/${step.args[step.args.length - 1]}`);
        }
      }
    }
    expect(naked, `케이스 선택자 없는 단계: ${naked.join(" | ")}`).toEqual([]);
  });
});
