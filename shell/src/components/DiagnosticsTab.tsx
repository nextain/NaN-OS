import { useCallback, useEffect, useRef, useState } from "react";
import { directToolCall } from "../lib/chat-service";
import { loadConfig } from "../lib/config";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import type { GatewayStatus } from "../lib/types";
import { useLogsStore } from "../stores/logs";

export function DiagnosticsTab() {
	const [status, setStatus] = useState<GatewayStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const entries = useLogsStore((s) => s.entries);
	const isTailing = useLogsStore((s) => s.isTailing);
	const logsEndRef = useRef<HTMLDivElement>(null);

	const fetchStatus = useCallback(async () => {
		setLoading(true);
		setError(null);

		const config = loadConfig();
		if (!config?.gatewayUrl || !config?.enableTools) {
			setLoading(false);
			setError(t("diagnostics.error"));
			return;
		}

		try {
			const res = await directToolCall({
				toolName: "skill_diagnostics",
				args: { action: "status" },
				requestId: `diag-status-${Date.now()}`,
				gatewayUrl: config.gatewayUrl,
				gatewayToken: config.gatewayToken,
			});

			if (res.success && res.output) {
				const parsed = JSON.parse(res.output);
				setStatus(parsed);
			} else {
				setError(t("diagnostics.error"));
			}
		} catch (err) {
			Logger.warn("DiagnosticsTab", "Failed to fetch status", {
				error: String(err),
			});
			setError(t("diagnostics.error"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	// Auto-scroll logs
	useEffect(() => {
		logsEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
	}, [entries]);

	const handleToggleTailing = useCallback(async () => {
		const config = loadConfig();
		if (!config?.gatewayUrl || !config?.enableTools) return;

		const store = useLogsStore.getState();
		const action = store.isTailing ? "logs_stop" : "logs_start";

		try {
			await directToolCall({
				toolName: "skill_diagnostics",
				args: { action },
				requestId: `diag-${action}-${Date.now()}`,
				gatewayUrl: config.gatewayUrl,
				gatewayToken: config.gatewayToken,
			});
			store.setTailing(!store.isTailing);
		} catch (err) {
			Logger.warn("DiagnosticsTab", `Failed to ${action}`, {
				error: String(err),
			});
		}
	}, []);

	function formatUptime(seconds?: number): string {
		if (!seconds) return "-";
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		return `${h}h ${m}m ${s}s`;
	}

	function levelColor(level: string): string {
		switch (level.toLowerCase()) {
			case "error":
				return "var(--error)";
			case "warn":
			case "warning":
				return "var(--amber)";
			case "info":
				return "var(--tech-blue)";
			default:
				return "var(--cream-dim)";
		}
	}

	return (
		<div className="diagnostics-tab" data-testid="diagnostics-tab">
			{/* Gateway Status */}
			<div className="diagnostics-section">
				<div className="diagnostics-section-header">
					<h3>{t("diagnostics.gatewayStatus")}</h3>
					<button
						type="button"
						className="diagnostics-refresh-btn"
						onClick={fetchStatus}
					>
						{t("diagnostics.refresh")}
					</button>
				</div>

				{loading ? (
					<div className="diagnostics-loading">
						{t("diagnostics.loading")}
					</div>
				) : error ? (
					<div className="diagnostics-error">{error}</div>
				) : status ? (
					<div className="diagnostics-status-grid">
						<div className="diagnostics-status-item">
							<span className="diagnostics-label">
								{t("diagnostics.gatewayStatus")}
							</span>
							<span
								className={`diagnostics-value ${status.ok ? "status-ok" : "status-err"}`}
							>
								{status.ok
									? t("diagnostics.connected")
									: t("diagnostics.disconnected")}
							</span>
						</div>
						{status.version && (
							<div className="diagnostics-status-item">
								<span className="diagnostics-label">
									{t("diagnostics.version")}
								</span>
								<span className="diagnostics-value">
									{status.version}
								</span>
							</div>
						)}
						{status.uptime != null && (
							<div className="diagnostics-status-item">
								<span className="diagnostics-label">
									{t("diagnostics.uptime")}
								</span>
								<span className="diagnostics-value">
									{formatUptime(status.uptime)}
								</span>
							</div>
						)}
						{status.methods && status.methods.length > 0 && (
							<div className="diagnostics-status-item diagnostics-methods">
								<span className="diagnostics-label">
									{t("diagnostics.methods")} ({status.methods.length})
								</span>
								<div className="diagnostics-methods-list">
									{status.methods.map((m) => (
										<span key={m} className="diagnostics-method-tag">
											{m}
										</span>
									))}
								</div>
							</div>
						)}
					</div>
				) : null}
			</div>

			{/* Live Logs */}
			<div className="diagnostics-section">
				<div className="diagnostics-section-header">
					<h3>{t("diagnostics.logsTitle")}</h3>
					<div className="diagnostics-logs-controls">
						<button
							type="button"
							className={`diagnostics-log-btn ${isTailing ? "tailing" : ""}`}
							onClick={handleToggleTailing}
						>
							{isTailing
								? t("diagnostics.logsStop")
								: t("diagnostics.logsStart")}
						</button>
						<button
							type="button"
							className="diagnostics-log-btn"
							onClick={() => useLogsStore.getState().clear()}
						>
							{t("diagnostics.logsClear")}
						</button>
					</div>
				</div>

				{isTailing && (
					<div className="diagnostics-tailing-indicator">
						{t("diagnostics.logsTailing")}
					</div>
				)}

				<div className="diagnostics-logs-container">
					{entries.length === 0 ? (
						<div className="diagnostics-logs-empty">
							{t("diagnostics.logsEmpty")}
						</div>
					) : (
						entries.map((entry, i) => (
							<div
								key={`${entry.timestamp}-${i}`}
								className="diagnostics-log-line"
							>
								<span className="log-timestamp">
									{entry.timestamp
										? new Date(entry.timestamp).toLocaleTimeString()
										: ""}
								</span>
								<span
									className="log-level"
									style={{ color: levelColor(entry.level) }}
								>
									[{entry.level}]
								</span>
								<span className="log-message">{entry.message}</span>
							</div>
						))
					)}
					<div ref={logsEndRef} />
				</div>
			</div>
		</div>
	);
}
