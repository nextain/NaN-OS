// 실패 우선 고리를 고정한다 — 무엇을 다시 돌리고, 재시험이 무엇을 대신하지
// 못하는가.
//
// 왜 이 파일이 있는가: 지금까지 러너는 실패 하나를 다시 확인하려면 그 기계의
// 몫 전부를 돌려야 했다(자격증명 등급 쉰다섯 개, 한 시간). 그래서 고치고
// 확인하는 고리가 한 시간짜리가 되고, 사람은 확인을 미루거나 눈으로 때웠다.
// 오너가 정한 순서는 [전체 → 실패 → 실패만 재시험 → 고침 → 재시험 실패 0 →
// 전체 한 번 확정] 이다.
//
// 그 고리에는 한 가지 위험이 있다. **재시험이 전체 기록을 대신하면 실패 우선이
// 곧 거짓 초록이 된다** — 실패 셋만 다시 돌려 통과시키고 "다 덮였다" 가 되는
// 길이다. 그래서 여기서 재는 것은 둘이다. 무엇을 고르는가, 그리고 고른 것을
// 다시 돌린 기록이 완결성 판정에 들어가지 **못하는가**.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const SELECTION_URL = pathToFileURL(
	resolve(ROOT, "scripts", "lib", "retest-selection.mjs"),
).href;
const GATE = resolve(ROOT, "scripts", "check-regression-complete.mjs");

/** 모듈 표면. `.mjs` 정적 import 는 루트 tsc 프로그램을 오염시킨다. */
interface RetestModule {
	retestTargets(record: unknown): {
		specs: string[];
		envMissing: string[];
		legacy: boolean;
	};
	pickLatestRecord(
		entries: readonly { file: string; record: unknown }[],
		machine: string,
	): { file: string; record: unknown } | null;
	isRetestRecord(record: unknown): boolean;
	retestSourceName(file: string): string;
}

const load = async (): Promise<RetestModule> =>
	(await import(SELECTION_URL)) as unknown as RetestModule;

/** 실제 기록의 모양. 이 셋이 선택 규칙의 입력 전부다. */
function record(over: Record<string, unknown> = {}) {
	return {
		machine: "naia-os-3090",
		tiers: ["credentialed_live"],
		started: "2026-09-06T00:00:00.000Z",
		finished: "2026-09-06T01:00:00.000Z",
		status: "failed",
		planned: ["a.spec.ts", "b.spec.ts", "c.spec.ts", "d.spec.ts"],
		executed: ["a.spec.ts", "b.spec.ts", "c.spec.ts"],
		passedSpecs: ["a.spec.ts"],
		envMissingBeforeRun: {},
		...over,
	};
}

describe("실패 우선 — 무엇을 다시 돌리는가", () => {
	it("돌았는데 실패한 것과 아예 돌지 못한 것을 함께 고른다", async () => {
		const { retestTargets } = await load();
		const { specs, envMissing, legacy } = retestTargets(record());

		// b·c 는 돌았고 통과 목록에 없다. d 는 차례가 오지 않았다 — 묶음이
		// 중간에 죽었거나 전제가 무너진 자리다. 이것을 빼면 "실패 0" 이
		// 거짓이 된다.
		expect(specs).toEqual(["b.spec.ts", "c.spec.ts", "d.spec.ts"]);
		expect(envMissing).toEqual([]);
		expect(legacy).toBe(false);
	});

	it("통과한 것은 고르지 않는다", async () => {
		const { retestTargets } = await load();

		// 반대 방향을 못 박지 않으면 "전부 다시 돌린다" 도 통과한다. 그러면
		// 재시험이 다시 한 시간짜리가 되어 이 수정의 뜻이 사라진다.
		const all = retestTargets(
			record({ passedSpecs: ["a.spec.ts", "b.spec.ts", "c.spec.ts"] }),
		);
		expect(all.specs).toEqual(["d.spec.ts"]);
	});

	it("요구 환경이 없어 건너뛴 것은 빼되 보고에는 남긴다", async () => {
		const { retestTargets } = await load();
		const { specs, envMissing } = retestTargets(
			record({ envMissingBeforeRun: { "c.spec.ts": ["OPENAI_API_KEY"] } }),
		);

		// 실패가 아니라 준비 부족이다. 다시 돌려도 같은 자리에서 같은 이유로
		// 빠진다. 그렇다고 목록에서 지우면 "이 기계는 왜 이것을 영영 안
		// 도는가" 를 아무도 묻지 않게 된다.
		expect(specs).toEqual(["b.spec.ts", "d.spec.ts"]);
		expect(envMissing).toEqual(["c.spec.ts"]);
	});

	it("passedSpecs 가 없던 옛 기록은 그 사실을 밝힌다", async () => {
		const { retestTargets } = await load();
		const legacyRecord = record();
		(legacyRecord as { passedSpecs?: unknown }).passedSpecs = undefined;
		const { specs, legacy } = retestTargets(legacyRecord);

		// 그때 `executed` 는 통과한 것만 담았으므로 "돌았는데 실패한 것" 을 알
		// 길이 없다. 조용히 적게 고르면 "실패 0" 이 다시 거짓이 되므로,
		// 부르는 쪽이 사람에게 말할 수 있게 표시를 남긴다.
		expect(legacy).toBe(true);
		expect(specs).toEqual(["d.spec.ts"]);
	});

	it("이 기계의 가장 최근 기록을 고르고, 재시험도 이어받는다", async () => {
		const { pickLatestRecord } = await load();
		const entries = [
			{ file: "old.json", record: record({ finished: "2026-09-06T01:00:00.000Z" }) },
			{
				file: "retest.json",
				record: record({ finished: "2026-09-06T02:00:00.000Z", kind: "retest" }),
			},
			{
				file: "other-machine.json",
				record: record({ machine: "win-rtx4060", finished: "2026-09-06T03:00:00.000Z" }),
			},
		];

		// 재시험을 후보에서 빼면 두 번째 재시험이 이미 고친 것을 계속 다시
		// 돈다. 고리는 [전체 → 재시험 → 고침 → 재시험] 이므로 이어받아야 한다.
		expect(pickLatestRecord(entries, "naia-os-3090")?.file).toBe("retest.json");
		// 다른 기계의 기록은 이 기계의 몫이 아니다.
		expect(pickLatestRecord(entries, "win-rtx4060")?.file).toBe(
			"other-machine.json",
		);
		expect(pickLatestRecord(entries, "없는-기계")).toBeNull();
	});
});

