/**
 * 의존이 죽었을 때 화면이 다음에 무엇을 하라고 말하는지 본다.
 *
 * 왜 필요한가: 안정성 축은 문서에 세 질문으로 적혀 있었다 — 재시작 뒤 상태가
 * 남는가, 동시에 만졌을 때 깨지는가, **의존이 죽었을 때 무엇이 보이는가**.
 * 앞의 둘은 재는 자리가 있었지만 셋째는 검증 수단이 어디에도 지목돼 있지
 * 않았다. 넘으면 실패하는 수치가 없으면 그 축은 이름만 있는 것이다.
 *
 * 무엇을 재는가: 실패를 사용자에게 알리는 자리마다 **복구 행동이 함께 있는가**.
 * 오류를 띄우고 끝나면 사용자는 앱을 껐다 켜는 것 말고 할 수 있는 일이 없다.
 *
 * 어디를 보는가: **막다른 화면**만 본다. 즉 실패했을 때 그 알림이 화면을
 * 통째로 대신하는 자리다(`if (error) return <... role="alert">`). 알림이
 * 다른 내용과 나란히 뜨는 경우는 대개 원래 화면의 버튼이 그대로 남아 있어
 * 사용자가 다시 시도할 수 있다 — 그런 자리까지 세면 과탐지가 되고, 과탐지가
 * 많은 게이트는 곧 꺼진다.
 *
 * 복구 행동으로 보는 것은 버튼·링크, 재시도/시작 계열 키, 그리고 실패해도
 * 사용자가 쓸 수 있는 대체 내용(원문 표시 같은 것)이다.
 *
 * 무엇을 재지 않는가: 그 행동이 실제로 복구시키는지는 정적으로 알 수 없다.
 * 이 게이트는 "빠져나갈 길을 보여주기라도 하는가" 까지만 말한다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHELL = "packages/shell";

/** 사용자에게 실패를 알리는 표시. */
const FAILURE_SURFACE = /role=["']alert["']/;

/** 다음 행동을 주는 표시. */
/**
 * 다음 행동을 주는 표시.
 *
 * `<pre>` 와 `<code>` 를 한때 인정했다 — 원문을 대신 보여 주는 화면이 있어서다.
 * 그런데 그러면 오류 문자열을 코드 블록으로 예쁘게 감싸기만 해도 "빠져나갈
 * 길이 있다" 로 세어진다. 읽을 것을 주는 것과 할 것을 주는 것은 다르다.
 * 대체 내용으로 인정하려면 사용자가 그것으로 무언가 할 수 있어야 한다
 * (복사, 편집, 이동).
 */
// `Start` 를 부분문자열로 인정하면 "Start-up failed" 라는 **문구**가 복구
// 수단이 된다. 실제로 그 한 단어로 통과했다. 행동을 가리키는 것만 센다 —
// 누를 것, 갈 곳, 고쳐 쓸 곳, 복사할 것.
const RECOVERY =
	/<button|<a\s|onClick=|common\.retry|\.retry\b|\bonStart\b|\bstart[A-Z]\w*\s*\(|href=|<textarea|onCopy|navigator\.clipboard/;

/**
 * 실패를 알리지만 복구 행동을 확인하지 못한 자리. 숫자가 아니라 자리로
 * 적는다 — 무엇이 면제됐는지 드러나야 한다.
 */
const ACKNOWLEDGED = new Map([
	[
		"packages/shell/src/components/MarkdownCodeBlock.tsx:67",
		"Mermaid 렌더 실패 화면이 원문만 보여 주고 다음에 할 일을 주지 않는다. 진짜 빈자리이고 덮는 것이 아니다 — 복사 단추를 붙이는 일로 #558 에 올렸다. 게이트를 고치자 드러난 자리다",
	],
]);

function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

/** `role="alert"` 를 단 요소의 본문. 여는 태그부터 짝 닫는 태그까지. */
function alertBlocks(source) {
	const blocks = [];
	for (const match of source.matchAll(/<(\w+)([^>]*role=["']alert["'][^>]*)>/g)) {
		const tag = match[1];
		const from = match.index;
		// 자기 닫힘이면 그 자체가 전부다.
		if (match[0].endsWith("/>")) {
			blocks.push({
				text: match[0],
				at: from,
				line: source.slice(0, from).split("\n").length,
			});
			continue;
		}
		let depth = 0;
		let cursor = from;
		let end = source.length;
		const opener = new RegExp(`<${tag}[\\s>]`, "g");
		const closer = new RegExp(`</${tag}>`, "g");
		opener.lastIndex = from;
		closer.lastIndex = from;
		let nextOpen = opener.exec(source);
		let nextClose = closer.exec(source);
		while (nextClose) {
			if (nextOpen && nextOpen.index < nextClose.index) {
				depth += 1;
				nextOpen = opener.exec(source);
				continue;
			}
			depth -= 1;
			if (depth === 0) {
				end = nextClose.index + nextClose[0].length;
				break;
			}
			nextClose = closer.exec(source);
		}
		cursor = end;
		blocks.push({
			text: source.slice(from, cursor),
			at: from,
			line: source.slice(0, from).split("\n").length,
		});
	}
	return blocks;
}

const files = [...tracked(`${SHELL}/src`, ".tsx")].filter(
	(f) => !/\.test\.tsx$/.test(f) && !f.includes("__tests__"),
);

/**
 * 이 알림이 화면을 통째로 대신하는가.
 *
 * 처음에는 `return (` 바로 뒤만 봤다. 그래서 `<div className="...">` 로 한 겹
 * 감싸기만 하면 빠져나갔고, 실무에서 오류 화면을 컨테이너 없이 최상위에 두는
 * 경우는 드물기 때문에 그 우회가 사실상 이 검사를 무력화했다.
 *
 * 이제 `return` 과 알림 사이에 여는 태그만 있는지 본다. 그 사이에 다른
 * 내용(형제 요소, 조건부 렌더)이 있으면 알림이 화면의 일부이지 전부가 아니다.
 */
function isDeadEnd(source, at) {
	const before = source.slice(Math.max(0, at - 600), at);
	// 예전에는 `return (` 만 봤고, 그것도 창 안의 **첫** 것을 썼다. 그래서
	// 괄호 없는 `return <div role="alert">` 는 막다른 화면이 아니었고
	// (머리말이 예시로 든 형태가 바로 그것이다), 위쪽에 이펙트 cleanup
	// `return () => ...` 가 있으면 그것이 잡혀 판정이 어긋났다.
	//
	// 이제 알림에 가장 가까운 return 을 보고, 괄호 없는 형태도 센다.
	// 이펙트 cleanup(`return () =>`)은 화면을 돌려주는 것이 아니므로 뺀다.
	const returns = [...before.matchAll(/return\s*(\(|<)/g)].filter(
		(m) => !/return\s*\(\s*\)\s*=>/.test(before.slice(m.index, m.index + 20)),
	);
	const last = returns[returns.length - 1];
	if (!last) return false;
	const afterReturn = [
		null,
		before.slice(last.index + last[0].length - (last[1] === "<" ? 1 : 0)),
	];
	// 사이에 남은 것에서 여는 태그와 공백을 걷어 낸다. 아무것도 남지 않으면
	// 알림까지 곧장 내려온 것이다.
	const between = afterReturn[1]
		.replace(/<[A-Za-z][\w.]*(\s[^>]*)?>/g, " ")
		.replace(/\{[\s\S]*?\}/g, " ")
		.trim();
	return between.length === 0;
}

const stranded = [];
let surfaces = 0;

for (const file of files) {
	const source = readFileSync(file, "utf8");
	if (!FAILURE_SURFACE.test(source)) continue;
	for (const block of alertBlocks(source)) {
		if (!isDeadEnd(source, block.at)) continue;
		surfaces += 1;
		if (RECOVERY.test(block.text)) continue;
		stranded.push({ file, line: block.line });
	}
}

console.log(
	`[recovery] 실패가 화면을 통째로 대신하는 자리 ${surfaces}곳 / 다음 행동이 없는 곳 ${stranded.length}`,
);

const unexpected = stranded.filter(
	(hit) => !ACKNOWLEDGED.has(`${hit.file}:${hit.line}`),
);
// 걸리지 않게 된 면제는 알리바이다. 남겨 두면 다음 결함이 그 자리로 들어와도
// 조용히 지나간다.
const staleAllowances = [...ACKNOWLEDGED.keys()].filter(
	(key) => !stranded.some((hit) => `${hit.file}:${hit.line}` === key),
);
if (staleAllowances.length > 0) {
	console.error("\n걸리지 않는 면제가 남아 있다:");
	for (const key of staleAllowances) console.error(`  ${key}`);
	console.error("\nACKNOWLEDGED 에서 지워라 — 남겨 두면 다음 결함을 덮는다.");
	process.exit(1);
}

if (unexpected.length > 0) {
	console.error("\n실패를 알리면서 다음에 할 일을 주지 않는 자리:");
	for (const hit of unexpected) console.error(`  ${hit.file}:${hit.line}`);
	console.error(
		"\n재시도 버튼이나 설정으로 가는 길처럼, 사용자가 스스로 빠져나갈 수단을 함께 두어라.",
	);
	console.error(
		"정말 할 수 있는 일이 없는 자리라면 ACKNOWLEDGED 에 이유와 함께 적어라.",
	);
	process.exit(1);
}

console.log("  ✓ 모든 실패 알림에 다음 행동이 있다");
