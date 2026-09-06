// 린트 경계의 **정본이 하나**라는 것을 고정한다.
//
// 왜 이 파일이 있는가: 2026-09-06 에 오너가 경계를 옮겼다 — 게이트가 읽지
// 않기로 한 문법 형태는 린터가 금지한다. 그 말이 참이려면 목록이 한 곳에만
// 있어야 한다. 목록이 여러 벌이면 한쪽만 늘고 나머지가 낡는다. 열네 번의
// 교차 리뷰가 정확히 그 자리로 들어왔다 — 손으로 적은 목록, 형태 열거,
// 한쪽만 고쳐진 공용 모듈.
//
// 그래서 여기서 못 박는 것은 세 가지다.
//   1. 형태 목록의 정본은 `scripts/lib/lint-boundary-forms.mjs` 하나다.
//   2. 게이트 모듈 여섯의 머리말과 회차별 문서가 그 목록을 그대로 싣는다.
//   3. 각 형태를 실제로 막는 수단(biome 규칙 또는 파서 검출기)이 있다.
//
// 모듈은 `.mjs` ESM 이라 정적 import 로는 이 tsconfig(rootDir=src)의 범위를
// 벗어난다. 파일 URL 로 동적 import 해서 실제 산출물 그대로를 태운다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");

const FORMS_URL = pathToFileURL(
	resolve(ROOT, "scripts", "lib", "lint-boundary-forms.mjs"),
).href;

interface BoundaryForm {
	id: string;
	title: string;
	why: string;
	instead: string;
	rounds: number[];
	biome: string | null;
	detector: string | null;
}

interface RejectedForm {
	id: string;
	title: string;
	reason: string;
}

interface Exception {
	file: string;
	form: string;
	reason: string;
}

interface FormsModule {
	LINT_BOUNDARY_FORMS: BoundaryForm[];
	LINT_BOUNDARY_DETECTORS: Record<string, (node: ts.Node) => boolean>;
	LINT_BOUNDARY_REJECTED: RejectedForm[];
	LINT_BOUNDARY_EXCEPTIONS: Exception[];
	LINT_BOUNDARY_SCOPE: string[];
	LINT_BOUNDARY_EXTENSIONS: string[];
	boundaryLines(): string[];
}

const F = (await import(/* @vite-ignore */ FORMS_URL)) as FormsModule;

function read(rel: string): string {
	return readFileSync(resolve(ROOT, rel), "utf8");
}

/** 머리말에 이 목록을 실어야 하는 모듈들. */
const HEADER_MODULES = [
	"scripts/lib/bindings.mjs",
	"scripts/lib/jsx-static.mjs",
	"scripts/lib/unwrap.mjs",
	"scripts/check-silent-clicks.mjs",
	"scripts/build-e2e-inventory.mjs",
	"scripts/check-destructive-affordance.mjs",
];

