/**
 * 이 저장소가 **쓰지 않기로 한 문법 형태**의 정본.
 *
 * 왜 이 파일이 있는가: 열네 번의 교차 리뷰에서 거짓 통과의 절반은 "같은 뜻을
 * 다르게 적기" 였다. `void 0` 을 닫으면 쉼표식이 왔고, 쉼표식을 닫으면 대괄호
 * 키가 왔다. 정적 게이트는 그 꼬리를 원리상 다 읽을 수 없다 — 뜻이 같고 적는
 * 법이 다른 형태는 문법이 허용하는 만큼 있기 때문이다.
 *
 * 그래서 오너가 경계를 옮겼다(2026-09-06): **게이트가 읽지 못하는 형태는
 * 린터가 금지한다.** 게이트는 자기가 읽는 범위를 지키고, 그 밖은 저장소에
 * 들어오지 못한다. 리뷰어는 린트를 통과하는 형태로만 도전한다.
 *
 * 이 파일이 그 목록의 **정본**이다. 세 곳이 이것을 본다.
 *
 *   1. `scripts/check-lint-boundary.mjs` — 실제로 막는 게이트
 *   2. 게이트 모듈 여섯의 머리말 "보증 밖" 절
 *   3. `docs/quality-reviews/obfuscation-forms.md` — 회차별 내력
 *
 * 셋이 어긋나면 `src/test/lint-boundary.contract.test.ts` 가 붉어진다. 목록이
 * 한 곳에만 늘고 나머지가 낡는 것을 막는 자리다.
 *
 * ## 형태를 고르는 기준
 *
 * 넓은 규칙을 통째로 켜지 않았다. 이 저장소에 **정당한 용도로 쓰이는** 형태를
 * 금지하면, 규칙은 곧 예외 목록이 되고 예외 목록은 아무도 읽지 않는다.
 *
 *   - biome `complexity/noVoid` 는 안 켠다. `void asyncFn()` 은 약속을 일부러
 *     버리는 관용구이고 이 저장소에 162자리 있다. 게이트를 속이는 것은 그것이
 *     아니라 **리터럴에 씌운 `void`**(`void 0` = `undefined` 대역)와
 *     **겹쳐 쌓은 `void`** 다. 그 둘만 막는다.
 *   - biome `complexity/useLiteralKeys` 는 안 켠다. `flat["workspaceRoot"]`
 *     같은 사전 접근은 정당하고 103자리 있다. 게이트를 속이는 것은 리터럴 키로
 *     **곧바로 부르는 것**(`f["call"](…)`, `el["click"]()`)이다. 그것만 막는다.
 *
 * 각 형태는 지금 저장소에 **0자리**다. 그래서 숫자 기준선이 없다 — 하나라도
 * 생기면 붉어진다.
 */

import ts from "typescript";
import { unwrapExpression } from "./unwrap.mjs";

/** 게이트가 분석하는 소스. 린트 경계도 같은 범위를 본다. */
export const LINT_BOUNDARY_SCOPE = [
	"scripts",
	"src",
	"packages/shell/src",
	"packages/shell/e2e",
	"packages/shell/e2e-tauri",
];

/** 검사할 파일 확장자. */
export const LINT_BOUNDARY_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * 금지 형태. `id` 가 정본 키다 — 머리말과 문서가 이 글자를 그대로 쓴다.
 *
 *   - `biome` 가 있으면 그 규칙으로 막는다(진짜 린터가 판정한다).
 *   - `detector` 가 있으면 게이트가 TypeScript 파서로 그 형태만 센다.
 *     biome 에 그 좁은 규칙이 없을 때만 쓴다.
 */
