import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { type AudioRecorder, startRecording } from "../lib/audio-recorder";
import { cancelChat, sendChatMessage } from "../lib/chat-service";
import { addAllowedTool, isToolAllowed, loadConfig } from "../lib/config";
import {
	chatMessageToRow,
	createSession,
	generateSessionId,
	getAllFacts,
	getSessionsWithCount,
	loadOrCreateSession,
	rowToChatMessage,
	saveMessage,
	updateSessionSummary,
	upsertFact,
} from "../lib/db";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import { summarizeSession, extractFacts } from "../lib/memory-processor";
import { type MemoryContext, buildSystemPrompt } from "../lib/persona";
import { transcribeAudio } from "../lib/stt";
import type {
	AgentResponseChunk,
	AuditEvent,
	AuditFilter,
	ChatMessage,
	ProviderId,
} from "../lib/types";
import { hasApiKey } from "../lib/config";
import { parseEmotion } from "../lib/vrm/expression";
import { useAvatarStore } from "../stores/avatar";
import { useChatStore } from "../stores/chat";
import { useProgressStore } from "../stores/progress";
import { PermissionModal } from "./PermissionModal";
import { CostDashboard } from "./CostDashboard";
import { HistoryTab } from "./HistoryTab";
import { SettingsTab } from "./SettingsTab";
import { ToolActivity } from "./ToolActivity";
import { WorkProgressPanel } from "./WorkProgressPanel";

type TabId = "chat" | "progress" | "settings" | "history";

