import { t } from "../lib/i18n";
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

export function CostDashboard({ messages }: { messages: ChatMessage[] }) {
	const groups = groupCosts(messages);

	if (groups.length === 0) {
		return <div className="cost-dashboard-empty">{t("cost.empty")}</div>;
	}

	const totalCost = groups.reduce((sum, g) => sum + g.cost, 0);
	const totalInput = groups.reduce((sum, g) => sum + g.inputTokens, 0);
	const totalOutput = groups.reduce((sum, g) => sum + g.outputTokens, 0);

	return (
		<div className="cost-dashboard">
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
