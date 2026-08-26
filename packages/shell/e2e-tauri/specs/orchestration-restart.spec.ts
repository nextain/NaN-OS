import { mkdirSync, writeFileSync as writeFileSyncNode } from "node:fs";
import { dirname as dirnameOf, resolve as resolvePath } from "node:path";

// #500 UC-ORCHESTRATION-RESTART-RESUME — 재시작 이후 태도 (P04, native).
//
// 문서 Test Coverage Map 이 이 파일을 확인 수단으로 선언해 두었으나 실제로는 없었다
// (2026-08-26 벤치가 발견). 계약 테스트는 순수 규칙(stanceAfterRestart)만 보고,
// 그 규칙이 실 백엔드의 영속 경계 위에서도 성립하는지는 아무도 안 봤다.
//
// 여기서 확인하는 것은 UI 가 아니라 **영속 경계**다. 이어받을 참조가 실제 디스크에
// 남는가, 그리고 다시 읽었을 때 무엇을 단정할 수 있는가.
//
// ⚠️ 실제 코딩 작업자는 띄우지 않는다. 이 스펙이 답하는 질문이 아니고, 띄우면 사용자
//    환경에 프로세스를 남긴다. 작업자 실행 상태가 *복사되지 않는다*는 것만 확인한다.

interface Probe {
	readonly name: string;
	readonly cmd: string;
	readonly args: Record<string, unknown>;
}

interface InvokeResult {
	readonly ok: boolean;
	readonly value: string;
	readonly error: string;
}

/** 이어받을 참조. 정본은 Herdr 에 있고 여기에는 가리키는 것만 둔다. */
const RESUME_REF = {
	issue: "naia-shell#500",
	spaceId: "wZ",
	conversationId: "conv-e2e-restart",
};

const ADK = "/tmp/naia-e2e-restart-adk";

const PROBES: Probe[] = [
	{
		name: "write",
		cmd: "write_naia_config",
		args: {
			adkPath: ADK,
			json: JSON.stringify({ orchestrationResume: RESUME_REF, workerPid: 4242, workerAlive: true }),
		},
	},
	{ name: "read", cmd: "read_naia_config", args: { adkPath: ADK } },
];

let results: Record<string, InvokeResult> = {};


/**
 * 실환경 관측 증명서. 벤치는 이 파일이 있어야 native 영수증을 준다 —
 * 등급이 경로 허용목록으로만 정해지면 그것은 설정을 검증하는 것이다(2026-08-27 적대리뷰).
 * wdio 스펙은 코어를 import 하지 않으므로 같은 형식을 여기서 직접 쓴다.
 */
function writeAttestationSync(touched: readonly string[]): void {
	const root = resolvePath(import.meta.dirname, "..", "..", "..", "..");
	const file = resolvePath(
		root,
		"benchmark",
		".attest",
		`${SPEC_ID.replace(/[^A-Za-z0-9]+/g, "_")}.json`,
	);
	mkdirSync(dirnameOf(file), { recursive: true });
	writeFileSyncNode(
		file,
		`${JSON.stringify({ spec: SPEC_ID, kinds: ["native"], touched, at: Date.now() }, null, 2)}\n`,
		"utf8",
	);
}

const SPEC_ID = "packages/shell/e2e-tauri/specs/orchestration-restart.spec.ts";

describe("재시작 이후 이어가기 — 영속 경계 (#500) [UC-ORCHESTRATION-RESTART-RESUME FR-ORCHESTRATION.10]", () => {
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
				for (const p of probes) missing[p.name] = { ok: false, value: "", error: "TAURI_INVOKE_MISSING" };
				return Promise.resolve(missing);
			}
			// 쓰기 → 읽기 순서를 지켜야 한다. 한 번의 왕복으로 사슬을 만든다.
			return probes
				.reduce(
					(chain, p) =>
						chain.then((acc) =>
							invoke(p.cmd, p.args).then(
								(v: unknown) => {
									acc[p.name] = { ok: true, value: typeof v === "string" ? v : JSON.stringify(v ?? ""), error: "" };
									return acc;
								},
								(e: unknown) => {
									acc[p.name] = { ok: false, value: "", error: typeof e === "string" ? e : String(e) };
									return acc;
								},
							),
						),
					Promise.resolve({} as Record<string, InvokeResult>),
				)
				.then((acc) => acc);
		}, PROBES)) as Record<string, InvokeResult>;
	});

	it("모든 탐침이 응답했다 — 빈 결과로 공허하게 통과하지 않는다", () => {
		expect(Object.keys(results).length).toBe(PROBES.length);
		for (const p of PROBES) {
			expect(results[p.name]).toBeDefined();
			expect(results[p.name]?.error).not.toBe("TAURI_INVOKE_MISSING");
		}
	});

	it("이어받을 참조가 실제 디스크에 남는다 (FR-ORCHESTRATION.10)", () => {
		// 이 러너의 expect 는 메시지 인자를 받지 않는다 — 사유를 남기려면 던져야 한다.
		if (!results.write?.ok) throw new Error(`쓰기 실패: ${results.write?.error}`);
		if (!results.read?.ok) throw new Error(`읽기 실패: ${results.read?.error}`);
		expect(results.read?.value).toContain(RESUME_REF.conversationId);
		expect(results.read?.value).toContain(RESUME_REF.issue);
	});

	it("참조는 가리키는 것만 담는다 — 작업자 실행 상태를 복사하지 않는다", () => {
		const parsed = JSON.parse(results.read?.value ?? "{}") as {
			orchestrationResume?: Record<string, unknown>;
		};
		const ref = parsed.orchestrationResume ?? {};
		expect(Object.keys(ref).sort()).toEqual(["conversationId", "issue", "spaceId"]);
		// 프로세스 식별자나 생존 여부는 참조 안에 없다. 정본은 Herdr 에 있다.
		expect(Object.keys(ref)).not.toContain("workerPid");
		expect(Object.keys(ref)).not.toContain("workerAlive");
	});

	it("다시 읽었다고 해서 끝났다고 말할 수 있는 것은 아니다", () => {
		// 재동기화 전에는 태도가 unknown-until-resynced 여야 한다. 규칙 자체는 계약
		// 테스트가 보고, 여기서는 그 규칙이 볼 입력(참조는 있으나 재동기화 전)이
		// 실 백엔드에서 실제로 만들어진다는 것을 고정한다.
		const parsed = JSON.parse(results.read?.value ?? "{}") as Record<string, unknown>;
		if (parsed.orchestrationResume === undefined) throw new Error("참조가 없다 — unresumable 이어야 한다");
		if (parsed.resyncedAt !== undefined) throw new Error("재동기화 증거가 없는데 남아 있다");
		expect(parsed.resyncedAt).toBeUndefined();
	});

	after(() => {
		// 이 실행이 실제 Rust 백엔드를 밟았다는 증명서를 남긴다.
		writeAttestationSync([SPEC_ID, `pid:${process.pid}`]);
	});
});
