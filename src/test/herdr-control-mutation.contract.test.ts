// #502 변경 요청 계약 테스트 (P02) — FR-HERDR-CONTROL.3·5.
// 구조화된 인자로 전달되는가, 결과에 영향 자원과 증거가 함께 오는가.
import { describe, it, expect } from "vitest";
import { HerdrControlPlane } from "../main/app/control/herdr-control.js";
import { admit } from "../main/domain/herdr-control.js";
import { COMMAND, fakeConnection, fakeMutate, fakeObserve, request, snapshot } from "./helpers/herdr-control-fixture.js";

const POLICY = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };
const CONTEXT = { currentRevision: { value: 1 }, grantedTiers: ["observe", "workspace-write"] as const };

describe("구조화 전달 (FR-HERDR-CONTROL.3) [UC-HERDR-CONTROL-MUTATE]", () => {
  it("실행 파일·인자·작업 디렉터리·환경이 분리되어 전달된다", async () => {
    const mutate = fakeMutate();
    const p = new HerdrControlPlane(fakeObserve(), mutate, fakeConnection([snapshot(9)]), ["observe", "workspace-write"], POLICY);
    await p.observeNow();
    await p.requestMutation(request());
    expect(mutate.applied[0]?.command).toEqual({ executable: "pnpm", args: ["test"], cwd: "/ws", env: { CI: "1" } });
  });

  it("구조화되지 않은 명령은 수용 단계에서 거절한다", () => {
    const rejections = admit(request({ command: { ...COMMAND, executable: "sh -c 'rm -rf /'" } }), { ...CONTEXT, grantedTiers: [...CONTEXT.grantedTiers] });
    expect(rejections.map((r) => r.code)).toEqual(["unstructured-command"]);
  });

  it("명령이 없는 요청도 있다 — 포커스처럼 프로세스를 만들지 않는 변경", () => {
    const r = request({ command: undefined });
    expect(admit(r, { ...CONTEXT, grantedTiers: [...CONTEXT.grantedTiers] })).toEqual([]);
  });

  it("거절된 요청은 포트에 도달하지 않는다 — 판정 전 실행 금지", async () => {
    const mutate = fakeMutate();
    const p = new HerdrControlPlane(fakeObserve(), mutate, fakeConnection([snapshot(9)]), ["observe"], POLICY);
    await p.observeNow();
    const out = await p.requestMutation(request());
    expect(out.ok).toBe(false);
    expect(mutate.applied).toEqual([]);
  });
});

describe("결과 증거 (FR-HERDR-CONTROL.5)", () => {
  it("변경 결과는 영향 자원 식별자와 증거 참조를 함께 돌려준다", async () => {
    const p = new HerdrControlPlane(fakeObserve(), fakeMutate(), fakeConnection([snapshot(9)]), ["observe", "workspace-write"], POLICY);
    await p.observeNow();
    const out = await p.requestMutation(request());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.affected).toEqual([{ kind: "terminal", id: "t1" }]);
    expect(out.result.evidence).toEqual(["log:1"]);
  });
});
