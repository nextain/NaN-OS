// #499 UC-ENV-TOOL-BROWSE — 브라우저 명령 경계 (P04, native).
//
// Playwright 로 도는 `e2e/env-tool-browser.spec.ts` 는 실제 DOM 을 그리지만 Tauri IPC 가
// 대역이라 browser 등급이다. 여기서는 실 Rust 백엔드에 직접 물어본다 — 참조 기반 조작
// 명령이 실제로 등록돼 있는지, 형식이 어긋난 인자를 Rust 가 실제로 거절하는지.
//
// ⚠️ 성공 경로(실제 페이지를 열어 클릭)는 밟지 않는다. E2E 픽스처에 브라우저 웹뷰가 없고,
//    있다 해도 외부 네트워크로 나가는 것은 이 스펙의 목적이 아니다.
//
// ⚠️ 왕복을 한 번만 한다 — execute 를 케이스마다 부르면 부팅 중 화면 전환 시점에
//    "Origin header is not a valid URL" 로 뒤쪽 케이스가 무너진다(2026-08-26 실측).

interface InvokeResult {
	readonly ok: boolean;
	readonly error: string;
}

interface Probe {
	readonly name: string;
	readonly cmd: string;
	readonly args: Record<string, unknown>;
}

/** 이 슬라이스가 확인하는 브라우저 명령. 좌표로 찍는 명령은 목록에 없다. */
const PROBES: Probe[] = [
	{ name: "click:registered", cmd: "browser_wv_click", args: { ref: "@e1" } },
	{ name: "fill:registered", cmd: "browser_wv_fill", args: { ref: "@e1", value: "x" } },
	{ name: "snapshot:registered", cmd: "browser_wv_snapshot", args: {} },
	{ name: "navigate:registered", cmd: "browser_wv_navigate", args: { url: "about:blank" } },
	{ name: "navigate:empty", cmd: "browser_wv_navigate", args: { url: "" } },
	{ name: "click:noRef", cmd: "browser_wv_click", args: {} },
	// 좌표로 요소를 찍는 명령은 애초에 없어야 한다.
	{ name: "unopened:clickAt", cmd: "browser_wv_click_at", args: { x: 10, y: 10 } },
	{ name: "unopened:tapCoord", cmd: "browser_wv_tap_coordinate", args: { x: 10, y: 10 } },
];

function looksUnregistered(error: string): boolean {
	return /not allowed|not found|unknown command|Command .* not/i.test(error);
}

let results: Record<string, InvokeResult> = {};

describe("브라우저 명령 경계 (#499)", () => {
	before(async () => {
		await browser.waitUntil(
			async () => {
				try {
					return (await browser.execute(() => document.location.href.startsWith("http"))) === true;
				} catch {
					return false;
				}
			},
			{ timeout: 60_000, timeoutMsg: "웹뷰가 http origin 에 도달하지 못했다" },
		);
		results = (await browser.execute((probes: Probe[]) => {
			const w = window as unknown as {
				__TAURI_INTERNALS__?: { invoke: (c: string, a: unknown) => Promise<unknown> };
			};
			const invoke = w.__TAURI_INTERNALS__?.invoke;
			if (!invoke) {
				const missing: Record<string, InvokeResult> = {};
				for (const p of probes) missing[p.name] = { ok: false, error: "TAURI_INVOKE_MISSING" };
				return Promise.resolve(missing);
			}
			return Promise.all(
				probes.map((p) =>
					invoke(p.cmd, p.args).then(
						() => [p.name, { ok: true, error: "" }] as [string, InvokeResult],
						(e: unknown) => [p.name, { ok: false, error: typeof e === "string" ? e : String(e) }] as [string, InvokeResult],
					),
				),
			).then((entries) => Object.fromEntries(entries));
		}, PROBES)) as Record<string, InvokeResult>;
	});

	it("모든 탐침이 응답했다 — 빈 결과로 공허하게 통과하지 않는다", () => {
		expect(Object.keys(results).length).toBe(PROBES.length);
		for (const p of PROBES) {
			expect(results[p.name]).toBeDefined();
			expect(results[p.name]?.error).not.toBe("TAURI_INVOKE_MISSING");
		}
	});

	describe("참조 기반 조작 명령이 등록돼 있다", () => {
		for (const name of ["click:registered", "fill:registered", "snapshot:registered", "navigate:registered"]) {
			it(`${name} — 미등록이 아니다`, () => {
				const r = results[name];
				if (looksUnregistered(r?.error ?? "")) {
					throw new Error(`명령이 등록돼 있지 않다: ${r?.error}`);
				}
				expect(looksUnregistered(r?.error ?? "")).toBe(false);
			});
		}
	});

	describe("형식이 어긋난 인자는 Rust 가 거절한다", () => {
		it("빈 URL 로는 이동하지 않는다", () => {
			expect(results["navigate:empty"]?.ok).toBe(false);
		});

		it("참조 없는 클릭은 성공하지 않는다", () => {
			expect(results["click:noRef"]?.ok).toBe(false);
		});
	});

	describe("좌표로 요소를 찍는 명령은 열려 있지 않다", () => {
		for (const name of ["unopened:clickAt", "unopened:tapCoord"]) {
			it(`${name} — 등록돼 있지 않다`, () => {
				const r = results[name];
				if (r?.ok) throw new Error("좌표로 찍는 명령이 실제로 열려 있다");
				expect(r?.ok).toBe(false);
				if (!looksUnregistered(r?.error ?? "")) {
					throw new Error(`미등록이 아니라 다른 이유로 실패했다: ${r?.error}`);
				}
			});
		}
	});
});
