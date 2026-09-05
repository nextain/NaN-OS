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
 *
 * ## 어디서 재는가 (10회차 지적 6 이후)
 *
 * 예전에는 `naia_data_home*(…)` 뒤 200자 안의 `.join("리터럴")` 을 찾았다.
 * 그 창은 `dir.push("...")`, 이름을 담은 상수, 200자 넘는 패딩 세 가지로
 * 각각 뚫렸다. 형태를 하나씩 더 열거하는 대신 **측정 지점을 옮겼다.**
 *
 * 이제 데이터 홈 아래 경로를 만드는 코드는 `src-tauri/src/data_home.rs`
 * 한 파일에만 있다. 그 파일 밖에서는
 *
 *   - 데이터 홈을 돌려주는 함수(`naia_data_home*`)를 부를 수도 없고,
 *   - 사용자 홈을 직접 구할 수도 없으며(`home_dir`, `HOME`/`USERPROFILE`),
 *   - `.naia` 라는 경로 마디를 문자열로 적을 수도 없다.
 *
 * 그래서 `push` 든 상수든 패딩이든, 자리를 만들려면 **모듈 밖에서 홈을
 * 짚어야** 하고 그 사실 자체가 잡힌다. 자리를 정말 하나 늘리려면
 * `DataHomeChild` 에 변형을 더해야 하고, 그러면 이름표가 늘어나 아래 `KNOWN`
 * 과 `docs/storage-locations.md` 의 표와 어긋나 붉어진다.
 *
 * 판정은 정규식이 아니라 **Rust 토크나이저**가 한다. 주석과 문자열을 갈라
 * 내고, 식별자는 코드 쪽에서, 경로 마디는 문자열 쪽에서만 본다. 형태를 세는
 * 자리가 없으니 형태를 하나 더 만들어도 빠져나갈 곳이 없다.
 *
 * ## 이름표도 토큰에서 읽는다 (12회차 지적 8 이후)
 *
 * 경로 조립만 토크나이저로 옮기고 이름표 목록은 `=> "리터럴"` 정규식으로 남겨
 * 두었더니, 갈래 본문을 중괄호로 감싸기만 해도(`Self::GhostCache => { "…" }`)
 * 이름표가 늘지 않았다 — 변형을 하나 더한 사실이 검사기 눈 밖으로 사라졌다.
 * 이제 갈래도 토큰으로 읽고, `=>` 뒤가 문자열 리터럴이 아니면 통과가 아니라
 * **실패**다. 더해서 `ALL_CHILDREN` 의 변형 수, `name()` 의 갈래 수,
 * `docs/storage-locations.md` 표의 행 수가 셋 다 같은지 센다. 자리 하나를
 * 늘리면서 셋 중 하나만 늘리는 것도 그 자리에서 걸린다.
 *
 * ## 이 검사가 보증하지 않는 것 (경계를 여기서 끊는다)
 *
 * 보증 범위는 "`~/.naia` **바로 아래** 새 자리가 이름표 없이 생기지 않는다"
 * 하나다. 아래 셋은 보지 않는다 — 무한히 단단해지지 않도록 여기서 끊는다.
 *
 *   1. 이미 알려진 자리 **안쪽**(`logs/` 밑의 파일 이름, `apps/<앱 id>/…`)은
 *      그 자리를 가진 모듈의 책임이다.
 *   2. 문자를 조립해 `.naia` 를 만드는 코드(`format!(".{}", "naia")`)는 우회가
 *      아니라 위조다. 리뷰가 볼 몫이다.
 *   3. 모듈이 돌려준 경로를 위로 거슬러(`parent`·`pop`) 형제 자리를 만드는 것.
 *      데이터 홈 디렉터리 자체를 돌려주는 함수는 모듈 밖에 없으므로(비공개)
 *      그러려면 눈에 띄는 경로 산술을 적어야 한다.
 *   4. Rust 밖(TypeScript·스크립트·wdio 설정)에서 홈을 짚는 것. e2e 실행 자리
 *      격리는 `src/test/e2e-runtime-isolation.contract.test.ts` 가 따로 든다.
 *
 * ## 공개 API 를 왜 세는가 (11회차 지적 1 이후)
 *
 * 위 세 규칙은 **금지 목록**이다. 그런데 깔때기가 홈 조회(`user_home_path`)와
 * 데이터 홈 이름(`DATA_HOME_DIR_NAME`)을 함께 공개해 두면, 금지된 글자를 하나도
 * 쓰지 않고 재료만 이어 붙여 이름표 없는 자리를 만들 수 있다. 실제로 11회차
 * 리뷰가 `user_home_path()?.join(DATA_HOME_DIR_NAME).join("ghost-cache")` 로
 * 그렇게 뚫었다 — 금지 식별자도, `.naia` 문자열도 없다.
 *
 * 그래서 이름을 하나 더 금지하는 대신 **재료를 없앴다.** 데이터 홈 이름과
 * 데이터 홈 뿌리를 돌려주는 함수는 이제 모듈 안에서만 보인다(`data_home.rs`).
 * 그 조립은 컴파일되지 않는다.
 *
 * 컴파일러가 막는 것은 오늘의 코드뿐이라, 다음 사람이 `pub` 을 다시 붙이면
 * 조용히 열린다. 그래서 이 검사는 깔때기의 `pub` 항목을 아래 [`PUBLIC_API`]
 * 허용 목록과 대조한다. 목록에 없는 `pub` 이 생기면 붉어지고, 목록에 있는데
 * `pub` 이 아니면(옮겼거나 지웠으면) 낡은 항목으로 붉어진다. 모듈 밖에서
 * `data_home::` 로 짚는 이름도 같은 목록과 대조한다.
 *
 * 항목마다 **어느 파일이 쓸 수 있는지**도 함께 적는다. 홈 그 자체를 돌려주는
 * 넷은 데이터 홈이 아닌 자리(`~/dev`, `~/.agent-browser`, 경로 가드의 홈)를
 * 위해 열려 있는데, 그 목록이 없으면 아무 파일이나 홈을 손에 쥐게 된다.
 * 파일 단위라는 것이 이 목록의 한계다 — 이미 적힌 파일 **안에서** 홈을 한 번
 * 더 쓰는 것은 세지 않는다. 보증은 위의 "`.naia` 라는 이름이 깔때기 밖에
 * 없다" 쪽이 지고, 이 목록은 그 위에 얹는 재고 조사다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { skipBalanced, splitCodeAndStrings, tokenizeRust } from "./lib/rust-tokens.mjs";

