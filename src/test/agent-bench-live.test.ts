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
import { DocumentBenchScenarioSource } from "./harness/agent-bench-scenarios.js";
import { CommandBenchExecution, nodeCommandRunner, readRequirements } from "./harness/bench-execution.js";
import { FileBenchReportSink } from "./harness/bench-report-sink.js";

const LIVE = process.env.NAIA_BENCH_LIVE === "1";
const ROOT = resolve(__dirname, "..", "..");

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

      const outcome = await harness.run({ testCount: 0 }, {
        // 첫 실행은 기준선을 만드는 자리다. 임계로 막지 않고 사실만 남긴다.
        minSuccessRate: 0,
        maxMedianLatencyMs: Number.MAX_SAFE_INTEGER,
        maxTailLatencyMs: Number.MAX_SAFE_INTEGER,
        maxTokenCost: Number.MAX_SAFE_INTEGER,
      });

      // 이 테스트가 확인하는 것은 "합격했나"가 아니라 "실제로 돌아 결과를 냈나"다.
      // 합격 여부는 보고서가 말한다 — 지금 대부분이 미검증인 것이 사실이고, 그 사실을
      // 초록불로 덮으면 벤치를 만든 이유가 없어진다.
      expect(outcome.verdicts.length).toBeGreaterThan(10);
      expect(outcome.summary.runs).toBe(outcome.verdicts.length);
      // 한 시나리오라도 실제 증거를 모았어야 한다 — 전부 0이면 실행부가 안 돈 것이다.
      expect(outcome.verdicts.some((v) => v.accepted || v.reasons.length > 0)).toBe(true);
    },
    1_800_000,
  );
});
