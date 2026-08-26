// #503 정체성 계약 테스트 (P02) — FR-CHANNEL-SESSION.1·2·4.
// 같은 이슈에 대화 정체성 하나, 실행 소유자 하나인가. 재개 참조만 보관하는가.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ChannelSessionService } from "../main/app/control/channel-session.js";
import { checkIdentity, resumeReferenceOf } from "../main/domain/channel-session.js";
import { fakeMembership, fakeRegistry, fakeTransport, identity } from "./helpers/channel-session-fixture.js";

const PORT_SOURCE = readFileSync(resolve(__dirname, "..", "main", "ports", "channel-session.ts"), "utf8");

describe("정체성 단일성 (FR-CHANNEL-SESSION.1) [UC-CHANNEL-SESSION-HANDOFF FR-CHANNEL-SESSION.2]", () => {
  it("새 이슈는 그냥 받는다", () => {
    expect(checkIdentity([], identity())).toEqual([]);
  });

  it("같은 이슈에 같은 정체성을 다시 선언해도 문제가 아니다", () => {
    expect(checkIdentity([identity()], identity())).toEqual([]);
  });

  it("같은 이슈에 다른 대화를 붙이면 거절한다", () => {
    expect(checkIdentity([identity()], identity({ conversationId: "c2" }))).toEqual(["issue-has-other-conversation"]);
  });

  it("같은 이슈에 다른 space 를 붙이면 거절한다", () => {
    expect(checkIdentity([identity()], identity({ spaceId: "s2" }))).toEqual(["issue-has-other-space"]);
  });

  it("둘 다 다르면 둘 다 남긴다", () => {
    expect([...checkIdentity([identity()], identity({ conversationId: "c2", spaceId: "s2" }))].sort()).toEqual([
      "issue-has-other-conversation",
      "issue-has-other-space",
    ]);
  });

  it("다른 이슈는 서로 간섭하지 않는다", () => {
    expect(checkIdentity([identity()], identity({ issue: "#502", conversationId: "c2", spaceId: "s2" }))).toEqual([]);
  });
});

describe("채널은 실행 소유자가 아니다 (FR-CHANNEL-SESSION.1)", () => {
  it("채널 포트에 작업자 생명주기 진입점이 없다", () => {
    expect(PORT_SOURCE).not.toMatch(/startWorker|spawn|kill|terminal|exec/i);
  });

  it("채널 포트는 전송·등록·자격 확인만 노출한다", () => {
    const methods = [...PORT_SOURCE.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(new Set(methods)).toEqual(new Set(["send", "list", "register", "saveResumeReference", "loadResumeReference", "isAuthorized"]));
  });
});

describe("재개 참조 (FR-CHANNEL-SESSION.4)", () => {
  it("참조는 이슈·space·대화만 담는다 — 작업자 상태를 복사하지 않는다", () => {
    expect(resumeReferenceOf(identity())).toEqual({ issue: "#501", spaceId: "s1", conversationId: "c1" });
    expect(Object.keys(resumeReferenceOf(identity()))).toEqual(["issue", "spaceId", "conversationId"]);
  });

  it("정체성을 받아들이면 참조가 보관된다", async () => {
    const registry = fakeRegistry();
    const svc = new ChannelSessionService(registry, fakeMembership(), fakeTransport());
    expect(await svc.adopt(identity())).toEqual([]);
    expect(registry.references.get("c1")).toEqual({ issue: "#501", spaceId: "s1", conversationId: "c1" });
  });

  it("거절된 정체성은 등록도 보관도 되지 않는다", async () => {
    const registry = fakeRegistry([identity()]);
    const svc = new ChannelSessionService(registry, fakeMembership(), fakeTransport());
    expect(await svc.adopt(identity({ spaceId: "s2" }))).toEqual(["issue-has-other-space"]);
    expect(registry.registered).toHaveLength(1);
    expect(registry.references.size).toBe(0);
  });
});
