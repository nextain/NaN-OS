// #502 제어 경로 계약 테스트 (P02) — FR-HERDR-CONTROL.1·10.
// raw 문자열 입력과 private socket 이 제어 표면에 없는가, 생명주기 중복 소유가 없는가.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { duplicateOwnership, HERDR_OWNED, isStructuredCommand } from "../main/domain/herdr-control.js";

const PORT_SOURCE = readFileSync(resolve(__dirname, "..", "main", "ports", "herdr-control.ts"), "utf8");

describe("제어 표면에 없는 것 (FR-HERDR-CONTROL.1)", () => {
  it.each(["stdin", "writeRaw", "sendKeys", "socketPath", "screen", "scrape", "pty"])(
    "포트에 %s 계열 진입점이 없다",
    (forbidden) => {
      expect(PORT_SOURCE.toLowerCase()).not.toMatch(new RegExp(`\\b${forbidden}\\s*\\(`, "i"));
    },
  );

  it("포트가 노출하는 메서드는 관측·구독·적용·재접속뿐이다", () => {
    const methods = [...PORT_SOURCE.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(new Set(methods)).toEqual(new Set(["snapshot", "subscribe", "apply", "reconnect"]));
  });
});

describe("명령은 조립하지 않는다 (FR-HERDR-CONTROL.3)", () => {
  it("실행 파일과 인자가 분리된 명령은 구조화된 것이다", () => {
    expect(isStructuredCommand({ executable: "pnpm", args: ["test", "--run"], cwd: "/ws", env: {} })).toBe(true);
  });

  it.each([
    "pnpm test && rm -rf /",
    "sh -c 'pnpm test'",
    "pnpm test; echo done",
    "echo `whoami`",
    "echo $(whoami)",
    "pnpm test | tee out",
    "pnpm test > out",
    "",
    "   ",
  ])("셸 한 줄을 실행 파일 자리에 밀어 넣으면 거부한다: %s", (executable) => {
    expect(isStructuredCommand({ executable, args: [], cwd: "/ws", env: {} })).toBe(false);
  });

  it("인자에 들어간 메타문자는 실행 파일이 아니므로 막지 않는다 — 셸을 거치지 않기 때문", () => {
    expect(isStructuredCommand({ executable: "grep", args: ["a|b", "$HOME"], cwd: "/ws", env: {} })).toBe(true);
  });
});

describe("생명주기 단일 소유 (FR-HERDR-CONTROL.10)", () => {
  it("Herdr 가 소유하는 종류가 명시되어 있다", () => {
    expect([...HERDR_OWNED].sort()).toEqual(["agent", "pane", "session", "space", "terminal"]);
  });

  it("Shell 이 같은 종류를 소유하면 중복으로 잡는다", () => {
    expect(duplicateOwnership(["terminal", "issue"])).toEqual(["terminal"]);
    expect(duplicateOwnership(["space", "agent", "pane"])).toEqual(["space", "agent", "pane"]);
  });

  it("Herdr 소유가 아닌 종류는 중복이 아니다", () => {
    expect(duplicateOwnership(["issue", "operation"])).toEqual([]);
  });
});
