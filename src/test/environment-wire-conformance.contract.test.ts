// #502 wire 경계 계약 테스트 (P02) — naia-shell 이 naia-agent 에 올리는 형태.
//
// 왜 있는가: 두 저장소를 잇는 것은 wire 계약이다(2026-06-10 교차개발 앵커 원칙). 그런데 그 원칙이
// 근거로 삼은 `uc1-outbound-probe`·`uc1-variant-probe` 는 *옛 baseline*(old-naia-os) 대조용이라
// 지금은 SKIP 된다(2026-08-26 확인). 즉 오늘의 셸↔뇌 형태를 막아 주는 게이트가 없다.
// 그 갭을 표본으로 닫는다 — 두 저장소가 같은 표본을 들고 각자 자기 쪽을 검증하고,
// 상대 저장소가 옆에 있으면 표본이 같은지도 확인한다.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { surfaceRef, toEnvironmentSegment, type EnvironmentReport } from "../main/domain/environment-intent.js";
import { observe } from "../main/adapters/herdr-environment.js";
import { liveHerdrSnapshot } from "./harness/herdr-live.js";

const FIXTURE_PATH = resolve(__dirname, "fixtures", "environment-surfaces-wire.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  readonly segment: {
    readonly kind: string;
    readonly surfaces: readonly { ref: string; label: string; activity: string; focused: boolean }[];
    readonly omitted: number;
  };
};

/** 표본과 같은 내용을 내는 보고. 표본이 바뀌면 이 보고도 바뀌어야 한다. */
const REPORT: EnvironmentReport = {
  schemaVersion: 1,
  surfaces: [
    { ref: surfaceRef("s-1"), label: "빌더", activity: "working", focused: true },
    { ref: surfaceRef("s-2"), label: "zsh — alpha-adk", activity: "idle", focused: false },
    { ref: surfaceRef("s-3"), label: "이름없는 표면", activity: "unknown", focused: false },
  ],
  omitted: 4,
};

describe("셸이 내는 wire 형태", () => {
  it("표본과 정확히 같다", () => {
    expect(toEnvironmentSegment(REPORT)).toEqual(fixture.segment);
  });

  it("손잡이가 문자열 하나로 눕는다 — 중첩 객체를 보내지 않는다", () => {
    const segment = toEnvironmentSegment(REPORT);
    for (const s of segment.surfaces) expect(typeof s.ref).toBe("string");
  });

  it("보고에 없는 값을 더하지 않는다 — 뇌가 보는 것은 보고가 전부다", () => {
    const segment = toEnvironmentSegment(REPORT);
    expect(Object.keys(segment).sort()).toEqual(["kind", "listWithheld", "omitted", "surfaces"]);
    for (const s of segment.surfaces) {
      expect(Object.keys(s).sort()).toEqual(["activity", "focused", "label", "ref"]);
    }
  });

  it("빈 보고도 형태를 지킨다", () => {
    expect(toEnvironmentSegment({ schemaVersion: 1, surfaces: [], omitted: 0 })).toEqual({
      kind: "environmentSurfaces",
      surfaces: [],
      omitted: 0,
      listWithheld: false,
    });
  });

  it("누락 개수를 그대로 옮긴다 — 조용히 0 으로 만들지 않는다", () => {
    expect(toEnvironmentSegment({ ...REPORT, omitted: 12 }).omitted).toBe(12);
  });

  it("표본이 네 가지 활동 상태 중 셋 이상을 담는다 — 한 가지만으로 통과하지 않게", () => {
    const activities = new Set(fixture.segment.surfaces.map((s) => s.activity));
    expect(activities.size).toBeGreaterThanOrEqual(3);
  });

  it("표본이 누락 개수를 0 이 아닌 값으로 담는다", () => {
    expect(fixture.segment.omitted).toBeGreaterThan(0);
  });
});

describe("실제 관측도 같은 형태로 눕는다", () => {
  const live = liveHerdrSnapshot();

  it.skipIf(live === null)("살아 있는 Herdr 관측이 wire 형태를 만족한다", () => {
    const segment = toEnvironmentSegment(observe(live as never).report);
    expect(segment.kind).toBe("environmentSurfaces");
    expect(Number.isInteger(segment.omitted)).toBe(true);
    for (const s of segment.surfaces) {
      expect(typeof s.ref).toBe("string");
      expect(typeof s.label).toBe("string");
      expect(["idle", "working", "waiting", "unknown"]).toContain(s.activity);
      expect(typeof s.focused).toBe("boolean");
    }
  });

  it.skipIf(live === null)("실제 관측에서도 표면이 하나 이상 나온다 — 빈 배열로 공허하게 통과하지 않는다", () => {
    expect(toEnvironmentSegment(observe(live as never).report).surfaces.length).toBeGreaterThan(0);
  });
});

describe("짝 저장소와의 표본 드리프트", () => {
  // naia-agent 체크아웃이 옆에 있으면 표본이 같은지 본다. 없으면 건너뛴다 —
  // 없는 것을 있는 척하지 않고, 있는데 안 보는 일도 없게.
  // 이 저장소가 워크트리일 수도, 본 체크아웃일 수도 있어 위로 여러 단계를 훑는다.
  // ⚠️ 아무 체크아웃이나 먼저 찾은 것을 쓰면 다른 브랜치와 비교하게 된다
  //    (2026-08-27 8차 실측: 옆에 issue/3090 브랜치의 naia-agent 가 있었다).
  //    이 저장소가 박아 둔 페어링 커밋을 담은 체크아웃만 짝이다.
  const REL = ["src", "test", "fixtures", "environment-surfaces-wire.json"];
  const pinned = (
    JSON.parse(
      readFileSync(resolve(__dirname, "..", "..", "packages", "shell", "agent-pairing.json"), "utf8"),
    ) as { agentCommit?: string }
  ).agentCommit;
  const roots: string[] = [];
  for (let up = 2; up <= 6; up += 1) {
    const base = resolve(__dirname, ...Array.from({ length: up }, () => ".."));
    roots.push(resolve(base, "naia-agent"));
    roots.push(resolve(base, "naia-agent-worktrees", "env-surfaces-112"));
  }
  const peer = roots
    .filter((root) => existsSync(resolve(root, ...REL)))
    .find((root) => {
      if (!pinned) return false;
      try {
        execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", pinned, "HEAD"], {
          stdio: "ignore",
        });
        return true;
      } catch {
        return false;
      }
    })
    ?.concat("/", REL.join("/"));

  it("짝 저장소 표본을 실제로 찾았다 — 건너뛴 게이트는 게이트가 아니다", () => {
    expect(peer, `찾은 곳 없음. 훑은 경로: ${roots.join(", ")}`).toBeDefined();
  });

  it.skipIf(peer === undefined)("두 저장소의 표본 세그먼트가 같다", () => {
    const theirs = JSON.parse(readFileSync(peer as string, "utf8")) as { readonly segment: unknown };
    expect(theirs.segment).toEqual(fixture.segment);
  });
});
