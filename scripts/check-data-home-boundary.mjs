#!/usr/bin/env node
/**
 * 데이터 홈(`~/.naia`)에는 `adk-path` 하나만 둔다.
 *
 * 나머지는 모두 그 파일이 가리키는 ADK 아래에 있어야 하고, 그 위치는
 * `adk-path` 에서 파생돼야 한다. 코드가 홈을 직접 짚으면 ADK 를 옮겼을 때
 * 데이터가 따라가지 못한다 — 실측에서 홈에 17GB 가 쌓여 있었고, 그 대부분이
 * 음성 런타임이었다(docs/storage-locations.md).
 *
 * 이 검사는 옮기는 일을 대신하지 않는다. **새로 늘어나는 것을 막는다.**
 * 옮기는 동안에도 새 자리가 생기면 목록이 끝없이 길어진다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHELL = "packages/shell";

/**
 * 오늘 데이터 홈 아래를 짚는 자리. 옮기고 나면 그 항목을 지운다.
 * 자리는 만드는 이름으로 적는다 — 줄 번호로 적으면 위에 한 줄만 넣어도
 * 어긋나고, 그때마다 목록을 고치게 되어 아무도 읽지 않게 된다.
 */
const KNOWN = new Map([
	["logs", "셸 로그. ADK 아래로 옮겨야 한다"],
	["run", "실행 중 리스와 PID. ADK 아래로 옮겨야 한다"],
	["skills", "설치된 스킬. ADK 아래로 옮겨야 한다"],
	[
		"voxcpm2-runtime",
		"로컬 음성 런타임 17GB. 이 기계의 음성 서비스가 지금 쓰고 있어 옮기려면 사람이 중단 창을 잡아야 한다",
	],
	["apps", "설치된 앱. app.rs 가 홈 아래를 짚는다. ADK 아래로 옮겨야 한다"],
	["agent-child-lease.json", "에이전트 자식 리스. ADK 아래로 옮겨야 한다"],
	["agent-child-lease.lock", "위 리스의 잠금 파일"],
	["panels", "패널 앱 저장 자리. ADK 아래로 옮겨야 한다"],
	[
		"chrome-profile",
		"내장 브라우저 프로필. 사용자의 로그인 상태가 들어 있어 옮기면 다시 로그인해야 한다 — 옮길 때 그 사실을 알려야 한다",
	],
	["login-profile", "로그인 전용 브라우저 프로필. 위와 같다"],
	[
		".naia",
		"`home.join(\".naia\")` 로 홈을 직접 짚는 자리. 데이터 홈 함수를 거치지 않아 NAIA_HOME 도 무시한다 — 격리된 개발 인스턴스에서 운영 데이터를 건드릴 수 있다",
	],
	[
		"deep-link-pending.txt",
		"macOS·윈도우의 딥링크 대기 파일. 앱이 뜨기 전에 쓰이므로 ADK 위치를 아직 모를 수 있다 — 옮길 때 그 순서를 함께 풀어야 한다",
	],
	["dev-deeplink", "macOS 개발 인스턴스의 딥링크 자리. 위와 같다"],
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

const found = new Map();
for (const file of tracked(`${SHELL}/src-tauri/src`, ".rs")) {
	const source = readFileSync(file, "utf8");
	// 데이터 홈을 돌려주는 함수 뒤에 붙는 `.join("...")` 만 본다. 홈과 무관한
	// join 까지 세면 관계없는 자리가 쏟아진다.
	for (const m of source.matchAll(
		/naia_data_home[\w]*\([^)]*\)[\s\S]{0,200}?\.join\("([^"]+)"\)/g,
	)) {
		if (!found.has(m[1])) found.set(m[1], new Set());
		found.get(m[1]).add(file);
	}
	// 홈 아래를 문자로 짚는 자리(`home.join(".naia").join("apps")`)도 같다.
	for (const m of source.matchAll(
		/\.join\("\.naia"\)[\s\S]{0,80}?\.join\("([^"]+)"\)/g,
	)) {
		if (!found.has(m[1])) found.set(m[1], new Set());
		found.get(m[1]).add(file);
	}
}

const names = [...found.keys()].filter((n) => n !== "adk-path");
const unexpected = names.filter((n) => !KNOWN.has(n));
const stale = [...KNOWN.keys()].filter((n) => !names.includes(n));

console.log(
	`[data-home] 데이터 홈 아래를 짚는 이름 ${names.length}개 (사유 적어 둔 것 ${KNOWN.size})`,
);

if (unexpected.length) {
	console.error(
		`  ❌ 데이터 홈에 새 자리가 생겼다(${unexpected.length}) — 거기에는 adk-path 하나만 둔다:`,
	);
	for (const n of unexpected) {
		console.error(`     ${n} (${[...found.get(n)].join(", ")})`);
	}
	console.error(
		"     ADK 아래로 두고, 그 위치를 adk-path 에서 파생하라. docs/storage-locations.md 를 보라.",
	);
	process.exit(1);
}

if (stale.length) {
	console.error(
		`  ❌ 옮겼는데 목록에 남아 있다(${stale.length}) — 지워라. 남겨 두면 다음 자리를 덮는다:`,
	);
	for (const n of stale) console.error(`     ${n}`);
	process.exit(1);
}

console.log("  ✓ 새로 생긴 자리 없음");
