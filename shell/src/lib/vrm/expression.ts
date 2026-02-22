import type { VRM } from "@pixiv/three-vrm";

export type EmotionName =
	| "happy"
	| "sad"
	| "angry"
	| "surprised"
	| "neutral"
	| "think";

interface EmotionState {
	expression: { name: string; value: number }[];
	blendDuration: number;
}

/**
 * VRM 1.0 canonical names → VRM 0.0 legacy equivalents.
 * Used to auto-detect which naming convention the model uses.
 */
const VRM_NAME_MAP: Record<string, string> = {
	happy: "Joy",
	sad: "Sorrow",
	angry: "Angry",
	surprised: "Surprised",
	neutral: "Neutral",
	relaxed: "Fun",
	aa: "A",
	ih: "I",
	ou: "U",
	ee: "E",
	oh: "O",
	blink: "Blink",
	blinkLeft: "Blink_L",
	blinkRight: "Blink_R",
};

/**
 * Build a resolver that maps canonical (VRM 1.0) names to actual names in the model.
 * If the model has "Joy" but not "happy", resolves "happy" → "Joy".
 */
export function buildExpressionResolver(
	expressionMap: Record<string, unknown>,
): (canonical: string) => string | null {
	const available = new Set(Object.keys(expressionMap));
	const cache = new Map<string, string | null>();

	return (canonical: string): string | null => {
		if (cache.has(canonical)) return cache.get(canonical)!;

		// 1. Exact match (VRM 1.0 model)
		if (available.has(canonical)) {
			cache.set(canonical, canonical);
			return canonical;
		}

		// 2. VRM 0.0 fallback
		const legacy = VRM_NAME_MAP[canonical];
		if (legacy && available.has(legacy)) {
			cache.set(canonical, legacy);
			return legacy;
		}

		// 3. Case-insensitive search
		const lower = canonical.toLowerCase();
		for (const name of available) {
			if (name.toLowerCase() === lower) {
				cache.set(canonical, name);
				return name;
			}
		}

		cache.set(canonical, null);
		return null;
	};
}

const EMOTION_STATES: Record<EmotionName, EmotionState> = {
	happy: {
		expression: [
			{ name: "happy", value: 1.0 },
			{ name: "aa", value: 0.3 },
		],
		blendDuration: 0.3,
	},
	sad: {
		expression: [
			{ name: "sad", value: 1.0 },
			{ name: "oh", value: 0.2 },
		],
		blendDuration: 0.3,
	},
	angry: {
		expression: [
			{ name: "angry", value: 1.0 },
			{ name: "ee", value: 0.4 },
		],
		blendDuration: 0.2,
	},
	surprised: {
		expression: [
			{ name: "surprised", value: 1.0 },
			{ name: "oh", value: 0.6 },
		],
		blendDuration: 0.1,
	},
	neutral: {
		expression: [{ name: "neutral", value: 1.0 }],
		blendDuration: 0.5,
	},
	think: {
		expression: [{ name: "neutral", value: 0.6 }],
		blendDuration: 0.5,
	},
};

const EMOTION_TAG_RE = /\[(HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/gi;

export function parseEmotion(text: string): {
	emotion: EmotionName;
	cleanText: string;
} {
	let firstEmotion: EmotionName | null = null;
	const cleanText = text
		.replace(EMOTION_TAG_RE, (_, tag) => {
			if (!firstEmotion) {
				firstEmotion = tag.toLowerCase() as EmotionName;
			}
			return "";
		})
		.trim();
	return {
		emotion: firstEmotion ?? "neutral",
		cleanText,
	};
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function createEmotionController(vrm: VRM) {
	const resolve = vrm.expressionManager
		? buildExpressionResolver(vrm.expressionManager.expressionMap)
		: (_: string) => null;

	let currentEmotion: EmotionName | null = null;
	let isTransitioning = false;
	let transitionProgress = 0;
	const currentValues = new Map<string, number>();
	const targetValues = new Map<string, number>();

	function setEmotion(name: EmotionName, intensity = 1) {
		const state = EMOTION_STATES[name];
		if (!state) return;

		currentEmotion = name;
		isTransitioning = true;
		transitionProgress = 0;
		currentValues.clear();
		targetValues.clear();

		const clamped = Math.min(1, Math.max(0, intensity));

		// Reset all expressions to 0 first
		if (vrm.expressionManager) {
			for (const exprName of Object.keys(vrm.expressionManager.expressionMap)) {
				vrm.expressionManager.setValue(exprName, 0);
			}
		}

		for (const expr of state.expression) {
			const resolved = resolve(expr.name);
			if (!resolved) continue;
			const current = vrm.expressionManager?.getValue(resolved) ?? 0;
			currentValues.set(resolved, current);
			targetValues.set(resolved, expr.value * clamped);
		}
	}

	function update(delta: number) {
		if (!isTransitioning || !currentEmotion) return;

		const state = EMOTION_STATES[currentEmotion];
		const blendDuration = state.blendDuration;

		transitionProgress += delta / blendDuration;
		if (transitionProgress >= 1.0) {
			transitionProgress = 1.0;
			isTransitioning = false;
		}

		const easedT = easeInOutCubic(transitionProgress);

		for (const [exprName, target] of targetValues) {
			const start = currentValues.get(exprName) ?? 0;
			const value = start + (target - start) * easedT;
			vrm.expressionManager?.setValue(exprName, value);
		}
	}

	return { setEmotion, update };
}
