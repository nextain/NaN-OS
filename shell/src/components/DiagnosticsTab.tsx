import { useCallback, useEffect, useRef, useState } from "react";
import { directToolCall } from "../lib/chat-service";
import { loadConfig, resolveGatewayUrl } from "../lib/config";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import type { GatewayStatus } from "../lib/types";
import { useLogsStore } from "../stores/logs";

const LOG_POLL_INTERVAL_MS = 2000;

/** Parse a Gateway log line (JSON with _meta) into display-friendly entry */
function parseLogLine(line: string): { level: string; message: string; timestamp: string } | null {
	try {
		const parsed = JSON.parse(line);
		const meta = parsed._meta || {};
		const level = (meta.logLevelName || "DEBUG").toUpperCase();
		const msg = parsed["0"] || JSON.stringify(parsed);
		const timestamp = parsed.time || meta.date || new Date().toISOString();
		return { level, message: msg, timestamp };
	} catch {
		return { level: "DEBUG", message: line, timestamp: new Date().toISOString() };
	}
}

export function DiagnosticsTab() {
	const [status, setStatus] = useState<GatewayStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const entries = useLogsStore((s) => s.entries);
	const isTailing = useLogsStore((s) => s.isTailing);
	const logsEndRef = useRef<HTMLDivElement>(null);
	const cursorRef = useRef<number | undefined>(undefined);

	const fetchStatus = useCallback(async () => {
		setLoading(true);
		setError(null);

		const config = loadConfig();
		const gatewayUrl = resolveGatewayUrl(config);
		if (!gatewayUrl || !config?.enableTools) {
			setLoading(false);
			setError(t("diagnostics.error"));
			return;
		}

		try {
			const res = await directToolCall({
				toolName: "skill_diagnostics",
				args: { action: "status" },
				requestId: `diag-status-${Date.now()}`,
				gatewayUrl,
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

	// Poll logs while tailing
	useEffect(() => {
		if (!isTailing) return;

		let cancelled = false;

		const poll = async () => {
			const config = loadConfig();
			const gatewayUrl = resolveGatewayUrl(config);
			if (!gatewayUrl || !config?.enableTools) return;

			try {
				const res = await directToolCall({
					toolName: "skill_diagnostics",
					args: {
						action: "logs_poll",
						...(cursorRef.current != null && { cursor: cursorRef.current }),
					},
					requestId: `diag-logs-poll-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config.gatewayToken,
				});

				if (res.success && res.output) {
					const result = JSON.parse(res.output);
					if (typeof result.cursor === "number") {
						cursorRef.current = result.cursor;
					}
					const lines: string[] = result.lines || [];
					const store = useLogsStore.getState();
					for (const line of lines) {
						const entry = parseLogLine(line);
						if (entry) {
							store.addEntry(entry);
						}
					}
				}
			} catch (err) {
				Logger.warn("DiagnosticsTab", "Log poll failed", {
					error: String(err),
				});
			}
		};

		// Initial poll
		poll();

		// Set up interval
		const intervalId = setInterval(() => {
			if (!cancelled) poll();
		}, LOG_POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			clearInterval(intervalId);
		};
	}, [isTailing]);

	// Auto-scroll logs
	useEffect(() => {
		logsEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
	}, [entries]);

	const handleToggleTailing = useCallback(() => {
		const store = useLogsStore.getState();
		if (store.isTailing) {
			// Stop tailing — just flip the flag, polling stops via useEffect cleanup
			store.setTailing(false);
		} else {
			// Start tailing — reset cursor to get recent lines first
			cursorRef.current = undefined;
			store.setTailing(true);
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
	const isConnected = status?.ok ?? (status != null && !error);

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
					<div className="diagnostics-loading">{t("diagnostics.loading")}</div>
				) : error ? (
					<div className="diagnostics-error">{error}</div>
				) : status ? (
					<div className="diagnostics-status-grid">
						<div className="diagnostics-status-item">
							<span className="diagnostics-label">
								{t("diagnostics.gatewayStatus")}
							</span>
							<span
								className={`diagnostics-value ${isConnected ? "status-ok" : "status-err"}`}
							>
								{isConnected
									? t("diagnostics.connected")
									: t("diagnostics.disconnected")}
							</span>
						</div>
						{status.version && (
							<div className="diagnostics-status-item">
								<span className="diagnostics-label">
									{t("diagnostics.version")}
								</span>
								<span className="diagnostics-value">{status.version}</span>
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
