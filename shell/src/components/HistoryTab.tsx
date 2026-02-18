import { useEffect, useState } from "react";
import {
	type SessionWithCount,
	deleteSession,
	getSessionMessages,
	getSessionsWithCount,
	rowToChatMessage,
} from "../lib/db";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import { useChatStore } from "../stores/chat";

function formatDate(timestamp: number): string {
	const d = new Date(timestamp);
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function HistoryTab({
	onLoadSession,
}: {
	onLoadSession: () => void;
}) {
	const [sessions, setSessions] = useState<SessionWithCount[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const currentSessionId = useChatStore((s) => s.sessionId);

	useEffect(() => {
		loadSessions();
	}, []);

	async function loadSessions() {
		setIsLoading(true);
		try {
			const result = await getSessionsWithCount(50);
			setSessions(result ?? []);
		} catch (err) {
			Logger.warn("HistoryTab", "Failed to load sessions", {
				error: String(err),
			});
		} finally {
			setIsLoading(false);
		}
	}

	async function handleLoadSession(sessionId: string) {
		if (sessionId === currentSessionId) return;
		try {
			const messages = await getSessionMessages(sessionId);
			const store = useChatStore.getState();
			store.newConversation();
			store.setSessionId(sessionId);
			store.setMessages(messages.map(rowToChatMessage));
			onLoadSession();
		} catch (err) {
			Logger.warn("HistoryTab", "Failed to load session", {
				error: String(err),
			});
		}
	}

	async function handleDeleteSession(sessionId: string) {
		if (!window.confirm(t("history.deleteConfirm"))) return;
		try {
			await deleteSession(sessionId);
			setSessions((prev) => prev.filter((s) => s.id !== sessionId));
			if (sessionId === currentSessionId) {
				useChatStore.getState().newConversation();
			}
		} catch (err) {
			Logger.warn("HistoryTab", "Failed to delete session", {
				error: String(err),
			});
		}
	}

	if (isLoading) {
		return <div className="history-tab-loading">{t("progress.loading")}</div>;
	}

	if (sessions.length === 0) {
		return <div className="history-tab-empty">{t("history.empty")}</div>;
	}

	return (
		<div className="history-tab">
			<div className="history-list">
				{sessions.map((s) => (
					<div
						key={s.id}
						className={`history-item${s.id === currentSessionId ? " current" : ""}`}
					>
						<button
							type="button"
							className="history-item-main"
							onClick={() => handleLoadSession(s.id)}
						>
							<span className="history-item-title">
								{s.title || t("history.untitled")}
								{s.id === currentSessionId && (
									<span className="history-current-badge">
										{t("history.current")}
									</span>
								)}
							</span>
							<span className="history-item-meta">
								{formatDate(s.created_at)} · {s.message_count}{" "}
								{t("history.messages")}
							</span>
						</button>
						<button
							type="button"
							className="history-delete-btn"
							onClick={() => handleDeleteSession(s.id)}
							title={t("history.delete")}
						>
							×
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
