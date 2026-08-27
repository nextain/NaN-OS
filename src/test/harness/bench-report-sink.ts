// harness/bench-report-sink — #498 보고 보관 (BenchReportSinkPort 구현). node 전용.
//
// 벤치의 쓸모는 통과 개수가 아니라 "무엇이 아직 증명되지 않았고 왜인가"다.
// 그래서 거절 사유를 요약하지 않고 시나리오별로 그대로 적는다.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { BenchSummary, RejectionCode, Verdict } from "../../main/domain/agent-bench.js";
import type { BenchReportSinkPort } from "../../main/ports/agent-bench.js";

/** 거절 사유를 사람 말로. 코드만 적으면 보고서를 읽어도 뭘 해야 할지 모른다. */
export const REASON_TEXT: Readonly<Record<RejectionCode, string>> = {
  "no-evidence": "확인 수단이 아예 없다 — 이 시나리오를 검증하는 것이 하나도 없다",
  "mock-only": "대역으로만 통과했다 — 실제 환경을 요구하는데 결정론 증거뿐이다",
  "missing-required-evidence": "요구된 등급의 증거가 빠졌다",
  unclaimed: "요구사항 문서가 아직 완료라고 말하지 않는다",
  "false-completion": "완료라고 적혀 있는데 요구된 증거가 없다",
  "suite-shrunk": "테스트 수가 기준선보다 줄었다",
  "context-leak": "다른 프로젝트 정보가 답변 근거에 섞였다",
  "unauthorized-effect": "승인 없이 외부 효과가 나갔다",
  "incomplete-trace": "추적 기록의 여섯 축 중 빈 것이 있다",
};

/**
 * "확인은 통과했는데 문서가 아직 완료라 안 했다"와 "확인 수단이 아예 없다"는 완전히 다른 상태다.
 * 둘 다 unclaimed 로 뭉뚱그리면 보고서를 읽고도 무엇을 해야 할지 모른다.
 */
function actionOf(v: Verdict): string {
  if (v.reasons.includes("no-evidence")) return "확인 수단부터 만들어야 한다";
  if (v.reasons.includes("incomplete-trace") && v.reasons.includes("unclaimed")) {
    return "확인 수단이 실패했거나 아직 없다";
  }
  if (v.reasons.includes("mock-only") || v.reasons.includes("missing-required-evidence")) {
    return "요구 등급의 확인을 더해야 한다";
  }
  // 완료 주장이 없으면 판정기는 증거 축을 아예 보지 않는다 — 그래서 "증거가 충분하다"고
  // 말할 근거가 없다. 여기서 단정하면 보고서가 실제보다 낙관적으로 읽힌다.
  if (v.reasons.includes("unclaimed")) {
    return "요구사항 상태를 Done 으로 올려야 증거 충분 여부가 판정된다";
  }
  return "위 사유를 해소해야 한다";
}

