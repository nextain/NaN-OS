/**
 * 앱에서 렌더되지 않는 화면을 검사하는 테스트를 잡는다.
 *
 * 왜 필요한가: 화면이 사라져도 그것을 검사하던 스펙은 남는다. 그 스펙은
 * 사라진 요소를 기다리다 시간을 다 쓰고 실패하는데, 그 실패는 "회귀가
 * 생겼다" 로 읽힌다. 실제로는 재는 대상이 없어진 것이다. 둘을 구별하지
 * 못하면 배포 판단이 흐려지고, 붉은 것이 상수가 되어 사람이 게이트를 끈다.
 *
 * 이 저장소에서 실제로 세 번 있었다.
 *   - 음성 깨우기 화면이 삭제됐는데(코드에 "UI + handlers deleted" 라고
 *     적혀 있다) 스펙 둘이 남아 그 화면을 기다렸다
 *   - Agents 탭이 옮겨 갔는데 스펙 넷이 옛 자리를 순서로 집고 있었다
 *   - 그 옮겨 간 자리(NaiaMetaArea)마저 앱 어디에서도 렌더되지 않는 죽은
 *     컴포넌트였다
 *
 * 무엇을 재는가: 스펙이 `data-testid` / `data-*-tab` 으로 집는 이름이 셸
 * 소스 어딘가에 실제로 있는지. 없으면 그 스펙은 없는 것을 기다린다.
 *
 * 무엇을 재지 않는가: 요소가 있어도 그 화면에 도달할 수 있는지는 정적으로
 * 알 수 없다. 렌더되지 않는 컴포넌트 안의 요소는 여기서 살아 있는 것으로
 * 보인다 — 그것은 실행이 잡는다.
 *
 * **없어야 한다고 단정하는 자리는 세지 않는다.** `toHaveCount(0)` 처럼 그
 * 요소가 사라졌음을 확인하는 테스트가 있고, 그런 자리는 소스에 이름이 없는
 * 것이 정상이다. 그것까지 결함으로 세면 게이트가 옳은 테스트를 지우라고
 * 말하게 된다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHELL = "packages/shell";

/** 스펙이 요소를 집는 방식 중 소스와 대조할 수 있는 것. */
/**
 * 스펙이 요소를 집는 방식.
 *
 * 처음에는 대괄호 셀렉터만 봤다. 그래서 같은 결함을 `getByTestId("...")` 나
 * `querySelector(".voice-wake-panel")` 로 적으면 세지도 않았다. 실제 스펙에서
 * 쓰는 형태를 세어 보면 `querySelector` 가 가장 많다.
 */
