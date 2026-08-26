// #502 슬라이스 1 전달 — 실 Tauri 백엔드 검증 (P04, FR-ENV-DISPATCH.4·7).
//
// 여기서 확인하는 것은 UI 가 아니라 **Rust 명령 경계**다. 새로 연 두 명령이 실제로 등록됐는지,
// 그리고 형식이 어긋난 인자를 Rust 가 실제로 거절하는지를 실 백엔드에 물어본다.
// 계약 테스트는 대역 포트로 돌기 때문에 이 두 가지를 증명하지 못한다.
//
// ⚠️ 성공 경로(실제로 사용자의 pane 에 명령을 넣는 것)는 여기서 밟지 않는다.
//    E2E 픽스처에 Herdr 세션이 없고, 있다 해도 실 터미널에 입력하는 것은 이 스펙의 목적이 아니다.
//    거절 경로만으로도 "등록됐는가"와 "검증이 사는가"는 증명된다.

interface InvokeResult {
	readonly ok: boolean;
	readonly error: string;
}

async function invokeCommand(command: string, args: Record<string, unknown>): Promise<InvokeResult> {
	return browser.execute(
		async (cmd: string, payload: Record<string, unknown>) => {
			const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (c: string, a: unknown) => Promise<unknown> } })
				.__TAURI_INTERNALS__;
			if (!internals?.invoke) return { ok: false, error: "TAURI_INTERNALS_MISSING" };
			try {
				await internals.invoke(cmd, payload);
				return { ok: true, error: "" };
			} catch (e) {
				return { ok: false, error: e instanceof Error ? e.message : String(e) };
			}
		},
		command,
		args,
	);
}

/** 명령이 등록되지 않았으면 Tauri 가 "not allowed"/"not found" 계열로 답한다. */
function looksUnregistered(error: string): boolean {
	return /not allowed|not found|unknown command|Command .* not/i.test(error);
}

describe("환경 호출 전달 — Rust 명령 경계 (#502)", () => {
	it("앱이 떠 있다", async () => {
		const appRoot = await $("#root");
		await appRoot.waitForDisplayed({ timeout: 30_000 });
	});

	describe("새로 연 명령이 등록돼 있다 (FR-ENV-DISPATCH.7)", () => {
		it("herdr_run_pane 이 등록돼 있다 — 미등록이 아니라 인자 검증에서 걸린다", async () => {
			const result = await invokeCommand("herdr_run_pane", { paneId: "잘못된형식", command: "echo hi" });
			expect(result.ok).toBe(false);
			expect(looksUnregistered(result.error)).toBe(false);
			expect(result.error).toContain("Invalid Herdr pane id");
		});

		it("herdr_send_keys 가 등록돼 있다", async () => {
			const result = await invokeCommand("herdr_send_keys", { paneId: "잘못된형식", keys: ["C-c"] });
			expect(result.ok).toBe(false);
			expect(looksUnregistered(result.error)).toBe(false);
			expect(result.error).toContain("Invalid Herdr pane id");
		});
	});

	describe("Rust 가 식별자 형식을 실제로 검증한다 (FR-ENV-DISPATCH.4)", () => {
		it.each([
			["빈 값", ""],
			["접두사 없음", "p1"],
			["워크스페이스 부분 없음", "w:p1"],
			["구분자 주입", "w9:pB;rm -rf /"],
			["과길이", `w9:p${"a".repeat(65)}`],
		])("%s 인 표면 식별자를 거절한다", async (_label, paneId) => {
			const result = await invokeCommand("herdr_run_pane", { paneId, command: "echo hi" });
			expect(result.ok).toBe(false);
			expect(result.error).toContain("Invalid Herdr pane id");
		});
	});

	describe("Rust 가 본문과 키를 실제로 검증한다 (FR-ENV-DISPATCH.5)", () => {
		it("빈 명령을 거절한다", async () => {
			const result = await invokeCommand("herdr_run_pane", { paneId: "w9:pB", command: "   " });
			expect(result.ok).toBe(false);
			expect(result.error).toContain("command is required");
		});

		it("상한을 넘는 명령을 거절한다", async () => {
			const result = await invokeCommand("herdr_run_pane", { paneId: "w9:pB", command: "a".repeat(12 * 1024 + 1) });
			expect(result.ok).toBe(false);
			expect(result.error).toContain("byte limit");
		});

		it("빈 키 배열을 거절한다", async () => {
			const result = await invokeCommand("herdr_send_keys", { paneId: "w9:pB", keys: [] });
			expect(result.ok).toBe(false);
			expect(result.error).toContain("keys are required");
		});

		it("플래그로 해석될 수 있는 키를 거절한다", async () => {
			const result = await invokeCommand("herdr_send_keys", { paneId: "w9:pB", keys: ["--help"] });
			expect(result.ok).toBe(false);
			expect(result.error).toContain("must not start with");
		});

		it("공백이 든 키를 거절한다", async () => {
			const result = await invokeCommand("herdr_send_keys", { paneId: "w9:pB", keys: ["a b"] });
			expect(result.ok).toBe(false);
			expect(result.error).toContain("Invalid Herdr key");
		});

		it("키 개수 상한을 넘기면 거절한다", async () => {
			const keys = Array.from({ length: 9 }, () => "esc");
			const result = await invokeCommand("herdr_send_keys", { paneId: "w9:pB", keys });
			expect(result.ok).toBe(false);
			expect(result.error).toContain("exceed");
		});
	});

	describe("열지 않은 명령은 없다", () => {
		it("이 슬라이스가 열지 않은 herdr 명령은 등록돼 있지 않다", async () => {
			// 프로토콜에는 있으나 셸이 열지 않은 것 — 등록 자체가 없어야 한다.
			const result = await invokeCommand("herdr_close_workspace", { workspaceId: "w9" });
			expect(result.ok).toBe(false);
			expect(looksUnregistered(result.error)).toBe(true);
		});
	});
});
