/**
 * 되돌릴 수 없는 동작 앞에 확인이 있는지 본다.
 *
 * 왜 필요한가: 사용성 축은 "쓸 수 있는가" 만 재고 있었다. 그런데 사용성에서
 * 가장 비싼 실패는 못 쓰는 것이 아니라 **되돌릴 수 없게 잃는 것**이다.
 *
 * 이 게이트의 첫 판은 스스로가 그 부류의 실패였다. 명령 목록을 손으로 적었는데
 * 그중 셋이 Rust 내부 함수 이름이라 프런트가 부르는 이름과 달랐고, 결과적으로
 * 열두 개 명령 중 하나만 보면서 "4종 통과" 라고 초록을 냈다. 그 눈먼 자리에
 * 실제 결함이 살아 있었다 — STT 모델 파일 삭제와 기억 항목 삭제가 확인 없이
 * 돌고 있었다.
 *
 * 그래서 두 가지를 바꿨다.
 *
 *   1) 목록을 손으로 적지 않는다. Rust 의 `#[tauri::command]` 선언에서
 *      직접 뽑는다. 명령이 늘면 게이트도 같이 는다.
 *   2) 못 찾으면 통과시키지 않는다. 첫 판은 호출부를 찾지 못하면 방어된
 *      것으로 보았는데, React 컴포넌트는 `Component(` 꼴로 불리지 않으므로
 *      컴포넌트 안의 파괴적 호출이 전부 그 구멍으로 빠져나갔다. 지금은
 *      확인을 확인하지 못하면 무방비로 센다.
 *
 * 무엇을 재지 않는가: 확인 문구가 좋은지, 되돌리기가 실제로 동작하는지는
 * 정적으로 알 수 없다. 이 게이트는 "물어보기라도 하는가" 까지만 말한다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHELL = "packages/shell";

/** 이름에 이것이 들어가면 파괴 후보로 본다. */
const DESTRUCTIVE_NAME = /(^|_)(delete|remove|clear|reset|wipe|purge|revoke|uninstall)(_|$)/;

/**
 * 파괴 후보처럼 보이지만 되돌릴 수 있어 묻지 않는 것. 면제하려면 **왜 되돌릴
 * 수 있는지** 여기 적어야 한다. 이유 없는 면제는 baseline 과 같은 알리바이다.
 */
const REVERSIBLE = new Map([
	["clear_naia_path_cache", "캐시다. 다음 조회에서 다시 채워진다"],
	["reset_window_state", "창 크기·위치다. 사용자가 다시 옮기면 된다"],
	[
		"delete_naia_settings",
		"설정 파일 하나를 지우면 기본값으로 돌아간다. 부르는 곳도 초기화 흐름 안이다",
	],
]);

/**
 * 확인 또는 되돌리기가 있다고 볼 수 있는 표시.
 *
 * `confirm` 을 이름에 담은 식별자도 인정한다 — 이 저장소는 브라우저
 * `confirm()` 말고 상태 토글로 확인 화면을 띄우는 자리가 있고
 * (`setShowResetConfirm(true)`), 그것도 사용자에게 묻는 것은 같다.
 */
const AFFORDANCE = /confirm|ConfirmDialog|\bundo\b|\brestore\b|\btrash\b/i;

/**
 * 주석과 문자열을 지운 코드. 리뷰에서 실증된 우회가 있었다 —
 * `// no undo needed` 라고 적기만 해도 방어로 세어졌다. 사람이 적은 말이
 * 아니라 코드가 하는 일로 판정해야 한다.
 */
