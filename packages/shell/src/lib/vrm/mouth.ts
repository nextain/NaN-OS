import type { VRM } from "@pixiv/three-vrm";
import { buildExpressionResolver } from "./expression";

type LipKey = "A" | "E" | "I" | "O" | "U";

/** Canonical VRM 1.0 vowel names */
const CANONICAL_VOWELS: Record<LipKey, string> = {
	A: "aa",
	E: "ee",
	I: "ih",
	O: "oh",
	U: "ou",
};

const LIP_KEYS: LipKey[] = ["A", "E", "I", "O", "U"];
const SPEECH_SEQUENCE: LipKey[] = ["A", "I", "U", "E", "O"];

const ATTACK = 50;
const RELEASE = 30;
const CAP = 0.7;
const VOWEL_DURATION_SECONDS = 0.12;

/**
 * Simulated lip sync controller.
 * Audio playback is handled by ChatArea (HTML Audio element).
 * This controller drives VRM mouth blendshapes when isSpeaking is true,
 * using a randomized vowel pattern to simulate speech.
 */
export function createMouthController(vrm: VRM) {
	const resolve = vrm.expressionManager
		? buildExpressionResolver(vrm.expressionManager.expressionMap)
		: (_: string) => null;

	// Resolve canonical vowel names to actual model names
	const expressionMap = vrm.expressionManager?.expressionMap ?? {};
	const resolvedVowels = Object.fromEntries(
		LIP_KEYS.map((key) => {
			const name = resolve(CANONICAL_VOWELS[key]);
			return [
				key,
				{
					name,
					isBinary: name ? Boolean(expressionMap[name]?.isBinary) : false,
				},
			];
		}),
	) as Record<LipKey, { name: string | null; isBinary: boolean }>;
	const availableSequence = SPEECH_SEQUENCE.filter(
		(key) => resolvedVowels[key].name !== null,
	);

	const smoothState: Record<LipKey, number> = {
		A: 0,
		E: 0,
		I: 0,
		O: 0,
		U: 0,
	};
	let speaking = false;
	let elapsed = 0;

	function resetVowels(): void {
		for (const key of LIP_KEYS) {
			smoothState[key] = 0;
			const resolved = resolvedVowels[key].name;
			if (resolved) vrm.expressionManager?.setValue(resolved, 0);
		}
	}

	function setSpeaking(value: boolean): void {
		speaking = value;
		if (!value) {
			elapsed = 0;
			resetVowels();
		}
	}

	function update(delta: number): void {
		if (!vrm.expressionManager) return;

		elapsed += delta;

		const target: Record<LipKey, number> = {
			A: 0,
			E: 0,
			I: 0,
			O: 0,
			U: 0,
		};

		if (speaking && availableSequence.length > 0) {
			const sequenceIndex =
				Math.floor(elapsed / VOWEL_DURATION_SECONDS) % availableSequence.length;
			target[availableSequence[sequenceIndex]] = CAP;
		}

		for (const key of LIP_KEYS) {
			const { name: resolved, isBinary } = resolvedVowels[key];
			if (!resolved) continue;
			if (isBinary) {
				const value = target[key] > 0 ? 1 : 0;
				smoothState[key] = value;
				vrm.expressionManager.setValue(resolved, value);
				continue;
			}
			const from = smoothState[key];
			const to = target[key];
			const rate = 1 - Math.exp(-(to > from ? ATTACK : RELEASE) * delta);
			smoothState[key] = from + (to - from) * rate;
			const weight = smoothState[key] <= 0.01 ? 0 : smoothState[key];
			vrm.expressionManager.setValue(resolved, weight);
		}
	}

	function stop(): void {
		speaking = false;
		elapsed = 0;
		resetVowels();
	}

	return {
		setSpeaking,
		update,
		stop,
		get isSpeaking() {
			return speaking;
		},
	};
}
