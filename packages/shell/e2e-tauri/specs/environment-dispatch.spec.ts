// #502 슬라이스 1 전달 — 실 Tauri 백엔드 검증 (P04, FR-ENV-DISPATCH.1·4·5·7).
//
// 여기서 확인하는 것은 UI 가 아니라 **Rust 명령 경계**다. 새로 연 두 명령이 실제로 등록됐는지,
// 형식이 어긋난 인자를 Rust 가 실제로 거절하는지를 실 백엔드에 물어본다.
// 계약 테스트는 대역 포트로 돌기 때문에 이 두 가지를 증명하지 못한다.
//
// ⚠️ 성공 경로(실제로 사용자의 pane 에 명령을 넣는 것)는 밟지 않는다. E2E 픽스처에 Herdr 세션이 없고,
//    있다 해도 실 터미널에 입력하는 것은 이 스펙의 목적이 아니다.
//
// ⚠️ 왕복을 한 번만 한다(2026-08-26 실측). execute 를 케이스마다 부르면 부팅 중 화면 전환 시점에
//    "Origin header is not a valid URL" 로 뒤쪽 케이스가 무너졌고, refresh 로 안정화하려 하면
//    앱이 다시 뜨지 않았다. 한 번의 execute 로 전부 모은 뒤 단언한다.
//    주입 함수는 async 로 만들지 않고 거절도 던지지 않는다 — 둘 다 wdio 가 결과를 파싱하지 못한다.

interface InvokeResult {
	readonly ok: boolean;
	readonly error: string;
}

interface Probe {
	readonly name: string;
	readonly cmd: string;
	readonly args: Record<string, unknown>;
}

const PROBES: Probe[] = [
	{ name: "run:registered", cmd: "herdr_run_pane", args: { paneId: "잘못된형식", command: "echo hi" } },
	{ name: "keys:registered", cmd: "herdr_send_keys", args: { paneId: "잘못된형식", keys: ["C-c"] } },
	{ name: "id:empty", cmd: "herdr_run_pane", args: { paneId: "", command: "echo hi" } },
	{ name: "id:noPrefix", cmd: "herdr_run_pane", args: { paneId: "p1", command: "echo hi" } },
	{ name: "id:noWorkspace", cmd: "herdr_run_pane", args: { paneId: "w:p1", command: "echo hi" } },
	{ name: "id:injection", cmd: "herdr_run_pane", args: { paneId: "w9:pB;rm -rf /", command: "echo hi" } },
	{ name: "id:tooLong", cmd: "herdr_run_pane", args: { paneId: `w9:p${"a".repeat(65)}`, command: "echo hi" } },
	{ name: "body:empty", cmd: "herdr_run_pane", args: { paneId: "w9:pB", command: "   " } },
	{ name: "body:tooLong", cmd: "herdr_run_pane", args: { paneId: "w9:pB", command: "a".repeat(12 * 1024 + 1) } },
	{ name: "keys:empty", cmd: "herdr_send_keys", args: { paneId: "w9:pB", keys: [] } },
	{ name: "keys:flag", cmd: "herdr_send_keys", args: { paneId: "w9:pB", keys: ["--help"] } },
	{ name: "keys:space", cmd: "herdr_send_keys", args: { paneId: "w9:pB", keys: ["a b"] } },
	{ name: "keys:tooMany", cmd: "herdr_send_keys", args: { paneId: "w9:pB", keys: Array.from({ length: 9 }, () => "esc") } },
	{ name: "unopened", cmd: "herdr_close_workspace", args: { workspaceId: "w9" } },
];

/** 명령이 등록되지 않았으면 Tauri 가 "not allowed"/"not found" 계열로 답한다. */
function looksUnregistered(error: string): boolean {
	return /not allowed|not found|unknown command|Command .* not/i.test(error);
}

let results: Record<string, InvokeResult> = {};

