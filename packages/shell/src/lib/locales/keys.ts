// `en.ts` 에서 파생되는 타입 별명이다. 키의 정본은 로케일 파일 열넷이고,
// 그중 `en.ts` 가 키 집합을 정한다(#559 에서 생성기를 없앤 뒤의 구조).
export type TranslationKey = keyof typeof import("./en").default;
