// #502 살아 있는 Herdr 로 관측 경로를 끝까지 밟는다 (UC-ENV-LIVE-OBSERVE, native 증거).
//
// 왜 따로 있는가: 다른 테스트는 전부 대역 스냅샷을 쓴다. 대역은 우리가 상상한 모양이고,
// 실제 Herdr 이 내는 모양과 다를 수 있다. 그 차이는 대역으로는 영원히 안 보인다.
//
// ⚠️ 읽기 전용이다. `herdr api snapshot` 만 부른다 — 사용자의 실제 세션을 바꾸지 않는다.
//    조작(focus·run·interrupt)은 여기서 밟지 않는다. 사용자의 살아 있는 터미널에
//    실제로 명령을 넣는 일이라, 전용 세션 없이 할 일이 아니다.
//
// ⚠️ Herdr 이 없으면 건너뛰지 않고 실패한다. 이 파일은 native 증거를 만드는 자리이고,
//    건너뛴 게이트는 게이트가 아니다.
import { describe, it, expect, afterAll } from "vitest";
import { writeAttestation } from "./harness/bench-execution.js";
import { EnvironmentSession } from "../main/app/control/environment-session.js";
import { resolve } from "node:path";
import { liveHerdrSnapshot } from "./harness/herdr-live.js";

const live = liveHerdrSnapshot();

describe("살아 있는 Herdr 관측 (native)", () => {
  it("Herdr 이 실제로 응답한다 — 없으면 이 증거는 성립하지 않는다", () => {
    expect(
      live,
      "herdr api snapshot 이 응답하지 않았다. 이 테스트는 native 증거를 만드는 자리라 건너뛰지 않는다",
    ).not.toBeNull();
  });

  it("실제 스냅샷이 보고로 바뀐다", () => {
    const session = new EnvironmentSession();
    const report = session.observeSnapshot(live as never);
    expect(report.surfaces.length, "실제 세션에 표면이 하나도 없다").toBeGreaterThan(0);
  });

  it("실제 표면이 전부 네 가지 활동 상태 안에 든다", () => {
    const session = new EnvironmentSession();
    for (const s of session.observeSnapshot(live as never).surfaces) {
      expect(["idle", "working", "waiting", "unknown"]).toContain(s.activity);
    }
  });

  it("실제 표면에 이름이 있다 — 이름 없는 표면을 만들지 않는다", () => {
    const session = new EnvironmentSession();
    for (const s of session.observeSnapshot(live as never).surfaces) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("실제 관측이 대화에 실을 세그먼트가 된다", () => {
    const session = new EnvironmentSession();
    session.observeSnapshot(live as never);
    const segment = session.segment();
    expect(segment?.kind).toBe("environmentSurfaces");
    expect(segment?.surfaces.length).toBeGreaterThan(0);
  });

  it("실제 pane 식별자가 뇌에 올라가지 않는다", () => {
    // 대역에서는 우리가 고른 문자열이라 당연히 통과한다. 진짜 값으로 확인해야 의미가 있다.
    const session = new EnvironmentSession();
    session.observeSnapshot(live as never);
    const wire = JSON.stringify(session.segment());
    const panes = (live as { panes?: { pane_id?: unknown }[] }).panes ?? [];
    const ids = panes.map((p) => p?.pane_id).filter((x): x is string => typeof x === "string");
    expect(ids.length, "실제 스냅샷에서 pane 식별자를 하나도 못 읽었다").toBeGreaterThan(0);
    for (const id of ids) expect(wire, `pane 식별자 ${id} 가 뇌에 올라간다`).not.toContain(id);
  });

  it("같은 스냅샷을 두 번 관측하면 손잡이가 그대로다", () => {
    const session = new EnvironmentSession();
    const first = session.observeSnapshot(live as never).surfaces.map((s) => s.ref.token);
    const second = session.observeSnapshot(live as never).surfaces.map((s) => s.ref.token);
    expect(second).toEqual(first);
  });

  it("이름이 겹쳐도 손잡이는 표면마다 다르다 — 실제 세션에 같은 이름이 여럿이다", () => {
    // 실측(2026-08-26): pane 15개 중 5개가 완전히 같은 이름이었다. 뇌는 이름으로 이것들을
    // 구분할 수 없다 — 손잡이가 있는 이유가 여기서 드러난다. 대역 스냅샷으로는 이 사실이
    // 보이지 않았고, 그래서 이 파일의 첫 판본은 이름으로 짝을 지으려다 실패했다.
    const session = new EnvironmentSession();
    const surfaces = session.observeSnapshot(live as never).surfaces;
    const tokens = surfaces.map((s) => s.ref.token);
    expect(new Set(tokens).size, "손잡이가 겹친다").toBe(tokens.length);
    const labels = surfaces.map((s) => s.label);
    if (new Set(labels).size < labels.length) {
      // 이름이 겹치는 상황을 실제로 밟았다는 것 자체가 이 단언의 근거다.
      expect(new Set(tokens).size).toBeGreaterThan(new Set(labels).size);
    }
  });
});

afterAll(() => {
  // 이 실행이 실제로 무엇을 만졌는지 남긴다. 벤치는 이 증명서가 있어야 native 영수증을 준다.
  const panes = ((live as { panes?: unknown[] } | null)?.panes ?? []) as unknown[];
  writeAttestation(resolve(__dirname, "..", ".."), {
    spec: "src/test/environment-live-herdr.contract.test.ts",
    kinds: ["native"],
    touched: panes.map((p) => String((p as { pane_id?: unknown }).pane_id ?? "")).filter(Boolean),
    at: Date.now(),
  });
});
