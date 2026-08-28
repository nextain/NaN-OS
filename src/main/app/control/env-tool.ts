// app/control/env-tool — #499 조립 (FR-ENV-TOOL.1~9). 포트만 사용. 판정 규칙 0.
import type { BrowserOperationPort, CancellationPort, TerminalOperationPort } from "../../ports/env-tool.js";
import type { StructuredCommand } from "../../domain/herdr-control.js";
import { isStructuredCommand } from "../../domain/herdr-control.js";
import {
  admitEnvOperation,
  canTransition,
  coordinateFallbackNote,
  hasEvidence,
  terminate,
  type ElementTarget,
  type EnvOperationRequest,
  type EnvRejection,
  type Evidence,
  type OperationState,
  type PageObservation,
  type Termination,
} from "../../domain/env-tool.js";
import type { CapabilityTier } from "../../domain/capability.js";

export interface CompletedOperation {
  readonly operationId: string;
  readonly state: OperationState;
  readonly evidence?: Evidence;
  readonly notes: readonly string[];
  readonly deduplicated: boolean;
}

export type EnvOutcome =
  | { readonly ok: true; readonly operation: CompletedOperation }
  | { readonly ok: false; readonly rejections: readonly EnvRejection[] };

export class EnvironmentToolService {
  private readonly states = new Map<string, OperationState>();
  private readonly byIdempotencyKey = new Map<string, CompletedOperation>();

  constructor(
    private readonly browser: BrowserOperationPort,
    private readonly terminal: TerminalOperationPort,
    private readonly cancellation: CancellationPort,
    private readonly grantedTiers: readonly CapabilityTier[],
  ) {}

  stateOf(operationId: string): OperationState | undefined {
    return this.states.get(operationId);
  }

  /** 브라우저 클릭. 참조가 없어 좌표를 썼다면 그 사실을 결과에 남긴다 (FR-ENV-TOOL.3). */
  async click(request: EnvOperationRequest, target: ElementTarget, page?: PageObservation): Promise<EnvOutcome> {
    return this.run(request, page, async () => {
      const evidence = await this.browser.click(request, target);
      const note = coordinateFallbackNote(target);
      return { evidence: { kind: "browser", value: evidence } as Evidence, notes: note ? [note] : [] };
    });
  }

  async exec(request: EnvOperationRequest, terminalId: string, command: StructuredCommand, page?: PageObservation): Promise<EnvOutcome> {
    if (!isStructuredCommand(command)) {
      return { ok: false, rejections: [{ code: "workspace-escape", detail: `명령이 구조화되지 않았다: ${command.executable}` }] };
    }
    return this.run(request, page, async () => ({
      evidence: { kind: "terminal", value: await this.terminal.exec(request, terminalId, command) } as Evidence,
      notes: [],
    }));
  }

  /** 취소 (FR-ENV-TOOL.9). 이미 일어난 일은 남기고 성공으로 승격하지 않는다. */
  async cancel(operationId: string): Promise<Termination> {
    const state = this.states.get(operationId);
    if (!state || !canTransition(state, "cancelled")) {
      return terminate("cancelled", []);
    }
    const partial = await this.cancellation.cancel(operationId);
    this.states.set(operationId, "cancelled");
    return terminate("cancelled", partial);
  }

  private async run(
    request: EnvOperationRequest,
    page: PageObservation | undefined,
    body: () => Promise<{ evidence: Evidence; notes: readonly string[] }>,
  ): Promise<EnvOutcome> {
    const cached = this.byIdempotencyKey.get(request.idempotencyKey);
    if (cached) return { ok: true, operation: { ...cached, deduplicated: true } };

    const rejections = admitEnvOperation(request, { grantedTiers: this.grantedTiers, page });
    if (rejections.length > 0) return { ok: false, rejections };

    this.states.set(request.operationId, "accepted");
    this.states.set(request.operationId, "running");
    let result: { evidence: Evidence; notes: readonly string[] };
    try {
      result = await body();
    } catch (e) {
      this.states.set(request.operationId, "failed");
      return { ok: false, rejections: [{ code: "workspace-escape", detail: String(e) }] };
    }
    if (!hasEvidence("completed", result.evidence)) {
      this.states.set(request.operationId, "failed");
      return { ok: false, rejections: [{ code: "workspace-escape", detail: "증거 없는 완료는 수용하지 않는다" }] };
    }
    this.states.set(request.operationId, "completed");
    const operation: CompletedOperation = {
      operationId: request.operationId,
      state: "completed",
      evidence: result.evidence,
      notes: result.notes,
      deduplicated: false,
    };
    this.byIdempotencyKey.set(request.idempotencyKey, operation);
    return { ok: true, operation };
  }
}