export const LINT_BOUNDARY_FORMS = [
	{
		id: "comma-operator",
		title: "쉼표식 `(a, b)` · `(0, f)()`",
		why: "값이 마지막 항에만 있어, 앞의 항을 읽는 판정이 통째로 어긋난다. 12·13회차에 호출부와 값 양쪽을 뚫었다.",
		instead: "부수 효과는 앞 줄의 문장으로 두고, 값은 그대로 적는다.",
		rounds: [12, 13],
		biome: "style/noCommaOperator",
		detector: null,
	},
	{
		id: "void-literal",
		title: "리터럴에 씌운 `void` (`void 0`, `void \"x\"`)",
		why: "`undefined` 를 다른 글자로 적는 것뿐이다. 널 판정·값 없음 판정이 형태 하나마다 갈린다. 10·14회차.",
		instead: "`undefined` 라고 적는다. 값 없이 나가려면 `return;` 이다.",
		rounds: [10, 14],
		biome: null,
		detector: "voidLiteral",
	},
	{
		id: "void-stacked",
		title: "겹쳐 쌓은 `void` (`void void …`)",
		why: "겹의 수만 늘려 벗기기 반복을 넘긴다. 어떤 뜻으로도 필요 없다. 14회차.",
		instead: "`void` 는 한 겹이면 충분하고, 대개 한 겹도 필요 없다.",
		rounds: [14],
		biome: null,
		detector: "voidStacked",
	},
	{
		id: "computed-callee",
		title: "리터럴 키로 곧바로 부르기 (`f[\"call\"](…)`, `el[\"click\"]()`)",
		why: "이름이 정적인데 점 표기를 피한 것뿐이다. 호출부 판정과 클릭 판정이 형태마다 갈린다. 12·14회차.",
		instead: "`f.call(…)`, `el.click()` 처럼 점으로 적는다.",
		rounds: [12, 14],
		biome: null,
		detector: "computedCallee",
	},
];

/**
 * 후보였지만 **금지하지 않기로** 한 형태와 그 이유.
 *
 * 적어 두는 까닭: 다음 사람이 같은 후보를 다시 검토하며 시간을 쓰지 않도록,
 * 그리고 리뷰어가 이 형태로 들어와도 그것이 경계 밖이 아님을 분명히 하려고.
 * 아래는 모두 **게이트가 읽는다**. 린트로 막을 이유가 없다.
 */
export const LINT_BOUNDARY_REJECTED = [
	{
		id: "default-alias-reexport",
		title: "`export { x as default }` · 네임스페이스 재수출",
		reason:
			"평범한 모듈 문법이고 다른 저장소에서도 흔하다. 13·14회차에 게이트가 이 형태를 읽도록 고쳤으므로 금지할 이유가 없다.",
	},
	{
		id: "all-void",
		title: "`void <식>` 전부 (biome `complexity/noVoid`)",
		reason:
			"`void asyncFn()` 은 약속을 일부러 버리는 관용구이고 이 저장소에 162자리 있다. 좁힌 `void-literal`·`void-stacked` 만 막는다.",
	},
	{
		id: "all-literal-keys",
		title: "리터럴 키 멤버 접근 전부 (biome `complexity/useLiteralKeys`)",
		reason:
			"`flat[\"workspaceRoot\"]` 같은 사전 접근은 정당하고 103자리 있다. 좁힌 `computed-callee` 만 막는다.",
	},
];

/**
 * 자리마다 걸어 둔 예외. **숫자가 아니라 자리**로 적는다.
 *
 * 넣을 때는 파일·형태·이유를 함께 적는다. 그 자리가 사라지면 게이트가 낡은
 * 예외로 잡는다 — 이유가 거짓이 된 예외가 남아 다음 결함을 삼키는 것을 막는
 * 자리다.
 *
 * 지금 있는 것은 하나뿐이다: **간접 `eval`**. `(0, eval)(src)` 는 전역
 * 스코프에서 평가하라는 뜻이고, 그렇게 적는 것 말고 다른 표기가 없다. 그리고
 * `eval` 안쪽은 모든 게이트 머리말이 이미 보증 밖으로 선언한 자리라, 이
 * 형태를 막아도 게이트가 더 읽게 되는 것이 없다. 브라우저측 셋업을 주입하는
 * Playwright 스펙 넷이 그 표기를 쓴다.
 *
 * @type {{ file: string, form: string, reason: string }[]}
 */
