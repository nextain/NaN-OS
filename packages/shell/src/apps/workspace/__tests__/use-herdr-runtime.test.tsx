// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HerdrSnapshot } from "../herdr";
import { useHerdrRuntime } from "../useHerdrRuntime";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../../../lib/adk-store", () => ({
	getAdkPath: () => "/work/naia",
}));

function snapshot(id: string): HerdrSnapshot {
	return {
		protocol: 19,
		version: "0.8.0",
		focused_workspace_id: id,
		focused_pane_id: `${id}:p1`,
		workspaces: [
			{
				workspace_id: id,
				label: id,
				focused: true,
				pane_count: 1,
				tab_count: 1,
				worktree: { checkout_path: `/work/${id}` },
			},
		],
		agents: [],
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return { promise, resolve, reject };
}

function RuntimeHarness() {
	const runtime = useHerdrRuntime();
	return (
		<div>
			<div data-testid="runtime-pty">{runtime.pty?.pty_id ?? "none"}</div>
			<div data-testid="runtime-snapshot">
				{runtime.snapshot?.focused_workspace_id ?? "none"}
			</div>
			<div data-testid="runtime-error">{runtime.snapshotError}</div>
			<div data-testid="runtime-root">{runtime.workspaceRoot}</div>
			<button
				type="button"
				onClick={() => void runtime.refreshSnapshot().catch(() => {})}
			>
				Refresh snapshot
			</button>
		</div>
	);
}

describe("useHerdrRuntime", () => {
	afterEach(() => {
		cleanup();
		mockInvoke.mockReset();
	});

	it("launches once under strict effects and discards stale snapshot results", async () => {
		const pending: Array<ReturnType<typeof deferred<HerdrSnapshot>>> = [];
		let controlled = false;
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") return { pty_id: "pty-1", pid: 1 };
			if (command === "workspace_set_root") return "/work/initial";
			if (command === "herdr_snapshot") {
				if (!controlled) return snapshot("initial");
				const next = deferred<HerdrSnapshot>();
				pending.push(next);
				return next.promise;
			}
			return null;
		});

		render(
			<StrictMode>
				<RuntimeHarness />
			</StrictMode>,
		);
		await waitFor(() =>
			expect(screen.getByTestId("runtime-pty")).toHaveTextContent("pty-1"),
		);
		expect(
			mockInvoke.mock.calls.filter(
				([command]) => command === "herdr_pty_create",
			),
		).toHaveLength(1);

		controlled = true;
		fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" }));
		fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" }));
		expect(pending).toHaveLength(2);
		pending[1].resolve(snapshot("newest"));
		await waitFor(() =>
			expect(screen.getByTestId("runtime-snapshot")).toHaveTextContent(
				"newest",
			),
		);
		pending[0].reject(new Error("stale failure"));
		await Promise.resolve();
		expect(screen.getByTestId("runtime-snapshot")).toHaveTextContent("newest");
		expect(screen.getByTestId("runtime-error")).toBeEmptyDOMElement();
	});

	it("shows the newest snapshot failure and clears it after recovery", async () => {
		let shouldFail = false;
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") return { pty_id: "pty-1", pid: 1 };
			if (command === "workspace_set_root") return "/work/initial";
			if (command === "herdr_snapshot") {
				if (shouldFail) throw new Error("snapshot unavailable");
				return snapshot("initial");
			}
			return null;
		});
		render(<RuntimeHarness />);
		await screen.findByText("initial");

		shouldFail = true;
		fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" }));
		await screen.findByText(/snapshot unavailable/);
		shouldFail = false;
		fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" }));
		await waitFor(() =>
			expect(screen.getByTestId("runtime-error")).toBeEmptyDOMElement(),
		);
	});

	it("retries a failed root sync when the same Space snapshot is refreshed", async () => {
		let rootAttempts = 0;
		mockInvoke.mockImplementation(async (command: string) => {
			if (command === "herdr_pty_create") return { pty_id: "pty-1", pid: 1 };
			if (command === "herdr_snapshot") return snapshot("focused");
			if (command === "workspace_set_root") {
				rootAttempts++;
				if (rootAttempts === 1) throw new Error("root temporarily unavailable");
				return "/work/focused";
			}
			return null;
		});

		render(<RuntimeHarness />);
		await waitFor(() => expect(rootAttempts).toBeGreaterThanOrEqual(1));
		fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" }));
		await waitFor(() =>
			expect(screen.getByTestId("runtime-root")).toHaveTextContent(
				"/work/focused",
			),
		);
		expect(rootAttempts).toBeGreaterThanOrEqual(2);
	});
});
