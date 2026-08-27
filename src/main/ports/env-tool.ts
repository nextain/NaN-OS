// ports/env-tool — #499 driven 인터페이스. domain 만 의존. 모든 메서드 async.
// 터미널의 생명주기 소유는 Herdr 에 있다 — 여기서는 요청만 한다 (FR-ENV-TOOL.5).
import type { BrowserEvidence, ElementTarget, EnvOperationRequest, TerminalEvidence } from "../domain/env-tool.js";
import type { StructuredCommand } from "../domain/herdr-control.js";

export interface BrowserOperationPort {
  open(request: EnvOperationRequest, url: string): Promise<BrowserEvidence>;
  snapshot(request: EnvOperationRequest): Promise<BrowserEvidence>;
  click(request: EnvOperationRequest, target: ElementTarget): Promise<BrowserEvidence>;
  fill(request: EnvOperationRequest, target: ElementTarget, value: string): Promise<BrowserEvidence>;
  close(request: EnvOperationRequest): Promise<void>;
}

/** 터미널 실행 요청. Herdr 가 만든 터미널을 참조할 뿐 직접 소유하지 않는다. */
export interface TerminalOperationPort {
  exec(request: EnvOperationRequest, terminalId: string, command: StructuredCommand): Promise<TerminalEvidence>;
}

export interface CancellationPort {
  cancel(operationId: string): Promise<readonly string[]>;
}
