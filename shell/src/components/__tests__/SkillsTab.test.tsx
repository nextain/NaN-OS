// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSkillsStore } from "../../stores/skills";
import type { SkillManifestInfo } from "../../lib/types";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Import after mocks
import { SkillsTab } from "../SkillsTab";

const BUILT_IN_SKILLS: SkillManifestInfo[] = [
	{ name: "skill_time", description: "Get current date and time", type: "built-in", tier: 0, source: "built-in" },
	{ name: "skill_memo", description: "Save and retrieve memos", type: "built-in", tier: 0, source: "built-in" },
];

const CUSTOM_SKILLS: SkillManifestInfo[] = [
	{ name: "skill_code_review", description: "Review code changes", type: "gateway", tier: 2, source: "/home/.naia/skills/code-review/skill.json", gatewaySkill: "code-review" },
	{ name: "skill_deploy", description: "Deploy to production", type: "command", tier: 2, source: "/home/.naia/skills/deploy/skill.json" },
];

const ALL_SKILLS = [...BUILT_IN_SKILLS, ...CUSTOM_SKILLS];

describe("SkillsTab", () => {
	afterEach(() => {
		cleanup();
		mockInvoke.mockReset();
		useSkillsStore.setState(useSkillsStore.getInitialState());
		localStorage.clear();
	});

	it("shows loading state initially", () => {
		mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
		render(<SkillsTab />);
		expect(screen.getByText(/로딩|Loading/)).toBeDefined();
	});

	it("renders skill cards after loading", async () => {
		mockInvoke.mockResolvedValue(ALL_SKILLS);
		render(<SkillsTab />);
		await waitFor(() => {
			expect(screen.getByText("skill_time")).toBeDefined();
			expect(screen.getByText("skill_code_review")).toBeDefined();
		});
	});

	it("shows empty state when no skills", async () => {
		mockInvoke.mockResolvedValue([]);
		render(<SkillsTab />);
		await waitFor(() => {
			expect(screen.getByText(/등록된 스킬이 없|No skills/)).toBeDefined();
		});
	});

	it("separates built-in and custom sections", async () => {
		mockInvoke.mockResolvedValue(ALL_SKILLS);
		const { container } = render(<SkillsTab />);
		await waitFor(() => {
			const sections = container.querySelectorAll(".skills-section-title");
			expect(sections.length).toBe(2);
		});
	});

	it("filters skills by search query", async () => {
		mockInvoke.mockResolvedValue(ALL_SKILLS);
		render(<SkillsTab />);
		await waitFor(() => {
			expect(screen.getByText("skill_time")).toBeDefined();
		});

		const searchInput = screen.getByPlaceholderText(/검색|Search/);
		fireEvent.change(searchInput, { target: { value: "deploy" } });

		expect(screen.queryByText("skill_time")).toBeNull();
		expect(screen.getByText("skill_deploy")).toBeDefined();
	});

	it("shows built-in badge when skill is expanded", async () => {
		mockInvoke.mockResolvedValue(ALL_SKILLS);
		const { container } = render(<SkillsTab />);
		await waitFor(() => {
			expect(screen.getByText("skill_time")).toBeDefined();
		});
		// Click to expand the first built-in skill
		const headers = container.querySelectorAll(".skill-card-header");
		fireEvent.click(headers[0]);
		const badges = container.querySelectorAll(".skill-badge.built-in");
		expect(badges.length).toBeGreaterThanOrEqual(1);
	});

	it("calls onAskAI when help button is clicked", async () => {
		const onAskAI = vi.fn();
		mockInvoke.mockResolvedValue(ALL_SKILLS);
		const { container } = render(<SkillsTab onAskAI={onAskAI} />);
		await waitFor(() => {
			expect(screen.getByText("skill_time")).toBeDefined();
		});
		const helpBtns = container.querySelectorAll(".skill-help-btn");
		expect(helpBtns.length).toBeGreaterThan(0);
		fireEvent.click(helpBtns[0]);
		expect(onAskAI).toHaveBeenCalledOnce();
		expect(onAskAI.mock.calls[0][0]).toContain("skill_time");
	});

	it("applies disabled class to disabled skills", async () => {
		localStorage.setItem("naia-config", JSON.stringify({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: "test",
			disabledSkills: ["skill_code_review"],
		}));
		mockInvoke.mockResolvedValue(ALL_SKILLS);
		const { container } = render(<SkillsTab />);
		await waitFor(() => {
			const disabledCards = container.querySelectorAll(".skill-card.disabled");
			expect(disabledCards.length).toBe(1);
		});
	});
});
