import type { AgentResponseChunk, CostEntry, ProviderId } from "./types";

type UsageChunk = Extract<AgentResponseChunk, { type: "usage" }>;

const EXACT_CUSTOMER_COST = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/;

function decimalUnits(value: string): bigint | undefined {
	if (!EXACT_CUSTOMER_COST.test(value)) return undefined;
	const [whole, fraction = ""] = value.split(".");
	return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
}

function safeLegacyCost(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: 0;
}

/**
 * Agent usage를 표시 모델로 정규화한다. hosted의 billingStatus 없는 구 payload는
 * `$0/free`가 아니라 unavailable이며, exact customerCost만 금융 정본으로 보존한다.
 */
export function usageToCostEntry(
	usage: UsageChunk,
	provider: ProviderId,
	fallbackModel: string,
): CostEntry {
	const base = {
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		provider,
		model: usage.model ?? fallbackModel,
	};
	if (provider !== "nextain") {
		return {
			...base,
			cost: safeLegacyCost(usage.cost),
			billingStatus: "estimated",
		};
	}

	const total = typeof usage.customerCost === "string"
		? decimalUnits(usage.customerCost)
		: undefined;
	const receipts = usage.billingReceipts;
	const requestIds = new Set<string>();
	let receiptTotal = 0n;
	let priceVersionId: string | undefined;
	let currency: string | undefined;
	let receiptsValid = Array.isArray(receipts) && receipts.length > 0;
	for (const receipt of receipts ?? []) {
		const units = decimalUnits(receipt.customerCost);
		const requestId = receipt.requestId.trim();
		const version = receipt.priceVersionId.trim();
		if (
			units === undefined || requestId.length === 0 || version.length === 0 ||
			requestIds.has(requestId) || !Number.isSafeInteger(receipt.attempt) ||
			receipt.attempt <= 0 || !/^[A-Z]{3}$/.test(receipt.currency) ||
			receipt.status !== "settled" ||
			(priceVersionId !== undefined && priceVersionId !== version) ||
			(currency !== undefined && currency !== receipt.currency)
		) {
			receiptsValid = false;
			break;
		}
		requestIds.add(requestId);
		priceVersionId = version;
		currency = receipt.currency;
		receiptTotal += units;
	}
	const complete = usage.billingStatus === "confirmed" &&
		typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 &&
		total !== undefined && usage.cost === Number(usage.customerCost) &&
		receiptsValid && receiptTotal === total;
	if (!complete) {
		return {
			...base,
			cost: 0,
			billingStatus: usage.billingStatus === "error" ? "error" : "unavailable",
		};
	}

	return {
		...base,
		cost: safeLegacyCost(usage.cost),
		billingStatus: "confirmed",
		customerCost: usage.customerCost,
		billingReceipts: receipts?.map((receipt) => ({ ...receipt })),
	};
}
