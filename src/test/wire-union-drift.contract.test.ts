// #497 후속 — 두 저장소 wire 어휘 동기 게이트 (FR-WIRE-UNION.1~6, UC-WIRE-UNION-DRIFT).
//
// 왜 있는가: naia-shell 과 naia-agent 는 2026-06-10 에 갈라졌고, 그때 경계를 지키기로 한
// `uc1-outbound-probe`·`uc1-variant-probe` 는 *옛 baseline* 대조라 오늘 SKIP 된다. 그 사이 실제로
// 하나가 8주간 조용히 깨져 있었다 — 셸은 `kind: "app"` 을 보내는데 뇌는 `panel` 만 받아
// 앱 컨텍스트가 통째로 버려졌다(nextain/naia-agent#113).
//
// 그래서 어휘를 표로 적어 두지 않는다. 양쪽이 *자기 코드에서* 어휘를 뽑아 같은 표본과 대조한다.
// 표와 코드가 어긋나도 깨지고, 한쪽이 kind 를 더하거나 이름을 바꿔도 양쪽이 깨진다.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHAT_TURN_VARIANTS,
  NONCHAT_KNOWN_VARIANTS,
  type EnvironmentSegment,
} from "../main/domain/chat.js";
import type { EnvironmentSurfacesSegment } from "../main/domain/environment-intent.js";

const FIXTURE_PATH = resolve(__dirname, "fixtures", "wire-union.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  readonly agentEmitsChatTurn: readonly string[];
  readonly shellAcceptsChatTurn: readonly string[];
  readonly shellAcceptsNonChat: readonly string[];
  readonly environmentSegmentKinds: readonly string[];
};

/**
 * 좁은 산출 타입이 코어 union 에 대입 가능한지 컴파일 시점에 묶는다.
 * `environment-intent.ts` 가 union 밖으로 흘러가면 여기서 tsc 가 먼저 막는다.
 */
const _assignable: EnvironmentSegment = {
  kind: "environmentSurfaces",
  surfaces: [],
  omitted: 0,
} satisfies EnvironmentSurfacesSegment;
void _assignable;