const SHELL = "packages/shell";
const RUST_ROOT = `${SHELL}/src-tauri/src`;
/** 데이터 홈 아래 자리를 만드는 유일한 파일. 이 파일만 아래 규칙에서 면제된다. */
const FUNNEL = `${RUST_ROOT}/data_home.rs`;

/**
 * 오늘 데이터 홈 아래를 짚는 자리. 옮기고 나면 그 항목을 지운다.
 * 이름은 `data_home.rs` 의 `DataHomeChild::name()` 대응표와 정확히 같아야 한다.
 */
const KNOWN = new Map([
	["adk-path", "어느 ADK 를 볼지 가리키는 부트스트랩 포인터. 여기 남는 유일한 것"],
	["logs", "셸 로그. ADK 아래로 옮겨야 한다"],
	["run", "실행 중 PID 파일. ADK 아래로 옮겨야 한다"],
	["skills", "설치된 스킬. ADK 아래로 옮겨야 한다"],
	[
		"voxcpm2-runtime",
		"로컬 음성 런타임 17GB. 이 기계의 음성 서비스가 지금 쓰고 있어 옮기려면 사람이 중단 창을 잡아야 한다",
	],
	["apps", "설치된 앱. ADK 아래로 옮겨야 한다"],
	["panels", "#472 이전의 앱 자리. ADK 아래로 옮겨야 한다"],
	["agent-child-lease.json", "에이전트 자식 리스. ADK 아래로 옮겨야 한다"],
	["agent-child-lease.lock", "위 리스의 잠금 파일"],
	[
		"chrome-profile",
		"내장 브라우저 프로필. 사용자의 로그인 상태가 들어 있어 옮기면 다시 로그인해야 한다 — 옮길 때 그 사실을 알려야 한다",
	],
	["login-profile", "로그인 전용 브라우저 프로필. 위와 같다"],
	[
		"deep-link-pending.txt",
		"macOS·윈도우의 딥링크 대기 파일. 앱이 뜨기 전에 쓰이므로 ADK 위치를 아직 모를 수 있다 — 옮길 때 그 순서를 함께 풀어야 한다",
	],
	["dev-deeplink", "macOS 개발 인스턴스의 딥링크 자리. 위와 같다"],
	[
		"workspace",
		"게이트웨이 기본 설정이 적는 에이전트 워크스페이스. 경로가 아니라 `~/.naia/workspace` 문자열로 설정에 실려 나가 다른 프로세스가 푼다 — 옛 200자 창 검사가 못 보던 자리다",
	],
]);

