/**
 * 한국어 발화용 숫자 정규화 (#540, FR-VOICE-TEXT.5).
 *
 * TTS 엔진은 "90년대"를 자리읽기("구공년대")로 읽는다. 발화 전에 숫자를
 * 한국어 읽기로 풀어 쓴다. 단위(의존명사)가 한자어 수사(삼십 분)와 고유어
 * 수사(세 시)를 가르며, 분류는 아래 테이블이 정의한다 — 새 단위는 테이블에
 * 추가하는 것으로 끝난다.
 */

const SINO_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SPOKEN_DIGITS = ["공", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SINO_SMALL_UNITS = ["천", "백", "십", ""];
const SINO_GROUP_UNITS = ["", "만", "억", "조", "경"];

const NATIVE_ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
const NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];

/** 1–9999 한자어. 십·백·천 앞의 '일'은 생략한다 (일십→십). */
function sinoUnder10000(n: number): string {
	const digits = [
		Math.floor(n / 1000) % 10,
		Math.floor(n / 100) % 10,
		Math.floor(n / 10) % 10,
		n % 10,
	];
	let out = "";
	digits.forEach((digit, i) => {
		if (!digit) return;
		const unit = SINO_SMALL_UNITS[i];
		out += (digit === 1 && unit ? "" : SINO_DIGITS[digit]) + unit;
	});
	return out;
}

/** 음이 아닌 정수의 한자어 읽기. 만 단위 그룹 사이는 띄어 읽는다. */
export function sinoKoreanNumber(n: number): string {
	if (!Number.isSafeInteger(n) || n < 0) return String(n);
	if (n === 0) return "영";
	let out = "";
	let group = 0;
	while (n > 0 && group < SINO_GROUP_UNITS.length) {
		const chunk = n % 10000;
		if (chunk) {
			// 만 앞의 '일'은 생략(일만→만)하되 억·조는 유지한다(일억).
			const part = chunk === 1 && group === 1 ? "" : sinoUnder10000(chunk);
			out = part + SINO_GROUP_UNITS[group] + (out ? ` ${out}` : "");
		}
		n = Math.floor(n / 10000);
		group++;
	}
	return out;
}

/** 1–99 관형 고유어 수사 (세 시, 스무 개, 스물한 명). 범위 밖은 한자어. */
export function nativeKoreanCounting(n: number): string {
	if (!Number.isSafeInteger(n) || n < 1 || n > 99) return sinoKoreanNumber(n);
	if (n === 20) return "스무";
	return NATIVE_TENS[Math.floor(n / 10)] + NATIVE_ONES[n % 10];
}

/** 자리읽기 — 전화번호·코드 (010 → 공일공). */
export function digitWiseKorean(digits: string): string {
	return [...digits]
		.map((ch) => SPOKEN_DIGITS[Number(ch)] ?? ch)
		.join("");
}

// ── 단위 분류표 (FR-VOICE-TEXT.5 확장점) ──────────────────────────────────
// 매칭은 항상 긴 단위부터 시도한다 (개월이 개보다, 시간이 시보다 먼저).

const SINO_UNITS = [
	"킬로바이트", "메가바이트", "기가바이트", "테라바이트",
	"밀리미터", "밀리리터", "밀리그램", "센티미터", "킬로미터", "킬로그램",
	"암페어", "헤르츠", "칼로리", "퍼센트", "페이지",
	"년대", "개월", "개국", "개소", "인분", "학년", "주년", "주일", "세기",
	"번지", "호선", "단계", "차원", "차선", "비트", "바이트", "인치",
	"킬로", "미터", "그램", "리터", "달러", "유로", "위안", "마력",
	"년", "월", "일", "분", "초", "원", "엔", "층", "호", "회", "차", "기",
	"쪽", "점", "배", "도", "프로", "세", "위", "부", "평", "볼트", "와트",
];

const NATIVE_UNITS = [
	"시간", "가지", "군데", "봉지", "조각", "켤레", "그루", "송이", "묶음",
	"다발", "상자", "그릇", "접시", "포기", "마디",
	"시", "개", "명", "살", "마리", "장", "잔", "권", "병", "대", "번",
	"벌", "척", "채", "곡", "줄", "판", "편", "팀", "알", "쌍", "컵",
];

const NATIVE_UNIT_SET = new Set(NATIVE_UNITS);

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const UNIT_ALTERNATION = [...SINO_UNITS, ...NATIVE_UNITS]
	.sort((a, b) => b.length - a.length)
	.map(escapeRegExp)
	.concat(["%", "℃"])
	.join("|");

const UNIT_PATTERN = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALTERNATION})`, "g");

function readWithUnit(numText: string, unit: string): string {
	const [intPart, fracPart] = numText.split(".");
	const n = Number.parseInt(intPart, 10);
	const unitWord = unit === "%" ? "퍼센트" : unit === "℃" ? "도" : unit;
	let reading: string;
	if (fracPart !== undefined) {
		// 소수는 항상 한자어 (삼 점 오 개).
		reading = `${sinoKoreanNumber(n)} 점 ${digitWiseKorean(fracPart)}`;
	} else if (NATIVE_UNIT_SET.has(unit) && n >= 1 && n <= 99) {
		reading = nativeKoreanCounting(n);
	} else {
		reading = sinoKoreanNumber(n);
	}
	return `${reading} ${unitWord}`;
}

/** 발화 텍스트의 숫자를 한국어 읽기로 정규화한다. */
export function normalizeKoreanNumbers(text: string): string {
	return (
		text
			// 천단위 콤마는 읽기 전에 지운다 (1,200 → 1200).
			.replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
			// 구분자 숫자열(전화번호·코드)은 자리읽기.
			.replace(/\b(\d{2,4}(?:-\d{2,4}){1,3})\b/g, (m) =>
				m.split("-").map(digitWiseKorean).join(" "),
			)
			// 숫자+단위 — 단위 분류표가 한자어/고유어 읽기를 가른다.
			.replace(UNIT_PATTERN, (_m, num: string, unit: string) =>
				readWithUnit(num, unit),
			)
			// 남은 소수 (단위 없음): 삼 점 오.
			.replace(
				/(\d+)\.(\d+)/g,
				(_m, i: string, f: string) =>
					`${sinoKoreanNumber(Number.parseInt(i, 10))} 점 ${digitWiseKorean(f)}`,
			)
			// 남은 정수: 0으로 시작하거나 아주 길면 자리읽기, 그 외 한자어.
			.replace(/\d+/g, (m) =>
				(m.length > 1 && m.startsWith("0")) || m.length > 15
					? digitWiseKorean(m)
					: sinoKoreanNumber(Number.parseInt(m, 10)),
			)
	);
}
