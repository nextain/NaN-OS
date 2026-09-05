// 회귀 러너가 **환경이 없다고 말한 스펙을 실제로 빼는지** 고정한다.
//
// 왜 이 파일이 있는가: 러너는 십몇 분 도는 프로그램이라, 선별이 옳은지 보려면
// 매번 그 시간을 다시 써야 했다. 그래서 아무도 확인하지 않았고, 확인하지 않은
// 자리가 실제로 어긋났다. `docs/regression-runs/naia-os-3090-2026-09-05T18-02-15-115Z.json`
// 은 그 어긋남이 남은 기계 기록이다 — 러너가 세 스펙을 `envMissingBeforeRun`
// 에 적어 놓고 셋 다 wdio 에 넘겼다. 하나(`96-voice-linux-app-start`)는
// `NAIA_E2E_NAIA_KEY must be a Naia member gateway key` 로 죽어 `stableFailures`
// 에 올랐고, 다른 하나(`88-stt-tts-combo-verification`)는 스스로 통과해
// `executed` 에 올랐다. 재지 않은 것이 한쪽에서는 결함으로, 다른 쪽에서는
// 통과로 세어진 것이다.
//
// 그래서 여기서 재는 것은 러너의 출력이 아니라 **선별 함수 자체**다. 그날의
// 기계에 어떤 키가 있었는지와 무관하게, 같은 입력이면 같은 판단이 나와야 한다.
// 픽스처는 그 기록에서 실제로 어긋났던 세 스펙과 그것들이 속한 설정이다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const MODULE_URL = pathToFileURL(
	resolve(ROOT, "scripts", "lib", "regression-selection.mjs"),
).href;

/** 인벤토리 한 줄. `docs/e2e-inventory.json` 의 `specs[]` 모양 그대로다. */
type SpecEntry = {
	spec: string;
	conf: readonly string[];
	env: readonly string[];
	tier: string;
};

type Selection = {
	partitionByEnv(
		specs: readonly SpecEntry[],
		env: Record<string, string | undefined>,
	): { runnable: SpecEntry[]; envMissing: Map<string, string[]> };
	groupByConf(specs: readonly SpecEntry[]): Map<string, string[]>;
	planGroups(
		specs: readonly SpecEntry[],
		env: Record<string, string | undefined>,
	): {
		groups: Map<string, string[]>;
		runnable: SpecEntry[];
		envMissing: Map<string, string[]>;
		skippedGroups: { conf: string; specs: string[]; reason: string }[];
	};
	wdioSpecArgs(specNames: readonly string[]): string[];
};

const load = async (): Promise<Selection> =>
	(await import(MODULE_URL)) as unknown as Selection;

/**
 * 실제 기계 기록. 픽스처를 손으로 지어내면 그날 어긋난 모양이 아니라 내가
 * 상상한 모양을 재게 된다.
 */
const RECORD = JSON.parse(
	readFileSync(
		resolve(
			ROOT,
			"docs/regression-runs/naia-os-3090-2026-09-05T18-02-15-115Z.json",
		),
		"utf8",
	),
) as {
	planned: string[];
	executed: string[];
	stableFailures: string[];
	envMissingBeforeRun: Record<string, string[]>;
};

/** 그 기록이 맡았던 몫을 인벤토리에서 그대로 집는다. */
const INVENTORY = JSON.parse(
	readFileSync(resolve(ROOT, "docs/e2e-inventory.json"), "utf8"),
) as { specs: SpecEntry[] };
const MINE: SpecEntry[] = INVENTORY.specs.filter((s) =>
	RECORD.planned.includes(s.spec),
);

/**
 * 그날 기계의 환경. 기록의 `envMissingBeforeRun` 에 적힌 이름만 없고 나머지
 * 요구 변수는 있었다는 뜻이므로, 그대로 되살린다. 값은 아무 문자열이면 된다 —
 * 이 함수는 있는지 없는지만 본다. 진짜 키는 쓰지 않는다.
 */
function envOfThatRun(): Record<string, string> {
	const absent = new Set(Object.values(RECORD.envMissingBeforeRun).flat());
	const env: Record<string, string> = {};
	for (const spec of MINE) {
		for (const name of spec.env) if (!absent.has(name)) env[name] = "present";
	}
	return env;
}