/** 모듈 밖에서 부르면 데이터 홈을 다시 만들 수 있는 이름들. */
const BANNED_IDENTIFIERS = [
	// 데이터 홈을 돌려주는 함수
	/\bnaia_data_home\w*\b/,
	// 사용자 홈을 돌려주는 함수 (`dirs::home_dir`, `crate::home_dir`)
	/\bhome_dir\b/,
];

/** 모듈 밖에서 읽으면 홈을 다시 구할 수 있는 환경 변수 이름. */
const BANNED_LITERALS = new Set(["HOME", "USERPROFILE", "NAIA_HOME"]);

/** 문자열 안에서 `.naia` 가 경로 **마디**로 나오는가. */
const DATA_HOME_SEGMENT = /(^|[/\\])\.naia($|[/\\])/;

const RUST_FILE = (name) => `${RUST_ROOT}/${name}`;

/**
 * 깔때기가 밖에 내주는 것 전부. `why` 는 왜 밖에 있어야 하는지, `files` 는 그
 * 항목을 쓸 수 있는 파일이다(없으면 어디서든 쓸 수 있다).
 *
 * 여기 없는 `pub` 이 깔때기에 생기면 붉어진다. 목록에 있는데 `pub` 이 아니면
 * 낡은 항목으로 붉어진다. 모듈 밖에서 `data_home::` 로 짚는 이름도 이 목록과
 * 대조한다.
 *
 * **여기에 없는 것**이 이 경계의 핵심이다 — `DATA_HOME_DIR_NAME`(`.naia`),
 * `root_of`, `direct_root_of`, `naia_data_home_*`. 데이터 홈 뿌리를 손에 쥐면
 * 이름표 없이 그 아래 무엇이든 만들 수 있다.
 */
const PUBLIC_API = new Map([
	["DataHomeChild", { why: "자리 이름표. 자리를 늘리려면 여기에 변형을 더해야 한다" }],
	["DataHomeChild::name", { why: "이름표 하나의 문자열. 검사기·문서와 맞추는 단일 출처다" }],
	["ALL_CHILDREN", { why: "이름표 전체 목록. 검사기와 테스트가 센다" }],
	["child_of", { why: "주어진 홈 기준 자리. 이름표를 받아야만 부를 수 있다" }],
	["child", { why: "환경에서 읽은 홈 기준 자리" }],
	["child_from_dirs_home", { why: "`dirs` 홈 기준 자리. 밖에서 홈을 쥐지 않게 조립까지 여기서 한다" }],
	["read_child_from_dirs_home", { why: "adk-path 부트스트랩 포인터처럼 자리의 내용을 읽는 곳" }],
	["direct_child_of", { why: "NAIA_HOME 을 무시하는 옛 자리. 이관 전까지 남는다" }],
	["direct_child", { why: "위와 같다. 환경에서 읽은 홈 기준" }],
	["tilde_child", { why: "설정에 문자열로 실려 나가는 `~/.naia/<자리>`" }],
	[
		"deep_link_helper_script_paths",
		{
			why: "홈을 스스로 구하는 AppleScript 에 넘길 홈 기준 상대 경로 두 조각. 이 한 자리에만 쓴다",
			files: [RUST_FILE("platform/macos.rs")],
		},
	],
	[
		"windows_deep_link_pending",
		{
			why: "앱이 뜨기 전에 쓰는 딥링크 대기 파일. 홈을 못 찾을 때의 예외까지 깔때기가 갖는다",
			files: [RUST_FILE("platform/windows.rs"), `${RUST_ROOT}/main.rs`],
		},
	],
	// --- 홈 그 자체. 데이터 홈이 **아닌** 자리를 짚으려고 열려 있다.
	[
		"user_home",
		{
			why: "`HOME`/`USERPROFILE` 홈. 경로 가드의 허용 뿌리와 `~/.agent-browser`·nvm 탐색이 쓴다",
			files: [
				RUST_FILE("app.rs"),
				RUST_FILE("browser.rs"),
				RUST_FILE("lib.rs"),
				RUST_FILE("platform/macos.rs"),
			],
		},
	],
	[
		"user_home_path",
		{
			why: "`dirs` 홈. `~/dev`·`~/naia-omni`·`~/.cache/huggingface` 와 `~` 풀이가 쓴다",
			files: [
				RUST_FILE("workspace.rs"),
				RUST_FILE("herdr/location.rs"),
				RUST_FILE("lib.rs"),
			],
		},
	],
	[
		"unix_home",
		{
			why: "유닉스 전용 홈. `~/dev`·LaunchAgents·Chrome for Testing 탐색이 쓴다",
			files: [
				RUST_FILE("workspace.rs"),
				RUST_FILE("agent_grpc.rs"),
				RUST_FILE("platform/macos.rs"),
				RUST_FILE("platform/linux.rs"),
			],
		},
	],
	[
		"windows_home",
		{
			why: "윈도우 전용 홈. `~/dev` 와 Chrome for Testing 탐색이 쓴다",
			files: [RUST_FILE("workspace.rs"), RUST_FILE("platform/windows.rs")],
		},
	],
]);

