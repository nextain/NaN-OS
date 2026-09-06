/**
 * 이 앱이 짓는 Rust 크레이트의 소스 뿌리를 `Cargo.toml` 에게 묻는 공용 모듈.
 *
 * 왜 따로 두는가: 명령 목록을 뽑는 게이트가 둘이다 — 확인 없는 파괴 조작을 보는
 * `check-destructive-affordance.mjs` 와, 스펙이 부르는 명령이 실제로 있는지 보는
 * `check-dead-ui-specs.mjs`. 둘이 **서로 다른 자리**에서 명령을 세면 한쪽에서
 * 닫은 구멍이 다른 쪽에 그대로 남는다. 실제로 14회차가 파괴 게이트의 소스 뿌리를
 * `Cargo.toml` 기반으로 넓혔는데, 죽은 UI 게이트는 `packages/shell/src-tauri/src`
 * 한 자리를 원문 정규식으로 훑고 있었다(19회차 지적 6).
 *
 * 그래서 뿌리를 정하는 판단을 여기 하나로 둔다. 명령 **이름**을 뽑는 판단은
 * `rust-tokens.mjs` 의 `tauriCommandNames` 하나다. 두 게이트는 그 둘을 부른다.
 *
 * ## 어디서 재는가
 *
 * 뿌리를 손으로 적으면 다음 크레이트에서 같은 일이 난다. 그래서 `Cargo.toml` 에게
 * 묻는다 — `[workspace] members` 와 `path = "…"` 로 적힌 지역 의존을 따라가며
 * 닿는 크레이트마다 `src` 를 더한다. 크레이트를 하나 붙이려면 Cargo 에 그 자리를
 * 적어야 하고, 적으면 여기서 보인다.
 *
 * 넓어지는 쪽으로만 틀린다 — `path` 를 넉넉히 읽어 소스가 아닌 자리를 더해도
 * 거기에 명령 속성이 없으면 목록은 그대로다.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { parseToml } from "./toml-min.mjs";

const SHELL = "packages/shell";

/** 이 앱의 크레이트 나무가 시작하는 자리. */
export const DEFAULT_CRATE_MANIFEST = `${SHELL}/src-tauri/Cargo.toml`;

/**
 * `entry` 에서 시작해 닿는 크레이트마다 `src` 디렉터리.
 *
 * 돌려주는 것은 경로 문자열이다. 그 아래 어떤 파일을 읽을지는 부르는 쪽이
 * 정한다(두 게이트 모두 `git ls-files` 로 추적되는 `.rs` 만 본다).
 */
export function crateSourceRoots(entry = DEFAULT_CRATE_MANIFEST) {
	const roots = [];
	const seen = new Set();
	const queue = [normalize(entry)];
	while (queue.length) {
		const manifest = queue.shift();
		if (seen.has(manifest)) continue;
		seen.add(manifest);
		if (!existsSync(manifest)) continue;
		const dir = dirname(manifest);
		roots.push(join(dir, "src"));
		const text = readFileSync(manifest, "utf8");
		for (const relative of localCrateReferences(text)) {
			queue.push(normalize(join(dir, relative, "Cargo.toml")));
		}
	}
	return roots;
}

/**
 * `Cargo.toml` 에 적힌 지역 크레이트 자리 — 어느 테이블에 있든 `path` 값과
 * `members` 배열.
 *
 * 예전에는 `\bpath\s*=\s*"([^"]+)"` 정규식이라 **겹따옴표만** 읽었다. TOML 은
 * 홑따옴표를 같은 문자열로 보므로 `path = 'plugins/…'` 로 적기만 하면 그
 * 크레이트가 뿌리에서 빠졌다(15회차 지적 6). 따옴표를 하나 더 열거하는 대신
 * 읽는 자리를 옮겼다 — `scripts/lib/toml-min.mjs` 가 문법으로 읽고, 여기서는
 * 값 나무를 훑는다. 주석과 여러 줄 문자열 안의 `path = "…"` 는 값이지 키가
 * 아니므로 저절로 빠진다.
 *
 * 어느 테이블인지 가리지 않는 것은 일부러다 — `[dependencies]`,
 * `[dev-dependencies]`, `[target."cfg(unix)".dependencies]`, `[patch.crates-io]`
 * 를 열거하면 다음 테이블에서 같은 일이 난다. 넓어지는 쪽으로만 틀린다.
 */
export function localCrateReferences(text) {
	const found = [];
	const visit = (node) => {
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (!node || typeof node !== "object") return;
		for (const [key, value] of Object.entries(node)) {
			if (key === "path" && typeof value === "string") found.push(value);
			if (key === "members" && Array.isArray(value)) {
				for (const member of value) if (typeof member === "string") found.push(member);
			}
			visit(value);
		}
	};
	visit(parseToml(text));
	return found;
}