export const LINT_BOUNDARY_EXCEPTIONS = [
	{
		file: "packages/shell/e2e/nva-p2-head-overlay.spec.ts",
		form: "comma-operator",
		reason: "간접 eval `(0, eval)(src)` — 전역 스코프 평가의 유일한 표기이고, eval 안쪽은 모든 게이트가 보증 밖으로 선언한 자리다",
	},
	{
		file: "packages/shell/e2e/nva-p4-layered-player.spec.ts",
		form: "comma-operator",
		reason: "간접 eval `(0, eval)(src)` — 전역 스코프 평가의 유일한 표기이고, eval 안쪽은 모든 게이트가 보증 밖으로 선언한 자리다",
	},
	{
		file: "packages/shell/e2e/nva-p5-alpha-yang.spec.ts",
		form: "comma-operator",
		reason: "간접 eval `(0, eval)(src)` — 전역 스코프 평가의 유일한 표기이고, eval 안쪽은 모든 게이트가 보증 밖으로 선언한 자리다",
	},
	{
		file: "packages/shell/e2e/nva-p6-osarang.spec.ts",
		form: "comma-operator",
		reason: "간접 eval `(0, eval)(src)` — 전역 스코프 평가의 유일한 표기이고, eval 안쪽은 모든 게이트가 보증 밖으로 선언한 자리다",
	},
];

/** 머리말과 문서가 그대로 실을 수 있는 한 줄 목록. */
export function boundaryLines() {
	return LINT_BOUNDARY_FORMS.map((form) => ` *   - \`${form.id}\` — ${form.title}`);
}

/* ─────────────── 형태의 정의 ─────────────── */

/**
 * 리터럴에 씌운 `void`. `void 0` 은 `undefined` 를 다르게 적은 것이다.
 *
 * 껍데기는 `scripts/lib/unwrap.mjs` 가 벗긴다 — 검출기가 자식 노드를 그대로
 * 맞추면 `void (0)` 괄호 한 겹으로 경계가 뚫린다(16회차 지적 4). 경계를 지는
 * 게이트가 게이트 모듈보다 얕게 보면 안 된다.
 */
function voidLiteral(node) {
	if (!ts.isVoidExpression(node)) return false;
	const inner = unwrapExpression(node.expression);
	if (!inner) return false;
	return (
		ts.isNumericLiteral(inner) ||
		ts.isBigIntLiteral(inner) ||
		ts.isStringLiteral(inner) ||
		ts.isNoSubstitutionTemplateLiteral(inner) ||
		inner.kind === ts.SyntaxKind.TrueKeyword ||
		inner.kind === ts.SyntaxKind.FalseKeyword ||
		inner.kind === ts.SyntaxKind.NullKeyword ||
		(ts.isIdentifier(inner) && inner.text === "undefined")
	);
}

/** 겹쳐 쌓은 `void`. 겹의 수만 늘리는 형태다. 껍데기를 벗기고 본다. */
function voidStacked(node) {
	if (!ts.isVoidExpression(node)) return false;
	const inner = unwrapExpression(node.expression);
	return !!inner && ts.isVoidExpression(inner);
}

/**
 * 리터럴 키로 곧바로 부르기. `f["call"](…)` 은 `f.call(…)` 이다.
 *
 * callee 와 키 **양쪽** 껍데기를 벗긴다. `(f["call"])()` 의 callee 는 괄호이고
 * `f["call" as const]()` 의 키는 단언이다 — 둘 다 같은 호출이고, 바인딩 쪽은
 * 이미 그렇게 읽는다(16회차 지적 4).
 */
function computedCallee(node) {
	if (!ts.isCallExpression(node)) return false;
	const callee = unwrapExpression(node.expression);
	if (!callee || !ts.isElementAccessExpression(callee)) return false;
	const key = unwrapExpression(callee.argumentExpression);
	return (
		!!key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key))
	);
}

/**
 * 검출기 이름 → 그 형태를 판별하는 함수.
 *
 * 게이트가 이것을 그대로 쓴다. 형태의 정의가 정본과 게이트 두 곳에 있으면
 * 한쪽만 고쳐진 자리로 결함이 들어온다 — 실제로 껍데기 벗기기가 그렇게
 * 뚫렸다(16회차 지적 4).
 */
export const LINT_BOUNDARY_DETECTORS = { voidLiteral, voidStacked, computedCallee };
