import { describe, expect, it } from "vitest";
import { usageToCostEntry } from "../billing";
import type { AgentResponseChunk } from "../types";

type UsageChunk = Extract<AgentResponseChunk, { type: "usage" }>;

describe("hosted billing consumer", () => {
	it("preserves confirmed exact billing while treating number as display-only", () => {
		const entry = usageToCostEntry({
			type: "usage", requestId: "r1", inputTokens: 1, outputTokens: 2,
			cost: 0.3000001, customerCost: "0.30000010", billingStatus: "confirmed",
			billingReceipts: [
				{ requestId: "gw-1", attempt: 2, priceVersionId: "pv-1", currency: "USD", customerCost: "0.10000010", status: "settled" },
				{ requestId: "gw-2", attempt: 1, priceVersionId: "pv-1", currency: "USD", customerCost: "0.20000000", status: "settled" },
			], model: "gateway-model",
		}, "nextain", "fallback");
		expect(entry).toMatchObject({ customerCost: "0.30000010", billingStatus: "confirmed", cost: 0.3000001 });
	});

	it.each([
		["old payload without status", { cost: 0 }],
		["missing exact cost", { billingStatus: "confirmed", cost: 0 }],
		["integrity error", { billingStatus: "error", cost: 0 }],
		["unsafe legacy number", { billingStatus: "confirmed", customerCost: "0.1", billingReceipts: [{ requestId: "gw", attempt: 1, priceVersionId: "pv", currency: "USD", customerCost: "0.1", status: "settled" }], cost: Number.POSITIVE_INFINITY }],
		["mismatched legacy alias", { billingStatus: "confirmed", customerCost: "0.1", billingReceipts: [{ requestId: "gw", attempt: 1, priceVersionId: "pv", currency: "USD", customerCost: "0.1", status: "settled" }], cost: 999 }],
		["whitespace request ID", { billingStatus: "confirmed", customerCost: "0.1", billingReceipts: [{ requestId: "   ", attempt: 1, priceVersionId: "pv", currency: "USD", customerCost: "0.1", status: "settled" }], cost: 0.1 }],
		["whitespace price version", { billingStatus: "confirmed", customerCost: "0.1", billingReceipts: [{ requestId: "gw", attempt: 1, priceVersionId: "   ", currency: "USD", customerCost: "0.1", status: "settled" }], cost: 0.1 }],
		["duplicate round receipt", { billingStatus: "confirmed", customerCost: "0.2", billingReceipts: [{ requestId: "gw", attempt: 1, priceVersionId: "pv", currency: "USD", customerCost: "0.1", status: "settled" }, { requestId: "gw", attempt: 2, priceVersionId: "pv", currency: "USD", customerCost: "0.1", status: "settled" }], cost: 0.2 }],
		["receipt sum mismatch", { billingStatus: "confirmed", customerCost: "0.2", billingReceipts: [{ requestId: "gw", attempt: 1, priceVersionId: "pv", currency: "USD", customerCost: "0.1", status: "settled" }], cost: 0.2 }],
	] satisfies Array<[string, Partial<UsageChunk>]>)
	("renders %s as unavailable/error, never as a free confirmed charge", (_name, extra) => {
		const entry = usageToCostEntry({ type: "usage", requestId: "r1", inputTokens: 0, outputTokens: 0, ...extra }, "nextain", "gateway-model");
		expect(entry.cost).toBe(0);
		expect(entry.billingStatus).not.toBe("confirmed");
		expect(entry.customerCost).toBeUndefined();
	});

	it("keeps BYO as an estimate and sanitizes missing cost", () => {
		expect(usageToCostEntry({ type: "usage", requestId: "r1", inputTokens: 1, outputTokens: 1 }, "gemini", "m"))
			.toMatchObject({ cost: 0, billingStatus: "estimated" });
	});
});
