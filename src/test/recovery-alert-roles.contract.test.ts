// 막다른 화면 판정이 **어떤 역할을 알림으로 보는지** 고정한다.
//
// 왜 이 파일이 있는가: 15회차 리뷰어가 번호 없이 짚은 자리다. 게이트는
// `role="alert"` 만 알림으로 봤는데, WAI-ARIA 에서 `alertdialog` 는 `alert` 의
// **하위 역할**이다 — 같은 알림이고 사용자의 응답을 요구한다는 것만 다르다.
// 역할 글자 하나로 같은 화면이 셈에서 빠졌고, 응답을 요구하면서 빠져나갈 길을
// 안 주는 화면이 더 나쁘다.
//
// 오너가 넓히기로 판단했으므로(2026-09-06), 여기서 그 결정을 못 박는다. 다음에
// 누가 목록을 좁히면 이 테스트가 먼저 붉어진다.
//
// 왜 소스를 읽는가: `check-recovery-affordance.mjs` 는 불러오는 순간 게이트를
// 실행하고 `process.exit` 로 끝나는 스크립트라, 동적 import 로 함수만 꺼내
// 올 수 없다. 그래서 결정이 적힌 자리를 소스에서 확인한다 — 게이트 자신의
// 판정은 주입 실증(심어서 EXIT=1, 되돌려 EXIT=0)이 따로 보증한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GATE = resolve(__dirname, "..", "..", "scripts", "check-recovery-affordance.mjs");
const source = readFileSync(GATE, "utf8");

/** 알림으로 보는 역할. 이 목록이 계약이다. */
const ALERT_ROLES = ["alert", "alertdialog"];

describe("복구 게이트 — 무엇을 실패 알림으로 보는가", () => {
	it("알림 역할을 한 자리에 목록으로 둔다", () => {
		// 여러 자리에 흩어져 있으면 한쪽만 넓어지고 나머지가 낡는다.
		expect(/const ALERT_ROLES = new Set\(\[/.test(source)).toBe(true);
	});

	for (const role of ALERT_ROLES) {
		it(`\`${role}\` 을 알림으로 본다`, () => {
			const list = /const ALERT_ROLES = new Set\(\[([^\]]*)\]\)/.exec(source);
			expect(list, "ALERT_ROLES 목록을 찾지 못했다").not.toBeNull();
			expect((list as RegExpExecArray)[1].includes(`"${role}"`)).toBe(true);
		});
	}

	it("역할 판정이 그 목록을 쓴다 — 글자 하나를 직접 비교하지 않는다", () => {
		// 반증의 자리: `includes("alert")` 로 돌아가면 `alertdialog` 가 다시
		// 빠지고, 그 사실이 아무 데도 남지 않는다.
		expect(source.includes("ALERT_ROLES.has(role)")).toBe(true);
		expect(
			/staticChunks\([^)]*\)\.includes\("alert"\)/.test(source),
			"역할을 글자 하나로 비교하는 자리가 남아 있다",
		).toBe(false);
	});

	it("머리말이 왜 둘을 같이 보는지 적어 두었다", () => {
		const header = source.slice(0, source.indexOf("\n */\n") + 4);
		expect(header.includes("alertdialog")).toBe(true);
		// 줄바꿈에 걸리지 않게 낱말 하나로 묻는다.
		expect(header.includes("WAI-ARIA")).toBe(true);
	});

	it("반증: 조작 역할과 알림 역할은 다른 목록이다", () => {
		// 둘을 한 목록에 섞으면 버튼이 알림으로, 알림이 복구 수단으로 읽힌다.
		expect(source.includes("const ACTION_ROLES = new Set(")).toBe(true);
		const actions = /const ACTION_ROLES = new Set\(\[([^\]]*)\]\)/.exec(source);
		expect(actions).not.toBeNull();
		for (const role of ALERT_ROLES)
			expect(
				(actions as RegExpExecArray)[1].includes(`"${role}"`),
				`${role} 이 조작 역할 목록에도 있다`,
			).toBe(false);
	});
});
