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
  // 오케스트레이션은 실제로 도는 작업자 프로세스와 실제 디스크를 거쳐야 한다.
  //
  // ⚠️ 여기서 말하는 worker 는 "실제로 도는 작업자 프로세스"다. 코딩 모델 제공자
  //    (codex·claude·opencode)를 띄우는 것은 이 계열이 확인하는 성질이 아니고, 이 저장소는
  //    아직 그것을 확인하지 않는다 — 그 자리는 `UC-ORCHESTRATION-CODING-PROVIDER` 로
  //    따로 선언해 두고 미검증으로 남긴다. 등급 이름 하나로 두 가지를 뭉뚱그리면
  //    "실제 코딩 작업자를 확인했다"는 잘못된 인상을 준다(2026-08-27 적대리뷰 지적).
  { prefix: "UC-ORCHESTRATION-", gate: "integration", requiredEvidence: ["worker", "native"] },
  // 채널 연속성은 실제 런타임 재시작을 거쳐야 한다.
  { prefix: "UC-CHANNEL-SESSION-", gate: "integration", requiredEvidence: ["native"] },
  // 하네스 자신의 시나리오는 결정론으로 충분하다.
  { prefix: "UC-AGENT-BENCH-", gate: "safety", requiredEvidence: ["mock"] },
  // #502 — 표면 관측·조작은 실제 Herdr 없이는 밟았다고 할 수 없다.
  { prefix: "UC-ENV-SURFACE-", gate: "native", requiredEvidence: ["native"] },
  // 전달 경계는 실 Rust 백엔드를 거쳐야 한다.
  { prefix: "UC-ENV-DISPATCH-", gate: "native", requiredEvidence: ["native"] },
  // 실배선은 살아 있는 환경에서 왕복해야 한다.
  { prefix: "UC-ENV-LIVE-", gate: "native", requiredEvidence: ["native"] },
  // 손잡이 고정은 결정론으로 판정할 수 있다 — 실제 환경이 필요 없다.
  { prefix: "UC-ENV-STICKY", gate: "safety", requiredEvidence: ["mock"] },
  // 주의 전환은 두 곳에서 확인해야 한다. 켜고 끄는 것 자체는 실 UI 에서 실제 대화 요청에
  // 무엇이 실리는지로 보고(browser), "안 샌다"는 이 기계에서 실제로 열려 있는 터미널
  // 이름으로 봐야 한다(native) — 우리가 고른 문자열로는 유출 부재를 증명할 수 없다.
  { prefix: "UC-ENV-ATTENTION", gate: "native", requiredEvidence: ["browser", "native"] },
  // 두 저장소 어휘 동기도 결정론이다.
  { prefix: "UC-WIRE-UNION-", gate: "protocol", requiredEvidence: ["mock"] },
];

/**
 * 계열 규칙보다 우선하는 시나리오별 요구.
 *
 * 계열로 묶으면 편하지만 거칠다 — 예컨대 환경 도구 계열에 일괄로 브라우저 증거를 요구하면
 * 터미널 실행 시나리오까지 브라우저를 요구하게 된다(2026-08-26 실측). 시나리오가 실제로
 * 무엇을 거쳐야 하는지에 맞춘다.
 */
const SCENARIO_OVERRIDES: Readonly<Record<string, readonly EvidenceKind[]>> = {
  // 터미널만 거친다.
  "UC-ENV-TOOL-TERMINAL-EXEC": ["native"],
  // 권한 등급 판정이라 특정 기질을 요구하지 않는다 — 실제 실행 앞에서 막히는지만 본다.
  "UC-ENV-TOOL-BOUNDARY-DENY": ["native"],
  // 취소는 UC 가 브라우저와 터미널을 함께 말한다 — 계열 기본값이 맞다.
  //
  // 분류 자체는 순수한 판단이지만, 이 시나리오에는 이슈·space 결속(FR-ORCHESTRATION.2)이
  // 함께 걸려 있다. 결속은 실제 디스크에 남아야 확인되는 성질이므로 mock 만으로는 부족하다
  // (2026-08-27 8차 적대리뷰 지적 — 6차에 mock 으로 낮춘 것이 과했다).
  "UC-ORCHESTRATION-CLASSIFY": ["mock", "native"],
};

/**
 * 아직 확인 수단이 없다고 *이름을 걸고* 선언한 시나리오.
 *
 * 비어 있는 것과 다르다. 여기 없는데 증거가 없으면 게이트가 빨간불이 된다.
 * 여기 있는 것은 "무엇이 왜 아직 안 됐는지"를 벤치가 계속 말하게 하는 자리다 —
 * 조용히 목록에서 빼는 것을 막기 위해 이 목록 자체를 테스트가 감시한다.
 */
/**
 * 유예는 없다.
 *
 * 앞서 `UC-ORCHESTRATION-CODING-PROVIDER` 를 작성자 상수로 유예해 두었다. 사유·해제 조건·
 * 만료를 붙여도 결국 작성자가 혼자 만들 수 있는 장치였고, 그러면 아무 시나리오나 그리로
 * 옮겨 게이트를 초록불로 만들 수 있다(2026-08-27 5·6·7차 적대리뷰가 세 번 지적했다).
 *
 * 그래서 걷어낸다. 확인 수단이 없는 시나리오는 그냥 실패한다. 게이트가 빨간불인 채로
 * 남는 것이 사실이며, 그것을 초록불로 만드는 것은 확인 수단을 만들거나 — 실제 코딩 모델
 * 제공자를 띄우는 일이라 비용과 자격증명이 든다 — 사람이 그 시나리오를 접는 일이다.
 * 둘 다 작성자가 혼자 할 수 없다.
 */
export const DEFERRED_SCENARIOS: Readonly<Record<string, never>> = {};

const HEADING = /^###\s+(UC-[A-Z0-9-]+)/gm;

/**
 * 이 에픽이 소유하지 않는 UC 접두사. 문서는 여러 슬라이스가 공유하므로,
 * 에픽 밖 시나리오까지 하네스가 판정하려 들면 안 된다.
 *
 * ⚠️ 이 목록은 "무시해도 되는 것"이지 "아직 안 적은 것"이 아니다.
 *    계열에도 없고 여기에도 없는 UC 는 테스트가 실패시킨다 — 그게 문서와 하네스가
 *    어긋나는 걸 막는 유일한 방향이다(2026-08-26: 이 방향이 없어서 #502 의 UC 11개가
 *    조용히 버려지고 있었다).
 */
const NOT_OWNED_BY_EPIC: readonly string[] = ["UC-DISCORD-", "UC-JEONJU-", "UC-V0"];

export function ownedByEpic(uc: string): boolean {
  return !NOT_OWNED_BY_EPIC.some((p) => uc.startsWith(p));
}

/** 문서에 있는 모든 `### UC-` 표제. 계열 판정 전의 날것이다. */
export function allHeadings(markdown: string): readonly string[] {
  const out = new Set<string>();
  for (const match of markdown.matchAll(HEADING)) {
    out.add((match[1] ?? "").replace(/[—-]+$/, "").trim());
  }
  return [...out];
}

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
    out.push({
      id: uc,
      uc,
      gate: family.gate,
      requiredEvidence: SCENARIO_OVERRIDES[uc] ?? family.requiredEvidence,
    });
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
