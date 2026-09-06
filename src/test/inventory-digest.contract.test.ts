// 회귀 기록의 **스펙 목록 지문** 이 줄끝에 흔들리지 않는지 고정한다.
//
// 왜 이 파일이 있는가: 지문을 인벤토리 파일의 원문 바이트 sha256 으로 잡았다.
// 윈도우 체크아웃은 같은 파일을 CRLF 로 받으므로 바이트가 다르고, 따라서
// 해시가 다르다. 그래서 두 기계가 같은 목록을 재고도 서로의 기록을 영원히
// "다른 스펙 목록에서 돌았다" 로 버렸다 — win-rtx4060 의 쉰아홉 개 실측이
// 통째로 판정 밖에 있었고, 게이트는 그 몫을 "아무 기계도 맡지 않았다" 로
// 말했다. 여러 기계로 나눠 도는 프로세스에서 이것은 나눔 자체를 무효로 만든다.
//
// 여기서 재는 것은 셋이다. 하나, 같은 내용이면 줄끝·끝 개행·키 순서·들여쓰기가
// 달라도 같은 지문. 둘, 스펙 하나만 달라져도 다른 지문 — 느슨해지면 낡은 기록이
// 통과한다. 셋, 그 계산이 **한 곳** 에서만 이뤄진다: 러너와 게이트가 자기
// `createHash(...)` 를 다시 적으면 한쪽만 고쳐지고, 갈라진 것은 기록이 버려질
// 때에만 드러난다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const DIGEST_PATH = resolve(ROOT, "scripts", "lib", "inventory-digest.mjs");
const DIGEST_URL = pathToFileURL(DIGEST_PATH).href;
const RUNNER_PATH = resolve(ROOT, "scripts", "run-regression.mjs");
const GATE_PATH = resolve(ROOT, "scripts", "check-regression-complete.mjs");
const INVENTORY_PATH = resolve(ROOT, "docs", "e2e-inventory.json");

/**
 * 모듈 표면은 여기 적는다. `.mjs` 를 정적으로 끌어오면 루트 tsc 프로그램이
 * 스크립트를 프로그램에 넣어 rootDir 위반으로 컴파일 무결성 게이트가 붉어진다.
 */
interface DigestModule {
	INVENTORY_DIGEST_VERSION: number;
	stableStringify(value: unknown): string;
	inventoryDigest(source: string | Buffer): string;
	inventoryDigestFromFile(path: string): string;
	legacyRawDigests(source: string | Buffer): { lf: string; crlf: string };
}

const load = async (): Promise<DigestModule> =>
	(await import(DIGEST_URL)) as unknown as DigestModule;

/** 손으로 지은 최소 인벤토리. 규칙만 재는 자리이므로 작을수록 좋다. */
const SAMPLE = {
	generatedFrom: "packages/shell/e2e-tauri/specs",
	total: 2,
	summary: { deterministic_ci: 1, credentialed_live: 1 },
	specs: [
		{ spec: "a.spec.ts", conf: [], env: [], tier: "deterministic_ci" },
		{
			spec: "b.spec.ts",
			conf: ["wdio.conf.codex.ts"],
			env: ["NAIA_API_KEY"],
			tier: "credentialed_live",
		},
	],
};

const withLf = (value: unknown): string => JSON.stringify(value, null, "\t");
const withCrlf = (value: unknown): string =>
	withLf(value).replace(/\n/g, "\r\n");

