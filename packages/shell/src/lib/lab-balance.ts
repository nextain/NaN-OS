import { invoke } from "@tauri-apps/api/core";

/**
 * Gateway balance is expressed in micro-dollars (`balance`), while the
 * naia.land account endpoint returns already-normalized `credits`. Accept both
 * response envelopes so login, dashboard, and direct gateway deployments show
 * the same value.
 */
export function parseLabCredits(payload: unknown): number | null {
	if (!payload || typeof payload !== "object") return null;

	const parse = (record: Record<string, unknown>): number | null => {
		const balance = record.balance;
		if (typeof balance === "number" && Number.isFinite(balance)) {
			return balance / 100_000;
		}
		const credits = record.credits;
		if (typeof credits === "number" && Number.isFinite(credits)) {
			return credits;
		}
		return null;
	};

	const record = payload as Record<string, unknown>;
	return parse(record) ??
		(record.data && typeof record.data === "object"
			? parse(record.data as Record<string, unknown>)
			: null);
}

/** Use native HTTP inside Tauri to avoid WebView CORS/PNA balance failures. */
export async function fetchLabBalancePayload(
	gatewayUrl: string,
	naiaKey: string,
	signal?: AbortSignal,
): Promise<unknown> {
	if (
		typeof window !== "undefined" &&
		"__TAURI_INTERNALS__" in window
	) {
		return invoke<unknown>("fetch_naia_balance", {
			gatewayUrl,
			naiaKey,
		});
	}
	const response = await fetch(
		`${gatewayUrl.replace(/\/+$/, "")}/v1/profile/balance`,
		{
			headers: { "X-AnyLLM-Key": `Bearer ${naiaKey}` },
			signal,
		},
	);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.json();
}
