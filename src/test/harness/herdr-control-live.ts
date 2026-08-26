// harness/herdr-control-live — 살아 있는 Herdr 에 붙는 제어면 어댑터. node 전용.
//
// 지금까지 이 포트에는 실제 구현이 없었고 대역만 있었다. 대역은 우리가 상상한 모양이라
// "실제 Herdr 이 이런 자원과 개정을 낸다"를 증명하지 못한다.
//
// ⚠️ 읽기는 `herdr api snapshot` 만 쓴다. 변경은 호출자가 넘긴 워크스페이스 안으로만
//    한정한다 — 사용자의 작업 공간을 건드리지 않는다.
import { execFileSync } from "node:child_process";
import type {
  EventEnvelope,
  MutationRequest,
  MutationResult,
  Resource,
  Snapshot,
} from "../../main/domain/herdr-control.js";
import type {
  HerdrConnectionPort,
  HerdrMutatePort,
  HerdrObservePort,
  Unsubscribe,
} from "../../main/ports/herdr-control.js";

function herdr(args: readonly string[]): string {
  return execFileSync("herdr", [...args], { encoding: "utf8", timeout: 30_000 });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * 실제 스냅샷 → 타입이 선언된 자원.
 *
 * ⚠️ Herdr 0.8 에는 전역 개정이 없다. 자원마다 revision 이 따로 붙어 있을 뿐이다(실측).
 *    그래서 전역 개정은 셸이 만든다 — 자원 개정의 합으로 단조 증가시킨다. 실제로 없는
 *    것을 있는 척 읽지 않기 위해, 이 합성이 어디서 일어나는지 여기 적어 둔다.
 */
export function toSnapshot(raw: unknown): Snapshot {
  const snap = (raw ?? {}) as { panes?: unknown[]; workspaces?: unknown[]; tabs?: unknown[] };
  const resources: Resource[] = [];
  let revisionSum = 0;

  const push = (kind: Resource["id"]["kind"], id: string, attributes: Record<string, string>, revision: unknown) => {
    if (!id) return;
    resources.push({ id: { kind, id }, attributes });
    if (typeof revision === "number" && Number.isFinite(revision)) revisionSum += revision;
  };

  for (const p of Array.isArray(snap.panes) ? snap.panes : []) {
    const pane = (p ?? {}) as Record<string, unknown>;
    push(
      "pane",
      str(pane.pane_id),
      {
        workspace: str(pane.workspace_id),
        agent: str(pane.agent),
        agentStatus: str(pane.agent_status),
        focused: String(pane.focused === true),
      },
      pane.revision,
    );
    if (str(pane.agent)) {
      push("agent", str(pane.pane_id), { status: str(pane.agent_status) }, pane.revision);
    }
    if (str(pane.terminal_id)) {
      push("terminal", str(pane.terminal_id), { pane: str(pane.pane_id) }, pane.revision);
    }
  }
  for (const w of Array.isArray(snap.workspaces) ? snap.workspaces : []) {
    const ws = (w ?? {}) as Record<string, unknown>;
    push("space", str(ws.workspace_id), { label: str(ws.label) }, ws.revision);
  }

  return { schemaVersion: 1, revision: { value: resources.length * 1_000 + revisionSum }, resources };
}

export function liveObservePort(): HerdrObservePort {
  return {
    async snapshot(): Promise<Snapshot> {
      const envelope = JSON.parse(herdr(["api", "snapshot"])) as { result?: { snapshot?: unknown } };
      return toSnapshot(envelope.result?.snapshot);
    },
    async subscribe(_onEvent: (event: EventEnvelope) => void): Promise<Unsubscribe> {
      // 이 슬라이스는 폴링 관측만 연다. 이벤트 스트림을 여는 척하지 않는다 —
      // 열지 않은 것을 열린 것처럼 보이게 하면 구독 누락 판정이 거짓이 된다.
      return () => {};
    },
  };
}

/** 변경은 이 워크스페이스 안으로만. 밖이면 거부한다. */
export function liveMutatePort(ownedWorkspaceId: string, onApply?: (request: MutationRequest) => void): HerdrMutatePort {
  return {
    async apply(request: MutationRequest): Promise<MutationResult> {
      onApply?.(request);
      const command = request.command;
      if (!command) {
        return { requestId: request.requestId, outcome: "failed", affected: [], evidence: [] };
      }
      const target = command.args.find((a) => a.includes(":")) ?? "";
      if (!target.startsWith(`${ownedWorkspaceId}:`)) {
        return {
          requestId: request.requestId,
          outcome: "failed",
          affected: [],
          evidence: [`소유하지 않은 대상 거부: ${target}`],
        };
      }
      try {
        const output = herdr([...command.args]);
        return {
          requestId: request.requestId,
          outcome: "completed",
          affected: [{ kind: "pane", id: target }],
          evidence: [output.slice(0, 200) || `herdr ${command.args.join(" ")}`],
        };
      } catch (e) {
        return {
          requestId: request.requestId,
          outcome: "failed",
          affected: [],
          evidence: [e instanceof Error ? e.message : String(e)],
        };
      }
    },
  };
}

export function liveConnectionPort(): HerdrConnectionPort {
  return {
    async reconnect(): Promise<Snapshot | null> {
      try {
        return await liveObservePort().snapshot();
      } catch {
        return null;
      }
    },
  };
}
