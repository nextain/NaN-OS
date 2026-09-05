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
const ANCHORS = [
	/\[data-testid=["']([\w-]+)["']\]/g,
	/\[data-([\w-]+)-tab=["']([\w-]+)["']\]/g,
];

/**
 * 소스에 없어도 두는 이름. 왜 없어도 되는지 적어야 한다.
 */
const ALLOWED_ABSENT = new Map([
	[
		"voice-wake-triggers",
		"삭제된 화면. 이 이름을 쓰는 스펙도 함께 지웠으므로 이 목록은 곧 비어야 한다",
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

const sourceText = [
	...tracked(`${SHELL}/src`, ".tsx"),
	...tracked(`${SHELL}/src`, ".ts"),
]
	.filter((f) => !/\.test\.|__tests__/.test(f))
	.map((f) => readFileSync(f, "utf8"))
	.join("\n");

const specs = [
	...tracked(`${SHELL}/e2e-tauri`, ".ts"),
	...tracked(`${SHELL}/e2e`, ".ts"),
];

const missing = [];
let anchors = 0;

for (const file of specs) {
	const source = readFileSync(file, "utf8");
	const names = new Map();
	for (const match of source.matchAll(ANCHORS[0]))
		names.set(match[1], match.index);
	for (const match of source.matchAll(ANCHORS[1]))
		names.set(`data-${match[1]}-tab="${match[2]}"`, match.index);

	for (const [name, at] of names) {
		anchors += 1;
		if (ALLOWED_ABSENT.has(name)) continue;
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
		const assembled = cuts.some(
			({ head, tail }) =>
				(tail.length > 3 && sourceText.includes(`}${tail}\``)) ||
				(head.length > 3 && sourceText.includes(`\`${head}${"${"}`)),
		);
		if (assembled) continue;
		missing.push({ file, name });
	}
}

console.log(
	`[dead-ui] 스펙이 집는 이름 ${anchors}개 / 셸 소스에 없는 것 ${missing.length}`,
);

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
