import { describe, expect, it } from "vitest";
import {
	hasPrimaryModifier,
	primaryModifierLabel,
	shortcutPlatform,
} from "../platform-shortcuts";

describe("platform shortcuts", () => {
	it("derives the primary modifier label and event mapping from one platform definition", () => {
		expect(shortcutPlatform("MacIntel")).toBe("macos");
		expect(shortcutPlatform("Win32")).toBe("other");
		expect(primaryModifierLabel("macos")).toBe("Command");
		expect(primaryModifierLabel("other")).toBe("Ctrl");
		expect(hasPrimaryModifier({ ctrlKey: false, metaKey: true }, "macos")).toBe(true);
		expect(hasPrimaryModifier({ ctrlKey: true, metaKey: false }, "other")).toBe(true);
		expect(hasPrimaryModifier({ ctrlKey: false, metaKey: false }, "other")).toBe(false);
	});
});