/** 코어 `chat.ts` 의 `EnvironmentSegment` union 에서 kind 를 뽑는다 — 타입은 런타임에 없으므로 소스에서. */
function unionKindsFromSource(): string[] {
  const src = readFileSync(resolve(__dirname, "..", "main", "domain", "chat.ts"), "utf8");
  const at = src.indexOf("export type EnvironmentSegment =");
  expect(at, "chat.ts 에서 EnvironmentSegment 선언을 못 찾았다").toBeGreaterThan(-1);
  const rest = src.slice(at + "export type EnvironmentSegment =".length);
  const stop = rest.search(/\n(?:export |function |const )/);
  const body = stop === -1 ? rest : rest.slice(0, stop);
  return [...new Set([...body.matchAll(/kind: "([A-Za-z]+)"/g)].map((m) => m[1] as string))].sort();
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe("표본이 공허하지 않다 (FR-WIRE-UNION.5)", () => {
  // 빈 집합이면 아래 부분집합 단언이 공허하게 참이 된다. 그 경로부터 막는다.
  it("네 목록 모두 비어 있지 않다", () => {
    expect(fixture.agentEmitsChatTurn.length).toBeGreaterThan(0);
    expect(fixture.shellAcceptsChatTurn.length).toBeGreaterThan(0);
    expect(fixture.shellAcceptsNonChat.length).toBeGreaterThan(0);
    expect(fixture.environmentSegmentKinds.length).toBeGreaterThan(0);
  });
});

describe("셸의 수용 어휘가 표본과 같다 (FR-WIRE-UNION.1, .2)", () => {
  it("chat-turn 수용 목록이 코드와 표본에서 같다", () => {
    expect(sorted(CHAT_TURN_VARIANTS)).toEqual(sorted(fixture.shellAcceptsChatTurn));
  });

  it("non-chat 수용 목록이 코드와 표본에서 같다", () => {
    expect(sorted(NONCHAT_KNOWN_VARIANTS)).toEqual(sorted(fixture.shellAcceptsNonChat));
  });

  it("두 목록이 겹치지 않는다 — 한 종류가 두 갈래로 분류되면 라우팅이 갈린다", () => {
    const overlap = CHAT_TURN_VARIANTS.filter((v) =>
      (NONCHAT_KNOWN_VARIANTS as readonly string[]).includes(v),
    );
    expect(overlap).toEqual([]);
  });
});

describe("뇌가 보내는 것을 셸이 전부 안다 (FR-WIRE-UNION.3)", () => {
  it("뇌 송신 chat-turn 이 셸 수용의 부분집합이다", () => {
    const known = new Set([...CHAT_TURN_VARIANTS, ...NONCHAT_KNOWN_VARIANTS] as readonly string[]);
    const unknown = fixture.agentEmitsChatTurn.filter((t) => !known.has(t));
    expect(unknown, "뇌가 보내는데 셸이 모르는 종류 — #113 과 같은 조용한 유실").toEqual([]);
  });
});

/** 셸 UI 의 세 번째 사본. 코어와 갈라지면 조립이 조용히 타입만 맞고 값이 안 실린다. */
function uiUnionKinds(): string[] {
  const src = readFileSync(
    resolve(__dirname, "..", "..", "packages", "shell", "src", "lib", "types.ts"),
    "utf8",
  );
  const at = src.indexOf("export type EnvironmentSegment =");
  expect(at, "UI types.ts 에서 EnvironmentSegment 선언을 못 찾았다").toBeGreaterThan(-1);
  const rest = src.slice(at + "export type EnvironmentSegment =".length);
  const stop = rest.search(/\n(?:export |function |const )/);
  const body = stop === -1 ? rest : rest.slice(0, stop);
  return [...new Set([...body.matchAll(/kind: "([A-Za-z]+)"/g)].map((m) => m[1] as string))].sort();
}

describe("환경 세그먼트 kind 가 두 저장소에서 같다 (FR-WIRE-UNION.4)", () => {
  it("셸 코어 union 의 kind 가 표본과 같다", () => {
    expect(unionKindsFromSource()).toEqual(sorted(fixture.environmentSegmentKinds));
  });

  it("셸 UI 의 세 번째 사본도 같은 kind 를 갖는다 (FR-ENV-LIVE.6)", () => {
    // 코어 union 만 맞추면 조립부(ChatArea)가 타입에서 막히거나, 더 나쁘게는
    // 다른 kind 를 실어도 조용히 통과한다.
    expect(uiUnionKinds()).toEqual(sorted(fixture.environmentSegmentKinds));
  });

  it("셸이 실제로 만드는 kind 가 union 안에 있다", () => {
    expect(fixture.environmentSegmentKinds).toContain("environmentSurfaces");
    expect(fixture.environmentSegmentKinds).toContain("app");
  });
});

describe("짝 저장소와의 표본 드리프트 (FR-WIRE-UNION.6)", () => {
  const REL = ["src", "test", "fixtures", "wire-union.json"];
  const roots: string[] = [];
  for (let up = 2; up <= 6; up += 1) {
    const base = resolve(__dirname, ...Array.from({ length: up }, () => ".."));
    roots.push(resolve(base, "naia-agent", ...REL));
    for (const wt of ["env-surfaces-112"]) {
      roots.push(resolve(base, "naia-agent-worktrees", wt, ...REL));
    }
  }
  const peer = roots.find((p) => existsSync(p));

  it("짝 저장소 표본을 실제로 찾았다 — 건너뛴 게이트는 게이트가 아니다", () => {
    expect(peer, `찾은 곳 없음. 훑은 경로: ${roots.join(", ")}`).toBeDefined();
  });

  it.skipIf(peer === undefined)("두 저장소의 표본이 한 글자도 다르지 않다", () => {
    expect(readFileSync(peer as string, "utf8")).toBe(readFileSync(FIXTURE_PATH, "utf8"));
  });
});