export function renderReport(summary: BenchSummary, verdicts: readonly Verdict[], generatedAt: string): string {
  const accepted = verdicts.filter((v) => v.accepted);
  const rejected = verdicts.filter((v) => !v.accepted);
  const lines: string[] = [
    "# 에이전트 벤치 결과",
    "",
    `생성 시각: ${generatedAt}`,
    "",
    `시나리오 ${summary.runs}개 중 ${summary.accepted}개 수용 (${Math.round(summary.successRate * 100)}%).`,
    `중앙 지연 ${summary.medianLatencyMs}ms · 꼬리 지연(95분위) ${summary.tailLatencyMs}ms · 사람 개입 ${summary.totalInterventions}회.`,
    "",
    "## 수용된 시나리오",
    "",
  ];
  if (accepted.length === 0) lines.push("없다.", "");
  else {
    for (const v of accepted) lines.push(`- ${v.scenarioId}`);
    lines.push("");
  }
  lines.push(
    "## 이 보고서가 말하지 않는 것",
    "",
    "수용(accepted)은 \"선언한 시나리오가 요구한 등급의 증거를 실제로 모았다\"는 뜻이다.",
    "다음은 이 수치가 보장하지 않는다.",
    "",
    "- 요구사항 문서의 모든 FR 이 어떤 테스트 이름에도 달려 있지는 않다. 이름이 달린 것은",
    "  실제로 돌았는지 확인하지만, 아예 이름이 없는 FR 은 추적 자체가 없다.",
    "- 시나리오와 요구 등급을 정한 것은 작성자다. 등급이 적절한지는 이 수치가 답하지 않는다.",
    "- 실환경 증거는 그 실행이 무엇을 만졌는지 남긴 증명서로 판정한다. 증명서가 사실인지는",
    "  그 테스트가 정직한지에 달려 있다.",
    "",
    "## 아직 증명되지 않은 시나리오",
    "",
  );
  if (rejected.length === 0) lines.push("없다.", "");
  else {
    lines.push("| 시나리오 | 왜 | 다음 할 일 |", "|---|---|---|");
    for (const v of rejected) {
      const why = v.reasons.map((r) => REASON_TEXT[r] ?? r).join(" / ");
      lines.push(`| ${v.scenarioId} | ${why} | ${actionOf(v)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * 보고서에 찍힌 판본이 지금 저장소의 HEAD 와 다르면, 그 보고서는 지금 상태의 증거가 아니다.
 * 앞서 34/34 보고서가 한 커밋 이전 판본으로 찍혀 있었다(2026-08-27 적대리뷰 지적).
 */
export function assertReportMatchesHead(report: string, head: string): void {
  if (!report.includes(head)) {
    throw new Error(`보고서가 현재 HEAD(${head}) 의 것이 아니다 — 다시 돌려야 한다`);
  }
}

/**
 * 보고서 판본이 지금 HEAD 가 아니어도, 그 사이 바뀐 것이 벤치 산출물뿐이면 여전히 이 상태의
 * 증거다. 벤치는 커밋 뒤에 돌려야 판본이 맞는데 그 결과물을 다시 커밋해야 하므로 한 칸이
 * 어긋난다 — 그 한 칸을 정확히 허용하고, 그 밖이 바뀌었으면 거절한다
 * (2026-08-27 5차 적대리뷰가 이 어긋남을 지적했다).
 */
export function assertReportCurrent(
  report: string,
  head: string,
  changedSince: (revision: string) => readonly string[],
): void {
  const stamped = /\(([0-9a-f]{7,40})\)/.exec(report)?.[1];
  if (!stamped) throw new Error("보고서에 판본이 찍혀 있지 않다");
  if (stamped === head) return;
  const outside = changedSince(stamped).filter((f) => !f.startsWith("benchmark/"));
  if (outside.length > 0) {
    throw new Error(
      `보고서는 ${stamped} 의 것인데 그 뒤로 벤치 산출물 밖이 바뀌었다: ${outside.slice(0, 5).join(", ")}`,
    );
  }
}

export class FileBenchReportSink implements BenchReportSinkPort {
  constructor(
    private readonly path: string,
    private readonly now: () => string,
    /** 원시 실행 영수증. 사람이 읽는 보고서만으로는 독립 확인이 안 된다. */
    private readonly rawPath?: string,
    private readonly raw?: () => unknown,
  ) {}

  async publish(summary: BenchSummary, verdicts: readonly Verdict[]): Promise<void> {
    const target = resolve(this.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderReport(summary, verdicts, this.now()), "utf8");
    if (this.rawPath && this.raw) {
      // 보고서가 요약만 남기면 저장소만 보고는 실제로 무엇이 돌았는지 알 수 없다
      // (2026-08-27 4차 적대리뷰 지적). 시나리오별 영수증·흔적을 그대로 남긴다.
      const rawTarget = resolve(this.rawPath);
      mkdirSync(dirname(rawTarget), { recursive: true });
      writeFileSync(rawTarget, `${JSON.stringify(this.raw(), null, 2)}\n`, "utf8");
    }
  }
}
