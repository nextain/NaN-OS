// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
const mockListen = vi.fn().mockResolvedValue(() => {});
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: (...args: unknown[]) => mockListen(...args),
}));

// The other meta tabs are unrelated to this wiring check — stub them so this
// test only exercises the Channels tab's real component vs. the retired
// static placeholder.
vi.mock("../WorkProgressArea", () => ({ WorkProgressArea: () => <div /> }));
vi.mock("../SkillsTab", () => ({ SkillsTab: () => <div /> }));
vi.mock("../AgentsTab", () => ({ AgentsTab: () => <div /> }));
vi.mock("../DiagnosticsTab", () => ({ DiagnosticsTab: () => <div /> }));
vi.mock("../SettingsTab", () => ({ SettingsTab: () => <div /> }));

import { NaiaMetaArea } from "../NaiaMetaArea";

describe("NaiaMetaArea channels tab wiring", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders the real ChannelsTab, not the retired static placeholder", async () => {
		mockInvoke.mockReturnValue(new Promise(() => {}));
		render(<NaiaMetaArea />);
		fireEvent.click(screen.getByTitle("Channels"));
		expect(await screen.findByTestId("channels-tab")).toBeDefined();
		expect(screen.queryByText(/안정화 작업 중/)).toBeNull();
	});
});
