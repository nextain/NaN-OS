// #498 실제 실행 — 시나리오를 진짜로 돌려 보고서를 남긴다.
//
// 기본으로는 건너뛴다. 안에서 vitest·playwright·wdio 를 실제로 띄우므로 일반 스위트에
// 섞이면 재귀가 되고 몇 분씩 걸린다. 돌릴 때:
//
//   NAIA_BENCH_LIVE=1 npx vitest run src/test/agent-bench-live.test.ts --testTimeout=1800000
//
// 결과는 benchmark/agent-bench-report.md 에 남는다.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { BenchHarness } from "../main/app/control/agent-bench.js";
import { DEFERRED_SCENARIOS, DocumentBenchScenarioSource, parseScenarios } from "./harness/agent-bench-scenarios.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CommandBenchExecution, nodeCommandRunner, readRequirements } from "./harness/bench-execution.js";
import { FileBenchReportSink, assertReportMatchesHead } from "./harness/bench-report-sink.js";

const LIVE = process.env.NAIA_BENCH_LIVE === "1";
const ROOT = resolve(__dirname, "..", "..");

/** 이번 실행에서 실제로 돈 테스트 수. 시나리오마다 실행부가 세어 둔 값을 합친다. */
function totalTests(outcome: { readonly verdicts: readonly { readonly scenarioId: string }[] }): number {
  // 판정 결과에는 테스트 수가 실리지 않는다. 기준선은 시나리오 수로 대신한다 —
  // 시나리오가 줄면 그 자체로 축소이고, 그것이 여기서 막으려는 것이다.
  return outcome.verdicts.length;
}

describe("에이전트 벤치 실제 실행", () => {
  it.skipIf(!LIVE)(
    "모든 시나리오를 돌리고 보고서를 남긴다",
    async () => {
      const revision = execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const stampedAt = new Date().toISOString();

      const harness = new BenchHarness(
        new DocumentBenchScenarioSource(resolve(ROOT, "docs", "user-scenarios.md")),
        new CommandBenchExecution({
          runner: nodeCommandRunner,
          repoRoot: ROOT,
          contextRevision: revision,
          requirementsMarkdown: readRequirements(ROOT),
        }),
        new FileBenchReportSink(resolve(ROOT, "benchmark", "agent-bench-report.md"), () => `${stampedAt} (${revision})`),
      );

      // 기준선은 파일로 남는다. 0 을 기준선으로 쓰면 축소 suite 판정이 공허해진다
      // (2026-08-27 적대리뷰 지적).
      // 문서가 선언한 시나리오 전부가 실제로 돌았는가 — 개수가 아니라 이름으로 본다.
      const declaredIds = parseScenarios(
        readFileSync(resolve(ROOT, "docs", "user-scenarios.md"), "utf8"),
      ).map((x) => x.id);

      const baselinePath = resolve(ROOT, "benchmark", "agent-bench-baseline.json");
      const baseline = existsSync(baselinePath)
        ? (JSON.parse(readFileSync(baselinePath, "utf8")) as { testCount: number })
        : { testCount: 0 };

      // 성공률 임계는 유예로 이름 걸어 둔 것만 빼고 전부 수용을 요구한다.
      // 무한대는 게이트가 아니고, 1 로 못 박으면 유예 선언 자체가 불가능해진다.
      const deferredCount = declaredIds.filter((id) => id in DEFERRED_SCENARIOS).length;
      const minSuccessRate = (declaredIds.length - deferredCount) / declaredIds.length;

      const outcome = await harness.run(baseline, {
        // 임계는 실제로 막는 값이어야 한다. 무한대는 게이트가 아니다.
        minSuccessRate,
        maxMedianLatencyMs: 120_000,
        maxTailLatencyMs: 600_000,
        maxTokenCost: 1_000_000,
      });

      expect([...outcome.verdicts.map((v) => v.scenarioId)].sort()).toEqual([...declaredIds].sort());
      expect(outcome.summary.runs).toBe(outcome.verdicts.length);

      // 거절된 시나리오가 있으면 이 게이트는 빨간불이어야 한다. 앞서는 "결과가 나왔나"만
      // 보고 있어서 거절이 섞여 있어도 종료 코드가 0 이었다(2026-08-27 적대리뷰 지적).
      // 유예로 이름을 걸어 둔 것 말고 거절이 있으면 빨간불이다.
      const unexpected = outcome.verdicts
        .filter((v) => !v.accepted)
        .filter((v) => !(v.scenarioId in DEFERRED_SCENARIOS));
      expect(
        unexpected.map((v) => `${v.scenarioId}: ${v.reasons.join(",")}`),
        "유예로 선언하지 않은 시나리오가 증명되지 않았다",
      ).toEqual([]);
      // 유예 목록이 조용히 자라지 않게 한다.
      expect(Object.keys(DEFERRED_SCENARIOS).length).toBeLessThanOrEqual(1);
      expect(outcome.breaches, "임계를 넘었다").toEqual([]);

      // 보고서가 지금 HEAD 의 것인지 확인한다 — 옛 판본 보고서는 증거가 아니다.
      assertReportMatchesHead(
        readFileSync(resolve(ROOT, "benchmark", "agent-bench-report.md"), "utf8"),
        revision,
      );

      // 다음 실행의 기준선을 남긴다 — 줄어들면 다음 번에 잡힌다.
      const observedTests = outcome.verdicts.length > 0 ? totalTests(outcome) : 0;
      mkdirSync(dirname(baselinePath), { recursive: true });
      writeFileSync(
        baselinePath,
        `${JSON.stringify({ testCount: Math.max(baseline.testCount, observedTests), revision }, null, 2)}\n`,
        "utf8",
      );
    },
    1_800_000,
  );
});
