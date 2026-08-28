// #502 살아 있는 Herdr 로 제어면을 끝까지 밟는다 (UC-HERDR-CONTROL-*, native 증거).
//
// 왜 따로 있는가: 제어면 계약 테스트는 전부 대역 포트로 돈다. 대역은 우리가 상상한
// 모양이라 "실제 Herdr 이 이런 자원과 개정을 낸다"를 증명하지 못한다. 실제로 이 저장소에는
// 이 포트의 실제 구현이 하나도 없었다(2026-08-26 실측) — 그래서 붙여 보기 전까지
// 무엇이 맞는지 아무도 확인한 적이 없다.
//
// ⚠️ 읽기는 읽기 전용 명령만 쓴다. 변경은 이 테스트가 만든 워크스페이스 안으로만 하고
//    끝나면 닫는다. 어댑터가 소유 밖 대상을 거부하므로 판정이 틀려도 남의 터미널로 못 간다.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { writeAttestation } from "./harness/bench-execution.js";
import { resolve as resolvePath } from "node:path";

const REPO_ROOT_FOR_ATTEST = resolvePath(__dirname, "..", "..");
import { execFileSync } from "node:child_process";
import { HerdrControlPlane } from "../main/app/control/herdr-control.js";
import { ALL_TIERS } from "../main/domain/capability.js";
import { liveConnectionPort, liveMutatePort, liveObservePort, toSnapshot } from "./harness/herdr-control-live.js";
import type { MutationRequest } from "../main/domain/herdr-control.js";

/**
 * 실제로 돈 케이스를 러너에서 모은다. 손으로 적은 목록은 테스트를 고칠 때 따라오지 않아
 * 작성자가 관리하는 매핑이 하나 더 느는 것뿐이다(2026-08-27 적대리뷰).
 */
const passedCases: string[] = [];
afterEach((ctx) => {
  if (ctx.task.result?.state === "pass") passedCases.push(ctx.task.name);
});

function herdr(args: readonly string[]): string {
  return execFileSync("herdr", [...args], { encoding: "utf8", timeout: 30_000 });
}

const NONCE = `naia-ctl-${Date.now().toString(36)}`;
const POLICY = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 };

let workspaceId = "";
let paneId = "";
let setupError = "";
const applied: MutationRequest[] = [];

beforeAll(() => {
  try {
    const created = JSON.parse(herdr(["workspace", "create", "--cwd", "/tmp", "--label", NONCE])) as {
      result?: { workspace?: { workspace_id?: string }; root_pane?: { pane_id?: string } };
    };
    workspaceId = created.result?.workspace?.workspace_id ?? "";
    paneId = created.result?.root_pane?.pane_id ?? "";
    if (!workspaceId || !paneId) throw new Error("워크스페이스 생성 결과가 비었다");
    herdr(["pane", "rename", paneId, NONCE]);
  } catch (e) {
    setupError = e instanceof Error ? e.message : String(e);
  }
}, 60_000);

