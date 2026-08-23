import { describe, expect, it } from "vitest";
import {
	permissionDecisionFromKeyboardEvent,
	permissionShortcutLabel,
	permissionShortcutPlatform,
} from "../permission-shortcuts";

describe("permission shortcuts", () => {
	it("derives platform-specific labels from the shared mapping", () => {
		expect(permissionShortcutPlatform("MacIntel")).toBe("macos");
		expect(permissionShortcutPlatform("Win32")).toBe("other");
		expect(permissionShortcutPlatform("Linux x86_64")).toBe("other");
		expect(permissionShortcutLabel("once", "macos")).toBe("⌥Y");
		expect(permissionShortcutLabel("always", "other")).toBe("Alt+A");
		expect(permissionShortcutLabel("reject", "other")).toBe("Alt+N");
	});

	it("requires an unmodified, non-repeating Alt chord", () => {
		const base = {
			altKey: true,
			ctrlKey: false,
			metaKey: false,
			shiftKey: false,
			repeat: false,
		};
		expect(permissionDecisionFromKeyboardEvent({ ...base, key: "Y" })).toBe("once");
		expect(permissionDecisionFromKeyboardEvent({ ...base, key: "a" })).toBe("always");
		expect(permissionDecisionFromKeyboardEvent({ ...base, key: "n" })).toBe("reject");
		expect(permissionDecisionFromKeyboardEvent({ ...base, key: "y", altKey: false })).toBeNull();
		expect(permissionDecisionFromKeyboardEvent({ ...base, key: "y", repeat: true })).toBeNull();
	});
});
