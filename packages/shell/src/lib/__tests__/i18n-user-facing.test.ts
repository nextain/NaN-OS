import { describe, expect, it } from "vitest";
import { type Locale, getLocale, setLocale, t } from "../i18n";
import type { TranslationKey } from "../locales/keys";
import ko from "../locales/ko";

/**
 * 사용성 축의 첫 자리 (UC-QUALITY-I18N-USER-FACING).
 *
 * 품질 프로세스는 사용성을 화면 문구가 아니라 i18n 키로 재기로 했다. 문구로
 * 재면 이 저장소에서 거짓 통과가 나기 때문이다 — 로케일이 열넷인데 단정이
 * `getByText("다시 시도")` 같은 취약한 쪽과 `/다시 시도|try again/i` 처럼
 * 어느 쪽이 나와도 통과하는 쪽으로 갈려 있었다.
 *
 * 이 테스트의 앞선 판은 스스로 그 부류였다. 로케일 모듈을 직접 import 해서
 * 키 집합만 견주었기 때문에, 런타임 해석 경로(`localeLoaders`)를 전혀 지나지
 * 않았다. 실제로 열두 로케일의 로더를 모두 영어로 바꿔 놓아도 초록이었다 —
 * 즉 열두 언어가 통째로 죽어도 이 테스트는 아무 말도 하지 않았다.
 *
 * 그래서 지금은 전부 `setLocale` 로 실제 전환하고 `t()` 로 읽는다. 배선이
 * 끊기면 여기서 걸린다.
 *
 * 재는 것은 넷이다.
 *   1. 로케일마다 실제로 다른 문구가 나온다 (열넷 배선이 각각 산다)
 *   2. 열네 로케일이 같은 키 집합을 갖는다 (한 언어만 빠지지 않는다)
 *   3. 사용자가 막혔을 때 다음을 알려 주는 문구가 키로 존재한다
 *   4. 값이 끼어드는 문구도 로케일을 지난다
 *
 * 이것이 통과한다고 화면이 아름다워지지는 않는다. 다만 "어떤 언어에서는
 * 아무 말도 안 나온다" 는 부류의 실패는 여기서 걸린다.
 */

const LOCALES: readonly Locale[] = [
	"ko", "en", "ja", "zh", "fr", "de", "ru", "es",
	"ar", "hi", "bn", "pt", "id", "vi",
];

/** 각 로케일을 실제로 켜고 표 전체를 런타임 경로로 읽어 온다. */
async function readThroughRuntime(): Promise<Map<Locale, Map<string, string>>> {
	const keys = Object.keys(ko) as TranslationKey[];
	const out = new Map<Locale, Map<string, string>>();
	for (const locale of LOCALES) {
		await setLocale(locale);
		expect(getLocale(), `setLocale("${locale}") 이 반영되지 않았다`).toBe(locale);
		out.set(locale, new Map(keys.map((key) => [key, t(key)])));
	}
	await setLocale("ko");
	return out;
}

describe("사용자에게 보이는 문구는 i18n 을 지난다 (UC-QUALITY-I18N-USER-FACING)", () => {
	it("열네 로케일이 각각 실제로 다른 문구를 낸다", async () => {
		const tables = await readThroughRuntime();
		const english = tables.get("en")!;

		// 로케일마다 영어와 글자까지 같은 키가 몇 개인지 센다. 배선이 끊겨
		// 영어로 되돌아가면 이 수가 전체 키 수와 같아진다. 번역이 아직 영어인
		// 자리가 있으므로 0 을 요구하지는 않되, 통째로 영어가 되는 것은 막는다.
		for (const locale of LOCALES) {
			if (locale === "en") continue;
			const table = tables.get(locale)!;
			let sameAsEnglish = 0;
			for (const [key, value] of table) {
				if (value === english.get(key)) sameAsEnglish += 1;
			}
			const ratio = sameAsEnglish / table.size;
			expect(
				ratio,
				`${locale} 의 ${Math.round(ratio * 100)}% 가 영어와 글자까지 같다 — 로더가 영어로 되돌아갔을 수 있다`,
			).toBeLessThan(0.6);
		}
	});

	it("모든 로케일이 같은 키 집합을 갖는다", async () => {
		const tables = await readThroughRuntime();
		const base = [...tables.get("ko")!.keys()].sort();

		for (const locale of LOCALES) {
			const keys = [...tables.get(locale)!.keys()].sort();
			expect(keys, `${locale} 의 키 집합이 다르다`).toEqual(base);
			// 런타임에서 빈 값이 나오면 그 자리는 화면에서 아무 말도 못 한다.
			const empty = [...tables.get(locale)!.entries()]
				.filter(([, value]) => !value || value.length === 0)
				.map(([key]) => key);
			// 빈 문자열이 의도인 키는 여기 적는다. 언어의 문법상 비는 자리다.
			const INTENTIONALLY_EMPTY = new Set(["common.honorificSuffix"]);
			expect(
				empty.filter((key) => !INTENTIONALLY_EMPTY.has(key)),
				`${locale} 에서 빈 문구: ${empty.slice(0, 5).join(", ")}`,
			).toEqual([]);
		}
	});

	it("실패와 복구를 알리는 문구가 모든 로케일에 있다", async () => {
		const tables = await readThroughRuntime();
		// 사용자가 막혔을 때 다음에 무엇을 하라고 말하는 자리들.
		const required: TranslationKey[] = [
			"workspace.herdrRetry",
			"apps.removeConfirm",
			"adk.setup.recreateConfirm",
			"voice.ref.errRecord",
		];
		for (const locale of LOCALES) {
			for (const key of required) {
				const value = tables.get(locale)!.get(key);
				expect(value, `${locale} 에 ${key} 가 비어 있다`).toBeTruthy();
			}
		}
	});

	it("값이 끼어드는 문구도 로케일을 지난다", async () => {
		await setLocale("ko");
		const korean = t("voice.ref.recording", { seconds: 7 });
		await setLocale("ja");
		const japanese = t("voice.ref.recording", { seconds: 7 });
		await setLocale("ko");

		expect(korean).toContain("7");
		expect(japanese).toContain("7");
		expect(
			korean,
			"값이 낀 문구가 로케일을 지나지 않는다 — 코드에서 이어 붙였을 수 있다",
		).not.toBe(japanese);
	});
});