// ── 재시험은 전체 기록을 대신하지 못한다 ────────────────────────────────────

const scratch: string[] = [];

afterAll(() => {
	while (scratch.length) rmSync(scratch.pop() as string, { recursive: true, force: true });
});

/**
 * 완결성 게이트를 그 자리에서 돌린다.
 *
 * 게이트는 상대 경로(`docs/e2e-inventory.json`, `docs/regression-runs`)를 읽으므로
 * 임시 저장소를 하나 세우고 그 안에서 부른다. 실제 인벤토리와 명단을 복사해
 * 쓰는 이유는, 손으로 지어낸 인벤토리로 재면 지문 규칙 같은 다른 관문에 걸려
 * 이 계약이 재려는 것을 재지 못하기 때문이다.
 */
function runGateWith(records: Record<string, unknown>[]): {
	code: number;
	out: string;
} {
	const dir = mkdtempSync(resolve(tmpdir(), "naia-retest-gate-"));
	scratch.push(dir);
	mkdirSync(resolve(dir, "docs", "regression-runs"), { recursive: true });
	cpSync(
		resolve(ROOT, "docs", "e2e-inventory.json"),
		resolve(dir, "docs", "e2e-inventory.json"),
	);
	cpSync(
		resolve(ROOT, "docs", "regression-runs", "machines.json"),
		resolve(dir, "docs", "regression-runs", "machines.json"),
	);
	records.forEach((value, index) => {
		writeFileSync(
			resolve(dir, "docs", "regression-runs", `naia-os-3090-probe-${index}.json`),
			JSON.stringify(value, null, "\t"),
		);
	});
	const result = spawnSync(process.execPath, [GATE, "--max-age-hours=24"], {
		cwd: dir,
		encoding: "utf8",
	});
	return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

/** 지금 인벤토리·커밋으로 찍은 지문. 이것이 없으면 게이트가 기록을 버린다. */
function stamp(): Record<string, string> {
	const digest = execFileSync(
		process.execPath,
		[
			"-e",
			'import("./scripts/lib/inventory-digest.mjs").then((m) => process.stdout.write(m.inventoryDigestFromFile("docs/e2e-inventory.json")))',
		],
		{ cwd: ROOT, encoding: "utf8" },
	);
	return {
		inventorySha256: digest,
		commit: "probe",
		host: "probe",
		platform: "linux-x64",
		node: process.version,
	};
}

/** 이 기계가 맡은 스펙 전부를 통과시킨 기록 — 덮임을 말할 수 있는 유일한 모양. */
function fullRecord(over: Record<string, unknown> = {}) {
	const inventory = JSON.parse(
		execFileSync(
			process.execPath,
			["-e", 'process.stdout.write(require("fs").readFileSync("docs/e2e-inventory.json","utf8"))'],
			{ cwd: ROOT, encoding: "utf8" },
		),
	) as { specs: { spec: string }[] };
	const all = inventory.specs.map((s) => s.spec);
	const now = new Date().toISOString();
	return {
		machine: "naia-os-3090",
		tiers: ["deterministic_ci", "credentialed_live", "native_local"],
		ranOn: stamp(),
		started: now,
		finished: now,
		status: "passed",
		planned: all,
		executed: all,
		passedSpecs: all,
		premise: "ok",
		envMissingBeforeRun: {},
		groups: [],
		flakySpecs: [],
		stableFailures: [],
		...over,
	};
}

describe("재시험은 전체 기록을 대신하지 못한다", () => {
	it("재시험 기록만 있으면 덮였다고 말하지 않는다", () => {
		const retestOnly = fullRecord({
			kind: "retest",
			retestOf: "naia-os-3090-2026-09-06T00-21-34-265Z.json",
		});
		const { code, out } = runGateWith([retestOnly]);

		// 이 기록은 스펙 전부를 통과로 담고 있다. 그런데도 붉어야 한다 —
		// 재시험은 그 기계의 몫 전체를 잰 것이 아니기 때문이다. 여기서
		// 초록이 나오면 실패 셋만 다시 돌려 "다 덮였다" 를 만들 수 있다.
		expect(out).toContain("재시험");
		expect(code).not.toBe(0);
	});

	it("같은 내용이라도 kind 가 없으면 판정에 들어간다", () => {
		const { code, out } = runGateWith([fullRecord()]);

		// 반대 방향을 못 박지 않으면 "언제나 뺀다" 도 통과한다. 그러면 어떤
		// 기록으로도 덮임을 말할 수 없게 되어 게이트가 영영 붉는다.
		expect(out).not.toContain("재시험 기록");
		expect(code).toBe(0);
	});
});