/** 항목 이름 앞에 올 수 있는, 이름이 아닌 낱말. */
const ITEM_MODIFIERS = new Set(["async", "unsafe", "extern", "default"]);
/** 이름을 뒤에 두는 항목 낱말. */
const ITEM_KEYWORDS = new Set([
	"fn",
	"enum",
	"struct",
	"const",
	"static",
	"type",
	"mod",
	"trait",
	"union",
]);

/**
 * 깔때기가 밖에 내주는 항목 이름 전부를 토큰에서 읽는다.
 *
 * `impl` 안의 것은 `타입::이름` 으로 적는다. `pub(crate)` 도 같은 크레이트의
 * 다른 모듈에서 보이므로 공개로 센다.
 */
function publicItems(source) {
	const tokens = tokenizeRust(source);
	const items = [];
	let depth = 0;
	let implType = null;
	let implDepth = -1;

	for (let i = 0; i < tokens.length; i += 1) {
		const t = tokens[i];
		if (t.kind === "punct" && t.text === "{") {
			depth += 1;
			continue;
		}
		if (t.kind === "punct" && t.text === "}") {
			depth -= 1;
			if (implType !== null && depth <= implDepth) implType = null;
			continue;
		}
		if (t.kind !== "ident") continue;
		if (t.text === "impl" && implType === null) {
			let j = i + 1;
			let last = null;
			while (j < tokens.length && !(tokens[j].kind === "punct" && tokens[j].text === "{")) {
				if (tokens[j].kind === "ident") last = tokens[j].text;
				j += 1;
			}
			implType = last;
			implDepth = depth;
			continue;
		}
		if (t.text !== "pub") continue;

		let j = i + 1;
		if (tokens[j]?.kind === "punct" && tokens[j].text === "(")
			j = skipBalanced(tokens, j, "(", ")");
		let kind = null;
		let name = null;
		for (let guard = 0; guard < 8; guard += 1) {
			const tk = tokens[j];
			if (!tk || tk.kind !== "ident") break;
			// `const fn` 의 `const` 는 항목 낱말이 아니라 수식어다.
			if (tk.text === "const" && tokens[j + 1]?.text === "fn") {
				j += 1;
				continue;
			}
			if (ITEM_MODIFIERS.has(tk.text)) {
				j += 1;
				if (tk.text === "extern" && tokens[j]?.kind === "string") j += 1;
				continue;
			}
			if (ITEM_KEYWORDS.has(tk.text)) {
				kind = tk.text;
				name = tokens[j + 1]?.kind === "ident" ? tokens[j + 1].text : null;
			}
			break;
		}
		if (!kind || !name) continue;
		items.push({ name: implType ? `${implType}::${name}` : name, kind, line: t.line });
	}
	return items;
}

/**
 * 모듈 밖에서 `data_home::` 로 짚은 이름. `use` 의 중괄호 묶음도 푼다.
 *
 * `self` 는 모듈 자신이라 이름이 아니고, `as` 뒤의 별명도 이름이 아니다.
 */
