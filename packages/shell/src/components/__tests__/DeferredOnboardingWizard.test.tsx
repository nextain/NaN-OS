// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../../lib/logger";
import { DeferredOnboardingWizard } from "../DeferredOnboardingWizard";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DeferredOnboardingWizard", () => {
	it("shows a localized loading state while the chunk is pending", () => {
		const load = vi.fn(() => new Promise<never>(() => undefined));

		render(<DeferredOnboardingWizard onComplete={vi.fn()} load={load} />);

		expect(screen.getByText("Loading...")).toBeInTheDocument();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("renders the loaded wizard and forwards completion", async () => {
		const onComplete = vi.fn();
		const load = vi.fn(async () => ({
			default: ({ onComplete: complete }: { onComplete: () => void }) => (
				<button type="button" onClick={complete}>
					Finish
				</button>
			),
		}));

		render(<DeferredOnboardingWizard onComplete={onComplete} load={load} />);
		fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("reports a load error and retries only the deferred surface", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(Logger, "error").mockImplementation(() => undefined);
		const load = vi
			.fn()
			.mockRejectedValueOnce(new Error("chunk unavailable"))
			.mockResolvedValueOnce({
				default: () => <div>Recovered onboarding</div>,
			});

		render(<DeferredOnboardingWizard onComplete={vi.fn()} load={load} />);
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Error");
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));

		expect(await screen.findByText("Recovered onboarding")).toBeInTheDocument();
		expect(load).toHaveBeenCalledTimes(2);
	});
});