describe("회귀 스펙 선별", () => {
	it("기록이 남은 그 실행에서, 환경이 없던 세 스펙이 실행 목록에 없다", async () => {
		const { planGroups } = await load();
		const { groups, envMissing } = planGroups(MINE, envOfThatRun());

		// 먼저 픽스처가 그날을 정말 되살렸는지 본다. 이것이 어긋나면 아래
		// 단정은 다른 상황을 재는 것이다.
		expect([...envMissing.keys()].sort()).toEqual(
			Object.keys(RECORD.envMissingBeforeRun).sort(),
		);

		const passedToWdio = new Set([...groups.values()].flat());
		for (const spec of Object.keys(RECORD.envMissingBeforeRun)) {
			expect(passedToWdio.has(spec)).toBe(false);
		}
	});

	it("그날 결함으로 기록된 96-voice-linux-app-start 는 애초에 넘어가지 않는다", async () => {
		const { planGroups } = await load();
		const { groups } = planGroups(MINE, envOfThatRun());
		const passedToWdio = new Set([...groups.values()].flat());

		// 기록에는 이것이 `stableFailures` 에 있다 — 두 번 돌려 두 번 죽었다.
		// 죽은 이유는 회귀가 아니라 키가 없다는 것이었다.
		expect(RECORD.stableFailures).toContain("96-voice-linux-app-start.spec.ts");
		expect(passedToWdio.has("96-voice-linux-app-start.spec.ts")).toBe(false);
	});

	it("그날 통과로 세어진 88-stt-tts-combo 도 넘어가지 않는다", async () => {
		const { planGroups } = await load();
		const { groups } = planGroups(MINE, envOfThatRun());
		const passedToWdio = new Set([...groups.values()].flat());

		// 반대 방향의 거짓이다. 키가 없는데 스펙이 스스로 통과해 `executed`
		// 에 올랐고, 완결성 게이트는 그것을 덮인 것으로 셌다.
		expect(RECORD.executed).toContain("88-stt-tts-combo-verification.spec.ts");
		expect(passedToWdio.has("88-stt-tts-combo-verification.spec.ts")).toBe(false);
	});

	it("스펙이 전부 환경 부재인 설정은 아예 띄우지 않고, 그 사실을 남긴다", async () => {
		const { planGroups } = await load();
		const { groups, skippedGroups } = planGroups(MINE, envOfThatRun());

		// `wdio.conf.voice-6g.ts` 에는 `94-voice-6g-shell` 하나뿐인데 그 하나가
		// 환경 부재다. 그날 이 설정은 그래도 떠서 통과 0 · failed 로 끝났다.
		expect(groups.has("wdio.conf.voice-6g.ts")).toBe(false);
		expect(skippedGroups.map((g) => g.conf)).toContain("wdio.conf.voice-6g.ts");
		const voice6g = skippedGroups.find(
			(g) => g.conf === "wdio.conf.voice-6g.ts",
		);
		expect(voice6g?.specs).toEqual(["94-voice-6g-shell.spec.ts"]);
		// 사라지는 것이 아니다 — 왜 안 돌렸는지가 기록에 남아야 한다.
		expect(voice6g?.reason).toMatch(/환경/);
	});

	it("환경이 필요 없는 스펙은 그대로 남고, 설정별로 갈린다", async () => {
		const { planGroups } = await load();
		const { groups } = planGroups(MINE, envOfThatRun());

		// 아무것도 요구하지 않는 스펙이 함께 떨어져 나가면 이 수정은 덮개를
		// 줄이는 것이 된다. 반대쪽도 못 박는다.
		expect(groups.get("wdio.conf.ts")).toContain("23-channels-status.spec.ts");
		expect(groups.get("wdio.conf.discord-settings.ts")).toEqual([
			"93-discord-inbox-handoff.spec.ts",
		]);
	});

	it("고른 것이 그대로 wdio 인자가 된다", async () => {
		const { planGroups, wdioSpecArgs } = await load();
		const { groups } = planGroups(MINE, envOfThatRun());
		const args = wdioSpecArgs(groups.get("wdio.conf.discord-settings.ts") ?? []);

		// 고르는 자리와 인자를 만드는 자리가 다르면 둘이 갈라져도 아무도
		// 모른다. 한 함수에서 나오는지를 여기서 못 박는다.
		expect(args).toEqual([
			"--spec",
			"e2e-tauri/specs/93-discord-inbox-handoff.spec.ts",
		]);
		// 뺀 스펙의 이름이 인자에 섞이면 선별이 무효다.
		expect(args.join(" ")).not.toContain("94-voice-6g-shell");
	});

	it("빈 문자열은 있는 것으로 읽지 않는다", async () => {
		const { partitionByEnv } = await load();
		const specs: SpecEntry[] = [
			{ spec: "x.spec.ts", conf: [], env: ["K"], tier: "native_local" },
		];

		// 셸에서 `K=` 로 지운 키가 있는 것으로 읽히면, 그 스펙이 자격증명 없이
		// 돌아 다시 결함처럼 죽는다.
		expect(partitionByEnv(specs, { K: "" }).runnable).toEqual([]);
		expect(partitionByEnv(specs, { K: "v" }).envMissing.size).toBe(0);
	});
});