describe("환경 호출 전달 — Rust 명령 경계 (#502)", () => {
	before(async () => {
		const appRoot = await $("#root");
		await appRoot.waitForDisplayed({ timeout: 30_000 });
		results = (await browser.execute((probes: Probe[]) => {
			const w = window as unknown as {
				__TAURI_INTERNALS__?: { invoke: (c: string, a: unknown) => Promise<unknown> };
				__TAURI__?: { core?: { invoke: (c: string, a: unknown) => Promise<unknown> } };
			};
			const invoke = w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.core?.invoke;
			if (!invoke) {
				const missing: Record<string, { ok: boolean; error: string }> = {};
				for (const p of probes) missing[p.name] = { ok: false, error: "TAURI_INVOKE_MISSING" };
				return Promise.resolve(missing);
			}
			return Promise.all(
				probes.map((p) =>
					invoke(p.cmd, p.args).then(
						() => [p.name, { ok: true, error: "" }] as [string, { ok: boolean; error: string }],
						(e: unknown) =>
							[p.name, { ok: false, error: typeof e === "string" ? e : String(e) }] as [
								string,
								{ ok: boolean; error: string },
							],
					),
				),
			).then((entries) => Object.fromEntries(entries));
		}, PROBES)) as Record<string, InvokeResult>;
	});

	it("모든 탐침이 응답했다 — 빈 결과로 공허하게 통과하지 않는다", () => {
		expect(Object.keys(results).length).toBe(PROBES.length);
		for (const probe of PROBES) {
			expect(results[probe.name]).toBeDefined();
			expect(results[probe.name]?.error).not.toBe("TAURI_INVOKE_MISSING");
		}
	});

	describe("새로 연 명령이 등록돼 있다 (FR-ENV-DISPATCH.7)", () => {
		it("herdr_run_pane 이 등록돼 있다 — 미등록이 아니라 인자 검증에서 걸린다", () => {
			const r = results["run:registered"];
			expect(r?.ok).toBe(false);
			expect(looksUnregistered(r?.error ?? "")).toBe(false);
			expect(r?.error).toContain("Invalid Herdr pane id");
		});

		it("herdr_send_keys 가 등록돼 있다", () => {
			const r = results["keys:registered"];
			expect(r?.ok).toBe(false);
			expect(looksUnregistered(r?.error ?? "")).toBe(false);
			expect(r?.error).toContain("Invalid Herdr pane id");
		});
	});

	describe("Rust 가 식별자 형식을 실제로 검증한다 (FR-ENV-DISPATCH.4)", () => {
		const cases: [string, string][] = [
			["빈 값", "id:empty"],
			["접두사 없음", "id:noPrefix"],
			["워크스페이스 부분 없음", "id:noWorkspace"],
			["구분자 주입", "id:injection"],
			["과길이", "id:tooLong"],
		];
		for (const [label, key] of cases) {
			it(`${label} 인 표면 식별자를 거절한다`, () => {
				const r = results[key];
				expect(r?.ok).toBe(false);
				expect(r?.error).toContain("Invalid Herdr pane id");
			});
		}
	});

	describe("Rust 가 본문과 키를 실제로 검증한다 (FR-ENV-DISPATCH.5)", () => {
		const cases: [string, string, string][] = [
			["빈 명령", "body:empty", "command is required"],
			["상한을 넘는 명령", "body:tooLong", "byte limit"],
			["빈 키 배열", "keys:empty", "keys are required"],
			["플래그로 해석될 수 있는 키", "keys:flag", "must not start with"],
			["공백이 든 키", "keys:space", "Invalid Herdr key"],
			["키 개수 상한 초과", "keys:tooMany", "exceed"],
		];
		for (const [label, key, expected] of cases) {
			it(`${label}을(를) 거절한다`, () => {
				const r = results[key];
				expect(r?.ok).toBe(false);
				expect(r?.error).toContain(expected);
			});
		}
	});

	describe("열지 않은 명령은 없다 (FR-ENV-DISPATCH.1)", () => {
		it("이 슬라이스가 열지 않은 herdr 명령은 등록돼 있지 않다", () => {
			const r = results["unopened"];
			expect(r?.ok).toBe(false);
			expect(looksUnregistered(r?.error ?? "")).toBe(true);
		});
	});
});
