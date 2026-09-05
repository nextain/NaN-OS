import { describe, expect, it } from "vitest";
import { setLocale, t } from "../i18n";
import ko from "../locales/ko";
import en from "../locales/en";
import ja from "../locales/ja";

/**
 * 사용성 축의 첫 자리 (UC-QUALITY-I18N-USER-FACING).
 *
 * 품질 프로세스는 사용성을 화면 문구가 아니라 i18n 키로 재기로 했다. 문구로
 * 재면 이 저장소에서 거짓 통과가 나기 때문이다 — 로케일이 열넷인데 단정이
 * `getByText("다시 시도")` 같은 취약한 쪽과 `/다시 시도|try again/i` 처럼
 * 어느 쪽이 나와도 통과하는 쪽으로 갈려 있었다. 후자는 나머지 열두 언어에서
 * 무엇이 보이는지 전혀 보증하지 않는다.
 *
 * 여기서 재는 것은 셋이다.
 *   1. 로케일을 바꾸면 같은 키가 실제로 다른 문구를 낸다 (해석이 도는가)
 *   2. 열네 로케일이 같은 키 집합을 갖는다 (한 언어만 빠지는 일이 없는가)
 *   3. 사용자에게 보이는 실패·복구 문구가 키로 존재한다 (하드코딩이 아닌가)
 *
 * 이것이 통과한다고 화면이 아름다워지지는 않는다. 다만 "어떤 언어에서는
 * 아무 말도 안 나온다" 는 부류의 실패는 여기서 걸린다.
 */
describe("사용자에게 보이는 문구는 i18n 을 지난다 (UC-QUALITY-I18N-USER-FACING)", () => {
	it("로케일을 바꾸면 같은 키가 다른 문구를 낸다", async () => {
		const key = "settings.tabGeneral" as const;
		await setLocale("ko");
		const korean = t(key);
		await setLocale("en");
		const english = t(key);
		await setLocale("ko"); // 다른 테스트에 새지 않게 되돌린다

		expect(korean.length).toBeGreaterThan(0);
		expect(english.length).toBeGreaterThan(0);
		expect(
			korean,
			"로케일을 바꿔도 같은 문구가 나온다 — 해석이 돌지 않는다는 뜻이다",
		).not.toBe(english);
	});

	it("모든 로케일이 같은 키 집합을 갖는다", () => {
		const base = Object.keys(ko).sort();
		for (const [name, table] of [
			["en", en],
			["ja", ja],
		] as const) {
			const keys = Object.keys(table).sort();
			const missing = base.filter((k) => !keys.includes(k));
			const extra = keys.filter((k) => !base.includes(k));
			expect(missing, `${name} 에 없는 키: ${missing.slice(0, 5).join(", ")}`).toEqual([]);
			expect(extra, `${name} 에만 있는 키: ${extra.slice(0, 5).join(", ")}`).toEqual([]);
		}
	});

	it("실패와 복구를 알리는 문구가 키로 존재한다", () => {
		// 사용자가 막혔을 때 다음에 무엇을 하라고 말하는 자리들. 하나라도 키가
		// 없으면 그 화면은 어느 언어에선가 아무 말도 하지 못한다.
		const required = ["workspace.herdrRetry"] as const;
		for (const key of required) {
			expect(Object.keys(ko), `ko 에 ${key} 가 없다`).toContain(key);
			expect(String((ko as Record<string, string>)[key]).length).toBeGreaterThan(0);
		}
	});
});
