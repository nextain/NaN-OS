// #502 슬라이스 1 번역 계약 테스트 (P02) — FR-ENV-SURFACE.7·8·9.
// 의도가 환경 호출로 어떻게 바뀌는가, 표면 종류에 따라 왜 갈리는가,
// 확인하지 못한 대응을 확인한 것처럼 보고하지 않는가.
import { describe, it, expect } from "vitest";
import { surfaceRef } from "../main/domain/environment-intent.js";
import {
  HERDR_0_8_DIALECT,
  mintRegistry,
  translate,
  type SurfaceRegistry,
} from "../main/domain/environment-translation.js";
import { observe } from "../main/adapters/herdr-environment.js";
import { liveHerdrSnapshot } from "./harness/herdr-live.js";

// s-1 = 에이전트가 붙은 표면, s-2 = 일반 터미널.
const registry: SurfaceRegistry = mintRegistry([
  { surfaceId: "w1:p1", agentTarget: "w1:p1" },
  { surfaceId: "w1:p2" },
]);

describe("관측 의도", () => {
  it("표면 손잡이 없이도 번역된다", () => {
    const out = translate({ kind: "observe" }, new Map());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.call.method).toBe("session.snapshot");
    expect(out.call.delivery).toBe("structured");
    expect(out.call.verified).toBe(true);
  });
});

describe("대응표에 없는 손잡이 (FR-ENV-SURFACE.9)", () => {
  it.each(["focus", "interrupt"] as const)("%s 는 번역되지 않는다", (kind) => {
    const out = translate({ kind, surface: surfaceRef("없는것") }, registry);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.rejections.map((r) => r.code)).toEqual(["unknown-surface"]);
  });

  it("run 도 마찬가지다", () => {
    const out = translate({ kind: "run", surface: surfaceRef("없는것"), request: "테스트" }, registry);
    expect(out.ok).toBe(false);
  });

  it("대응표는 환경 식별자를 들고 있고 손잡이는 그것이 아니다", () => {
    expect(registry.get("s-1")?.surfaceId).toBe("w1:p1");
    expect(registry.has("w1:p1")).toBe(false);
  });
});

describe("포커스 (FR-ENV-SURFACE.7)", () => {
  it("에이전트가 붙은 표면은 에이전트 대상으로 포커스한다", () => {
    const out = translate({ kind: "focus", surface: surfaceRef("s-1") }, registry);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.call.method).toBe("agent.focus");
    expect(out.call.params).toEqual({ target: "w1:p1" });
  });

  it("일반 터미널은 표면 자체를 포커스한다", () => {
    const out = translate({ kind: "focus", surface: surfaceRef("s-2") }, registry);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.call.method).toBe("pane.focus");
    expect(out.call.params).toEqual({ pane_id: "w1:p2" });
  });

  it("포커스는 구조화 전달이라 인용 책임이 없다", () => {
    const out = translate({ kind: "focus", surface: surfaceRef("s-1") }, registry);
    expect(out.ok && out.call.quotingOwnedByCaller).toBe(false);
  });
});

describe("실행 (FR-ENV-SURFACE.7·8)", () => {
  it("에이전트가 붙은 표면은 구조화된 프롬프트를 받는다 — 인용 문제가 없다", () => {
    const out = translate({ kind: "run", surface: surfaceRef("s-1"), request: "테스트 돌려줘" }, registry);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.call.method).toBe("agent.prompt");
    expect(out.call.params).toEqual({ target: "w1:p1", text: "테스트 돌려줘" });
    expect(out.call.delivery).toBe("structured");
    expect(out.call.quotingOwnedByCaller).toBe(false);
  });

  it("일반 터미널은 텍스트 입력뿐이고 인용 책임이 호출자에게 남는다", () => {
    const out = translate({ kind: "run", surface: surfaceRef("s-2"), request: "pnpm test" }, registry);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.call.method).toBe("pane.send_text");
    expect(out.call.params).toEqual({ pane_id: "w1:p2", text: "pnpm test" });
    expect(out.call.delivery).toBe("terminal-input");
    expect(out.call.quotingOwnedByCaller).toBe(true);
  });

  it("같은 요청이라도 표면 종류에 따라 전달 방식이 갈린다 — 감추지 않는다", () => {
    const agentSide = translate({ kind: "run", surface: surfaceRef("s-1"), request: "x" }, registry);
    const plainSide = translate({ kind: "run", surface: surfaceRef("s-2"), request: "x" }, registry);
    expect(agentSide.ok && plainSide.ok).toBe(true);
    if (!agentSide.ok || !plainSide.ok) return;
    expect(agentSide.call.delivery).not.toBe(plainSide.call.delivery);
  });

  it("요청 문자열을 셸이 고쳐 쓰지 않는다 — 그대로 넘긴다", () => {
    const request = "echo '따옴표 든 것' && ls";
    const out = translate({ kind: "run", surface: surfaceRef("s-2"), request }, registry);
    expect(out.ok && out.call.params["text"]).toBe(request);
  });
});

