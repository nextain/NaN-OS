import { describe, expect, it } from "vitest";
import { createMouthController } from "../mouth";

/** VRM 1.0 style (lowercase vowels) */
function createMockVrm10({ binary = false } = {}) {
	const values = new Map<string, number>();
	const expressions = Object.fromEntries(
		["aa", "ee", "ih", "oh", "ou"].map((name) => [name, { isBinary: binary }]),
	);
	return {
		expressionManager: {
			expressionMap: expressions,
			setValue: (name: string, value: number) => {
				values.set(name, value);
			},
			getValue: (name: string) => values.get(name) ?? 0,
		},
		_values: values,
	};
}

/** VRM 0.0 style (PascalCase vowels: A, E, I, O, U) */
function createMockVrm00() {
	const values = new Map<string, number>();
	return {
		expressionManager: {
			expressionMap: { A: {}, E: {}, I: {}, O: {}, U: {} },
			setValue: (name: string, value: number) => {
				values.set(name, value);
			},
			getValue: (name: string) => values.get(name) ?? 0,
		},
		_values: values,
	};
}

describe("createMouthController", () => {
	it("creates controller with setSpeaking and update", () => {
		const vrm = createMockVrm10();
		const ctrl = createMouthController(vrm as any);
		expect(ctrl.setSpeaking).toBeDefined();
		expect(ctrl.update).toBeDefined();
		expect(ctrl.stop).toBeDefined();
	});

	it("all mouth blendshapes are 0 when not speaking (VRM 1.0)", () => {
		const vrm = createMockVrm10();
		const ctrl = createMouthController(vrm as any);
		ctrl.update(0.016);
		expect(vrm._values.get("aa") ?? 0).toBe(0);
		expect(vrm._values.get("ee") ?? 0).toBe(0);
		expect(vrm._values.get("ih") ?? 0).toBe(0);
		expect(vrm._values.get("oh") ?? 0).toBe(0);
		expect(vrm._values.get("ou") ?? 0).toBe(0);
	});

	it("mouth opens when speaking (VRM 1.0)", () => {
		const vrm = createMockVrm10();
		const ctrl = createMouthController(vrm as any);

		ctrl.setSpeaking(true);
		expect(ctrl.isSpeaking).toBe(true);

		for (let i = 0; i < 10; i++) {
			ctrl.update(0.016);
		}

		const aa = vrm._values.get("aa") ?? 0;
		expect(aa).toBeGreaterThan(0);
	});

	it("cycles every binary VRM 1.0 vowel one at a time above its activation threshold", () => {
		const vrm = createMockVrm10({ binary: true });
		const ctrl = createMouthController(vrm as any);
		const activated = new Set<string>();

		ctrl.setSpeaking(true);
		for (let frame = 0; frame < 10; frame++) {
			ctrl.update(0.13);
			const active = ["aa", "ih", "ou", "ee", "oh"].filter(
				(name) => (vrm._values.get(name) ?? 0) > 0.5,
			);
			expect(active.length).toBe(1);
			activated.add(active[0]);
		}

		expect(activated).toEqual(new Set(["aa", "ih", "ou", "ee", "oh"]));
	});

	it("cycles every continuous VRM 1.0 vowel", () => {
		const vrm = createMockVrm10();
		const ctrl = createMouthController(vrm as any);
		const activated = new Set<string>();

		ctrl.setSpeaking(true);
		for (let frame = 0; frame < 20; frame++) {
			ctrl.update(0.13);
			for (const name of ["aa", "ih", "ou", "ee", "oh"]) {
				if ((vrm._values.get(name) ?? 0) > 0.05) activated.add(name);
			}
		}

		expect(activated).toEqual(new Set(["aa", "ih", "ou", "ee", "oh"]));
	});

	it("mouth opens when speaking (VRM 0.0 — PascalCase vowels)", () => {
		const vrm = createMockVrm00();
		const ctrl = createMouthController(vrm as any);

		ctrl.setSpeaking(true);
		for (let i = 0; i < 10; i++) {
			ctrl.update(0.016);
		}

		// VRM 0.0 uses "A" instead of "aa"
		const a = vrm._values.get("A") ?? 0;
		expect(a).toBeGreaterThan(0);
	});

	it("mouth closes after stop", () => {
		const vrm = createMockVrm10();
		const ctrl = createMouthController(vrm as any);

		ctrl.setSpeaking(true);
		for (let i = 0; i < 10; i++) ctrl.update(0.016);

		ctrl.stop();
		expect(ctrl.isSpeaking).toBe(false);

		for (const name of ["aa", "ee", "ih", "oh", "ou"]) {
			expect(vrm._values.get(name) ?? 0).toBe(0);
		}
	});

	it("closes a binary mouth immediately when speaking ends", () => {
		const vrm = createMockVrm10({ binary: true });
		const ctrl = createMouthController(vrm as any);

		ctrl.setSpeaking(true);
		ctrl.update(0.13);
		expect([...vrm._values.values()].some((value) => value > 0.5)).toBe(true);

		ctrl.setSpeaking(false);
		for (const name of ["aa", "ee", "ih", "oh", "ou"]) {
			expect(vrm._values.get(name) ?? 0).toBe(0);
		}
	});
});
