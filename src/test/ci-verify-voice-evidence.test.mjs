#!/usr/bin/env node
/** 음성 경로 증거 게이트 검증 — 침묵 회귀를 명시적 주장으로 전환하는 판정 로직. */
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../../scripts/ci-verify-voice-evidence.mjs");

function run(msg, ...changed) {
	return spawnSync("node", [SCRIPT, ...changed], { input: msg, encoding: "utf8" }).status;
}

let pass = 0, fail = 0;
const check = (n, c) => { console.log(`${c ? "✅ PASS" : "❌ FAIL"} — ${n}`); c ? pass++ : fail++; };

check("무관 파일만 → exit 0", run("chore: docs", "docs/requirements.md", "src/main/domain/x.ts") === 0);
check("변경 파일 없음 → exit 0", run("chore: empty") === 0);
check("tts 파일 + 증거 없음 → exit 1", run("fix: refactor", "packages/shell/src/lib/tts/synthesize.ts") === 1);
check("voice 파일 + 증거 없음 → exit 1", run("fix: x", "packages/shell/src/lib/voice/ref-audio-api.ts") === 1);
check("ChatArea + 증거 없음 → exit 1", run("feat: radio", "packages/shell/src/components/ChatArea.tsx") === 1);
check("RefAudioSection + 증거 없음 → exit 1", run("fix: ui", "packages/shell/src/components/RefAudioSection.tsx") === 1);
check("voice-6g e2e 스펙 + 증거 없음 → exit 1", run("test: seed", "packages/shell/e2e-tauri/specs/94-voice-6g-shell.spec.ts") === 1);
check("tts 파일 + 'Voice-E2E: pass' → exit 0", run("fix: warm-up\n\nVoice-E2E: pass", "packages/shell/src/lib/tts/synthesize.ts") === 0);
check("ChatArea + 'Voice-Impact: none' → exit 0", run("feat: radio ui\n\nVoice-Impact: none", "packages/shell/src/components/ChatArea.tsx") === 0);
check("대소문자 변형 'voice-e2e:  PASS' → exit 0", run("fix: x\nvoice-e2e:  PASS", "packages/shell/src/lib/tts/synthesize.ts") === 0);
check("트레일러 뒤 부연 허용 'Voice-E2E: pass (8GB 실측)' → exit 0", run("fix: x\nVoice-E2E: pass (8GB 실측)", "packages/shell/src/lib/tts/synthesize.ts") === 0);
check("[핵심] 본문 산문 속 언급은 불인정 '… add Voice-E2E: pass gate' → exit 1", run("docs: add Voice-E2E: pass gate", "packages/shell/src/lib/tts/synthesize.ts") === 1);
check("[핵심] 'Voice-Impact: high' 는 불인정 → exit 1", run("fix: x\nVoice-Impact: high", "packages/shell/src/lib/tts/synthesize.ts") === 1);
check("Windows 백슬래시 경로도 검출 → exit 1", run("fix: x", "packages\\shell\\src\\lib\\tts\\synthesize.ts") === 1);
check("유사 경로 오탐 없음(lib/tts 밖) → exit 0", run("fix: x", "packages/shell/src/lib/ttsx/other.ts", "packages/shell/src/components/ChatAreaHelper.tsx") === 0);

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
