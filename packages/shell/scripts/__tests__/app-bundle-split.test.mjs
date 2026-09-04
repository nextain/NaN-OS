import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shellDirectory = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const appSource = readFileSync(resolve(shellDirectory, "src/App.tsx"), "utf8");
const appMainContentSource = readFileSync(
	resolve(shellDirectory, "src/components/AppMainContent.tsx"),
	"utf8",
);
const deferredSource = readFileSync(
	resolve(shellDirectory, "src/components/DeferredOnboardingWizard.tsx"),
	"utf8",
);

describe("App entry bundle split", () => {
	it("keeps the onboarding wizard out of the returning-user entry path", () => {
		expect(appSource).not.toMatch(
			/import\s*{\s*OnboardingWizard\s*}\s*from\s*["']\.\/components\/OnboardingWizard["']/,
		);
		expect(deferredSource).toMatch(/import\(["']\.\/OnboardingWizard["']\)/);
		expect(deferredSource).toContain("lazy(() =>");
		expect(appSource).not.toMatch(
			/import\s+.*(?:Deferred)?OnboardingWizard.*from/,
		);
		expect(appMainContentSource).toContain("<DeferredOnboardingWizard");
		expect(deferredSource).toContain('scope="OnboardingWizard"');
		expect(deferredSource).toContain("resetKey={attempt}");
	});
});
