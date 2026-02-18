import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { getLabKey, hasLabKey } from "../lib/config";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import type { ChatMessage } from "../lib/types";

interface CostGroup {
	provider: string;
	model: string;
	count: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
}

function groupCosts(messages: ChatMessage[]): CostGroup[] {
	const map = new Map<string, CostGroup>();
	for (const msg of messages) {
		if (!msg.cost) continue;
		const key = `${msg.cost.provider}|${msg.cost.model}`;
		const existing = map.get(key);
		if (existing) {
			existing.count++;
			existing.inputTokens += msg.cost.inputTokens;
			existing.outputTokens += msg.cost.outputTokens;
			existing.cost += msg.cost.cost;
		} else {
			map.set(key, {
				provider: msg.cost.provider,
				model: msg.cost.model,
				count: 1,
				inputTokens: msg.cost.inputTokens,
				outputTokens: msg.cost.outputTokens,
				cost: msg.cost.cost,
			});
		}
	}
	return Array.from(map.values());
}

function formatCost(cost: number): string {
	if (cost < 0.001) return `$${cost.toFixed(6)}`;
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	return `$${cost.toFixed(3)}`;
}

const GATEWAY_URL =
	"https://cafelua-gateway-789741003661.asia-northeast3.run.app";

function LabBalanceSection() {
	const [balance, setBalance] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		const labKey = getLabKey();
		if (!labKey) {
			setLoading(false);
			return;
		}
		fetch(`${GATEWAY_URL}/v1/profile/balance`, {
			headers: { "X-AnyLLM-Key": `Bearer ${labKey}` },
		})
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: { balance?: number }) => {
				setBalance(data.balance ?? 0);
			})
			.catch((err) => {
				Logger.warn("CostDashboard", "Lab balance fetch failed", {
					error: String(err),
				});
				setError(true);
			})
			.finally(() => setLoading(false));
	}, []);

	if (loading) {
		return <div className="lab-balance-row">{t("cost.labLoading")}</div>;
	}
	if (error) {
		return <div className="lab-balance-row lab-balance-error">{t("cost.labError")}</div>;
	}
	if (balance === null) return null;

	return (
		<div className="lab-balance-section">
			<div className="lab-balance-row">
				<span className="lab-balance-label">{t("cost.labBalance")}</span>
				<span className="lab-balance-value">
					{balance.toFixed(2)} {t("cost.labCredits")}
				</span>
			</div>
			<button
				type="button"
				className="lab-charge-btn"
				onClick={() =>
					openUrl("https://lab.cafelua.com/ko/billing").catch(() => {})
				}
			>
				{t("cost.labCharge")}
			</button>
		</div>
	);
}

export function CostDashboard({ messages }: { messages: ChatMessage[] }) {
	const groups = groupCosts(messages);
	const showLabBalance = hasLabKey();

	if (groups.length === 0 && !showLabBalance) {
		return <div className="cost-dashboard-empty">{t("cost.empty")}</div>;
	}

	const totalCost = groups.reduce((sum, g) => sum + g.cost, 0);
	const totalInput = groups.reduce((sum, g) => sum + g.inputTokens, 0);
	const totalOutput = groups.reduce((sum, g) => sum + g.outputTokens, 0);

	return (
		<div className="cost-dashboard">
			{showLabBalance && <LabBalanceSection />}
			<div className="cost-dashboard-title">{t("cost.title")}</div>
			<table className="cost-table">
				<thead>
					<tr>
						<th>{t("cost.provider")}</th>
						<th>{t("cost.model")}</th>
						<th>{t("cost.messages")}</th>
						<th>{t("cost.inputTokens")}</th>
						<th>{t("cost.outputTokens")}</th>
						<th>{t("cost.total")}</th>
					</tr>
				</thead>
				<tbody>
					{groups.map((g) => (
						<tr key={`${g.provider}|${g.model}`}>
							<td>{g.provider}</td>
							<td>{g.model}</td>
							<td>{g.count}</td>
							<td>{g.inputTokens.toLocaleString()}</td>
							<td>{g.outputTokens.toLocaleString()}</td>
							<td>{formatCost(g.cost)}</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr>
						<td colSpan={3}>{t("cost.total")}</td>
						<td>{totalInput.toLocaleString()}</td>
						<td>{totalOutput.toLocaleString()}</td>
						<td>{formatCost(totalCost)}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}

// Export for testing
export { groupCosts };
