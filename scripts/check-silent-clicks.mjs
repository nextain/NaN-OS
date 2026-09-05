/**
 * 요소가 없어도 조용히 넘어가는 클릭과, 리눅스에서 반드시 실패하는 클릭 대기를
 * 잡는다.
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
 * `await` 가 낀 형태도 함께 본다. e2e 코드에서 자연스러운 것은 오히려 그쪽인데,
 * 처음에는 동기 형태만 알고 있어서 실제 사고가 난 자리(async 핸들러)를 통째로
 * 놓치고 있었다 — 게이트가 "무음 클릭 금지" 가 아니라 "await 없는 무음 클릭
 * 금지" 였던 셈이다.
 *
 * `waitForClickable` 도 함께 본다. WebKitWebDriver 는 요소를 상호작용 가능으로
 * 보지 않아서 그 대기가 시간을 다 쓰고 실패한다 — 실제로 열 개 스펙이 그
 * 자리에서 삼십 초씩 기다리다 죽었다. 헬퍼(`clickElement`)는 보이는 것을
 * 확인한 뒤 페이지 안에서 누르므로 그 환경을 지난다.
 *
 * 지금 있는 것은 baseline 으로 잠그고 늘어나는 것만 막는다. 한 번에 고치면
 * 그 커밋을 아무도 검토할 수 없다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHELL = "packages/shell";

/** 있으면 누르고 없으면 조용히 넘어가는 꼴. */
const SILENT_CLICK = new RegExp(
	[
		// if (el) el.click();  /  if (el) await el.click();
		String.raw`if\s*\(\s*(\w+)\s*\)\s*(?:await\s+)?\1\.click\(`,
		// if (el) { el.click(); }  /  if (el) { await el.click(); }
		//   포매터가 중괄호를 권하므로 오히려 이쪽이 더 흔하다
		String.raw`if\s*\(\s*(\w+)\s*\)\s*\{\s*(?:await\s+)?\2\.click\(`,
		// el && el.click();  /  el && (await el.click());
		String.raw`(\w+)\s*&&\s*\(?\s*(?:await\s+)?\3\.click\(`,
		// el?.click();  /  await el?.click();
		String.raw`(\w+)\?\.click\(`,
	// 같은 무음 클릭을 뒤집어 적은 형태. `if (!el) return;` 뒤의 클릭도
	// 요소가 없으면 아무 일 없이 지나간다 — 방향만 바꾼 같은 사고다.
	//
	// 다만 `if (!el) return false;` 는 다르다. 못 눌렀다는 사실을 값으로
	// 돌려주고 부르는 쪽이 그것을 단언한다 — 이 게이트가 권하는 형태이고
	// clickElement 가 그렇게 쓴다. 값 없이 빠져나가는 것만 센다.
	String.raw`if\s*\(\s*!\s*(\w+)\s*\)\s*\{?\s*(?:return|continue)\s*;\s*\}?[\s\S]{0,120}?\.click\(`,
	// 널 비교로 적어도 같은 무음이다. 이 저장소 포매터는 중괄호를 넣으므로
	// 중괄호 없는 한 줄만 보면 실제 코드 형태를 놓친다.
	String.raw`if\s*\(\s*(\w+)\s*!==?\s*null\s*\)\s*\{?\s*(?:await\s+)?\6\.click\(`,
		// waitForClickable — 리눅스 드라이버에서 반드시 시간을 다 쓴다
		String.raw`waitForClickable\s*\(`,
	].join("|"),
	"g",
);

/**
 * 지금 상태. 줄이면 이 값도 함께 줄여야 한다.
 *
 * 49 에서 61 로 올렸다. 새로 생긴 것이 아니라, 검사가 `if (el) el.click()`
 * 한 꼴만 보고 있어서 `if (el) { el.click(); }` 와 `el && el.click()` 을
 * 놓치고 있었다. 포매터가 중괄호를 권하므로 놓치던 쪽이 오히려 더 흔했다.
 */
const BASELINE = 59;

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
	// 어느 자리가 새것인지 순서로 가정하면 안 된다. 파일이 알파벳순으로
	// 읽히므로, 앞쪽 파일에 하나 더하면 뒤쪽의 멀쩡한 자리가 "새로 늘었다"
	// 로 지목된다 — 그러면 고치는 사람이 엉뚱한 파일을 판다.
	console.error(`\n늘었다(${hits.length} > ${BASELINE}). 지금 있는 자리를 파일별로 센다:`);
	const byFile = new Map();
	for (const hit of hits) byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1);
	for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
		console.error(`  ${String(count).padStart(3)} ${file}`);
	}
	console.error(
		"\n방금 만진 파일을 보라. 이 검사는 총수만 지키므로 어느 줄이 새것인지는 말하지 못한다.",
	);
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
