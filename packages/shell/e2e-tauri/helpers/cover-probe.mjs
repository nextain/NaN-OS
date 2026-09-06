/**
 * 클릭이 막혔을 때 **무엇이 덮었는지**를 그 자리에서 남긴다 (#569).
 *
 * 왜 필요한가: `element not interactable` · `element click intercepted` 는 요소가
 * 없다는 뜻이 아니다 — 있고, 보이고, 심지어 `active` 인데 다른 것이 그 위에 있다는
 * 뜻이다. 로그에는 그 "다른 것" 이 남지 않아, 회차마다 화면을 다시 띄워 눈으로
 * 확인해야 했다.
 *
 * 코드로 좁힌 기제는 이렇다. 채팅 레일 `.naia-overlay` 는 `z-index: 2` 이고
 * 앱 레이어 `.app-layout` 은 `z-index: 5` 다(`global.css` 1144·1636행). `.app-layout`
 * 의 `left` 는 인라인이고 셋 중 하나면 `0` 이 된다(`AppMainContent.tsx:320`) —
 * 온보딩 중, `!naiaVisible`, `uiMode === "workspace" && railCollapsed`. `left` 가 `0`
 * 이면 앱 레이어가 창을 통째로 덮고 레일 위에 올라앉는다.
 *
 * 셋 중 `!naiaVisible` 은 **이미 배제됐다** — 레일 자체가 그때는 렌더되지 않으므로
 * (`AppMainContent.tsx:219`) 요소가 있다는 관측과 모순이다. 남은 둘을 가르는 것이
 * 이 탐침이다.
 *
 * 표지는 제품에 새로 넣지 않는다. 이미 있는 것으로 읽는다 —
 * `naiaVisible` 은 `.naia-overlay` 의 존재로, `railCollapsed` 는
 * `.ws-rail-toggle--collapsed` 로, `uiMode` 는 `[data-ui-mode]` 로.
 */

/** 그 실패가 "가려짐" 계열인가. */
export function isCoverFailure(message) {
	return /not interactable|click intercepted|element is not clickable|not visible/i.test(
		String(message ?? ""),
	);
}

/** 페이지 안에서 도는 수집기. `browser.execute` 에 그대로 넘긴다. */
export function coverEvidenceScript(selector) {
	const target = selector ? document.querySelector(selector) : null;
	const rect = target ? target.getBoundingClientRect() : null;
	const center =
		rect && rect.width > 0 && rect.height > 0
			? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
			: null;
	const covering = center ? document.elementFromPoint(center.x, center.y) : null;
	const describe = (element) =>
		element
			? `${element.tagName.toLowerCase()}.${(element.className || "").toString().trim().split(/\s+/).join(".")}`
			: null;
	const layout = document.querySelector(".app-layout");
	const rail = document.querySelector(".naia-overlay");
	const layoutStyle = layout ? getComputedStyle(layout) : null;
	const railStyle = rail ? getComputedStyle(rail) : null;
	return {
		selector: selector ?? null,
		targetFound: Boolean(target),
		targetRect: rect
			? { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
			: null,
		covering: describe(covering),
		coveringIsTarget: Boolean(target && covering && target.contains(covering)),
		appLayoutLeft: layoutStyle?.left ?? null,
		appLayoutZIndex: layoutStyle?.zIndex ?? null,
		railZIndex: railStyle?.zIndex ?? null,
		// `.naia-overlay` 는 naiaVisible 일 때만 렌더된다 — 존재가 곧 그 값이다.
		naiaVisible: Boolean(rail),
		// 접힌 레일은 토글 버튼의 클래스로 드러난다.
		railCollapsed: Boolean(document.querySelector(".ws-rail-toggle--collapsed")),
		uiMode:
			document.querySelector("[data-ui-mode]")?.getAttribute("data-ui-mode") ?? null,
		onboarding: Boolean(document.querySelector(".onboarding-overlay, [data-onboarding]")),
		viewport: { w: window.innerWidth, h: window.innerHeight },
	};
}

/** 한 줄 JSON. 로그에서 `[e2e][cover]` 로 집어 갈 수 있어야 한다. */
export function formatCoverLog(evidence) {
	return `[e2e][cover] ${JSON.stringify(evidence)}`;
}

/**
 * 증거를 모아 한 줄로 남긴다.
 *
 * `execute` 와 `log` 를 인자로 받는 것은 계약 테스트가 진짜 브라우저 없이 이 경로가
 * **실제로 찍는지** 재게 하려는 것이다 — 형태 검사가 아니라 출력 검사다.
 */
export async function reportCover(execute, log, selector) {
	try {
		const evidence = await execute(coverEvidenceScript, selector ?? null);
		if (!evidence) return null;
		const line = formatCoverLog(evidence);
		log(line);
		return line;
	} catch (error) {
		// 탐침이 실패했다고 시험을 더 망가뜨리지 않는다. 그 사실만 남긴다.
		const line = `[e2e][cover] probe failed: ${String(error)}`;
		log(line);
		return line;
	}
}
