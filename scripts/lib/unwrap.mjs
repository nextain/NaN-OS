/**
 * 값을 가리지 않는 **껍데기**를 벗기는 자리. 저장소에 하나뿐이다.
 *
 * 왜 따로 두는가: 열두 번째 회차까지 이 일이 세 곳에 따로 있었다.
 * `bindings.mjs` 의 `unwrap`, `jsx-static.mjs` 의 `unwrapAll`, 무음 클릭
 * 게이트의 지역 `unwrap` 이다. 12회차에 쉼표식(`(0, invoke)`)을 닫을 때
 * `bindings.mjs` 만 고쳤고, 그래서 같은 쉼표가 **값** 쪽에서는 그대로
 * 남았다 — `(0, true)` 는 영구히 꺼 둔 버튼이 아니었고,
 * `(0, <div role="alert"/>)` 는 알림이 아니었으며, `(0, el.click())` 은
 * 클릭이 아니었다(13회차 지적 1). 껍데기를 벗기는 규칙이 세 벌이면
 * 구멍도 세 번 막아야 하고, 리뷰어는 매번 안 고친 쪽으로 넣는다.
 *
 * 무엇을 벗기는가: 값이 **그대로 통과하는** 문법 껍데기다.
 *
 *   - 괄호 `(x)`
 *   - 타입 단언 `x as T`, `x satisfies T`, `<T>x`
 *   - non-null `x!`
 *   - 쉼표식 `(a, b, c)` — 값은 **마지막 항**이다. 앞의 항은 부수 효과일 뿐
 *     결과가 아니다. 파서는 이것을 왼쪽으로 접힌 쉼표 이항식으로도,
 *     `CommaListExpression` 으로도 준다.
 *
 * 무엇을 벗기지 않는가: 값을 **바꾸는** 것은 껍데기가 아니다. `await x` 는
 * 약속을 푼 값이고, `void x` 는 언제나 `undefined` 이며, `!x` 는 뒤집은
 * 값이다. 그런 것을 여기서 벗기면 뜻이 달라진다 — 필요한 게이트가 자기
 * 자리에서 따로 다룬다.
 *
 * 한계를 세지 않는다: 껍데기는 몇 겹이든 벗긴다. 예전에는 열여섯 번만
 * 돌았는데, 그런 숫자는 "몇 겹을 더 씌우면 통과하는가" 를 알려 주는
 * 눈금이다. 구문 나무는 유한하고 껍데기는 언제나 자식 하나로 내려가므로
 * 이 반복은 반드시 끝난다.
 */

import ts from "typescript";

/** 껍데기를 모두 벗긴 알맹이 식. 값이 없으면 `null`. */
export function unwrapExpression(node) {
	let cur = node;
	for (;;) {
		if (!cur) return null;
		if (
			ts.isParenthesizedExpression(cur) ||
			ts.isAsExpression(cur) ||
			ts.isNonNullExpression(cur) ||
			(ts.isSatisfiesExpression?.(cur) ?? false) ||
			cur.kind === ts.SyntaxKind.TypeAssertionExpression
		) {
			cur = cur.expression;
			continue;
		}
		if (ts.isCommaListExpression?.(cur)) {
			cur = cur.elements[cur.elements.length - 1];
			continue;
		}
		if (
			ts.isBinaryExpression(cur) &&
			cur.operatorToken.kind === ts.SyntaxKind.CommaToken
		) {
			cur = cur.right;
			continue;
		}
		return cur;
	}
}