describe("인벤토리 지문", () => {
	it("같은 내용이면 LF·CRLF·끝 개행 유무가 같은 지문을 낸다", async () => {
		const { inventoryDigest } = await load();
		const lf = inventoryDigest(withLf(SAMPLE));
		expect(inventoryDigest(withCrlf(SAMPLE))).toBe(lf);
		expect(inventoryDigest(`${withLf(SAMPLE)}\n`)).toBe(lf);
		expect(inventoryDigest(`${withCrlf(SAMPLE)}\r\n`)).toBe(lf);
		// 버퍼로 줘도 같아야 한다 — 러너와 게이트는 파일에서 바이트로 읽는다.
		expect(inventoryDigest(Buffer.from(withCrlf(SAMPLE), "utf8"))).toBe(lf);
	});

	it("키 순서와 들여쓰기가 달라도 같은 지문이다", async () => {
		const { inventoryDigest } = await load();
		const reordered = {
			specs: SAMPLE.specs.map((s) => ({
				tier: s.tier,
				env: s.env,
				conf: s.conf,
				spec: s.spec,
			})),
			summary: SAMPLE.summary,
			total: SAMPLE.total,
			generatedFrom: SAMPLE.generatedFrom,
		};
		expect(inventoryDigest(JSON.stringify(reordered))).toBe(
			inventoryDigest(withLf(SAMPLE)),
		);
	});

	it("스펙 하나가 바뀌면 다른 지문이다", async () => {
		const { inventoryDigest } = await load();
		const base = inventoryDigest(withLf(SAMPLE));

		// 이름이 바뀐 경우.
		const renamed = structuredClone(SAMPLE);
		renamed.specs[0].spec = "a2.spec.ts";
		expect(inventoryDigest(withLf(renamed))).not.toBe(base);

		// 요구 환경이 바뀐 경우. 이것이 같은 지문이면 환경 조건이 달라진 뒤의
		// 낡은 기록이 지금 목록을 잰 것으로 통과한다.
		const reenv = structuredClone(SAMPLE);
		reenv.specs[1].env = ["NAIA_API_KEY", "GEMINI_API_KEY"];
		expect(inventoryDigest(withLf(reenv))).not.toBe(base);

		// 순서가 바뀐 경우도 다른 목록이다 — 러너가 순서로 기계별 몫을 가른다.
		const reordered = structuredClone(SAMPLE);
		reordered.specs.reverse();
		expect(inventoryDigest(withLf(reordered))).not.toBe(base);
	});

	it("실제 인벤토리도 줄끝에 흔들리지 않는다", async () => {
		const { inventoryDigest, inventoryDigestFromFile, legacyRawDigests } =
			await load();
		const raw = readFileSync(INVENTORY_PATH, "utf8");
		const asCrlf = raw.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");

		// 손으로 지은 표본만 재면 진짜 파일의 모양(중첩 배열, 유니코드)을
		// 놓친다. 이 저장소가 실제로 쓰는 파일로 한 번 더 못 박는다.
		expect(inventoryDigest(asCrlf)).toBe(
			inventoryDigestFromFile(INVENTORY_PATH),
		);
		// 옛 규칙은 정확히 이 자리에서 갈라졌다.
		const legacy = legacyRawDigests(raw);
		expect(legacy.lf).not.toBe(legacy.crlf);
	});

	it("지문 계산이 한 곳에만 있다 — 러너·게이트에 자기 해시가 없다", async () => {
		const { inventoryDigestFromFile } = await load();
		for (const path of [RUNNER_PATH, GATE_PATH]) {
			const source = readFileSync(path, "utf8");
			// 인벤토리를 자기 손으로 해시하면 규칙이 갈라진다. 이 결함이 정확히
			// 그 모양이었다 — 두 파일에 같은 식이 따로 적혀 있었다.
			expect(
				/createHash\([^)]*\)[\s\S]{0,200}?INVENTORY/.test(source),
				`${path} 가 인벤토리를 스스로 해시한다`,
			).toBe(false);
			expect(source, `${path} 가 정본 모듈을 쓰지 않는다`).toContain(
				"inventory-digest.mjs",
			);
		}
		// 정본이 실제로 부를 수 있는 것인지도 본다 — 이름만 맞고 던지면 소용없다.
		expect(inventoryDigestFromFile(INVENTORY_PATH)).toMatch(/^[0-9a-f]{64}$/);
	});

	// 이행 기간 항목은 2026-09-07 인벤토리 변경(#567)으로 만료돼 지웠다 — 게이트의
	// acceptedDigests 도 같은 커밋에서 정규화 지문 하나만 남았다.
});
