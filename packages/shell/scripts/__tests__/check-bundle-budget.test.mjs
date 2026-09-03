import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBundleBudget } from "../check-bundle-budget.mjs";

const temporaryDirectories = [];

function fixture({ entry = "export const answer = 42;", budget } = {}) {
	const shellDirectory = mkdtempSync(resolve(tmpdir(), "naia-bundle-budget-"));
	temporaryDirectories.push(shellDirectory);
	const distDirectory = resolve(shellDirectory, "dist");
	mkdirSync(resolve(distDirectory, "assets"), { recursive: true });
	writeFileSync(
		resolve(distDirectory, "index.html"),
		'<script type="module" crossorigin src="/assets/index-test.js"></script>',
	);
	writeFileSync(resolve(distDirectory, "assets/index-test.js"), entry);
	writeFileSync(
		resolve(shellDirectory, "bundle-budget.json"),
		JSON.stringify(
			budget ?? { entryRawBytes: 1000, entryGzipBytes: 1000, distBytes: 2000 },
		),
	);
	return { shellDirectory, distDirectory };
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("bundle budget", () => {
	it("measures the HTML module entry and writes a passing JSON report", () => {
		const { shellDirectory, distDirectory } = fixture();
		const report = checkBundleBudget({ shellDirectory });
		expect(report.passed).toBe(true);
		expect(report.entry).toBe("assets/index-test.js");
		expect(report.measurements.entryRawBytes).toBeGreaterThan(0);
		expect(
			JSON.parse(
				readFileSync(
					resolve(distDirectory, "bundle-budget-report.json"),
					"utf8",
				),
			),
		).toEqual(report);
	});

	it("fails closed when any measured size exceeds its budget", () => {
		const { shellDirectory, distDirectory } = fixture({
			entry: "x".repeat(200),
			budget: { entryRawBytes: 100, entryGzipBytes: 1000, distBytes: 2000 },
		});
		const report = checkBundleBudget({ shellDirectory });
		expect(report.passed).toBe(false);
		expect(report.checks.entryRawBytes).toEqual({
			actual: 200,
			limit: 100,
			passed: false,
		});
	});

	it("rejects a build without an explicit module entry", () => {
		const { distDirectory } = fixture();
		writeFileSync(resolve(distDirectory, "index.html"), "<main>missing</main>");
		expect(() =>
			checkBundleBudget({ shellDirectory: resolve(distDirectory, "..") }),
		).toThrow("Unable to resolve the module entry script");
		expect(
			JSON.parse(
				readFileSync(
					resolve(distDirectory, "bundle-budget-report.json"),
					"utf8",
				),
			),
		).toMatchObject({
			passed: false,
			error: expect.stringContaining(
				"Unable to resolve the module entry script",
			),
		});
	});
});
