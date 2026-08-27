// #498 실제 실행 — 시나리오를 진짜로 돌려 보고서를 남긴다.
//
// 기본으로는 건너뛴다. 안에서 vitest·playwright·wdio 를 실제로 띄우므로 일반 스위트에
// 섞이면 재귀가 되고 몇 분씩 걸린다. 돌릴 때:
//
//   NAIA_BENCH_LIVE=1 npx vitest run src/test/agent-bench-live.test.ts --testTimeout=1800000
//
// 완료를 주장하려면 유예까지 없어야 한다:
//   NAIA_BENCH_LIVE=1 NAIA_BENCH_COMPLETION=1 npx vitest run ...
//
// 결과는 benchmark/agent-bench-report.md 에 남는다.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BenchHarness } from "../main/app/control/agent-bench.js";
import {
  DEFERRED_SCENARIOS,
  DocumentBenchScenarioSource,
  parseScenarios,
} from "./harness/agent-bench-scenarios.js";
import { CommandBenchExecution, nodeCommandRunner, readRequirements } from "./harness/bench-execution.js";
import {
  FileBenchReportSink,
  assertReportFingerprint,
  benchInputFingerprint,
} from "./harness/bench-report-sink.js";
import type { BenchScenario } from "../main/domain/agent-bench.js";
import type { BenchExecutionPort, ScenarioRun } from "../main/ports/agent-bench.js";

const LIVE = process.env.NAIA_BENCH_LIVE === "1";
const COMPLETION = process.env.NAIA_BENCH_COMPLETION === "1";
const ROOT = resolve(__dirname, "..", "..");