afterAll(() => {
  if (workspaceId) {
    let closeError = "";
    try {
      herdr(["workspace", "close", workspaceId]);
    } catch (e) {
      closeError = e instanceof Error ? e.message : String(e);
    }
    // 정리 실패를 삼키면 사용자 화면에 잔재가 남는데도 벤치는 아무 일 없었다고 본다
    // (2026-08-27 적대리뷰 지적). 실제로 사라졌는지 확인하고, 안 사라졌으면 알린다.
    // 확인 자체가 실패하면 "없다"가 아니라 "모른다"이다. 모르는 것을 깨끗함으로 읽지 않는다
    // (2026-08-27 3차 적대리뷰 지적).
    let stillThere: boolean;
    try {
      stillThere = herdr(["workspace", "list"]).includes(NONCE);
    } catch (e) {
      throw new Error(`정리 확인에 실패했다 — 잔재 여부를 모른다: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (stillThere) {
      throw new Error(`테스트 워크스페이스가 남았다: ${NONCE} ${closeError}`);
    }
  }

  // 이 실행이 실제로 무엇을 만졌는지 남긴다. 벤치는 이 증명서가 있어야 native 영수증을 준다.
  writeAttestation(REPO_ROOT_FOR_ATTEST, {
    spec: "src/test/herdr-control-live.contract.test.ts",
    kinds: ["native"],
    cases: passedCases,
    touched: [workspaceId, paneId].filter(Boolean),
    at: Date.now(),
  });
}, 60_000);

function plane(): HerdrControlPlane {
  return new HerdrControlPlane(
    liveObservePort(),
    liveMutatePort(workspaceId, (r) => applied.push(r)),
    liveConnectionPort(),
    ALL_TIERS,
    POLICY,
  );
}

function request(overrides: Partial<MutationRequest> & { expectedRevision: { value: number } }): MutationRequest {
  return {
    requestId: `req-${NONCE}`,
    idempotencyKey: `key-${NONCE}`,
    capability: "workspace-write",
    timeoutMs: 20_000,
    command: {
      executable: "herdr",
      args: ["pane", "run", paneId, `echo ${NONCE}-ctl`],
      cwd: "/tmp",
      env: {},
    },
    ...overrides,
  };
}

describe("살아 있는 Herdr 제어면 (native)", () => {
  it("전용 워크스페이스를 실제로 만들었다 — 없으면 이 증거는 성립하지 않는다", () => {
    expect(setupError, setupError).toBe("");
    expect(paneId.startsWith(`${workspaceId}:`)).toBe(true);
  });

  it("자원을 타입이 선언된 값으로 읽는다 (UC-HERDR-CONTROL-OBSERVE)", async () => {
    const snap = await plane().observeNow();
    expect(snap.schemaVersion).toBe(1);
    expect(snap.resources.length, "실제 세션에서 자원을 하나도 못 읽었다").toBeGreaterThan(0);
    const kinds = new Set(snap.resources.map((r) => r.id.kind));
    expect(kinds.has("pane"), "pane 자원이 없다").toBe(true);
    // 우리가 만든 표면이 실제로 목록에 있다.
    expect(snap.resources.some((r) => r.id.id === paneId)).toBe(true);
  });

  it("화면 문자열을 긁지 않는다 — 자원은 선언된 속성만 갖는다", async () => {
    const snap = await plane().observeNow();
    for (const r of snap.resources) {
      for (const v of Object.values(r.attributes)) {
        // 터미널 화면 내용(줄바꿈 덩어리)이 속성으로 새어 들어오지 않는다.
        expect(v.includes("\n"), `속성에 화면 내용이 섞였다: ${JSON.stringify(r)}`).toBe(false);
      }
    }
  });

  it("스냅샷에 개정이 실려 있고 단조 증가한다 (UC-HERDR-CONTROL-OBSERVE)", async () => {
    const p = plane();
    const first = await p.observeNow();
    expect(Number.isFinite(first.revision.value)).toBe(true);
    // 같은 상태를 두 번 읽으면 개정이 뒷걸음질치지 않는다.
    const second = await p.observeNow();
    expect(second.revision.value).toBeGreaterThanOrEqual(first.revision.value);
  });

  it("구조화된 요청이 실제로 실행된다 (UC-HERDR-CONTROL-MUTATE)", async () => {
    const p = plane();
    const snap = await p.observeNow();
    const outcome = await p.requestMutation(request({ expectedRevision: snap.revision }));
    expect(outcome.ok, `거절: ${JSON.stringify(outcome)}`).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.outcome).toBe("completed");
    expect(outcome.result.evidence.length, "증거 없는 성공을 만들었다").toBeGreaterThan(0);
  }, 60_000);

  it("같은 멱등 키를 다시 보내도 두 번 실행하지 않는다 (UC-HERDR-CONTROL-MUTATE)", async () => {
    const p = plane();
    const snap = await p.observeNow();
    applied.length = 0;
    const first = await p.requestMutation(request({ expectedRevision: snap.revision }));
    const again = await p.requestMutation(request({ expectedRevision: snap.revision }));
    expect(first.ok && again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.deduplicated, "같은 키인데 다시 실행됐다").toBe(true);
    expect(applied.length, `환경에 두 번 나갔다: ${applied.length}`).toBe(1);
  }, 60_000);

  it("소유하지 않은 대상은 실제 환경에 닿지 못한다", async () => {
    const p = plane();
    const snap = await p.observeNow();
    const outcome = await p.requestMutation(
      request({
        expectedRevision: snap.revision,
        idempotencyKey: `key-foreign-${NONCE}`,
        command: { executable: "herdr", args: ["pane", "run", "wZZ:p9", "echo nope"], cwd: "/tmp", env: {} },
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.outcome).toBe("failed");
    expect(outcome.result.evidence.join(" ")).toContain("소유하지 않은 대상");
  }, 60_000);

  it("낡은 개정으로 온 요청은 충돌로 거절된다 (UC-HERDR-CONTROL-STALE-REVISION)", async () => {
    const p = plane();
    const snap = await p.observeNow();
    applied.length = 0;
    const outcome = await p.requestMutation(
      request({
        expectedRevision: { value: snap.revision.value - 1 },
        idempotencyKey: `key-stale-${NONCE}`,
      }),
    );
    expect(outcome.ok, "낡은 개정인데 통과했다").toBe(false);
    if (outcome.ok) return;
    expect(outcome.rejections.map((r) => r.code)).toContain("stale-revision");
    expect(applied.length, "거절인데 환경에 나갔다").toBe(0);
  }, 60_000);

  it("셸 한 줄을 실행 파일 자리에 밀어 넣을 수 없다", async () => {
    const p = plane();
    const snap = await p.observeNow();
    applied.length = 0;
    const outcome = await p.requestMutation(
      request({
        expectedRevision: snap.revision,
        idempotencyKey: `key-shell-${NONCE}`,
        command: { executable: "sh -c 'rm -rf /'", args: [], cwd: "/tmp", env: {} },
      }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rejections.map((r) => r.code)).toContain("unstructured-command");
    expect(applied.length).toBe(0);
  }, 60_000);

  it("재접속하면 현재 상태를 다시 확인한다 (UC-HERDR-CONTROL-RECONNECT)", async () => {
    const p = plane();
    await p.observeNow();
    const out = await p.reconnect(async () => {});
    expect(out.stance, "다시 붙었는데 재동기화됐다고 말하지 않는다").toBe("resynced");
    expect(out.attempts).toBeGreaterThan(0);
  }, 60_000);

  it("이벤트 스트림을 열지 않았으므로 누락을 봤다고 말하지 않는다", async () => {
    const p = plane();
    await p.observeNow();
    const stop = await p.watch(() => {});
    stop();
    // 열지 않은 구독에서 누락을 지어내지 않는다.
    expect(p.observedGaps()).toEqual([]);
  });

  it("합성한 전역 개정이 자원 수에 반응한다 — 죽은 상수가 아니다", () => {
    const one = toSnapshot({ panes: [{ pane_id: "wA:p1", revision: 1 }] });
    const two = toSnapshot({ panes: [{ pane_id: "wA:p1", revision: 1 }, { pane_id: "wA:p2", revision: 1 }] });
    expect(two.revision.value).toBeGreaterThan(one.revision.value);
  });
});
