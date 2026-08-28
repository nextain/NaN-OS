// #502 프로토콜 대조 계약 테스트 (P02) — FR-HERDR-CONTROL.1~10.
// 우리 계약이 Herdr 가 실제로 내주는 것과 어디서 만나고 어디서 갈라지는지를 고정한다.
// 고정 대상은 실제 `herdr api schema --json` 에서 뽑은 축약본이다(재생성: src/test/harness/distill-herdr-schema.mjs).
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessProtocol,
  correlates,
  hasGlobalRevision,
  hasStructuredExec,
  shellFilled,
  unfillable,
  type ProtocolFacts,
} from "../main/domain/herdr-protocol.js";

const FIXTURE = resolve(__dirname, "fixtures", "herdr-protocol-19.json");
const facts = JSON.parse(readFileSync(FIXTURE, "utf8")) as ProtocolFacts;

function levelOf(requirement: string): string {
  return assessProtocol(facts).find((a) => a.requirement === requirement)?.level ?? "없음";
}

describe("프로토콜 19 사실", () => {
  it("이 축약본은 protocol 19 이고 메서드와 이벤트가 실제로 들어 있다", () => {
    expect(facts.protocol).toBe(19);
    expect(facts.methods.length).toBeGreaterThan(50);
    expect(facts.eventKinds.length).toBeGreaterThan(20);
  });

  it("셸이 오늘 쓰는 메서드가 실제로 존재한다", () => {
    for (const m of ["session.snapshot", "workspace.focus", "agent.focus", "workspace.create"]) {
      expect(facts.methods, m).toContain(m);
    }
  });

  it("구독은 존재한다 — 스냅샷 폴링만 있는 것이 아니다", () => {
    expect(facts.methods).toContain("events.subscribe");
    expect(facts.eventKinds).toContain("pane_agent_status_changed");
  });

  it("요청과 응답이 id 로 묶인다", () => {
    expect(correlates(facts)).toBe(true);
  });
});

describe("계약이 실현되지 않는 지점", () => {
  it("전역 개정은 없다 — 개정은 자원별로만 붙는다", () => {
    expect(hasGlobalRevision(facts)).toBe(false);
    expect(facts.revisionCarriers).toContain("PaneInfo");
    expect(facts.revisionCarriers).not.toContain("SessionSnapshot");
  });

  it("멱등 키가 없다 — 중복 제거는 프로토콜이 해 주지 않는다", () => {
    expect(facts.hasIdempotencyKey).toBe(false);
  });

  it("임의 명령을 argv 로 실행하는 메서드가 없다", () => {
    expect(hasStructuredExec(facts)).toBe(false);
    expect(facts.methods).not.toContain("pane.run");
    // 실행 경로는 텍스트 입력뿐이다.
    expect(facts.methods).toContain("pane.send_text");
  });

  it("기대 순번은 report 계열에만 있다 — 포커스·생명주기에는 없다", () => {
    expect(facts.sequenceCarriers.length).toBeGreaterThan(0);
    expect(facts.sequenceCarriers.every((n) => n.includes("Report") || n.includes("Release") || n.includes("ClearAgentAuthority"))).toBe(true);
  });
});

describe("요구사항별 판정 (사실에서 계산된다)", () => {
  it.each([
    ["FR-HERDR-CONTROL.1", "supported"],
    ["FR-HERDR-CONTROL.2", "partial"],
    ["FR-HERDR-CONTROL.3", "partial"],
    ["FR-HERDR-CONTROL.4", "unsupported"],
    ["FR-HERDR-CONTROL.5", "supported"],
    ["FR-HERDR-CONTROL.6", "unsupported"],
    ["FR-HERDR-CONTROL.7", "partial"],
    ["FR-HERDR-CONTROL.8", "partial"],
    ["FR-HERDR-CONTROL.9", "unsupported"],
    ["FR-HERDR-CONTROL.10", "supported"],
  ])("%s = %s", (requirement, level) => {
    expect(levelOf(requirement)).toBe(level);
  });

  it("판정마다 근거가 붙는다 — 빈 판정이 없다", () => {
    for (const a of assessProtocol(facts)) expect(a.because.length).toBeGreaterThan(10);
  });

  it("셸이 메워야 하는 것이 무엇인지 분명하다 — 재시작하면 사라지는 보장들이다", () => {
    expect([...shellFilled(facts)]).toEqual([
      "FR-HERDR-CONTROL.2",
      "FR-HERDR-CONTROL.4",
      "FR-HERDR-CONTROL.6",
      "FR-HERDR-CONTROL.7",
      "FR-HERDR-CONTROL.8",
      "FR-HERDR-CONTROL.9",
    ]);
  });

  it("어느 쪽도 메울 수 없는 요구사항이 하나 있다 — 요구사항을 고쳐야 한다", () => {
    expect([...unfillable(facts)]).toEqual(["FR-HERDR-CONTROL.3"]);
  });

  it("사실이 달라지면 판정도 달라진다 — 표를 손으로 적어 둔 것이 아니다", () => {
    const richer: ProtocolFacts = {
      ...facts,
      methods: [...facts.methods, "pane.run"],
      hasIdempotencyKey: true,
      revisionCarriers: [...facts.revisionCarriers, "SessionSnapshot"],
    };
    expect(assessProtocol(richer).find((a) => a.requirement === "FR-HERDR-CONTROL.3")?.level).toBe("supported");
    expect(assessProtocol(richer).find((a) => a.requirement === "FR-HERDR-CONTROL.4")?.level).toBe("supported");
    expect(assessProtocol(richer).find((a) => a.requirement === "FR-HERDR-CONTROL.2")?.level).toBe("supported");
  });
});

describe("살아 있는 Herdr 와의 드리프트", () => {
  // 이 머신에 herdr 가 있으면 실제 바이너리로 대조한다. 없으면 건너뛴다 —
  // 없는 것을 있는 척하지 않고, 있는데 안 보는 일도 없게 한다.
  let live: ProtocolFacts | null = null;
  try {
    const raw = execFileSync("herdr", ["api", "schema", "--json"], { encoding: "utf8", timeout: 20_000 });
    const distilled = execFileSync("node", [resolve(__dirname, "harness", "distill-herdr-schema.mjs")], {
      input: raw,
      encoding: "utf8",
      timeout: 20_000,
    });
    live = JSON.parse(distilled) as ProtocolFacts;
  } catch {
    live = null;
  }

  it.skipIf(live === null)("설치된 herdr 의 프로토콜이 축약본과 같다", () => {
    expect(live?.protocol).toBe(facts.protocol);
  });

  it.skipIf(live === null)("메서드 목록이 드리프트하지 않았다", () => {
    expect(live?.methods).toEqual(facts.methods);
  });

  it.skipIf(live === null)("이벤트 종류가 드리프트하지 않았다", () => {
    expect(live?.eventKinds).toEqual(facts.eventKinds);
  });

  it.skipIf(live === null)("요구사항 판정이 살아 있는 프로토콜에서도 같다", () => {
    expect(assessProtocol(live as ProtocolFacts)).toEqual(assessProtocol(facts));
  });
});