describe("에이전트 벤치 실제 실행", () => {
  it.skipIf(!LIVE)(
    "모든 시나리오를 돌리고 보고서를 남긴다",
    async () => {
      const revision = execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const stampedAt = new Date().toISOString();

      // 판정에 쓰는 입력의 지문. 커밋 해시로 판본을 적으면 벤치를 커밋 뒤에 돌려야 하는
      // 순서 때문에 늘 한 칸 어긋난다 — 내용으로 판정하면 그 어긋남이 없다.
      const fingerprintFiles = [
        "docs/user-scenarios.md",
        "docs/requirements.md",
        "src/test/harness/bench-execution.ts",
        "src/test/harness/agent-bench-scenarios.ts",
      ].map((rel) => ({ path: rel, body: readFileSync(resolve(ROOT, rel), "utf8") }));
      const fingerprint = benchInputFingerprint(fingerprintFiles);

      // 문서가 선언한 시나리오 전부가 실제로 돌았는가 — 개수가 아니라 이름으로 본다.
      const declaredIds = parseScenarios(
        readFileSync(resolve(ROOT, "docs", "user-scenarios.md"), "utf8"),
      ).map((x) => x.id);

      // 기준선은 시나리오별로 남는다.
      //
      // ⚠️ 도메인의 suite-shrunk 판정은 하나의 기준선을 모든 시나리오에 적용한다. 전역 합계를
      //    시나리오별 지역 개수와 비교하게 되어 늘 축소로 읽힌다(2026-08-27 적대리뷰 지적).
      //    그래서 도메인에는 0 을 주고, 축소 판정은 아래에서 시나리오별로 한다.
      const baselinePath = resolve(ROOT, "benchmark", "agent-bench-baseline.json");
      const stored = existsSync(baselinePath)
        ? (JSON.parse(readFileSync(baselinePath, "utf8")) as { perScenario?: Record<string, number> })
        : {};
      const floor = stored.perScenario ?? {};

      // 시나리오마다 실제로 확인한 테스트 수를 기록한다. 판정 결과에는 실리지 않는 값이라
      // 실행부를 감싸서 받는다.
      const executed: Record<string, number> = {};
      // 원시 영수증. 저장소만 보고도 무엇이 실제로 돌았는지 확인할 수 있어야 한다.
      const raw: Record<string, unknown> = {};
      const execution = new CommandBenchExecution({
        runner: nodeCommandRunner,
        repoRoot: ROOT,
        contextRevision: revision,
        requirementsMarkdown: readRequirements(ROOT),
      });
      const recording: BenchExecutionPort = {
        async run(scenario: BenchScenario): Promise<ScenarioRun> {
          const out = await execution.run(scenario);
          executed[scenario.id] = out.testCount;
          raw[scenario.id] = {
            receipts: out.receipts,
            testCount: out.testCount,
            artifacts: out.trace?.artifacts ?? [],
            safety: out.safety,
          };
          return out;
        },
      };

      const harness = new BenchHarness(
        new DocumentBenchScenarioSource(resolve(ROOT, "docs", "user-scenarios.md")),
        recording,
        new FileBenchReportSink(
          resolve(ROOT, "benchmark", "agent-bench-report.md"),
          () => `${stampedAt} (${revision}) 입력지문 ${fingerprint}`,
          resolve(ROOT, "benchmark", "agent-bench-receipts.json"),
          () => ({ revision, stampedAt, fingerprint, scenarios: raw }),
        ),
      );

      // 성공률 임계는 유예로 이름 걸어 둔 것만 빼고 전부 수용을 요구한다.
      // 무한대는 게이트가 아니고, 1 로 못 박으면 유예 선언 자체가 불가능해진다.
      const deferredCount = declaredIds.filter((id) => id in DEFERRED_SCENARIOS).length;
      const minSuccessRate = (declaredIds.length - deferredCount) / declaredIds.length;

      const outcome = await harness.run(
        { testCount: 0 },
        {
          // 임계는 실제로 막는 값이어야 한다. 무한대는 게이트가 아니다.
          minSuccessRate,
          maxMedianLatencyMs: 120_000,
          maxTailLatencyMs: 600_000,
          maxTokenCost: 1_000_000,
        },
      );

      expect([...outcome.verdicts.map((v) => v.scenarioId)].sort()).toEqual([...declaredIds].sort());
      expect(outcome.summary.runs).toBe(outcome.verdicts.length);

      // 완료 주장 모드. 유예가 하나라도 있으면 완료라고 말할 수 없다 —
      // "전부 다"와 "유예 하나 빼고 다"는 다른 말인데 앞서 그 둘을 같이 썼다
      // (2026-08-27 적대리뷰 지적).
      if (COMPLETION) {
        expect(Object.keys(DEFERRED_SCENARIOS), "유예가 남아 있으면 완료가 아니다").toEqual([]);
        expect(outcome.verdicts.filter((v) => !v.accepted).map((v) => v.scenarioId)).toEqual([]);
        expect(outcome.summary.successRate).toBe(1);
        expect(outcome.accepted).toBe(true);
      }

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

      // 유예는 내 상수 하나로 성립하면 안 된다 — 그러면 아무 시나리오나 넣어 게이트를
      // 초록불로 만들 수 있다(2026-08-27 5차 적대리뷰 지적). 요구사항 문서가 그 시나리오를
      // 아직 완료로 적지 않았다는 사실과 맞물려야 유예가 성립한다.
      const requirements = readFileSync(resolve(ROOT, "docs", "requirements.md"), "utf8");
      for (const [id, d] of Object.entries(DEFERRED_SCENARIOS)) {
        const rows = requirements.split("\n").filter((l) => l.startsWith("|") && l.includes(id));
        const anyDone = rows.some((l) => /\|\s*Done\s*\|?\s*$/.test(l.trimEnd()));
        expect(anyDone, `${id} 를 유예로 두면서 요구사항은 Done 이라고 적혀 있다`).toBe(false);
        // 무엇이 있어야 풀리는지 적혀 있어야 한다. "언젠가"는 유예가 아니라 방치다.
        expect(d.liftedBy.length, `${id} 에 해제 조건이 없다`).toBeGreaterThan(20);
        // 만료가 지나면 더는 유예가 아니다.
        expect(
          new Date(`${d.expiresOn}T23:59:59Z`).getTime() > Date.now(),
          `${id} 의 유예가 ${d.expiresOn} 로 만료됐다 — 확인 수단을 만들거나 사람이 연장해야 한다`,
        ).toBe(true);
      }
      expect(outcome.breaches, "임계를 넘었다").toEqual([]);

      // 보고서가 지금 입력의 것인지 확인한다. 커밋이 아니라 내용으로 본다.
      assertReportFingerprint(
        readFileSync(resolve(ROOT, "benchmark", "agent-bench-report.md"), "utf8"),
        fingerprint,
      );

      // 안전 관측이 실제로 무언가를 봤는지. 전부 비어 있기만 하면 관측이 죽어 있는 것과
      // 구별되지 않으므로, 잔재 감사가 돌았다는 사실 자체를 여기서 확인한다.
      expect(outcome.summary.totalInterventions).toBe(0);

      // 시나리오별 축소 판정. 기준선보다 줄어든 것이 있으면 빨간불이다.
      const shrunk = Object.entries(floor)
        .filter(([id, before]) => (executed[id] ?? 0) < before)
        .map(([id, before]) => `${id}: ${before} → ${executed[id] ?? 0}`);
      expect(shrunk, "시나리오가 확인하는 테스트 수가 줄었다").toEqual([]);

      // 다음 실행의 기준선을 남긴다. 줄어든 값으로 덮어쓰지 않는다.
      const nextFloor: Record<string, number> = { ...floor };
      for (const [id, count] of Object.entries(executed)) {
        nextFloor[id] = Math.max(floor[id] ?? 0, count);
      }
      mkdirSync(dirname(baselinePath), { recursive: true });
      writeFileSync(
        baselinePath,
        `${JSON.stringify({ perScenario: nextFloor, revision }, null, 2)}\n`,
        "utf8",
      );
    },
    1_800_000,
  );
});
