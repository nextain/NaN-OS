// #502 살아 있는 Herdr 조회 헬퍼. node 전용 — 배포 표면 밖(src/test)이라 셸 번들에 들어가지 않는다.
// 읽기 전용 명령(`herdr api snapshot`)만 쓴다. 사용자의 실제 세션을 바꾸지 않는다.
import { execFileSync } from "node:child_process";
import { describe } from "vitest";

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

/**
 * Herdr 가 이 기계에 설치돼 있는가.
 *
 * 실환경 증거를 만드는 계약 테스트는 실제 `herdr` 를 부른다. 도구가 없는
 * 기계(예: CI 러너)에서는 그 증거를 만들 수 없다 — 만들 수 없는 것과 코드가
 * 깨진 것은 다르다. 예전에는 둘을 구분하지 않아 `spawnSync herdr ENOENT` 가
 * 실패로 보고됐고, 그 실패가 CI 를 멈춰 뒤 단계를 전부 건너뛰게 했다.
 *
 * 없으면 건너뛴다. 건너뛴 실행은 증명서를 남기지 않으므로 벤치도 그것을
 * 실환경 증거로 세지 않는다 — 통과로 위장되지 않는다.
 */
export function herdrIsInstalled(): boolean {
	try {
		execFileSync("herdr", ["--version"], { encoding: "utf8", timeout: 10_000 });
		return true;
	} catch {
		return false;
	}
}

/** 도구가 없으면 건너뛰는 describe. 이유를 이름에 남긴다. */
export const describeWithHerdr: typeof describe = herdrIsInstalled()
	? describe
	: (describe.skip as typeof describe);
