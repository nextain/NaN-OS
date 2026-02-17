import { describe, expect, it } from "vitest";
import {
	getToolDescription,
	getToolTier,
	needsApproval,
} from "../tool-tiers.js";

describe("getToolTier", () => {
	it("returns 0 for read_file", () => {
		expect(getToolTier("read_file")).toBe(0);
	});

	it("returns 0 for search_files", () => {
		expect(getToolTier("search_files")).toBe(0);
	});

	it("returns 1 for write_file", () => {
		expect(getToolTier("write_file")).toBe(1);
	});

	it("returns 1 for web_search", () => {
		expect(getToolTier("web_search")).toBe(1);
	});

	it("returns 2 for execute_command", () => {
		expect(getToolTier("execute_command")).toBe(2);
	});

	it("returns 2 for unknown tools", () => {
		expect(getToolTier("some_new_tool")).toBe(2);
	});
});

describe("needsApproval", () => {
	it("returns false for tier 0 tools", () => {
		expect(needsApproval("read_file")).toBe(false);
		expect(needsApproval("search_files")).toBe(false);
	});

	it("returns true for tier 1 tools", () => {
		expect(needsApproval("write_file")).toBe(true);
		expect(needsApproval("web_search")).toBe(true);
	});

	it("returns true for tier 2 tools", () => {
		expect(needsApproval("execute_command")).toBe(true);
	});
});

describe("getToolDescription", () => {
	it("describes execute_command with the command arg", () => {
		const desc = getToolDescription("execute_command", { command: "npm test" });
		expect(desc).toContain("npm test");
	});

	it("describes write_file with the path arg", () => {
		const desc = getToolDescription("write_file", { path: "/tmp/test.txt" });
		expect(desc).toContain("/tmp/test.txt");
	});

	it("describes web_search with the query arg", () => {
		const desc = getToolDescription("web_search", { query: "vitest docs" });
		expect(desc).toContain("vitest docs");
	});

	it("returns a description for unknown tools", () => {
		const desc = getToolDescription("unknown_tool", { foo: "bar" });
		expect(desc).toBeTruthy();
		expect(desc.length).toBeGreaterThan(0);
	});
});