function dataHomeReferences(tokens) {
	const found = [];
	for (let i = 0; i < tokens.length; i += 1) {
		const t = tokens[i];
		if (t.kind !== "ident" || t.text !== "data_home") continue;
		if (!(tokens[i + 1]?.text === ":" && tokens[i + 2]?.text === ":")) continue;
		const head = tokens[i + 3];
		if (!head) continue;
		if (head.kind === "punct" && head.text === "{") {
			const stop = skipBalanced(tokens, i + 3, "{", "}");
			for (let j = i + 4; j < stop - 1; j += 1) {
				if (tokens[j].kind !== "ident") continue;
				if (tokens[j].text === "self") continue;
				if (tokens[j].text === "as") {
					j += 1;
					continue;
				}
				// 중첩 경로(`a::b`)의 첫 마디만 항목이다.
				found.push({ name: tokens[j].text, line: tokens[j].line });
				while (tokens[j + 1]?.text === ":" && tokens[j + 2]?.text === ":") j += 3;
			}
			i = stop - 1;
			continue;
		}
		if (head.kind === "ident" && head.text !== "self") {
			found.push({ name: head.text, line: head.line });
		}
	}
	return found;
}


function tracked(dir, extension) {
	try {
		return execFileSync("git", ["ls-files", "--", dir], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f.endsWith(extension));
	} catch {
		return [];
	}
}

/** 코드 텍스트에서 금지 식별자가 나오는 줄을 찾는다. */
function findIdentifierHits(code) {
	const hits = [];
	const lines = code.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		for (const pattern of BANNED_IDENTIFIERS) {
			const m = pattern.exec(lines[index]);
			if (m) hits.push({ line: index + 1, name: m[0] });
		}
	}
	return hits;
}

/** `tokens[at]` 가 `Self::` 또는 `DataHomeChild::` 로 시작하는 변형 이름인가. */
function variantAt(tokens, at) {
	const head = tokens[at];
	if (!head || head.kind !== "ident") return null;
	if (head.text !== "Self" && head.text !== "DataHomeChild") return null;
	if (!(tokens[at + 1]?.text === ":" && tokens[at + 2]?.text === ":")) return null;
	const name = tokens[at + 3];
	if (!name || name.kind !== "ident") return null;
	return { variant: name.text, after: at + 4 };
}

/** `fn <이름>` 의 본문 블록 범위. 본문 없는 선언이면 `null`. */
function functionBodyRange(tokens, fnName) {
	for (let i = 0; i + 1 < tokens.length; i += 1) {
		if (tokens[i].kind !== "ident" || tokens[i].text !== "fn") continue;
		if (tokens[i + 1].kind !== "ident" || tokens[i + 1].text !== fnName) continue;
		for (let j = i + 2; j < tokens.length; j += 1) {
			const t = tokens[j];
			if (t.kind !== "punct") continue;
			if (t.text === ";") return null;
			if (t.text === "{") return { open: j, end: skipBalanced(tokens, j, "{", "}") };
		}
		return null;
	}
	return null;
}

/**
 * `data_home.rs` 의 `DataHomeChild::name()` 대응표에서 이름표를 **토큰으로** 읽는다.
 *
 * 예전에는 `DataHomeChild::\w+\s*=>\s*"([^"]+)"` 정규식이었다. 그래서 갈래 본문이
 * 중괄호이기만 하면(`Self::GhostCache => { "ghost-cache" }`) 이름표가 늘지 않았고,
 * 변형을 하나 더한 사실이 검사기 눈 밖으로 사라졌다(12회차 지적 8). 형태를 하나 더
 * 열거하는 대신 **측정 지점을 옮긴다** — 갈래 머리(`Self::` / `DataHomeChild::`)를
 * 토큰으로 찾고, `=>` 뒤에서 중괄호·괄호를 벗긴 첫 토큰을 읽는다.
 *
 * 그 자리가 문자열 리터럴이 아니면(상수 이름, `concat!`, 함수 호출) **읽지 못한 것**
 * 으로 실패한다. 모르는 것은 통과가 아니다 — 이름표를 못 읽으면 아래 대조가 전부
 * 무의미해진다.
 */
