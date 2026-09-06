// 한 시간짜리 실행이 **몇 번째를 돌고 있는지** 말하는지 고정한다.
//
// 왜 이 파일이 있는가: 러너는 자식 wdio 를 붙들어(`stdio: pipe`) 끝날 때까지
// 아무것도 보여 주지 않았다. 자격증명 등급 한 묶음이 마흔한 개, 한 시간이다.
// 그동안 화면에는 아무 소리가 없어서, 사람이 앱이 남긴 흔적 파일의 수정 시각을
// 뒤져 진행을 추정했다. 그것은 관측이 아니라 점술이고, 멈춘 실행과 오래 걸리는
// 실행을 구별하지 못한다.
//
// 여기서 재는 것은 리포터 줄을 읽는 규칙이다. 실행을 다시 돌리지 않고 이
// 판단을 고정할 수 있어야, 형식이 바뀌었을 때 한 시간을 쓰지 않고 알 수 있다.
// 픽스처 줄은 이 기계의 실제 실행 로그에서 그대로 옮겼다.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const MODULE_URL = pathToFileURL(
	resolve(ROOT, "scripts", "lib", "wdio-progress.mjs"),
).href;

interface ProgressModule {
	progressEvent(line: string): { kind: string; spec: string } | null;
	formatProgress(input: {
		done: number;
		total: number;
		kind: string;
		spec: string;
		seconds: number;
	}): string;
	createProgressTracker(
		total: number,
		now?: () => number,
	): { feed(line: string): string | null; readonly done: number };
}

const load = async (): Promise<ProgressModule> =>
	(await import(MODULE_URL)) as unknown as ProgressModule;

// ── 실제 로그에서 그대로 옮긴 줄 ────────────────────────────────────────────
/** 세션 이름이 아직 정해지지 않은 채로 시작하는 흔한 모양. */
const RUNNING = "[0-0] RUNNING in undefined - file:///e2e-tauri/specs/01-app-launch.spec.ts";
const PASSED = "[0-0] PASSED in undefined - file:///e2e-tauri/specs/01-app-launch.spec.ts";
/** 워커 번호가 두 자리인 경우와 세션 이름이 `tauri` 인 경우. */
const FAILED_W10 = "[0-10] FAILED in tauri - file:///e2e-tauri/specs/21-cron-recurring.spec.ts";
/** 진행과 무관한 줄. 이런 것에 반응하면 숫자가 엉킨다. */
const NOISE = [
	"[0-0] [Naia] agent-core started",
	"[wry 0.55.1 linux #0-0] Session ID: 4929063e-528a-4abc-b722-4833f54a9914",
	"Execution of 1 workers started at 2026-09-06T04:03:14.418Z",
	"[0-0] [Naia] agent-core restart debounced (5000ms cooldown remaining)",
];

describe("wdio 진행 줄 읽기", () => {
	it("시작·통과·실패 세 줄을 읽는다", async () => {
		const { progressEvent } = await load();

		expect(progressEvent(RUNNING)).toEqual({
			kind: "start",
			spec: "01-app-launch.spec.ts",
		});
		expect(progressEvent(PASSED)).toEqual({
			kind: "pass",
			spec: "01-app-launch.spec.ts",
		});
		// 워커 번호가 두 자리여도, 세션 이름이 달라도 같은 사건이다.
		expect(progressEvent(FAILED_W10)).toEqual({
			kind: "fail",
			spec: "21-cron-recurring.spec.ts",
		});
	});

	it("진행과 무관한 줄에는 반응하지 않는다", async () => {
		const { progressEvent } = await load();

		// 이것이 느슨해지면 숫자가 엉켜 진행 표시가 거짓말을 한다. 실행 하나에
		// `restart debounced` 만 천사백 줄 넘게 나온 적이 있다.
		for (const line of NOISE) expect(progressEvent(line)).toBeNull();
		expect(progressEvent("")).toBeNull();
	});

	it("끝난 스펙마다 몇/몇 과 걸린 시간을 한 줄로 낸다", async () => {
		const { createProgressTracker } = await load();
		let clock = 0;
		const tracker = createProgressTracker(41, () => clock);

		// 시작 줄은 아직 적을 것이 없다 — 끝나야 걸린 시간을 안다.
		expect(tracker.feed(RUNNING)).toBeNull();
		clock = 41_000;
		expect(tracker.feed(PASSED)).toBe(
			"[regression] 1/41 ✓ 01-app-launch.spec.ts (41s)",
		);
		expect(tracker.done).toBe(1);
	});

	it("실패도 같은 자리에 즉시 보인다", async () => {
		const { createProgressTracker } = await load();
		let clock = 0;
		const tracker = createProgressTracker(41, () => clock);
		tracker.feed(RUNNING);
		clock = 5_000;
		tracker.feed(PASSED);
		tracker.feed(
			"[0-10] RUNNING in tauri - file:///e2e-tauri/specs/21-cron-recurring.spec.ts",
		);
		clock = 12_000;

		// 실패를 끝에 몰아 보여 주면, 한 시간 동안 무엇이 깨지고 있는지 모른 채
		// 기다리게 된다. 실패 우선 고리는 그 사실을 일찍 알아야 성립한다.
		expect(tracker.feed(FAILED_W10)).toBe(
			"[regression] 2/41 ✗ 21-cron-recurring.spec.ts (7s)",
		);
	});

	it("시작 줄을 못 본 스펙은 시간을 지어내지 않는다", async () => {
		const { createProgressTracker } = await load();
		const tracker = createProgressTracker(3, () => 1000);

		// 0초라고 적으면 잰 것처럼 보인다. 출력이 잘렸다는 사실을 덮지 않는다.
		expect(tracker.feed(PASSED)).toBe("[regression] 1/3 ✓ 01-app-launch.spec.ts");
	});

	it("여러 워커가 겹쳐 돌아도 각자의 시간을 센다", async () => {
		const { createProgressTracker } = await load();
		let clock = 0;
		const tracker = createProgressTracker(2, () => clock);

		// wdio 는 워커를 여럿 띄운다. 시작 시각을 하나만 들고 있으면 나중에
		// 끝난 스펙의 시간이 앞 스펙의 것으로 나온다.
		tracker.feed(RUNNING);
		clock = 1_000;
		tracker.feed(
			"[0-10] RUNNING in tauri - file:///e2e-tauri/specs/21-cron-recurring.spec.ts",
		);
		clock = 9_000;
		expect(tracker.feed(PASSED)).toBe(
			"[regression] 1/2 ✓ 01-app-launch.spec.ts (9s)",
		);
		clock = 11_000;
		expect(tracker.feed(FAILED_W10)).toBe(
			"[regression] 2/2 ✗ 21-cron-recurring.spec.ts (10s)",
		);
	});
});
