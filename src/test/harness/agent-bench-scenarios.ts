// adapters/agent-bench-scenarios — #498 시나리오 출처. 형제 이슈의 UC 를 문서에서 읽어 온다.
// 하네스가 판정해야 할 목록을 코드에 손으로 적으면, UC 를 추가하고 시나리오를 빠뜨려도 아무도 모른다.
// 그래서 docs/user-scenarios.md 를 직접 읽는다 — 문서와 하네스가 어긋나면 테스트가 깨진다.
import { readFile } from "node:fs/promises";
import type { BenchScenario, EvidenceKind, GateKind } from "../../main/domain/agent-bench.js";
import type { BenchScenarioSourcePort } from "../../main/ports/agent-bench.js";

/** 에픽 #497 자식들이 쓰는 UC 접두사와 각 계열이 요구하는 증거. */
const FAMILIES: readonly {
  readonly prefix: string;
  readonly gate: GateKind;
  readonly requiredEvidence: readonly EvidenceKind[];
}[] = [
  // 컨텍스트 해석은 파일 시스템만 있으면 밟을 수 있다.
  { prefix: "UC-WORKSPACE-CONTEXT-", gate: "protocol", requiredEvidence: ["mock", "native"] },
  // 제어면은 실제 Herdr 없이는 밟았다고 할 수 없다.
  { prefix: "UC-HERDR-CONTROL-", gate: "native", requiredEvidence: ["native"] },
  // 환경 도구는 실제 브라우저와 실제 터미널을 모두 거쳐야 한다.
  { prefix: "UC-ENV-TOOL-", gate: "native", requiredEvidence: ["browser", "native"] },
  // 오케스트레이션은 실제 코딩 작업자가 돌아야 한다.
  { prefix: "UC-ORCHESTRATION-", gate: "integration", requiredEvidence: ["worker", "native"] },
  // 채널 연속성은 실제 런타임 재시작을 거쳐야 한다.
  { prefix: "UC-CHANNEL-SESSION-", gate: "integration", requiredEvidence: ["native"] },
  // 하네스 자신의 시나리오는 결정론으로 충분하다.
  { prefix: "UC-AGENT-BENCH-", gate: "safety", requiredEvidence: ["mock"] },
];

const HEADING = /^###\s+(UC-[A-Z0-9-]+)/gm;

export function familyOf(uc: string): (typeof FAMILIES)[number] | undefined {
  return FAMILIES.find((f) => uc.startsWith(f.prefix));
}

export function parseScenarios(markdown: string): readonly BenchScenario[] {
  const out: BenchScenario[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(HEADING)) {
    const uc = (match[1] ?? "").replace(/[—-]+$/, "").trim();
    const family = familyOf(uc);
    if (!family || seen.has(uc)) continue;
    seen.add(uc);
    out.push({ id: uc, uc, gate: family.gate, requiredEvidence: family.requiredEvidence });
  }
  return out;
}

/** 에픽의 UC 계열 목록. 시나리오가 하나도 없는 계열을 잡아내는 데 쓴다. */
export function declaredFamilies(): readonly string[] {
  return FAMILIES.map((f) => f.prefix);
}

export class DocumentBenchScenarioSource implements BenchScenarioSourcePort {
  constructor(private readonly path: string) {}

  async list(): Promise<readonly BenchScenario[]> {
    return parseScenarios(await readFile(this.path, "utf8"));
  }
}