function funnelNames() {
	if (!existsSync(FUNNEL)) return null;
	const tokens = tokenizeRust(readFileSync(FUNNEL, "utf8"));
	const body = functionBodyRange(tokens, "name");
	if (!body) return null;

	let matchAt = -1;
	for (let i = body.open + 1; i < body.end; i += 1) {
		if (tokens[i].kind === "ident" && tokens[i].text === "match") {
			matchAt = i;
			break;
		}
	}
	if (matchAt === -1) return null;
	let open = -1;
	for (let i = matchAt + 1; i < body.end; i += 1) {
		if (tokens[i].kind === "punct" && tokens[i].text === "{") {
			open = i;
			break;
		}
	}
	if (open === -1) return null;
	const close = skipBalanced(tokens, open, "{", "}") - 1;

	const names = [];
	const unreadable = [];
	let i = open + 1;
	while (i < close) {
		const head = variantAt(tokens, i);
		if (!head) {
			i += 1;
			continue;
		}
		// 패턴 나머지(`|` 갈래, `if` 가드)를 지나 `=>` 를 찾는다.
		let arrow = -1;
		for (let j = head.after; j < close; j += 1) {
			if (tokens[j].kind === "punct" && tokens[j].text === "=" && tokens[j + 1]?.text === ">") {
				arrow = j;
				break;
			}
		}
		if (arrow === -1) {
			unreadable.push({ variant: head.variant, line: tokens[i].line, why: "`=>` 가 없다" });
			break;
		}

		// 갈래 본문. 중괄호·괄호를 벗기고 첫 토큰을 본다.
		let k = arrow + 2;
		while (tokens[k]?.kind === "punct" && (tokens[k].text === "{" || tokens[k].text === "(")) {
			k += 1;
		}
		const value = tokens[k];
		if (!value || value.kind !== "string") {
			unreadable.push({
				variant: head.variant,
				line: tokens[i].line,
				why: `이름표 자리가 문자열이 아니다 (${value ? value.text : "끝"})`,
			});
		} else {
			names.push(value.text);
		}

		// 다음 갈래로. 중괄호 본문은 통째로 건너뛰어, 본문 안의 `Self::` 를 갈래로 읽지 않는다.
		if (tokens[arrow + 2]?.kind === "punct" && tokens[arrow + 2].text === "{") {
			i = skipBalanced(tokens, arrow + 2, "{", "}");
		} else {
			let j = arrow + 2;
			while (j < close && !(tokens[j].kind === "punct" && tokens[j].text === ",")) j += 1;
			i = j + 1;
		}
	}
	return { names, unreadable };
}

/** `ALL_CHILDREN` 배열에 적힌 변형. 이름표 갈래 수와 맞물려야 한다. */
function allChildrenVariants() {
	if (!existsSync(FUNNEL)) return null;
	const tokens = tokenizeRust(readFileSync(FUNNEL, "utf8"));
	for (let i = 0; i < tokens.length; i += 1) {
		if (tokens[i].kind !== "ident" || tokens[i].text !== "ALL_CHILDREN") continue;
		// `=` 를 찾되 타입 자리(`: [DataHomeChild; 14]`)는 통째로 건너뛴다 — 그 안의
		// `;` 를 선언 끝으로 읽으면 초기화식을 못 만난다.
		let eq = -1;
		for (let j = i + 1; j < tokens.length; ) {
			const t = tokens[j];
			if (t.kind === "punct" && t.text === "[") {
				j = skipBalanced(tokens, j, "[", "]");
				continue;
			}
			if (t.kind === "punct" && t.text === ";") break;
			if (t.kind === "punct" && t.text === "=" && tokens[j + 1]?.text !== ">") {
				eq = j;
				break;
			}
			j += 1;
		}
		if (eq === -1) continue;
		if (!(tokens[eq + 1]?.kind === "punct" && tokens[eq + 1].text === "[")) return null;
		const open = eq + 1;
		const end = skipBalanced(tokens, open, "[", "]") - 1;
		const variants = [];
		for (let j = open + 1; j < end; j += 1) {
			const found = variantAt(tokens, j);
			if (!found) continue;
			variants.push(found.variant);
			j = found.after - 1;
		}
		return variants;
	}
	return null;
}

