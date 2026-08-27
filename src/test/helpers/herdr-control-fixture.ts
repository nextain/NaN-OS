// #502 계약 테스트용 대역 포트. 결정론 — 실제 Herdr 도 시계도 쓰지 않는다.
import type { HerdrConnectionPort, HerdrMutatePort, HerdrObservePort, Unsubscribe } from "../../main/ports/herdr-control.js";
import type { EventEnvelope, MutationRequest, MutationResult, Resource, Snapshot } from "../../main/domain/herdr-control.js";

export function resource(kind: Resource["id"]["kind"], id: string, attributes: Record<string, string> = {}): Resource {
  return { id: { kind, id }, attributes };
}

export function snapshot(value: number, resources: readonly Resource[] = [resource("space", "s1")]): Snapshot {
  return { schemaVersion: 1, revision: { value }, resources };
}

export interface FakeObserve extends HerdrObservePort {
  emit(event: EventEnvelope): void;
  unsubscribed: boolean;
}

export function fakeObserve(initial: Snapshot = snapshot(1)): FakeObserve {
  let listener: ((e: EventEnvelope) => void) | null = null;
  const fake: FakeObserve = {
    unsubscribed: false,
    async snapshot() {
      return initial;
    },
    async subscribe(onEvent): Promise<Unsubscribe> {
      listener = onEvent;
      return () => {
        fake.unsubscribed = true;
        listener = null;
      };
    },
    emit(event) {
      listener?.(event);
    },
  };
  return fake;
}

export interface FakeMutate extends HerdrMutatePort {
  readonly applied: MutationRequest[];
}

export function fakeMutate(result?: Partial<MutationResult>): FakeMutate {
  const applied: MutationRequest[] = [];
  return {
    applied,
    async apply(request) {
      applied.push(request);
      return {
        requestId: request.requestId,
        outcome: "completed",
        affected: [{ kind: "terminal", id: "t1" }],
        evidence: ["log:1"],
        ...result,
      };
    },
  };
}

export function fakeConnection(sequence: readonly (Snapshot | null)[]): HerdrConnectionPort {
  let i = 0;
  return {
    async reconnect() {
      const next = sequence[Math.min(i, sequence.length - 1)] ?? null;
      i += 1;
      return next;
    },
  };
}

export function event(value: number, res: Resource = resource("terminal", "t1")): EventEnvelope {
  return { schemaVersion: 1, revision: { value }, kind: "updated", resource: res };
}

export const COMMAND = { executable: "pnpm", args: ["test"], cwd: "/ws", env: { CI: "1" } };

export function request(over: Partial<MutationRequest> = {}): MutationRequest {
  return {
    requestId: "r1",
    idempotencyKey: "k1",
    expectedRevision: { value: 1 },
    capability: "workspace-write",
    command: COMMAND,
    timeoutMs: 1_000,
    ...over,
  };
}
