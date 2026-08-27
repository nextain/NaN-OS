// domain/herdr-protocol — #502 계약과 Herdr 실제 프로토콜의 대조. 순수.
// 계약: docs/progress/issue-497-universal-agent.md.
//
// 왜 있는가: FR-HERDR-CONTROL.* 는 우리가 원하는 것을 적은 것이고, Herdr 가 실제로 내주는 것은
// 별개다. 둘의 차이를 손으로 적어 두면 Herdr 가 바뀌어도 아무도 모른다. 그래서 프로토콜 사실에서
// 지원 수준을 *계산*하고, 사실이 달라지면 판정이 달라지게 한다.

/** `herdr api schema --json` 에서 뽑은, 계약이 실제로 기대는 사실들. */
export interface ProtocolFacts {
  readonly protocol: number;
  readonly methods: readonly string[];
  readonly eventKinds: readonly string[];
  readonly requestRequired: readonly string[];
  readonly successResponseRequired: readonly string[];
  readonly errorResponseRequired: readonly string[];
  readonly eventRequired: readonly string[];
  /** `revision` 필드를 싣는 타입 이름. 전역 개정이 아니라 자원별 개정이다. */
  readonly revisionCarriers: readonly string[];
  /** 낙관적 동시성용 `seq` 를 받는 파라미터 타입 이름. */
  readonly sequenceCarriers: readonly string[];
  readonly hasIdempotencyKey: boolean;
}

export type SupportLevel = "supported" | "partial" | "unsupported";

export interface RequirementAssessment {
  readonly requirement: string;
  readonly level: SupportLevel;
  /** 판정 근거. 프로토콜 사실을 그대로 인용한다. */
  readonly because: string;
  /** 프로토콜이 못 하는 부분을 누가 메우는가. 없으면 메울 필요가 없다는 뜻. */
  readonly filledBy?: "shell" | "human-decision" | "not-fillable";
}

function has(facts: ProtocolFacts, method: string): boolean {
  return facts.methods.includes(method);
}

/** 전역 개정이 있는가. 자원별 개정만으로는 세션 전체의 연속성을 판단할 수 없다. */
export function hasGlobalRevision(facts: ProtocolFacts): boolean {
  return facts.revisionCarriers.includes("SessionSnapshot");
}

/** 임의 명령을 구조화된 인자로 실행하는 메서드가 있는가. */
export function hasStructuredExec(facts: ProtocolFacts): boolean {
  return has(facts, "pane.run") || has(facts, "pane.exec");
}

/** 요청·응답이 상관 식별자로 묶이는가. */
export function correlates(facts: ProtocolFacts): boolean {
  return (
    facts.requestRequired.includes("id") &&
    facts.successResponseRequired.includes("id") &&
    facts.errorResponseRequired.includes("id")
  );
}

/**
 * 요구사항별 실현 가능성. 표를 적는 것이 아니라 사실에서 계산한다.
 * Herdr 가 메서드나 필드를 더하거나 빼면 여기 결과가 달라지고, 계약 테스트가 그것을 알린다.
 */