/** 문서의 자리 표에서 이름을 읽는다. */
function docNames() {
	const path = "docs/storage-locations.md";
	if (!existsSync(path)) return null;
	const source = readFileSync(path, "utf8");
	const section = /### 코드가 홈 아래에 만드는 자리[^\n]*\n([\s\S]*?)(?:\n### |\n## |$)/.exec(
		source,
	);
	if (!section) return null;
	const names = [];
	for (const row of section[1].split("\n")) {
		const m = /^\|\s*`([^`]+)`\s*\|/.exec(row);
		if (m) names.push(m[1]);
	}
	return names;
}

let failed = false;
function fail(message, details = []) {
	failed = true;
	console.error(`  ❌ ${message}`);
	for (const d of details) console.error(`     ${d}`);
}

// --- 1. 모듈 밖에서 홈을 짚었는가 ---------------------------------------

const escapes = [];
const files = tracked(RUST_ROOT, ".rs");
for (const file of files) {
	if (file === FUNNEL) continue;
	const { code, strings } = splitCodeAndStrings(readFileSync(file, "utf8"));
	for (const hit of findIdentifierHits(code)) {
		escapes.push(`${file}:${hit.line} — \`${hit.name}\` (data_home 모듈 밖에서 홈을 구한다)`);
	}
	for (const s of strings) {
		if (BANNED_LITERALS.has(s.value)) {
			escapes.push(
				`${file}:${s.line} — 환경 변수 "${s.value}" 를 직접 읽는다 (data_home 이 든다)`,
			);
		}
		if (DATA_HOME_SEGMENT.test(s.value)) {
			escapes.push(
				`${file}:${s.line} — 문자열에 \`.naia\` 마디가 있다 (${JSON.stringify(s.value.slice(0, 60))})`,
			);
		}
	}
}

if (!existsSync(FUNNEL)) {
	fail(`깔때기 모듈이 없다: ${FUNNEL}`, [
		"데이터 홈 아래 자리는 그 파일 하나에서만 만든다.",
	]);
}

console.log(
	`[data-home] Rust 파일 ${files.length}개를 토큰으로 갈라 홈 접근을 본다 (깔때기: ${FUNNEL})`,
);

if (escapes.length) {
	fail(`데이터 홈을 모듈 밖에서 짚었다(${escapes.length}) — 거기에는 adk-path 하나만 둔다:`, [
		...escapes,
		"자리를 늘리려면 data_home::DataHomeChild 에 변형을 더하고, 그 자리를 ADK 아래로 두라.",
		"docs/storage-locations.md 를 보라.",
	]);
}

// --- 2. 이름표·검사기 목록·문서가 같은가 --------------------------------

const labels = funnelNames();
if (!labels) {
	fail("깔때기 모듈에서 자리 이름표를 읽지 못했다", [
		"`DataHomeChild::name()` 의 대응표 모양이 바뀌었다면 이 검사도 함께 고쳐라.",
	]);
} else if (labels.unreadable.length) {
	// 모르는 것은 통과가 아니다. 이름표 하나를 못 읽으면 아래 대조가 전부 헛돈다.
	fail(`이름표를 읽을 수 없는 갈래가 있다(${labels.unreadable.length}):`, [
		...labels.unreadable.map((u) => `${FUNNEL}:${u.line} — ${u.variant} — ${u.why}`),
		"이름표는 갈래마다 문자열 리터럴 하나로 적어라. 상수·조립·호출은 단일 출처를 흩뜨린다.",
	]);
} else {
	const names = labels.names;
	console.log(`[data-home] 이름표 ${names.length}개 (사유 적어 둔 것 ${KNOWN.size})`);
	const duplicated = names.filter((n, i) => names.indexOf(n) !== i);
	if (duplicated.length) {
		fail("이름표가 겹친다 — 자리 하나에 이름 하나다:", duplicated);
	}
	const unexpected = names.filter((n) => !KNOWN.has(n));
	if (unexpected.length) {
		fail(`이름표에는 있고 사유가 없다(${unexpected.length}):`, unexpected);
	}
	const stale = [...KNOWN.keys()].filter((n) => !names.includes(n));
	if (stale.length) {
		fail(`옮겼는데 목록에 남아 있다(${stale.length}) — 지워라. 남겨 두면 다음 자리를 덮는다:`, stale);
	}
	const documented = docNames();
	if (!documented) {
		fail("docs/storage-locations.md 의 자리 표를 읽지 못했다");
	} else {
		const missing = names.filter((n) => !documented.includes(n));
		const extra = documented.filter((n) => !names.includes(n));
		if (missing.length || extra.length) {
			fail("문서의 자리 표가 이름표와 다르다:", [
				...missing.map((n) => `문서에 없다: ${n}`),
				...extra.map((n) => `코드에 없다: ${n}`),
			]);
		}
	}

	// 이름 대조만으로는 갈래를 못 읽었다는 사실이 "이름표가 하나 적다" 로만
	// 보인다. 변형·갈래·문서 행의 **수**가 셋 다 같은지 따로 센다 — 변형을
	// 더하면서 이름표를 검사기가 못 읽는 모양으로 적으면 여기서 걸린다.
	const variants = allChildrenVariants();
	if (!variants) {
		fail("깔때기에서 `ALL_CHILDREN` 목록을 읽지 못했다", [
			"자리 전체 목록은 검사기와 테스트가 세는 단일 출처다.",
		]);
	} else {
		const docCount = documented ? documented.length : null;
		console.log(
			`[data-home] 변형 ${variants.length}개 · 이름표 갈래 ${names.length}개 · 문서 ${docCount ?? "?"}행`,
		);
		if (variants.length !== names.length || (docCount !== null && docCount !== names.length)) {
			fail("변형 수·이름표 수·문서 행 수가 다르다:", [
				`ALL_CHILDREN 변형 ${variants.length}개`,
				`name() 갈래 ${names.length}개`,
				`docs/storage-locations.md 행 ${docCount ?? "읽지 못함"}개`,
				"자리를 하나 늘리면 셋을 함께 늘려라. 하나만 늘면 그 자리는 아무도 세지 않는다.",
			]);
		}
	}
}

