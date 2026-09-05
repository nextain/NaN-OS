/**
 * 회귀 기록의 **스펙 목록 지문** 을 계산하는 한 곳.
 *
 * 왜 이 파일이 있는가. 회귀 기록에는 "이 실행이 어느 스펙 목록을 잰 것인가" 가
 * 함께 남고, 완결성 게이트는 그것이 지금 인벤토리와 같을 때만 기록을 판정에
 * 넣는다. 인벤토리가 바뀐 뒤의 낡은 기록이 "전부 덮였다" 를 만들지 못하게
 * 하려는 장치다.
 *
 * 그런데 지문을 **원문 바이트** sha256 으로 잡았다. 윈도우 체크아웃은 같은
 * 파일을 CRLF 로 받으므로 바이트가 다르고, 따라서 해시가 다르다. 실측:
 * `docs/e2e-inventory.json` 은 LF 로 a5e62ea6…, 같은 내용을 CRLF 로 바꾸면
 * 1420842c… 이고 뒤쪽이 win-rtx4060 기록의 `inventorySha256` 이다. 두 기계가
 * 같은 목록을 재고도 서로의 기록을 영원히 "다른 스펙 목록에서 돌았다" 로
 * 버렸다. 여러 기계로 나눠 도는 프로세스에서 이것은 나눔 자체를 무효로 만든다
 * — 실제로 4060 의 쉰아홉 개 실측이 통째로 판정 밖에 있었고, 게이트는 그 몫을
 * "아무 기계도 맡지 않았다" 로 말했다.
 *
 * 그래서 지문은 바이트가 아니라 **내용** 을 잰다. JSON 으로 읽어 키를 정렬해
 * 다시 적은 다음 해시하므로, 줄끝(LF/CRLF)·들여쓰기·끝 개행·키 순서가 달라도
 * 같은 목록이면 같은 지문이 나온다. 배열 순서는 그대로 둔다 — 스펙 목록의
 * 순서가 바뀌면 나눔의 몫이 바뀌므로 그것은 다른 목록이다.
 *
 * 러너(`scripts/run-regression.mjs`)와 게이트
 * (`scripts/check-regression-complete.mjs`)가 **둘 다 여기서** 계산한다. 두
 * 곳에 같은 식을 적으면 한쪽만 고쳐지고, 갈라진 것은 기록이 버려질 때에만
 * 드러난다 — 그 형태로 이미 한 번 어긋났다.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** 지문 알고리즘의 판. 규칙이 바뀌면 이 값을 올려 옛 지문과 구별한다. */
export const INVENTORY_DIGEST_VERSION = 2;

/**
 * 키를 정렬해 안정적으로 직렬화한다.
 *
 * 배열은 정렬하지 않는다. `specs` 의 순서는 기계별 몫을 가르는 입력이므로
 * (`run-regression.mjs` 의 `shareOf`), 순서가 다르면 실제로 다른 나눔이다.
 */
export function stableStringify(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}
	const keys = Object.keys(value).sort();
	return `{${keys
		.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
		.join(",")}}`;
}

/**
 * 인벤토리의 정규화 지문. 입력은 원문(문자열 또는 버퍼)이다.
 *
 * JSON 으로 읽지 못하면 던진다. 읽을 수 없는 인벤토리로 회귀를 나누는 것은
 * 조용히 넘어갈 일이 아니다 — 러너도 게이트도 이 파일을 어차피 파싱한다.
 */
export function inventoryDigest(source) {
	const text = Buffer.isBuffer(source)
		? source.toString("utf8")
		: String(source);
	const parsed = JSON.parse(text);
	return createHash("sha256")
		.update(`naia-e2e-inventory/v${INVENTORY_DIGEST_VERSION}\n`)
		.update(stableStringify(parsed))
		.digest("hex");
}

/** 파일에서 바로. 러너와 게이트가 부르는 자리다. */
export function inventoryDigestFromFile(path) {
	return inventoryDigest(readFileSync(path));
}

/**
 * 옛 규칙(원문 바이트 sha256)으로 같은 인벤토리가 낼 수 있었던 지문들.
 *
 * 줄끝 두 가지뿐이다. 이행 기간 동안 게이트가 이것도 인정해야, 규칙을 바꾸기
 * 전에 이미 남은 기록이 되살아난다. 새 지문을 만드는 데는 쓰지 않는다.
 */
export function legacyRawDigests(source) {
	const text = Buffer.isBuffer(source)
		? source.toString("utf8")
		: String(source);
	const lf = text.replace(/\r\n/g, "\n");
	const crlf = lf.replace(/\n/g, "\r\n");
	const sha = (value) =>
		createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
	return { lf: sha(lf), crlf: sha(crlf) };
}