function generateRequestId(): string {
	return `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatCost(cost: number): string {
	if (cost < 0.001) return `$${cost.toFixed(6)}`;
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	return `$${cost.toFixed(3)}`;
}

/** Summarize a previous session and extract facts (fire-and-forget). */
async function summarizePreviousSession(
	sessionId: string,
	messages: ChatMessage[],
	apiKey: string,
	provider: ProviderId,
) {
	try {
		const rows = messages.map((m) => ({
			id: m.id,
			session_id: sessionId,
			role: m.role,
			content: m.content,
			timestamp: m.timestamp,
			cost_json: null,
			tool_calls_json: null,
		}));
		const summary = await summarizeSession(rows, apiKey, provider);
		if (summary) {
			await updateSessionSummary(sessionId, summary);
			Logger.info("ChatPanel", "Session summarized", { sessionId });

			// Extract facts from summary
			const rawFacts = await extractFacts(rows, summary, apiKey, provider);
			for (const f of rawFacts) {
				const now = Date.now();
				await upsertFact({
					id: `fact-${f.key}-${now}`,
					key: f.key,
					value: f.value,
					source_session: sessionId,
					created_at: now,
					updated_at: now,
				});
			}
		}
	} catch (err) {
		Logger.warn("ChatPanel", "Background summarization failed", {
			error: String(err),
		});
	}
}

/** Build MemoryContext for system prompt injection. */
async function buildMemoryContext(): Promise<MemoryContext> {
	const ctx: MemoryContext = {};
	try {
		const cfg = loadConfig();
		ctx.userName = cfg?.userName;
		ctx.agentName = cfg?.agentName;

		const sessions = await getSessionsWithCount(5);
		ctx.recentSummaries = (sessions ?? [])
			.filter((s) => s.summary)
			.map((s) => s.summary as string);

		const facts = await getAllFacts();
		if (facts && facts.length > 0) {
			ctx.facts = facts;
		}
	} catch (err) {
		Logger.warn("ChatPanel", "Failed to build memory context", {
			error: String(err),
		});
	}
	return ctx;
}

// Keep reference to prevent garbage collection during playback
let currentAudio: HTMLAudioElement | null = null;

/** Play base64 MP3 via HTML Audio element (reliable in webkit2gtk). */
function playBase64Audio(base64: string): void {
	Logger.info("ChatPanel", "Audio chunk received", {
		length: base64.length,
	});
	const avatarStore = useAvatarStore.getState();
	avatarStore.setSpeaking(true);
	avatarStore.setPendingAudio(base64);

	// Stop previous audio if still playing
	if (currentAudio) {
		currentAudio.pause();
		currentAudio = null;
	}

	const audio = new Audio(`data:audio/mp3;base64,${base64}`);
	currentAudio = audio; // prevent GC
	audio.onended = () => {
		Logger.info("ChatPanel", "Audio playback ended");
		currentAudio = null;
		avatarStore.setSpeaking(false);
	};
	audio.onerror = (e) => {
		Logger.warn("ChatPanel", "Audio playback error", {
			error: String(e),
		});
		currentAudio = null;
		avatarStore.setSpeaking(false);
	};
	audio.play().then(
		() => Logger.info("ChatPanel", "Audio play() started"),
		(err) => {
			Logger.warn("ChatPanel", "Audio play() rejected", {
				error: String(err),
			});
			currentAudio = null;
			avatarStore.setSpeaking(false);
		},
	);
}

function sendApprovalResponse(
	requestId: string,
	toolCallId: string,
	decision: "once" | "always" | "reject",
): void {
	const message = JSON.stringify({
		type: "approval_response",
		requestId,
		toolCallId,
		decision,
	});
	invoke("send_to_agent_command", { message }).catch((err) => {
		Logger.warn("ChatPanel", "Failed to send approval response", {
			error: String(err),
		});
	});
}

/** Persist a ChatMessage to the memory DB. Noop if sessionId is not set. */
function persistMessage(msg: ChatMessage): void {
	const sessionId = useChatStore.getState().sessionId;
	if (!sessionId) return;
	saveMessage(chatMessageToRow(sessionId, msg)).catch((err) => {
		Logger.warn("ChatPanel", "Failed to persist message", {
			error: String(err),
		});
	});
}

export function ChatPanel() {
	const [input, setInput] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>(
		hasApiKey() ? "chat" : "settings",
	);
	const [showCostDashboard, setShowCostDashboard] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const recorderRef = useRef<AudioRecorder | null>(null);
	const sessionLoaded = useRef(false);
	const currentRequestId = useRef<string | null>(null);

	const messages = useChatStore((s) => s.messages);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const streamingContent = useChatStore((s) => s.streamingContent);
	const streamingToolCalls = useChatStore((s) => s.streamingToolCalls);
	const totalSessionCost = useChatStore((s) => s.totalSessionCost);
	const provider = useChatStore((s) => s.provider);
	const pendingApproval = useChatStore((s) => s.pendingApproval);
	const messageQueue = useChatStore((s) => s.messageQueue);

	// Read STT toggle from config (safe: loadConfig handles parse errors)
	const sttEnabled = loadConfig()?.sttEnabled !== false;

	const setEmotion = useAvatarStore((s) => s.setEmotion);

	// Load previous session on mount
	useEffect(() => {
		if (sessionLoaded.current) return;
		sessionLoaded.current = true;
		loadOrCreateSession()
			.then(({ session, messages: rows }) => {
				const store = useChatStore.getState();
				store.setSessionId(session.id);
				if (rows.length > 0) {
					store.setMessages(rows.map(rowToChatMessage));
				}
				Logger.info("ChatPanel", "Session loaded", {
					sessionId: session.id,
					messageCount: rows.length,
				});
			})
			.catch((err) => {
				Logger.warn("ChatPanel", "Failed to load session", {
					error: String(err),
				});
			});
	}, []);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
	}, [messages, streamingContent]);

	function handleCancelStreaming() {
		const store = useChatStore.getState();
		if (!store.isStreaming) return;
		const reqId = currentRequestId.current;
		if (reqId) {
			cancelChat(reqId).catch((err) => {
				Logger.warn("ChatPanel", "Failed to cancel stream", {
					error: String(err),
				});
			});
		}
		store.finishStreaming();
		setEmotion("neutral");
		currentRequestId.current = null;
	}

	// ESC key to cancel streaming
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape" && useChatStore.getState().isStreaming) {
				handleCancelStreaming();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	// Auto-send queued messages when streaming ends
	useEffect(() => {
		if (!isStreaming && messageQueue.length > 0) {
			const next = useChatStore.getState().dequeueMessage();
			if (next) {
				setInput(next);
				// Send on next tick after state update
				setTimeout(() => handleSend(), 50);
			}
		}
	}, [isStreaming, messageQueue.length]);

	async function handleNewConversation() {
		const store = useChatStore.getState();
		const prevSessionId = store.sessionId;
		const prevMessages = store.messages;
		store.newConversation();

		// Summarize previous session in background
		if (prevSessionId && prevMessages.length >= 2) {
			const config = loadConfig();
			if (config?.apiKey) {
				summarizePreviousSession(
					prevSessionId,
					prevMessages,
					config.apiKey,
					config.provider || "gemini",
				);
			}
		}

		try {
			const id = generateSessionId();
			const session = await createSession(id);
			useChatStore.getState().setSessionId(session.id);
			Logger.info("ChatPanel", "New conversation started", {
				sessionId: session.id,
			});
		} catch (err) {
			Logger.warn("ChatPanel", "Failed to create new session", {
				error: String(err),
			});
		}
	}

	async function handleSend() {
		const text = input.trim();
		if (!text) return;

		// If streaming, queue the message instead
		if (isStreaming) {
			useChatStore.getState().enqueueMessage(text);
			setInput("");
			return;
		}

		setInput("");
		useChatStore.getState().addMessage({ role: "user", content: text });

		// Persist user message
		const msgs = useChatStore.getState().messages;
		const userMsg = msgs[msgs.length - 1];
		if (userMsg) persistMessage(userMsg);

		useChatStore.getState().startStreaming();

		const requestId = generateRequestId();
		currentRequestId.current = requestId;
		const store = useChatStore.getState();

		const config = loadConfig();
		if (!config?.apiKey) {
			useChatStore.getState().appendStreamChunk(t("chat.noApiKey"));
			useChatStore.getState().finishStreaming();
			return;
		}

		const history = store.messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({ role: m.role, content: m.content }));

		const ttsEnabled = config.ttsEnabled !== false;
		const activeProvider = config.provider || provider;
		const memoryCtx = await buildMemoryContext();
		try {
			await sendChatMessage({
				message: text,
				provider: {
					provider: activeProvider,
					model: config.model || "gemini-2.5-flash",
					apiKey: config.apiKey,
				},
				history: history.slice(0, -1), // exclude last (just added) user msg
				onChunk: (chunk) => handleChunk(chunk, activeProvider),
				requestId,
				ttsVoice: ttsEnabled ? config.ttsVoice : undefined,
				ttsApiKey: ttsEnabled ? config.googleApiKey : undefined,
				systemPrompt: buildSystemPrompt(config.persona, memoryCtx),
				enableTools: config.enableTools,
				gatewayUrl: config.enableTools
					? config.gatewayUrl || "ws://localhost:18789"
					: undefined,
				gatewayToken: config.gatewayToken,
			});
		} catch (err) {
			useChatStore
				.getState()
				.appendStreamChunk(`\n[${t("chat.error")}] ${String(err)}`);
			useChatStore.getState().finishStreaming();
		}
	}

	function handleChunk(chunk: AgentResponseChunk, activeProvider: ProviderId) {
		const store = useChatStore.getState();

		switch (chunk.type) {
			case "text": {
				store.appendStreamChunk(chunk.text);
				// Parse emotion from accumulated text (tag may span multiple chunks)
				const accumulated = store.streamingContent;
				if (accumulated.length <= 30 && accumulated.length >= 4) {
					const { emotion } = parseEmotion(accumulated);
					setEmotion(emotion);
				}
				break;
			}
			case "audio":
				playBase64Audio(chunk.data);
				break;
			case "tool_use":
				store.addStreamingToolUse(chunk.toolCallId, chunk.toolName, chunk.args);
				break;
			case "tool_result":
				store.updateStreamingToolResult(
					chunk.toolCallId,
					chunk.success,
					chunk.output,
				);
				break;
			case "approval_request":
				if (isToolAllowed(chunk.toolName)) {
					sendApprovalResponse(chunk.requestId, chunk.toolCallId, "once");
				} else {
					store.setPendingApproval({
						requestId: chunk.requestId,
						toolCallId: chunk.toolCallId,
						toolName: chunk.toolName,
						args: chunk.args,
						tier: chunk.tier,
						description: chunk.description,
					});
				}
				break;
			case "usage":
				store.finishStreaming();
				setEmotion("neutral");
				store.addCostEntry({
					inputTokens: chunk.inputTokens,
					outputTokens: chunk.outputTokens,
					cost: chunk.cost,
					provider: activeProvider,
					model: chunk.model,
				});
				{
					const asMsgs = useChatStore.getState().messages;
					const assistantMsg = asMsgs[asMsgs.length - 1];
					if (assistantMsg) persistMessage(assistantMsg);
				}
				break;
			case "finish":
				if (store.isStreaming) {
					store.finishStreaming();
					setEmotion("neutral");
					const asMsgs = useChatStore.getState().messages;
					const assistantMsg = asMsgs[asMsgs.length - 1];
					if (assistantMsg) persistMessage(assistantMsg);
				}
				break;
			case "error":
				store.appendStreamChunk(`\n[${t("chat.error")}] ${chunk.message}`);
				store.finishStreaming();
				setEmotion("neutral");
				{
					const asMsgs = useChatStore.getState().messages;
					const assistantMsg = asMsgs[asMsgs.length - 1];
					if (assistantMsg) persistMessage(assistantMsg);
				}
				break;
		}
	}

	function handleApprovalDecision(decision: "once" | "always" | "reject") {
		const approval = useChatStore.getState().pendingApproval;
		if (!approval) return;

		if (decision === "always") {
			addAllowedTool(approval.toolName);
		}

		sendApprovalResponse(approval.requestId, approval.toolCallId, decision);
		useChatStore.getState().clearPendingApproval();
	}

	async function handleMicStart() {
		if (isRecording || isStreaming) return;

		try {
			const recorder = await startRecording();
			recorderRef.current = recorder;
			setIsRecording(true);
		} catch (err) {
			Logger.warn("ChatPanel", "Microphone access failed", {
				error: String(err),
			});
			setIsRecording(false);
		}
	}

	async function handleMicStop() {
		const recorder = recorderRef.current;
		if (!recorder) return;
		recorderRef.current = null;

		try {
			const wavBlob = await recorder.stop();
			setIsRecording(false);

			if (wavBlob.size <= 44) return; // WAV header only = silence

			const config = loadConfig();
			const googleKey =
				config?.googleApiKey ||
				(config?.provider === "gemini" ? config?.apiKey : null);
			if (!googleKey) return;

			const text = await transcribeAudio(wavBlob, googleKey);
			if (text) {
				setInput((prev) => (prev ? `${prev} ${text}` : text));
				inputRef.current?.focus();
			}
		} catch (err) {
			Logger.warn("ChatPanel", "STT processing failed", {
				error: String(err),
			});
			setIsRecording(false);
		}
	}

	function handleTabChange(tab: TabId) {
		setActiveTab(tab);
		if (tab === "progress") {
			const store = useProgressStore.getState();
			store.setLoading(true);
			const filter: AuditFilter = { limit: 100 };
			Promise.all([
				invoke("get_audit_log", { filter }),
				invoke("get_audit_stats"),
			])
				.then(([eventsResult, statsResult]) => {
					const s = useProgressStore.getState();
					s.setEvents(eventsResult as AuditEvent[]);
					s.setStats(statsResult as Parameters<typeof s.setStats>[0]);
				})
				.catch((err) => {
					Logger.warn("ChatPanel", "Failed to load progress data", {
						error: String(err),
					});
				})
				.finally(() => {
					useProgressStore.getState().setLoading(false);
				});
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<div className="chat-panel">
			{/* Header with tabs */}
			<div className="chat-header">
				<div className="chat-tabs">
					<button
						type="button"
						className={`chat-tab${activeTab === "chat" ? " active" : ""}`}
						onClick={() => handleTabChange("chat")}
					>
						{t("progress.tabChat")}
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "progress" ? " active" : ""}`}
						onClick={() => handleTabChange("progress")}
					>
						{t("progress.tabProgress")}
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "settings" ? " active" : ""}`}
						onClick={() => handleTabChange("settings")}
					>
						{t("settings.title")}
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "history" ? " active" : ""}`}
						onClick={() => handleTabChange("history")}
					>
						{t("history.tabHistory")}
					</button>
				</div>
				<div className="chat-header-right">
					{totalSessionCost > 0 && (
						<button
							type="button"
							className="cost-badge session-cost cost-badge-clickable"
							onClick={() => setShowCostDashboard((v) => !v)}
						>
							{formatCost(totalSessionCost)}
						</button>
					)}
					<button
						type="button"
						className="settings-icon-btn new-chat-btn"
						onClick={handleNewConversation}
						title={t("chat.newConversation")}
						disabled={isStreaming}
					>
						+
					</button>
				</div>
			</div>

			{/* Progress tab */}
			{activeTab === "progress" && <WorkProgressPanel />}

			{/* Settings tab */}
			{activeTab === "settings" && <SettingsTab />}

			{/* History tab */}
			{activeTab === "history" && (
				<HistoryTab onLoadSession={() => setActiveTab("chat")} />
			)}

			{/* Cost dashboard (dropdown) */}
			{showCostDashboard && activeTab === "chat" && (
				<CostDashboard messages={messages} />
			)}

			{/* Messages (chat tab) */}
			<div className="chat-messages" style={{ display: activeTab === "chat" ? "flex" : "none" }}>
				{messages.map((msg) => (
					<div key={msg.id} className={`chat-message ${msg.role}`}>
						{msg.toolCalls?.map((tc) => (
							<ToolActivity key={tc.toolCallId} tool={tc} />
						))}
						<div className="message-content">
							{msg.role === "assistant" ? (
								<Markdown>{parseEmotion(msg.content).cleanText}</Markdown>
							) : (
								msg.content
							)}
						</div>
						{msg.cost && (
							<span className="cost-badge">
								{formatCost(msg.cost.cost)} ·{" "}
								{msg.cost.inputTokens + msg.cost.outputTokens}{" "}
								{t("chat.tokens")}
							</span>
						)}
					</div>
				))}

				{/* Streaming content */}
				{isStreaming && (
					<div className="chat-message assistant streaming">
						{streamingToolCalls.map((tc) => (
							<ToolActivity key={tc.toolCallId} tool={tc} />
						))}
						<div className="message-content">
							{streamingContent ? (
								<Markdown>{parseEmotion(streamingContent).cleanText}</Markdown>
							) : null}
							<span className="cursor-blink">▌</span>
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Permission Modal */}
			{pendingApproval && (
				<PermissionModal
					pending={pendingApproval}
					onDecision={handleApprovalDecision}
				/>
			)}

			{/* Input (chat tab only) */}
			<div className="chat-input-bar" style={{ display: activeTab === "chat" ? "flex" : "none" }}>
				{sttEnabled && (
					<button
						type="button"
						className={`chat-mic-btn${isRecording ? " recording" : ""}`}
						onMouseDown={handleMicStart}
						onMouseUp={handleMicStop}
						onMouseLeave={handleMicStop}
						disabled={isStreaming}
						title={isRecording ? t("chat.recording") : "STT"}
					>
						{isRecording ? "⏺" : "🎤"}
					</button>
				)}
				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={
						isRecording ? t("chat.recording") : t("chat.placeholder")
					}
					rows={1}
					disabled={isRecording}
					className="chat-input"
				/>
				{messageQueue.length > 0 && (
					<span className="queue-badge">
						{messageQueue.length} {t("chat.queued")}
					</span>
				)}
				{isStreaming ? (
					<button
						type="button"
						onClick={handleCancelStreaming}
						className="chat-send-btn chat-cancel-btn"
						title="ESC"
					>
						■
					</button>
				) : (
					<button
						type="button"
						onClick={handleSend}
						disabled={!input.trim()}
						className="chat-send-btn"
					>
						↑
					</button>
				)}
			</div>
		</div>
	);
}