// --- 3. 깔때기의 공개 API 가 허용 목록과 같은가 ------------------------
//
// 컴파일러는 오늘의 코드만 막는다. `pub` 이 하나 다시 붙는 순간을 여기서 잡는다.

if (existsSync(FUNNEL)) {
	const items = publicItems(readFileSync(FUNNEL, "utf8"));
	const names = new Set(items.map((item) => item.name));
	console.log(`[data-home] 깔때기 공개 항목 ${items.length}개 (허용 목록 ${PUBLIC_API.size})`);

	const opened = items.filter((item) => !PUBLIC_API.has(item.name));
	if (opened.length) {
		fail(`깔때기가 허용 목록에 없는 것을 공개했다(${opened.length}):`, [
			...opened.map((item) => `${FUNNEL}:${item.line} — pub ${item.kind} ${item.name}`),
			"데이터 홈 뿌리와 그 이름은 밖으로 내지 않는다 — 손에 쥐면 이름표 없이 자리를 만든다.",
			"정말 밖에 필요하면 이름표를 받는 API 로 좁히고, PUBLIC_API 에 이유와 쓸 파일을 적어라.",
		]);
	}
	const gone = [...PUBLIC_API.keys()].filter((name) => !names.has(name));
	if (gone.length) {
		fail(`허용 목록이 낡았다(${gone.length}) — 더는 공개가 아니다. 지워라:`, gone);
	}

	// 모듈 밖에서 짚는 이름도 같은 목록으로 본다.
	const wrongName = [];
	const wrongPlace = [];
	for (const file of files) {
		if (file === FUNNEL) continue;
		for (const ref of dataHomeReferences(tokenizeRust(readFileSync(file, "utf8")))) {
			const entry = PUBLIC_API.get(ref.name);
			if (!entry) {
				wrongName.push(`${file}:${ref.line} — data_home::${ref.name}`);
				continue;
			}
			if (entry.files && !entry.files.includes(file)) {
				wrongPlace.push(`${file}:${ref.line} — data_home::${ref.name} (${entry.why})`);
			}
		}
	}
	if (wrongName.length) {
		fail(`깔때기에서 내주지 않는 것을 밖에서 짚었다(${wrongName.length}):`, [
			...wrongName,
			"자리를 늘리려면 data_home::DataHomeChild 에 변형을 더하고 이름표로 받아라.",
		]);
	}
	if (wrongPlace.length) {
		fail(`허용 목록이 정한 파일 밖에서 짚었다(${wrongPlace.length}):`, [
			...wrongPlace,
			"홈 그 자체가 정말 필요하면 PUBLIC_API 의 files 에 그 파일과 이유를 적어라.",
		]);
	}
}

if (failed) process.exit(1);
console.log("  ✓ 모듈 밖에서 홈을 짚는 자리 없음 · 이름표·목록·문서가 같다");
