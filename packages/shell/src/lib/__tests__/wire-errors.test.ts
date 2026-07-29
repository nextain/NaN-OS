import { describe, expect, it } from "vitest";
import { setLocale } from "../i18n";
import { WIRE_ERROR_CODES, wireErrorMessage } from "../wire-errors";

describe("UC-WIRE-V1 stable error code i18n", () => {
	it("25개 안정 code를 모두 현지화하고 raw agent message를 표시하지 않는다", () => {
		setLocale("ko");
		expect(WIRE_ERROR_CODES).toHaveLength(25);
		for (const code of WIRE_ERROR_CODES) {
			const message = wireErrorMessage(code, "provider leaked detail");
			expect(message.length).toBeGreaterThan(0);
			expect(message).not.toContain("leaked");
		}
	});

	it("billing integrity를 무료 $0이 아니라 확인 불가로 표시한다", () => {
		expect(wireErrorMessage("BILLING_INTEGRITY", "$0")).not.toBe("$0");
	});

	it("알 수 없는 legacy error는 기존 message와 호환된다", () => {
		expect(wireErrorMessage(undefined, "legacy error")).toBe("legacy error");
	});
});