const ANCHORS = [
	/\[data-testid=["']([\w-]+)["']\]/g,
	/\[data-([\w-]+)-tab=["']([\w-]+)["']\]/g,
	/(?:getByTestId|findByTestId)\(\s*["'`]([\w-]+)["'`]/g,
];

/**
 * 소스에 없어도 두는 이름. 왜 없어도 되는지 적어야 한다.
 */
const ALLOWED_ABSENT = new Map();

function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

const sourceText = [
	...tracked(`${SHELL}/src`, ".tsx"),
	...tracked(`${SHELL}/src`, ".ts"),
]
	.filter((f) => !/\.test\.|__tests__/.test(f))
	.map((f) => readFileSync(f, "utf8"))
	.join("\n");

/**
 * 이름을 만들어 붙이는 자리만 모은다.
 *
 * `data-testid={...}`, `id={...}`, `getByTestId(...)` 처럼 식별자를 정하는
 * 문맥이다. 소스 전체에서 찾으면 관계없는 문자열이 접두사를 가로챈다.
 */
const identifierContexts = [
	...sourceText.matchAll(
		/(?:data-testid|id|htmlFor|data-[\w-]+)\s*=\s*\{([^}]*\{[^}]*\}[^}]*|[^}]*)\}/g,
	),
]
	.map((match) => match[0])
	.concat(
		[...sourceText.matchAll(/(?:getByTestId|findByTestId)\s*\(([^)]*)\)/g)].map(
			(match) => match[0],
		),
	);

/** Rust 가 프런트에 내주는 명령 이름 전부. */
function tauriCommandNames() {
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

/**
 * 지금 없는 채로 두는 명령. 왜 없는지 적어야 한다.
 *
 * 둘 다 스펙만 남고 구현이 없는 자리다. 지우거나 만들거나 둘 중 하나인데,
 * 그 판단은 그 기능을 아는 사람이 해야 한다.
 */
const KNOWN_MISSING_COMMANDS = new Map([
	[
		"e2e_emit_bgm_play_request",
		"93-radio-bgm-observation 이 부른다. e2e 전용 명령으로 만들려다 만 것으로 보인다",
	],
	["discord_api", "70-channel-sync-dm 이 부른다. 이름이 바뀌었을 수 있다"],
]);

const specs = [
	...tracked(`${SHELL}/e2e-tauri`, ".ts"),
	...tracked(`${SHELL}/e2e`, ".ts"),
];

const missing = [];
const usedAllowances = new Set();
let anchors = 0;

for (const file of specs) {
	const source = readFileSync(file, "utf8");
	const names = new Map();
	for (const match of source.matchAll(ANCHORS[0]))
		names.set(match[1], match.index);
	for (const match of source.matchAll(ANCHORS[1]))
		names.set(`data-${match[1]}-tab="${match[2]}"`, match.index);
	for (const match of source.matchAll(ANCHORS[2])) names.set(match[1], match.index);

	for (const [name, at] of names) {
		anchors += 1;
		if (ALLOWED_ABSENT.has(name)) {
			usedAllowances.add(name);
			continue;
		}
		// 이 자리가 "없어야 한다" 를 확인하는 단정인가. 그렇다면 소스에
		// 이름이 없는 것이 정상이다.
		const around = source.slice(at, at + 220);
		if (/toHaveCount\(\s*0\s*\)|\.not\.|toBeNull\(\)|not toContain/.test(around))
			continue;
		if (name.startsWith("data-")) {
			// `data-meta-tab="agents"` 처럼 값까지 집는 것. 값이 코드에서
			// 만들어지는 경우가 있어(`data-meta-tab={tab.id}`) 문자열로는
			// 못 만난다. 속성 이름이 소스에 있으면 살아 있는 것으로 본다.
			const attribute = /^(data-[\w-]+)=/.exec(name)?.[1] ?? name;
			if (sourceText.includes(name)) continue;
			if (sourceText.includes(`${attribute}={`)) continue;
			missing.push({ file, name });
			continue;
		}
		if (sourceText.includes(`data-testid="${name}"`)) continue;
		// 문자열이 조립될 수도 있으니 이름만으로도 한 번 더 본다.
		if (sourceText.includes(`"${name}"`)) continue;
		if (sourceText.includes(`\`${name}\``)) continue;
		// 이름이 코드에서 만들어지는 경우가 흔하다
		// (`data-testid={\`${role}-llm-mode\`}`). 앞이나 뒤가 잘린 꼴로도
		// 찾아본다 — 그러지 않으면 멀쩡한 자리를 사라졌다고 보고한다.
		// `data-testid={\`${role}-llm-mode\`}` 처럼 앞이나 뒤가 코드로 채워지는
		// 자리를 찾는다. 자를 때 하이픈을 남겨야 실제 소스와 만난다 —
		// 빠뜨리면 멀쩡한 자리를 사라졌다고 보고한다.
		const cuts = [];
		for (let i = 0; i < name.length; i += 1) {
			if (name[i] !== "-") continue;
			// 자를 때 하이픈을 양쪽에 남긴다. 소스는 `slot-${sid}` 와
			// `${role}-llm-mode` 두 꼴이 모두 있어서, 한쪽만 남기면 다른
			// 꼴을 놓친다.
			cuts.push({ head: name.slice(0, i + 1), tail: name.slice(i) });
		}
		// 조립된 이름을 찾되 **식별자 문맥 안에서만** 본다. 그러지 않으면
		// 관계없는 문자열이 접두사를 가로챈다 — 실제로 세션 아이디를 만드는
		// `` `voice-${seq}` `` 하나 때문에 `voice-` 로 시작하는 모든 이름이
		// 영원히 살아 있는 것으로 판정됐고, 삭제된 음성 화면을 기다리는 스펙을
		// 되살려도 게이트가 잡지 못했다.
		const assembled = cuts.some(({ head, tail }) => {
			if (tail.length > 3 && identifierContexts.some((ctx) => ctx.includes(`}${tail}\``)))
				return true;
			if (head.length > 3 && identifierContexts.some((ctx) => ctx.includes(`\`${head}${"${"}`)))
				return true;
			return false;
		});
		if (assembled) continue;
		missing.push({ file, name });
	}
}

/**
 * 스펙이 부르는 Tauri 명령이 실제로 있는지 본다.
 *
 * 사라진 화면과 같은 성격이다 — 명령이 없어지거나 이름이 바뀌어도 그것을
 * 부르는 스펙은 남고, 그 실패는 "회귀가 생겼다" 로 읽힌다. 실제로 두 스펙이
 * 존재하지 않는 명령을 부르고 있었고, 그중 하나는 e2e 전용으로 만들려다
 * 만 것이 스펙에만 남은 자리다.
 */
const commandNames = tauriCommandNames();
const missingCommands = [];
for (const file of specs) {
	const source = readFileSync(file, "utf8");
	for (const match of source.matchAll(
		/(?:tauriInvoke|invoke)\(\s*["'`]([a-z0-9_]+)["'`]/g,
	)) {
		const name = match[1];
		if (name.startsWith("plugin:") || commandNames.has(name)) continue;
		missingCommands.push({
			file,
			name,
			line: source.slice(0, match.index).split("\n").length,
		});
	}
}

// 같은 명령을 여러 번 불러도 결함은 하나다. 이름으로 센다.
const unexpectedCommands = missingCommands.filter(
	(hit) => !KNOWN_MISSING_COMMANDS.has(hit.name),
);
const staleKnown = [...KNOWN_MISSING_COMMANDS.keys()].filter(
	(name) => !missingCommands.some((hit) => hit.name === name),
);

if (staleKnown.length > 0) {
	console.error("\n없다고 적어 둔 명령이 이제 걸리지 않는다:");
	for (const name of staleKnown) console.error(`  ${name}`);
	console.error("\nKNOWN_MISSING_COMMANDS 에서 지워라 — 남겨 두면 다음 결함을 덮는다.");
	process.exit(1);
}

if (unexpectedCommands.length > 0) {
	console.error("\n스펙이 부르는데 Rust 에 없는 명령:");
	for (const hit of unexpectedCommands) {
		console.error(`  ${hit.file}:${hit.line} — ${hit.name}`);
	}
	console.error(
		"\n명령이 사라졌으면 그 스펙도 지워라. 이름이 바뀐 것이면 스펙을 따라오게 하라.",
	);
	process.exit(1);
}

console.log(
	`[dead-ui] 스펙이 집는 이름 ${anchors}개 / 셸 소스에 없는 것 ${missing.length}`,
);

// 걸리지도 않는 면제는 알리바이다. 남겨 두면 다음 결함이 그 이름으로 들어와
// 조용히 지나간다 — 실제로 `voice-wake-triggers` 면제가 그러고 있었다.
const staleAllowances = [...ALLOWED_ABSENT.keys()].filter(
	(name) => !usedAllowances.has(name),
);
if (staleAllowances.length > 0) {
	console.error("\n걸리지 않는 면제가 남아 있다:");
	for (const name of staleAllowances) console.error(`  ${name}`);
	console.error("\nALLOWED_ABSENT 에서 지워라 — 남겨 두면 다음 결함을 덮는다.");
	process.exit(1);
}

if (missing.length > 0) {
	console.error("\n스펙이 집는데 셸 소스에 없는 이름:");
	for (const hit of missing) console.error(`  ${hit.file} — ${hit.name}`);
	console.error(
		"\n화면이 사라졌으면 그 스펙도 지워라. 이름이 바뀐 것이면 스펙을 따라오게 하라.",
	);
	console.error(
		"없는 채로 두어야 할 이유가 있으면 ALLOWED_ABSENT 에 그 이유와 함께 적어라.",
	);
	process.exit(1);
}

console.log("  ✓ 사라진 화면을 기다리는 스펙 없음");