describe("린트 경계 — 목록의 정본은 하나다", () => {
	it("형태가 하나라도 있어야 경계가 뜻을 갖는다", () => {
		expect(F.LINT_BOUNDARY_FORMS.length).toBeGreaterThan(0);
	});

	it("형태마다 막는 수단이 있다 — biome 규칙이거나 파서 검출기", () => {
		// 반증의 자리: 둘 다 없으면 목록에만 적히고 아무것도 막지 않는다.
		// 그것은 경계가 아니라 문서다.
		for (const form of F.LINT_BOUNDARY_FORMS) {
			const armed = Boolean(form.biome) || Boolean(form.detector);
			expect(armed, `${form.id} 를 막는 수단이 없다`).toBe(true);
		}
	});

	it("형태마다 왜 금지하는지와 대신 무엇을 쓰는지가 적혀 있다", () => {
		for (const form of F.LINT_BOUNDARY_FORMS) {
			expect(form.why.length, `${form.id} 에 이유가 없다`).toBeGreaterThan(10);
			expect(form.instead.length, `${form.id} 에 대안이 없다`).toBeGreaterThan(5);
			expect(form.rounds.length, `${form.id} 가 어느 회차에서 왔는지 없다`).toBeGreaterThan(0);
		}
	});

	it("id 가 겹치지 않는다", () => {
		const ids = F.LINT_BOUNDARY_FORMS.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("린트 경계 — 게이트가 같은 목록을 본다", () => {
	it("린트 게이트는 형태를 직접 적지 않고 정본에서 읽는다", () => {
		const gate = read("scripts/check-lint-boundary.mjs");
		expect(gate.includes("lint-boundary-forms.mjs")).toBe(true);
		// 반증: 게이트가 자기 목록을 들면 정본이 둘이 된다.
		for (const form of F.LINT_BOUNDARY_FORMS) {
			const declared = new RegExp(`id:\\s*["'\`]${form.id}["'\`]`).test(gate);
			expect(declared, `게이트가 ${form.id} 를 자기 안에 다시 적었다`).toBe(false);
		}
	});

	it("파서 검출기가 정본에 실제로 구현돼 있다", () => {
		// 형태의 **정의**도 정본에 있어야 한다. 게이트가 자기 판별을 들면
		// 껍데기 벗기기처럼 한쪽만 고쳐진 자리가 생긴다(16회차 지적 4).
		for (const form of F.LINT_BOUNDARY_FORMS) {
			if (!form.detector) continue;
			expect(
				typeof F.LINT_BOUNDARY_DETECTORS[form.detector],
				`${form.detector} 검출기가 없다`,
			).toBe("function");
		}
	});

	it("린트 게이트 소스에 자기 껍데기 벗기기가 없다", () => {
		// 경계를 지는 게이트가 게이트 모듈보다 얕게 보면 안 된다. `void (0)`
		// 괄호 한 겹으로 경계가 뚫렸던 자리다(16회차 지적 4).
		const gate = read("scripts/check-lint-boundary.mjs");
		const forms = read("scripts/lib/lint-boundary-forms.mjs");
		for (const marker of [
			"isParenthesizedExpression",
			"isAsExpression",
			"isNonNullExpression",
			"isSatisfiesExpression",
			"isCommaListExpression",
		]) {
			expect(gate.includes(marker), `게이트가 ${marker} 를 직접 본다`).toBe(false);
			expect(forms.includes(marker), `정본이 ${marker} 를 직접 본다`).toBe(false);
		}
		expect(forms.includes("unwrap.mjs"), "정본이 공용 껍데기 모듈을 안 쓴다").toBe(true);
	});

	describe("검출기는 껍데기 한 겹에 뚫리지 않는다 (16회차 지적 4)", () => {
		function first(code: string, pick: (n: ts.Node) => boolean): ts.Node {
			const sf = ts.createSourceFile("p.ts", code, ts.ScriptTarget.Latest, true);
			let hit: ts.Node | undefined;
			const walk = (n: ts.Node): void => {
				if (hit) return;
				if (pick(n)) hit = n;
				else ts.forEachChild(n, walk);
			};
			walk(sf);
			expect(hit, `${code} 에서 노드를 찾지 못했다`).not.toBeUndefined();
			return hit as ts.Node;
		}

		const voidLiteral = (code: string): boolean =>
			F.LINT_BOUNDARY_DETECTORS.voidLiteral(first(code, ts.isVoidExpression));
		const computedCallee = (code: string): boolean =>
			F.LINT_BOUNDARY_DETECTORS.computedCallee(first(code, ts.isCallExpression));

		it("`void (0)` 은 `void 0` 과 같다", () => {
			expect(voidLiteral("void 0;")).toBe(true);
			expect(voidLiteral("void (0);")).toBe(true);
			expect(voidLiteral("void ((0));")).toBe(true);
			expect(voidLiteral("void (0 as never);")).toBe(true);
		});

		it("`(f[\"call\"])()` 은 `f[\"call\"]()` 과 같다", () => {
			expect(computedCallee('f["call"](null);')).toBe(true);
			expect(computedCallee('(f["call"])(null);')).toBe(true);
			expect(computedCallee('f["call" as const](null);')).toBe(true);
		});

		it("`void +0` 처럼 정적으로 값이 정해지면 같은 형태다", () => {
			// "리터럴" 은 형태가 아니라 정적으로 값이 정해지는가다. 형태로 세면
			// 매 회차에 하나씩 새로 온다(17회차 지적 9).
			expect(voidLiteral("void +0;")).toBe(true);
			expect(voidLiteral("void -1;")).toBe(true);
			expect(voidLiteral("void ~0;")).toBe(true);
			expect(voidLiteral("void !0;")).toBe(true);
			expect(voidLiteral('void "x".length;')).toBe(true);
			expect(voidLiteral("void (1 === 1);")).toBe(true);
		});

		it("반증: 껍데기를 벗겨도 형태가 아니면 걸리지 않는다", () => {
			// `void asyncFn()` 은 정당한 관용구다. 벗기기를 넓혔다고 이것까지
			// 잡으면 규칙이 곧 예외 목록이 된다.
			expect(voidLiteral("void (asyncFn());")).toBe(false);
			expect(voidLiteral("void +asyncFn();")).toBe(false);
			expect(computedCallee("f[name](null);")).toBe(false);
			expect(computedCallee("f.call(null);")).toBe(false);
		});
	});

	it("검사 범위는 게이트가 분석하는 소스와 같다", () => {
		expect(F.LINT_BOUNDARY_SCOPE).toContain("scripts");
		expect(F.LINT_BOUNDARY_SCOPE).toContain("src");
		expect(F.LINT_BOUNDARY_SCOPE).toContain("packages/shell/src");
		expect(F.LINT_BOUNDARY_SCOPE).toContain("packages/shell/e2e-tauri");
	});
});

describe("린트 경계 — 머리말과 문서가 같은 목록을 싣는다", () => {
	for (const rel of HEADER_MODULES) {
		it(`${rel} 머리말이 경계를 밝힌다`, () => {
			const text = read(rel);
			const header = text.slice(0, text.indexOf("\n */\n") + 4);
			expect(header.includes("scripts/check-lint-boundary.mjs"), `${rel} 이 게이트를 안 가리킨다`).toBe(
				true,
			);
			for (const form of F.LINT_BOUNDARY_FORMS)
				expect(header.includes(form.id), `${rel} 머리말에 ${form.id} 가 없다`).toBe(true);
		});
	}

	it("회차별 문서가 같은 형태를 싣는다", () => {
		const doc = read("docs/quality-reviews/obfuscation-forms.md");
		for (const form of F.LINT_BOUNDARY_FORMS)
			expect(doc.includes(form.id), `obfuscation-forms.md 에 ${form.id} 가 없다`).toBe(true);
	});

	it("금지하지 않기로 한 후보도 이유와 함께 남아 있다", () => {
		// 다음 사람이 같은 후보를 다시 검토하며 시간을 쓰지 않게, 그리고
		// 리뷰어가 그 형태로 들어와도 경계 밖이 아님을 분명히 하려고 남긴다.
		expect(F.LINT_BOUNDARY_REJECTED.length).toBeGreaterThan(0);
		const doc = read("docs/quality-reviews/obfuscation-forms.md");
		for (const form of F.LINT_BOUNDARY_REJECTED) {
			expect(form.reason.length, `${form.id} 에 이유가 없다`).toBeGreaterThan(10);
			expect(doc.includes(form.id), `obfuscation-forms.md 에 ${form.id} 가 없다`).toBe(true);
		}
	});

	it("품질 문서가 경계를 어디에 두는지 적어 두었다", () => {
		const doc = read("docs/quality-process.md");
		expect(doc.includes("### 경계를 어디에 두는가")).toBe(true);
		expect(doc.includes("check-lint-boundary.mjs")).toBe(true);
	});
});

describe("린트 경계 — 예외는 자리로 적는다", () => {
	it("예외마다 파일·형태·이유가 함께 있다", () => {
		for (const hit of F.LINT_BOUNDARY_EXCEPTIONS) {
			expect(hit.file.length).toBeGreaterThan(0);
			expect(F.LINT_BOUNDARY_FORMS.some((f) => f.id === hit.form)).toBe(true);
			expect(hit.reason.length, `${hit.file} 예외에 이유가 없다`).toBeGreaterThan(10);
		}
	});

	it("숫자 기준선이 없다", () => {
		// 반증의 자리: 개수를 잠그면 그 수만큼은 언제나 들어올 수 있고,
		// 기준선이 곧 알리바이가 된다. 위반은 자리로만 적는다.
		const gate = read("scripts/check-lint-boundary.mjs");
		expect(/baseline/i.test(gate), "게이트에 baseline 이 있다").toBe(false);
		const forms = read("scripts/lib/lint-boundary-forms.mjs");
		expect(/baseline/i.test(forms), "정본에 baseline 이 있다").toBe(false);
	});
});

describe("금지 키도 접히는 키 전부다 (19회차 지적 4)", () => {
	function computedCallee(code: string): boolean {
		const sf = ts.createSourceFile("p.ts", code, ts.ScriptTarget.Latest, true);
		let hit: ts.Node | undefined;
		const walk = (n: ts.Node): void => {
			if (hit) return;
			if (ts.isCallExpression(n)) hit = n;
			else ts.forEachChild(n, walk);
		};
		walk(sf);
		expect(hit, `${code} 에서 호출을 찾지 못했다`).not.toBeUndefined();
		return F.LINT_BOUNDARY_DETECTORS.computedCallee(hit as ts.Node);
	}

	it("리터럴이 아니어도 접히면 같은 형태다", () => {
		expect(computedCallee('f["call"](null);')).toBe(true);
		expect(computedCallee("f[String.raw`call`](null);")).toBe(true);
		expect(computedCallee('f["ca" + "ll"](null);')).toBe(true);
		expect(computedCallee('const KEY = "call";\nf[KEY](null);')).toBe(true);
	});

	it("반증: 못 접는 키는 보증 밖이라 금지 대상이 아니다", () => {
		expect(computedCallee("declare const k: string;\nf[k](null);")).toBe(false);
		expect(computedCallee("f.call(null);")).toBe(false);
	});
});
