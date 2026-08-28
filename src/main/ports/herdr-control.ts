// ports/herdr-control — #502 driven 인터페이스. domain 만 의존. 모든 메서드 async.
// ⚠️ 이 표면에는 raw 문자열 입력도 private socket 핸들도 없다. 그것이 제어 프로토콜이 아니라는 뜻이
//    문서가 아니라 타입으로 남아야 한다 (FR-HERDR-CONTROL.1, #434 승계).
import type { EventEnvelope, MutationRequest, MutationResult, Snapshot } from "../domain/herdr-control.js";

export type Unsubscribe = () => void;

export interface HerdrObservePort {
  /** 현재 스냅샷. 화면을 긁지 않는다. */
  snapshot(): Promise<Snapshot>;
  /** 변화 구독. 개정이 연속인지 판단하는 것은 소비자 몫이다. */
  subscribe(onEvent: (event: EventEnvelope) => void): Promise<Unsubscribe>;
}

export interface HerdrMutatePort {
  /** 수용된 요청을 실행한다. 판정은 이미 끝난 뒤에만 호출된다. */
  apply(request: MutationRequest): Promise<MutationResult>;
}

export interface HerdrConnectionPort {
  /** 재접속 시도. 성공하면 재동기화된 스냅샷을 돌려준다. */
  reconnect(): Promise<Snapshot | null>;
}
