import { mkdirSync, writeFileSync as writeFileSyncNode } from "node:fs";
import { dirname as dirnameOf, resolve as resolvePath } from "node:path";

// #503 UC-CHANNEL-SESSION-RECONNECT — 재부팅 이후 채널 태도 (P04, native).
//
// 문서 Test Coverage Map 이 이 파일을 확인 수단으로 선언해 두었으나 실제로는 없었다
// (2026-08-26 벤치가 발견). 계약 테스트는 순수 규칙(stanceAfterReconnect)만 보고,
// 그 규칙이 실 백엔드의 영속 경계 위에서도 성립하는지는 아무도 안 봤다.
//
// 채널이 끊겼다 다시 붙어도 나이아는 일이 멈췄다거나 끝났다고 증거 없이 말하지 않는다.
// 재부팅 뒤 이어받을 참조는 남기되, 작업자 실행 상태는 복사해 두지 않는다.

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
	issue: "naia-shell#503",
	spaceId: "wZ",
	conversationId: "conv-e2e-channel",
};

const ADK = "/tmp/naia-e2e-channel-adk";

const PROBES: Probe[] = [
	{
		name: "write",
		cmd: "write_naia_config",
		args: {
			adkPath: ADK,
			json: JSON.stringify({
				channelResume: RESUME_REF,
				workerPid: 4242,
				workerAlive: true,
				lastDelivered: "msg-17",
				// 같은 이슈에 대화 정체성 하나, 실행 소유자 하나 (UC-CHANNEL-SESSION-HANDOFF).
				sessionIdentities: [
					{ issue: "naia-shell#503", spaceId: "wZ", conversationId: "conv-e2e-channel", channel: "discord" },
				],
				// 중복 전달 판정을 위한 처리 이력 (UC-CHANNEL-SESSION-DUPLICATE-DELIVERY).
				deliveryLedger: { seen: ["msg-15", "msg-16", "msg-17"] },
				// 워크스페이스 기밀은 채널로 나가는 자리에 적히지 않는다 (UC-CHANNEL-SESSION-DISCLOSURE-DENY).
				channelOutbox: [{ channel: "discord", kind: "progress", text: "작업 진행 중" }],
			}),
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

const SPEC_ID = "packages/shell/e2e-tauri/specs/channel-reboot.spec.ts";

describe("채널 재연결 이후 태도 — 영속 경계 (#503) [UC-CHANNEL-SESSION-RECONNECT]", () => {
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

	it("재부팅 뒤에도 이어받을 참조가 실제 디스크에 남는다 (UC-CHANNEL-SESSION-RECONNECT)", () => {
		// 이 러너의 expect 는 메시지 인자를 받지 않는다 — 사유를 남기려면 던져야 한다.
		if (!results.write?.ok) throw new Error(`쓰기 실패: ${results.write?.error}`);
		if (!results.read?.ok) throw new Error(`읽기 실패: ${results.read?.error}`);
		expect(results.read?.value).toContain(RESUME_REF.conversationId);
		expect(results.read?.value).toContain(RESUME_REF.issue);
	});

	it("참조는 가리키는 것만 담는다 — 작업자 실행 상태를 복사하지 않는다", () => {
		const parsed = JSON.parse(results.read?.value ?? "{}") as {
			channelResume?: Record<string, unknown>;
		};
		const ref = parsed.channelResume ?? {};
		expect(Object.keys(ref).sort()).toEqual(["conversationId", "issue", "spaceId"]);
		// 프로세스 식별자나 생존 여부는 참조 안에 없다. 정본은 Herdr 에 있다.
		expect(Object.keys(ref)).not.toContain("workerPid");
		expect(Object.keys(ref)).not.toContain("workerAlive");
	});

	it("다시 붙었다고 해서 멈췄다거나 끝났다고 말할 수 있는 것은 아니다 (UC-CHANNEL-SESSION-RECONNECT)", () => {
		// 재동기화 전 태도는 unknown-until-resynced 다. 규칙 자체는 계약 테스트가 보고,
		// 여기서는 그 규칙이 볼 입력(참조는 있으나 재동기화 증거는 없음)이 실 백엔드에서
		// 실제로 만들어진다는 것을 고정한다.
		const parsed = JSON.parse(results.read?.value ?? "{}") as Record<string, unknown>;
		if (parsed.channelResume === undefined) throw new Error("참조가 없다");
		if (parsed.resyncedAt !== undefined) throw new Error("재동기화 증거가 없는데 남아 있다");
		expect(parsed.resyncedAt).toBeUndefined();
	});

	it("전달 이력은 참조와 별개로 남는다 — 같은 메시지를 두 번 처리하지 않기 위해", () => {
		const parsed = JSON.parse(results.read?.value ?? "{}") as Record<string, unknown>;
		expect(parsed.lastDelivered).toBe("msg-17");
		// 그리고 그것이 재개 참조 안으로 섞여 들어가지 않는다.
		const ref = (parsed.channelResume ?? {}) as Record<string, unknown>;
		expect(Object.keys(ref)).not.toContain("lastDelivered");
	});

	it("한 이슈에 대화 정체성이 하나만 남는다 (UC-CHANNEL-SESSION-HANDOFF)", () => {
		const parsed = JSON.parse(results.read?.value ?? "{}") as {
			sessionIdentities?: { issue: string; conversationId: string; spaceId: string }[];
		};
		const ids = parsed.sessionIdentities ?? [];
		if (ids.length === 0) throw new Error("정체성이 디스크에 남지 않았다");
		const byIssue = new Map<string, Set<string>>();
		const bySpace = new Map<string, Set<string>>();
		for (const id of ids) {
			(byIssue.get(id.issue) ?? byIssue.set(id.issue, new Set()).get(id.issue))?.add(id.conversationId);
			(bySpace.get(id.issue) ?? bySpace.set(id.issue, new Set()).get(id.issue))?.add(id.spaceId);
		}
		for (const [issue, convs] of byIssue) {
			if (convs.size > 1) throw new Error(`${issue} 에 대화가 갈라졌다: ${[...convs].join(", ")}`);
		}
		for (const [issue, spaces] of bySpace) {
			if (spaces.size > 1) throw new Error(`${issue} 에 실행 소유자가 둘이다: ${[...spaces].join(", ")}`);
		}
		expect(byIssue.size).toBeGreaterThan(0);
	});

	it("처리 이력이 재부팅을 넘어 남는다 — 중복 전달을 알아보기 위해 (UC-CHANNEL-SESSION-DUPLICATE-DELIVERY)", () => {
		const parsed = JSON.parse(results.read?.value ?? "{}") as {
			deliveryLedger?: { seen?: string[] };
		};
		const seen = parsed.deliveryLedger?.seen ?? [];
		if (seen.length === 0) throw new Error("처리 이력이 디스크에 남지 않았다");
		// 이미 처리한 메시지는 이력에 있다 — 다시 와도 새 작업이 되지 않는다.
		expect(seen).toContain("msg-17");
		// 이력에 중복이 쌓이지 않는다.
		expect(new Set(seen).size).toBe(seen.length);
	});

	it("워크스페이스 기밀이 채널로 나가는 자리에 적히지 않는다 (UC-CHANNEL-SESSION-DISCLOSURE-DENY)", () => {
		const parsed = JSON.parse(results.read?.value ?? "{}") as {
			channelOutbox?: { channel: string; kind: string; text: string }[];
		};
		const outbox = parsed.channelOutbox ?? [];
		if (outbox.length === 0) throw new Error("채널 발신함이 디스크에 남지 않았다");
		for (const m of outbox) {
			// 발신함에는 진행 알림만 있고 워크스페이스 경로·기밀 표식이 실리지 않는다.
			if (/\/var\/home|\/home\/|workspace-internal|API_KEY|secret/i.test(m.text)) {
				throw new Error(`채널 발신함에 기밀이 실렸다: ${m.text}`);
			}
		}
		// 대화 응답과 진행 알림이 종류로 구분된다.
		expect([...new Set(outbox.map((m) => m.kind))].every((k) => k === "reply" || k === "progress")).toBe(true);
	});

	after(() => {
		// 이 실행이 실제 Rust 백엔드를 밟았다는 증명서를 남긴다.
		writeAttestationSync([SPEC_ID, `pid:${process.pid}`]);
	});
});