describe("중단과 확인되지 않은 대응 (FR-ENV-SURFACE.8)", () => {
  it("중단은 터미널 입력으로 간다", () => {
    const out = translate({ kind: "interrupt", surface: surfaceRef("s-2") }, registry);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.call.method).toBe("pane.send_keys");
    expect(out.call.delivery).toBe("terminal-input");
  });

  it("Herdr 0.8 키 표기법은 확인하지 못했고 확인한 척하지 않는다", () => {
    expect(HERDR_0_8_DIALECT.interruptVerified).toBe(false);
    const out = translate({ kind: "interrupt", surface: surfaceRef("s-2") }, registry);
    expect(out.ok && out.call.verified).toBe(false);
  });

  it("표기법을 확인한 방언을 주입하면 판정이 바뀐다 — 값을 박아 둔 것이 아니다", () => {
    const verified = { interruptKeys: ["C-c"], interruptVerified: true };
    const out = translate({ kind: "interrupt", surface: surfaceRef("s-2") }, registry, verified);
    expect(out.ok && out.call.verified).toBe(true);
  });

  it("키 표기는 방언에서 오고 번역기가 지어내지 않는다", () => {
    const other = { interruptKeys: ["ctrl+c", "esc"], interruptVerified: true };
    const out = translate({ kind: "interrupt", surface: surfaceRef("s-2") }, registry, other);
    expect(out.ok && out.call.params["keys"]).toEqual(["ctrl+c", "esc"]);
  });
});

describe("손잡이 발행 (FR-ENV-SURFACE.9)", () => {
  it("발행된 손잡이에 환경 식별자가 들어가지 않는다", () => {
    const minted = mintRegistry([{ surfaceId: "w9:p9" }]);
    expect([...minted.keys()]).toEqual(["s-1"]);
    expect([...minted.keys()].join()).not.toContain("w9");
  });

  it("에이전트 유무가 결속에 보존된다", () => {
    const minted = mintRegistry([{ surfaceId: "a", agentTarget: "a" }, { surfaceId: "b" }]);
    expect(minted.get("s-1")?.agentTarget).toBe("a");
    expect(minted.get("s-2")?.agentTarget).toBeUndefined();
  });
});

describe("살아 있는 Herdr 로 왕복", () => {
  const live = liveHerdrSnapshot();

  it.skipIf(live === null)("실제 관측이 낸 손잡이가 전부 번역된다", () => {
    const { report, registry: liveRegistry } = observe(live as never);
    for (const surface of report.surfaces) {
      const out = translate({ kind: "focus", surface: surface.ref }, liveRegistry);
      expect(out.ok, `${surface.ref.token} 번역 실패`).toBe(true);
    }
  });

  it.skipIf(live === null)("실제 환경에도 두 전달 방식이 모두 나타난다", () => {
    const { report, registry: liveRegistry } = observe(live as never);
    const deliveries = new Set(
      report.surfaces
        .map((s) => translate({ kind: "run", surface: s.ref, request: "x" }, liveRegistry))
        .filter((o) => o.ok)
        .map((o) => (o.ok ? o.call.delivery : "")),
    );
    // 실측(2026-08-26)에서 pane 13개 중 7개가 에이전트를 달고 있었다 — 둘 다 나와야 한다.
    expect(deliveries).toContain("structured");
    expect(deliveries).toContain("terminal-input");
  });

  it.skipIf(live === null)("뇌가 보는 보고에는 환경 식별자가 없다", () => {
    const { report, registry: liveRegistry } = observe(live as never);
    const serialized = JSON.stringify(report);
    for (const binding of liveRegistry.values()) {
      expect(serialized).not.toContain(binding.surfaceId);
    }
  });
});
