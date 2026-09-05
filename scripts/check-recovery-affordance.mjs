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
const RECOVERY =
	/<button|<a\s|onClick=|common\.retry|\.retry|Start|start[A-Z]|href=|<pre|<code|<textarea/;

/**
 * 실패를 알리지만 복구 행동을 확인하지 못한 자리. 숫자가 아니라 자리로
 * 적는다 — 무엇이 면제됐는지 드러나야 한다.
 */
const ACKNOWLEDGED = new Map();

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

/** `return (` 또는 `return <` 바로 뒤에 오는 알림인가 — 화면을 통째로 대신하는가. */
function isDeadEnd(source, at) {
	const before = source.slice(Math.max(0, at - 120), at);
	return /return\s*\(?\s*$/.test(before);
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
