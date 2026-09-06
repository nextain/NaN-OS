// 클릭이 막히면 무엇이 덮었는지 **실제로 찍힌다** (#569).
//
// 왜 이 테스트가 있는가: `element not interactable` · `element click intercepted` 는
// 요소가 없다는 뜻이 아니다 — 있고, 보이고, 심지어 `active` 인데 다른 것이 위에 있다는
// 뜻이다. 그 "다른 것" 이 로그에 남지 않아 회차마다 화면을 띄워 눈으로 확인해야 했다.
//
// 여기서 재는 것은 형태가 아니라 **출력**이다. 가짜 `execute` 를 넣고, 그 경로가
// `[e2e][cover]` 한 줄을 남기며 그 줄이 판정에 필요한 값을 모두 담는지 본다. 배선을
// 지우면 줄이 사라져 이 테스트가 붉어진다.
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

interface CoverProbeModule {
	isCoverFailure(message: unknown): boolean;
	coverEvidenceScript(selector: string | null): unknown;
	formatCoverLog(evidence: unknown): string;
	reportCover(
		execute: (script: unknown, selector: unknown) => Promise<unknown>,
		log: (line: string) => void,
		selector?: string,
	): Promise<string | null>;
}

let probe: CoverProbeModule;

beforeAll(async () => {
	probe = (await import(
		fileURLToPath(
			new URL("../../packages/shell/e2e-tauri/helpers/cover-probe.mjs", import.meta.url),
		)
	)) as CoverProbeModule;
});

/** 판정에 필요한 값 — 하나라도 빠지면 다음 회차가 또 화면을 띄워야 한다. */
const REQUIRED_KEYS = [
	"covering",
	"appLayoutLeft",
	"appLayoutZIndex",
	"railZIndex",
	"naiaVisible",
	"railCollapsed",
	"uiMode",
	"onboarding",
];

describe("가려진 클릭은 스스로 증거를 남긴다", () => {
	it("가려짐 계열 실패만 집는다", () => {
		expect(probe.isCoverFailure("element not interactable")).toBe(true);
		expect(probe.isCoverFailure("element click intercepted: ...")).toBe(true);
		expect(probe.isCoverFailure("Element is not clickable at point")).toBe(true);
		// 요소가 아예 없는 것은 다른 문제다 — 덮개를 찾을 이유가 없다.
		expect(probe.isCoverFailure("still not displayed after 10000ms")).toBe(false);
		expect(probe.isCoverFailure(undefined)).toBe(false);
	});

	it("한 줄 JSON 을 `[e2e][cover]` 로 찍는다", async () => {
		const evidence = {
			selector: ".chat-tab.active",
			covering: "div.app-layout",
			appLayoutLeft: "0px",
			appLayoutZIndex: "5",
			railZIndex: "2",
			naiaVisible: true,
			railCollapsed: true,
			uiMode: "workspace",
			onboarding: false,
		};
		const lines: string[] = [];
		const line = await probe.reportCover(
			async () => evidence,
			(text) => lines.push(text),
			".chat-tab.active",
		);

		expect(lines).toHaveLength(1);
		expect(line).toBe(lines[0]);
		expect(lines[0].startsWith("[e2e][cover] ")).toBe(true);

		const parsed = JSON.parse(lines[0].slice("[e2e][cover] ".length));
		for (const key of REQUIRED_KEYS) {
			expect(parsed, `${key} 가 없으면 판정에 못 쓴다`).toHaveProperty(key);
		}
		// 세 조건 중 어느 것이 참인지 그 줄만 보고 갈릴 수 있어야 한다.
		expect(parsed.appLayoutLeft).toBe("0px");
		expect(parsed.naiaVisible).toBe(true);
		expect(parsed.railCollapsed).toBe(true);
		expect(parsed.uiMode).toBe("workspace");
	});

	it("탐침이 실패해도 그 사실을 남기고 시험을 더 망가뜨리지 않는다", async () => {
		const lines: string[] = [];
		const line = await probe.reportCover(
			async () => {
				throw new Error("execute died");
			},
			(text) => lines.push(text),
			".chat-tab.active",
		);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("[e2e][cover] probe failed");
		expect(line).toBe(lines[0]);
	});

	it("수집기가 판정에 필요한 값을 모두 읽는다", () => {
		// 페이지 안에서 도는 함수라 DOM 을 흉내 내어 직접 부른다.
		const style = { left: "0px", zIndex: "5" };
		const railStyle = { left: "0px", zIndex: "2" };
		const target = {
			getBoundingClientRect: () => ({ left: 10, top: 20, width: 30, height: 10 }),
			contains: () => false,
		};
		const layout = { __style: style };
		const rail = { __style: railStyle };
		const covering = { tagName: "DIV", className: "app-layout" };
		const documentStub = {
			querySelector: (selector: string) => {
				if (selector === ".app-layout") return layout;
				if (selector === ".naia-overlay") return rail;
				if (selector === ".ws-rail-toggle--collapsed") return {};
				if (selector === "[data-ui-mode]")
					return { getAttribute: () => "workspace" };
				if (selector.includes("onboarding")) return null;
				return target;
			},
			elementFromPoint: () => covering,
		};
		const globalStub = globalThis as unknown as Record<string, unknown>;
		const saved = {
			document: globalStub.document,
			getComputedStyle: globalStub.getComputedStyle,
			window: globalStub.window,
		};
		globalStub.document = documentStub;
		globalStub.getComputedStyle = (element: { __style?: unknown }) =>
			element.__style ?? {};
		globalStub.window = { innerWidth: 1366, innerHeight: 768 };
		try {
			const evidence = probe.coverEvidenceScript(".chat-tab.active") as Record<
				string,
				unknown
			>;
			for (const key of REQUIRED_KEYS) expect(evidence).toHaveProperty(key);
			expect(evidence.covering).toBe("div.app-layout");
			expect(evidence.appLayoutLeft).toBe("0px");
			expect(evidence.railZIndex).toBe("2");
			expect(evidence.naiaVisible).toBe(true);
			expect(evidence.railCollapsed).toBe(true);
			expect(evidence.uiMode).toBe("workspace");
		} finally {
			globalStub.document = saved.document;
			globalStub.getComputedStyle = saved.getComputedStyle;
			globalStub.window = saved.window;
		}
	});

	it("기본 설정이 그 탐침을 실패한 시험에서 부른다", async () => {
		const { readFileSync } = await import("node:fs");
		const conf = readFileSync(
			fileURLToPath(
				new URL("../../packages/shell/e2e-tauri/wdio.conf.ts", import.meta.url),
			),
			"utf8",
		);
		expect(conf).toContain('from "./helpers/cover-probe.mjs"');
		expect(conf).toContain("async afterTest(");
		expect(conf).toContain("isCoverFailure(result?.error?.message)");
		expect(conf).toContain("reportCover(");
	});
});