export function assessProtocol(facts: ProtocolFacts): readonly RequirementAssessment[] {
  const typedResources = has(facts, "session.snapshot") && has(facts, "pane.list") && has(facts, "agent.list");
  const subscribes = has(facts, "events.subscribe");
  const controlMethods = ["workspace.focus", "workspace.create", "workspace.close", "tab.create", "tab.close", "pane.split", "pane.close", "agent.focus", "agent.start"];
  const structuredControl = controlMethods.every((m) => has(facts, m));

  return [
    {
      requirement: "FR-HERDR-CONTROL.1",
      level: typedResources ? "supported" : "unsupported",
      because: `session.snapshot·pane.list·agent.list ${typedResources ? "존재" : "부재"}, 이벤트 종류 ${facts.eventKinds.length}가지`,
    },
    {
      requirement: "FR-HERDR-CONTROL.2",
      level: subscribes ? (hasGlobalRevision(facts) ? "supported" : "partial") : "unsupported",
      because: subscribes
        ? `events.subscribe 는 있으나 전역 개정이 없다. 개정을 싣는 것은 ${facts.revisionCarriers.join("·")} 뿐이다`
        : "events.subscribe 부재",
      filledBy: hasGlobalRevision(facts) ? undefined : "shell",
    },
    {
      requirement: "FR-HERDR-CONTROL.3",
      level: structuredControl ? (hasStructuredExec(facts) ? "supported" : "partial") : "unsupported",
      because: structuredControl
        ? "제어(포커스·생명주기)는 타입 있는 메서드다. 임의 명령 실행은 pane.send_text 계열 텍스트 입력뿐이라 argv 로 넘길 수 없다"
        : "제어 메서드 일부 부재",
      filledBy: hasStructuredExec(facts) ? undefined : "not-fillable",
    },
    {
      requirement: "FR-HERDR-CONTROL.4",
      level: facts.hasIdempotencyKey ? "supported" : "unsupported",
      because: facts.hasIdempotencyKey ? "프로토콜에 멱등 키가 있다" : "프로토콜에 멱등 키가 없다. 요청 id 는 상관용이지 중복 제거용이 아니다",
      filledBy: facts.hasIdempotencyKey ? undefined : "shell",
    },
    {
      requirement: "FR-HERDR-CONTROL.5",
      level: has(facts, "pane.read") && facts.revisionCarriers.includes("PaneReadResult") ? "supported" : "partial",
      because: "pane.read 가 개정과 함께 출력을 돌려준다",
    },
    {
      requirement: "FR-HERDR-CONTROL.6",
      level: "unsupported",
      because: "프로토콜에 권한 등급도 승인 참조도 없다. 소켓에 닿는 쪽은 무엇이든 할 수 있다",
      filledBy: "shell",
    },
    {
      requirement: "FR-HERDR-CONTROL.7",
      level: facts.sequenceCarriers.length > 0 ? "partial" : "unsupported",
      because:
        facts.sequenceCarriers.length > 0
          ? `기대 순번(seq)을 받는 것은 report 계열 ${facts.sequenceCarriers.length}종뿐이다. 포커스·생명주기 변경에는 없다`
          : "기대 개정을 받는 메서드가 없다",
      filledBy: "shell",
    },
    {
      requirement: "FR-HERDR-CONTROL.8",
      level: correlates(facts) ? "partial" : "unsupported",
      because: correlates(facts)
        ? "요청 id 로 성공·실패를 묶을 수 있으나 취소·타임아웃·부분 완료를 프로토콜이 구분해 주지 않는다"
        : "요청과 응답을 묶을 식별자가 없다",
      filledBy: "shell",
    },
    {
      requirement: "FR-HERDR-CONTROL.9",
      level: "unsupported",
      because: "재접속 상한은 프로토콜의 관심사가 아니다",
      filledBy: "shell",
    },
    {
      requirement: "FR-HERDR-CONTROL.10",
      level: typedResources ? "supported" : "unsupported",
      because: "space·tab·pane·terminal·agent 의 생명주기 메서드를 Herdr 가 전부 소유한다",
    },
  ];
}

/** 프로토콜만으로는 안 되고 셸이 메워야 하는 요구사항. 여기 있는 것은 재시작하면 사라진다. */
export function shellFilled(facts: ProtocolFacts): readonly string[] {
  return assessProtocol(facts)
    .filter((a) => a.filledBy === "shell")
    .map((a) => a.requirement);
}

/** 어느 쪽도 메울 수 없어 요구사항 자체를 고쳐야 하는 것. */
export function unfillable(facts: ProtocolFacts): readonly string[] {
  return assessProtocol(facts)
    .filter((a) => a.filledBy === "not-fillable")
    .map((a) => a.requirement);
}
