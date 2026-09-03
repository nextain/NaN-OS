import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const REPORT_NAME = "bundle-budget-report.json";

function directoryBytes(directory) {
	let total = 0;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === REPORT_NAME) continue;
		const path = resolve(directory, entry.name);
		total += entry.isDirectory() ? directoryBytes(path) : statSync(path).size;
	}
	return total;
}

export function measureBundle({ distDirectory, budget }) {
	const indexPath = resolve(distDirectory, "index.html");
	if (!existsSync(indexPath))
		throw new Error(`Missing build entry: ${indexPath}`);
	const html = readFileSync(indexPath, "utf8");
	const match = html.match(
		/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+\.js)["']/i,
	);
	if (!match)
		throw new Error(
			"Unable to resolve the module entry script from dist/index.html",
		);
	const entryPath = resolve(distDirectory, match[1].replace(/^\//, ""));
	if (!existsSync(entryPath))
		throw new Error(`Missing module entry script: ${entryPath}`);
	const entry = readFileSync(entryPath);
	const measurements = {
		entryRawBytes: entry.byteLength,
		entryGzipBytes: gzipSync(entry).byteLength,
		distBytes: directoryBytes(distDirectory),
	};
	const checks = Object.fromEntries(
		Object.entries(budget).map(([name, limit]) => [
			name,
			{
				actual: measurements[name],
				limit,
				passed: measurements[name] <= limit,
			},
		]),
	);
	return {
		passed: Object.values(checks).every((check) => check.passed),
		entry: relative(distDirectory, entryPath),
		measurements,
		budget,
		checks,
	};
}

export function checkBundleBudget({
	shellDirectory = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
} = {}) {
	const distDirectory = resolve(shellDirectory, "dist");
	const budgetPath = resolve(shellDirectory, "bundle-budget.json");
	const reportPath = resolve(distDirectory, REPORT_NAME);
	try {
		if (!existsSync(budgetPath))
			throw new Error(`Missing bundle budget: ${budgetPath}`);
		const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
		for (const name of ["entryRawBytes", "entryGzipBytes", "distBytes"]) {
			if (!Number.isSafeInteger(budget[name]) || budget[name] <= 0) {
				throw new Error(`Invalid bundle budget ${name}: ${budget[name]}`);
			}
		}
		const report = measureBundle({ distDirectory, budget });
		writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
		return report;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		mkdirSync(distDirectory, { recursive: true });
		writeFileSync(
			reportPath,
			`${JSON.stringify({ passed: false, error: message }, null, 2)}\n`,
		);
		throw error;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const report = checkBundleBudget();
		for (const [name, check] of Object.entries(report.checks)) {
			console.log(
				`${check.passed ? "PASS" : "FAIL"} ${name}: ${check.actual} / ${check.limit} bytes`,
			);
		}
		if (!report.passed) process.exitCode = 1;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