function codeOnly(text) {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
		.replace(/`(?:[^`\\]|\\.)*`/g, "``")
		.replace(/"(?:[^"\\]|\\.)*"/g, '""')
		.replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/**
 * 검사기가 확인을 확인하지 못하는 자리. **숫자가 아니라 자리로** 적는다 —
 * 숫자 baseline 은 무엇이 면제됐는지 숨기지만, 자리 목록은 드러내고 새로
 * 생긴 것과 섞이지 않는다.
 *
 * 여기 적으려면 사람이 그 자리를 열어 보고 방어가 실제로 있는지 확인해야
 * 하고, 왜 검사기가 못 보는지 적어야 한다.
 */
const ACKNOWLEDGED = new Map([
	[
		"packages/shell/src/lib/adk-store.ts:reset_naia_config_files",
		"SettingsTab 의 executeReset 이 부르고, 그 앞에 setShowResetConfirm 로 뜨는 확인 화면이 있다. 확인 상태와 실행 함수가 서로 다른 함수에 있어 이 검사기의 추적 범위를 벗어난다",
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

/** Rust 가 프런트에 내주는 명령 이름 전부. */
function tauriCommands() {
	const names = new Set();
	for (const file of tracked(`${SHELL}/src-tauri/src`, ".rs")) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(
			/#\[tauri::command[^\]]*\][\s\S]{0,200}?\bfn\s+([a-z0-9_]+)/g,
		)) {
			names.add(match[1]);
		}
	}
	return names;
}

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

const FUNCTION_HEAD =
	/(?:function\s*[A-Za-z0-9_]*\s*\([^)]*\)\s*(?::[^{]*)?|=>\s*|\)\s*(?::\s*[^{]+)?)\s*$/;

/**
 * 호출을 감싼 **함수** 본문. 한 단계만 올라가면 `try {` 같은 안쪽 블록에서
 * 멈춘다 — 확인은 대개 try 바깥에 있으므로 함수 머리가 나올 때까지 넓힌다.
 */
function enclosingFunction(source, at) {
	let cursor = at;
	let widest = null;
	for (let step = 0; step < 12; step++) {
		const block = enclosingBlock(source, cursor);
		if (!block) break;
		widest = block;
		if (
			FUNCTION_HEAD.test(
				source.slice(Math.max(0, block.start - 200), block.start),
			)
		)
			return block;
		if (block.start === 0) break;
		cursor = block.start - 1;
	}
	return widest;
}

/** 함수 본문 바로 앞에서 그 함수의 이름을 읽는다. 못 읽으면 null. */
function functionNameBefore(source, blockStart) {
	const head = source.slice(Math.max(0, blockStart - 240), blockStart);
	// 앞을 greedy 로 먹어 **마지막** 선언을 잡는다. 그러지 않으면 앞선
	// 함수의 이름을 집는다 — 실제로 `deleteAgentFact` 를 바로 위의
	// `getAllAgentFacts` 로 잘못 읽어, 확인이 걸린 자리를 무방비로 셌다.
	const named =
		/[\s\S]*(?:function|const|let|var)\s+([A-Za-z0-9_$]+)/.exec(head) ??
		/[\s\S]*?([A-Za-z0-9_$]+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]*)?=>\s*$/.exec(
			head,
		);
	return named ? named[1] : null;
}

const files = [
	...tracked(`${SHELL}/src`, ".ts"),
	...tracked(`${SHELL}/src`, ".tsx"),
].filter((f) => !/\.test\.|__tests__|\/locales\//.test(f));

const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

const commands = [...tauriCommands()].filter(
	(name) => DESTRUCTIVE_NAME.test(name) && !REVERSIBLE.has(name),
);

/**
 * 이름이 가리키는 함수 안에 확인이 있는지, 없으면 그 함수를 부르는 쪽으로
 * 한 단계 더 올라가 본다. 부르는 쪽을 하나도 찾지 못하면 방어를 확인하지
 * 못한 것이므로 무방비로 센다.
 */
function guarded(name, depth = 0) {
	if (depth > 3) return false;
	let sawCaller = false;
	for (const [file, source] of sources) {
		for (const call of source.matchAll(
			new RegExp(`\\b${name}\\s*\\(`, "g"),
		)) {
			const head = source.slice(0, call.index);
			if (/(?:function|const|let|var)\s+$/.test(head)) continue;
			sawCaller = true;
			const block = enclosingFunction(source, call.index);
			if (!block) return false;
			if (AFFORDANCE.test(codeOnly(block.text))) continue;
			const outer = functionNameBefore(source, block.start);
			if (!outer || !guarded(outer, depth + 1)) return false;
		}
	}
	return sawCaller;
}

const unguarded = [];
let callSites = 0;

for (const [file, source] of sources) {
	for (const command of commands) {
		for (const match of source.matchAll(
			new RegExp(`["'\`]${command}["'\`]`, "g"),
		)) {
			callSites++;
			const block = enclosingFunction(source, match.index);
			const line = source.slice(0, match.index).split("\n").length;
			if (block && AFFORDANCE.test(codeOnly(block.text))) continue;

			const wrapper = block ? functionNameBefore(source, block.start) : null;
			if (wrapper && guarded(wrapper)) continue;

			unguarded.push({ file, line, command, wrapper });
		}
	}
}

console.log(
	`[destructive] Rust 명령 ${tauriCommands().size}개 중 파괴 후보 ${commands.length}개` +
		` (되돌릴 수 있어 면제 ${REVERSIBLE.size}개) / 프런트 호출 ${callSites}곳`,
);

const unexpected = unguarded.filter(
	(hit) => !ACKNOWLEDGED.has(`${hit.file}:${hit.command}`),
);
const stale = [...ACKNOWLEDGED.keys()].filter(
	(key) => !unguarded.some((hit) => `${hit.file}:${hit.command}` === key),
);

if (unexpected.length > 0) {
	console.error(
		`\n되돌릴 수 없는 동작 ${unexpected.length}곳에 확인도 되돌리기도 없다:`,
	);
	for (const hit of unexpected) {
		console.error(
			`  ${hit.file}:${hit.line} — ${hit.command}` +
				(hit.wrapper ? ` (감싼 함수 ${hit.wrapper})` : " (감싼 함수를 못 읽음)"),
		);
	}
	console.error(
		"\n확인을 걸거나(confirm/ConfirmDialog), 되돌릴 수 있게 만들어라(undo/trash).",
	);
	console.error(
		"되돌릴 수 있는 동작이면 REVERSIBLE 에, 검사기가 못 보는 것뿐이면 ACKNOWLEDGED 에 이유와 함께 적어라.",
	);
	process.exit(1);
}

if (stale.length > 0) {
	console.error("\n확인을 확인하지 못한다고 적어 둔 자리가 이제 걸리지 않는다:");
	for (const key of stale) console.error(`  ${key}`);
	console.error("\nACKNOWLEDGED 에서 지워라 — 남겨 두면 다음 결함을 덮는다.");
	process.exit(1);
}

if (unguarded.length > 0) {
	console.log(`  검사기가 확인을 확인하지 못하는 자리 ${unguarded.length} (사람이 확인해 적어 둠):`);
	for (const hit of unguarded) console.log(`    ${hit.file}:${hit.line} — ${hit.command}`);
}
console.log("  ✓ 확인 없는 파괴적 동작 없음");
