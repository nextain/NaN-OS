#!/usr/bin/env node
/**
 * 음성 경로 증거 게이트 — 음성 경로 파일을 바꾼 변경은 음성 검증 주장을 반드시 동반한다.
 *
 * 배경(2026-08-13): 로컬 음성(VoxCPM2 TRT) 경로는 GPU 가 필요해 CI e2e 가 없다.
 * 그래서 무관한 작업이 음성 경로 파일을 지나며 회귀를 내도 어떤 게이트도 울리지
 * 않았고, 7~8월에 'restore local voice' 계열 수리 커밋이 반복됐다. 이 게이트는
 * 침묵 회귀를 '명시적 주장'으로 전환한다 — 주장은 커밋 메시지에 남아 감사 가능하다.
 *
 * 규칙:
 *  - 변경 파일이 음성 경로(VOICE_PATHS)와 무관 → 통과.
 *  - 음성 경로 변경 시, 검사 범위 커밋 메시지에 다음 트레일러 중 하나 필수:
 *      Voice-E2E: pass    — `pnpm -C packages/shell test:e2e:tauri:voice-6g` 실행·통과
 *      Voice-Impact: none — 음성 동작에 영향 없음을 의식적으로 확인함
 *  - 없으면 exit 1 (교정 안내 출력).
 *
 * 사용: <commit messages via stdin> node scripts/ci-verify-voice-evidence.mjs <changed_file...>
 * (scripts/git-hooks/pre-push 가 로컬 1차 마찰로 사용. CI 강제 배선은 charter 승인 대상.)
 * ESM. 판정은 주입 가능한 순수함수 verifyVoiceEvidence — 재구현하지 말고 import 해서 쓸 것.
 */
import { pathToFileURL } from "node:url";

/** 음성 크리티컬 경로 — 넓히면 마찰, 좁히면 구멍. 회귀 이력이 실제로 난 지점만. */
export const VOICE_PATHS = [
	/^packages\/shell\/src\/lib\/tts\//,
	/^packages\/shell\/src\/lib\/voice\//,
	/^packages\/shell\/src\/components\/ChatArea\.tsx$/,
	/^packages\/shell\/src\/components\/RefAudioSection\.tsx$/,
	/^packages\/shell\/e2e-tauri\/wdio\.conf\.voice-6g\.ts$/,
	/^packages\/shell\/e2e-tauri\/specs\/94-voice-6g-shell\.spec\.ts$/,
];

/** 트레일러는 줄 시작에서만 인정 — 본문 산문 속 언급('… Voice-E2E: pass 게이트 추가')은 불인정. */
const E2E_PASS_RE = /^\s*Voice-E2E\s*:\s*pass\b/im;
const IMPACT_NONE_RE = /^\s*Voice-Impact\s*:\s*none\b/im;

/**
 * @param {{ changedFiles: string[], message: string }} input
 * @returns {{ ok: boolean, reason: string, touched: string[] }}
 */
export function verifyVoiceEvidence({ changedFiles, message }) {
	const normalized = (changedFiles ?? []).map((f) =>
		String(f).replace(/\\/g, "/").normalize("NFC"),
	);
	const touched = normalized.filter((f) => VOICE_PATHS.some((re) => re.test(f)));
	if (touched.length === 0) {
		return { ok: true, reason: "음성 경로 무변경", touched };
	}
	const msg = String(message ?? "");
	if (E2E_PASS_RE.test(msg)) {
		return { ok: true, reason: "Voice-E2E: pass 트레일러 확인", touched };
	}
	if (IMPACT_NONE_RE.test(msg)) {
		return { ok: true, reason: "Voice-Impact: none 트레일러 확인", touched };
	}
	return { ok: false, reason: "음성 경로 변경 + 음성 증거 트레일러 부재", touched };
}

const isMain =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	const changedFiles = process.argv.slice(2);
	const r = verifyVoiceEvidence({ changedFiles, message: input });
	if (r.ok) {
		console.log(`[음성 증거 게이트 통과] ${r.reason}`);
		process.exit(0);
	}
	console.error(
		"[음성 증거 게이트 실패] 다음 음성 크리티컬 파일이 변경됐지만, 커밋 메시지에 음성 검증 주장이 없습니다:",
	);
	for (const t of r.touched) console.error("  - " + t);
	console.error(
		"\n둘 중 하나를 커밋 메시지 트레일러로 추가하세요 (거짓 주장은 커밋에 남아 추적됩니다):\n" +
			"  Voice-E2E: pass    — pnpm -C packages/shell test:e2e:tauri:voice-6g 실행·통과 후\n" +
			"  Voice-Impact: none — 음성 동작에 영향 없음을 직접 확인한 경우",
	);
	process.exit(1);
}
