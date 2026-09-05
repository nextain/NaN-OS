/**
 * 요소가 없어도 조용히 넘어가는 클릭을 잡는다.
 *
 * 왜 필요한가: `if (el) el.click()` 은 요소가 없으면 아무 일도 하지 않고,
 * 그 사실이 어디에도 남지 않는다. 그래서 실패가 한 걸음 뒤에서 엉뚱한
 * 모습으로 나타난다 — 실제로 92번 스펙이 "슬롯이 활성이 아니다" 로 실패했는데
 * 원인은 그보다 앞에서 버튼을 못 찾은 것이었다. 원인과 증상이 떨어져 있으면
 * 고치는 사람이 엉뚱한 곳을 판다.
 *
 * 무엇을 재는가: 스펙과 헬퍼 안에서 "있으면 누르고 없으면 넘어가는" 꼴.
 * 눌렀는지 돌려주고 못 눌렀으면 말하는 형태(`if (!pressed) throw`)는 세지
 * 않는다.
 *
 * 지금 있는 것은 baseline 으로 잠그고 늘어나는 것만 막는다. 마흔아홉 자리를
 * 한 번에 고치면 그 커밋을 아무도 검토할 수 없다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHELL = "packages/shell";

/** 있으면 누르고 없으면 조용히 넘어가는 꼴. */
const SILENT_CLICK =
	/if\s*\(\s*(\w+)\s*\)\s*\1\.click\(\)|(\w+)\?\.\click\(\)/g;

/** 지금 상태. 줄이면 이 값도 함께 줄여야 한다. */
const BASELINE = 49;

function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

const files = [
	...tracked(`${SHELL}/e2e-tauri`, ".ts"),
	...tracked(`${SHELL}/e2e`, ".ts"),
];

const hits = [];
for (const file of files) {
	const source = readFileSync(file, "utf8");
	for (const match of source.matchAll(SILENT_CLICK)) {
		hits.push({
			file,
			line: source.slice(0, match.index).split("\n").length,
		});
	}
}

console.log(
	`[silent-clicks] 요소가 없어도 조용히 넘어가는 클릭 ${hits.length} (baseline ${BASELINE})`,
);

if (hits.length > BASELINE) {
	console.error("\n늘었다. 새로 더한 자리:");
	for (const hit of hits.slice(BASELINE)) console.error(`  ${hit.file}:${hit.line}`);
	console.error(
		"\n눌렀는지 돌려주고 못 눌렀으면 그 자리에서 말하라 — 헬퍼의 clickElement 가 그렇게 한다.",
	);
	process.exit(1);
}

if (hits.length < BASELINE) {
	console.log(`  ✓ 줄었다(${hits.length}) — 이 파일의 BASELINE 도 함께 줄여라`);
} else {
	console.log("  ✓ 늘지 않았다");
}
