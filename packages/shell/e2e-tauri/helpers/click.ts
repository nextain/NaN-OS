/**
 * 요소를 누른다 — 드라이버가 클릭을 거절하는 환경을 피해서.
 *
 * 왜 파일을 나눴는가: 이 함수만 쓰려고 settings 헬퍼를 import 하면 그 모듈이
 * 최상위에서 읽는 API 키·경로 환경 변수까지 그 스펙의 요구조건으로 딸려
 * 온다. 실기 스펙 목록이 그것을 보고 등급을 매기므로, 클릭 한 번 때문에
 * 자격증명이 필요한 스펙으로 분류된다. 실제로 그 탓에 결정론으로 돌 수 있는
 * 스펙 여섯 개가 자격증명 칸으로 옮겨 갔다.
 */

/**
 * 요소를 누른다. 드라이버가 클릭을 지원하면 그것으로, 아니면 페이지 안에서
 * 누른다.
 *
 * 왜 필요한가: WebKitWebDriver 는 `element/<id>/click` 을 "unsupported
 * operation" 으로 거절한다(2026-09-05 실측 — 22-channels-config 를 단독으로
 * 돌려도 같은 오류로 넷이 실패했다). 그래서 리눅스에서는 실제 클릭을 쓰는
 * 스펙이 구조적으로 통과하지 못한다.
 *
 * 그렇다고 처음부터 페이지 안에서만 누르면, 요소가 없을 때 아무 일도 일어나지
 * 않고 조용히 지나간다 — 그 무음 실패가 #541 에서 스펙이 헛통과하던 원인이다.
 * 그래서 순서를 둔다. 먼저 요소가 보이는지 기다려 존재를 확인하고(없으면 여기서
 * 실패한다), 드라이버 클릭을 시도하고, 드라이버가 거절할 때만 페이지 안에서
 * 누른다. 존재 확인이 앞에 있으므로 무음 실패로 돌아가지 않는다.
 */
export async function clickElement(selector: string, timeout = 15_000): Promise<void> {
	const element = await $(selector);
	await element.waitForDisplayed({ timeout });

	// WebKitWebDriver 에서는 요소 클릭을 시도하는 것 자체가 위험하다. 처음에는
	// "unsupported operation" 으로 거절하고, 다시 부르면 드라이버가 죽어
	// ECONNREFUSED 가 되어 그 뒤 아무것도 못 한다(2026-09-05 실측, 두 번).
	// 그래서 이 환경에서는 시도하지 않고 페이지 안에서 누른다. 위에서 요소가
	// 보이는 것을 이미 확인했으므로 무음 실패로 돌아가지는 않는다.
	const driverClickIsSafe = process.platform === "win32";
	if (driverClickIsSafe) {
		try {
			await element.click();
			return;
		} catch (error) {
			const message = String((error as Error)?.message ?? error);
			if (!/unsupported operation/i.test(message)) throw error;
		}
	}
	const pressed = await browser.execute((sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (!el) return false;
		el.click();
		return true;
	}, selector);
	if (!pressed) throw new Error(`클릭할 요소를 찾지 못했다: ${selector}`);
}
