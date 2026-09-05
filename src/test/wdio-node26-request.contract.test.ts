import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONF_DIR = fileURLToPath(
	new URL("../../packages/shell/e2e-tauri", import.meta.url),
);

/**
 * Node 26 에서 WebDriver 세션 요청이 거절되지 않게 하는 대응이 **모든** wdio
 * 설정에 있는지 본다.
 *
 * 예전에는 기본 설정 하나만 읽었다. 그래서 전용 설정 열 개에 그 대응이 빠져
 * 있는 것을 말해 주지 않았고, 그 설정들은 세션 생성 단계에서 전부
 * `UND_ERR_INVALID_ARG` 로 죽었다 — 회귀를 나눠 돌리기 시작하고 나서야
 * 드러났다. 한 곳만 보는 계약 테스트는 그 한 곳만 지킨다.
 */
describe("native WebDriver Node 26 request compatibility", () => {
	const configs = readdirSync(CONF_DIR).filter((name) =>
		/^wdio\.conf(\..+)?\.ts$/.test(name),
	);

	it("설정 파일을 실제로 찾는다", () => {
		expect(configs.length).toBeGreaterThan(5);
	});

	it.each(configs)("%s 이 Content-Length 를 fetch 에 맡긴다", (name) => {
		const source = readFileSync(`${CONF_DIR}/${name}`, "utf8");
		expect(
			source.includes("transformRequest"),
			`${name} 에 Node 26 대응이 없다 — 이 설정으로 도는 스펙은 세션 생성에서 죽는다`,
		).toBe(true);
	});

	it("대응 자체는 한 곳에 있다", () => {
		const shared = readFileSync(`${CONF_DIR}/node26-request.ts`, "utf8");
		expect(shared).toContain('request.headers.delete("Content-Length")');
		expect(shared).toContain("return request");
	});
});
