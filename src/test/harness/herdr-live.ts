// #502 살아 있는 Herdr 조회 헬퍼. node 전용 — 배포 표면 밖(src/test)이라 셸 번들에 들어가지 않는다.
// 읽기 전용 명령(`herdr api snapshot`)만 쓴다. 사용자의 실제 세션을 바꾸지 않는다.
import { execFileSync } from "node:child_process";

/** herdr 가 없거나 서버가 안 떠 있으면 null. 없는 것을 있는 척하지 않는다. */
export function liveHerdrSnapshot(): unknown | null {
  try {
    const raw = execFileSync("herdr", ["api", "snapshot"], { encoding: "utf8", timeout: 20_000 });
    const envelope = JSON.parse(raw) as { readonly result?: { readonly snapshot?: unknown } };
    return envelope.result?.snapshot ?? null;
  } catch {
    return null;
  }
}
