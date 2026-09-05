/**
 * 되돌릴 수 없는 동작 앞에 확인이 있는지 본다.
 *
 * 왜 필요한가: 사용성 축은 "쓸 수 있는가" 만 재고 있었다. 그런데 사용성에서
 * 가장 비싼 실패는 못 쓰는 것이 아니라 **되돌릴 수 없게 잃는 것**이다.
 * 이 게이트를 처음 돌렸을 때 실제로 그 결함이 있었다 — 대화 세션 삭제에는
 * 확인이 있는데, 설치된 앱을 디스크에서 지우는 두 경로에는 확인도 되돌리기도
 * 없었다. 더 파괴적인 쪽이 더 무방비였다.
 *
 * 무엇을 재는가: 파괴적 Tauri 명령을 부르는 프런트 호출부마다, 그 호출을 감싼
 * 함수 안에 확인 절차(confirm 계열)나 되돌리기 표시(undo/restore/trash)가
 * 있는지 본다. 없으면 그 자리를 이름과 함께 보고한다.
 *
 * 무엇을 재지 않는가: 확인 문구가 좋은지, 되돌리기가 실제로 동작하는지는
 * 정적으로 알 수 없다. 이 게이트는 "물어보기라도 하는가" 까지만 말한다.
 * 그 위는 e2e 가 맡는다.
 *
 * baseline 은 지금 값으로 잠근다. 늘면 실패하고, 줄이면 baseline 도 함께
 * 줄여야 한다 — 늘리기만 하면 baseline 이 알리바이가 된다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHELL = "packages/shell";

/** 실행하면 사용자 자산이 사라지고 앱 안에서 되돌릴 수 없는 명령. */
const DESTRUCTIVE_COMMANDS = [
	"app_remove_installed",
	"clear_app_skills",
	"delete_agent_fact",
	"delete_model",
];

/** 확인 또는 되돌리기가 있다고 볼 수 있는 표시. */
const AFFORDANCE = /\bconfirm\s*\(|ConfirmDialog|\bundo\b|\brestore\b|\btrash\b/i;

/** 지금 방어가 없는 자리의 수. 늘어나면 실패한다. */
const BASELINE = 0;

function tracked(pattern) {
	try {
		return execFileSync("git", ["ls-files", pattern], { encoding: "utf8" })
			.split("\n")
			.filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * 호출 지점을 감싼 블록 본문을 찾는다. 중괄호 균형으로 위로 거슬러 올라가
 * 여는 괄호를 찾고, 거기서부터 짝이 맞는 닫는 괄호까지를 본문으로 본다.
 */
function enclosingBlock(source, at) {
	let depth = 0;
	let start = -1;
	for (let i = at; i >= 0; i--) {
		const ch = source[i];
		if (ch === "}") depth++;
		else if (ch === "{") {
			if (depth === 0) {
				start = i;
				break;
			}
			depth--;
		}
	}
	if (start < 0) return null;

	let end = source.length;
	depth = 0;
	for (let i = start; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	return { start, end, text: source.slice(start, end) };
}

/** 이 여는 괄호 바로 앞이 함수 선언인가. */
const FUNCTION_HEAD = /(?:function\s*[A-Za-z0-9_]*\s*\([^)]*\)\s*(?::[^{]*)?|=>\s*|\)\s*(?::\s*[^{]+)?)\s*$/;

/**
 * 호출을 감싼 **함수** 본문을 찾는다. 한 단계만 올라가면 `try {` 같은 안쪽
 * 블록에서 멈춘다 — 실제로 그 버그가 있었다. 확인은 대개 try 바깥에 있으므로
 * 함수 머리가 나올 때까지 바깥으로 계속 넓힌다.
 */
function enclosingFunction(source, at) {
	let cursor = at;
	let widest = null;
	for (let step = 0; step < 12; step++) {
		const block = enclosingBlock(source, cursor);
		if (!block) break;
		widest = block;
		if (FUNCTION_HEAD.test(source.slice(Math.max(0, block.start - 200), block.start)))
			return block.text;
		if (block.start === 0) break;
		cursor = block.start - 1;
	}
	return widest ? widest.text : source.slice(Math.max(0, at - 800), at + 800);
}

const files = [
	...tracked(`${SHELL}/src/**/*.ts`),
	...tracked(`${SHELL}/src/**/*.tsx`),
].filter((f) => !/\.test\.|__tests__|\/locales\//.test(f));

const unguarded = [];
let callSites = 0;

for (const file of files) {
	const source = readFileSync(file, "utf8");
	for (const command of DESTRUCTIVE_COMMANDS) {
		const needle = new RegExp(`["'\`]${command}["'\`]`, "g");
		let match = needle.exec(source);
		while (match) {
			callSites++;
			const body = enclosingFunction(source, match.index);
			if (!AFFORDANCE.test(body)) {
				const line = source.slice(0, match.index).split("\n").length;
				unguarded.push({ file, line, command });
			}
			match = needle.exec(source);
		}
	}
}

// 명령을 감싼 얇은 함수(invoke 한 줄만 있는 래퍼)는 그 자체로는 물을 수 없다.
// 그 함수를 부르는 쪽에 확인이 있으면 방어된 것으로 본다.
const wrappers = new Map();
for (const file of files) {
	const source = readFileSync(file, "utf8");
	for (const command of DESTRUCTIVE_COMMANDS) {
		if (!source.includes(`"${command}"`)) continue;
		const named = source.matchAll(
			/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
		);
		for (const fn of named) {
			// 선언 뒤 첫 여는 괄호가 본문 시작이다. 시그니처 길이를 어림하면
			// 인자 목록 한가운데를 짚어 엉뚱한 블록을 잡는다.
			const brace = source.indexOf("{", fn.index + fn[0].length);
			if (brace < 0) continue;
			const body = enclosingFunction(source, brace + 1);
			if (body.includes(`"${command}"`)) wrappers.set(fn[1], command);
		}
	}
}

const stillUnguarded = unguarded.filter((hit) => {
	const wrapperNames = [...wrappers.entries()]
		.filter(([, command]) => command === hit.command)
		.map(([name]) => name);
	if (wrapperNames.length === 0) return true;
	// 래퍼를 부르는 모든 자리에 확인이 있으면 방어된 것으로 본다.
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		for (const name of wrapperNames) {
			const calls = source.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"));
			for (const call of calls) {
				if (/(export\s+)?(async\s+)?function\s*$/.test(source.slice(0, call.index)))
					continue;
				const body = enclosingFunction(source, call.index);
				if (!AFFORDANCE.test(body)) return true;
			}
		}
	}
	return false;
});

const guarded = callSites - unguarded.length;

if (stillUnguarded.length > BASELINE) {
	console.error(
		`되돌릴 수 없는 동작 ${stillUnguarded.length}곳에 확인도 되돌리기도 없다 (허용 ${BASELINE}):`,
	);
	for (const hit of stillUnguarded) {
		console.error(`  ${hit.file}:${hit.line} — ${hit.command}`);
	}
	console.error(
		"\n확인을 걸거나(confirm/ConfirmDialog), 되돌릴 수 있게 만들어라(undo/trash).",
	);
	console.error(
		"의도적으로 묻지 않는다면 그 이유를 코드 주석이 아니라 이 파일의 BASELINE 옆에 적어라.",
	);
	process.exit(1);
}

console.log(
	`되돌릴 수 없는 동작 ${DESTRUCTIVE_COMMANDS.length}종을 부르는 자리 ${unguarded.length + guarded}곳 중 ` +
		`확인도 되돌리기도 없는 곳 ${stillUnguarded.length}개 ✓`,
);
