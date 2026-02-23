import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { type AudioRecorder, startRecording } from "../lib/audio-recorder";
import { cancelChat, sendChatMessage } from "../lib/chat-service";
import { resetDiscordPollState } from "../lib/discord-poll";
import {
	addAllowedTool,
	isToolAllowed,
	loadConfig,
	saveConfig,
} from "../lib/config";
import { hasApiKey } from "../lib/config";
import {
	getAllFacts,
	upsertFact,
} from "../lib/db";
import {
	discoverAndPersistDiscordDmChannel,
	getGatewayHistory,
	patchGatewaySession,
	resetGatewaySession,
} from "../lib/gateway-sessions";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import { extractFacts, summarizeSession } from "../lib/memory-processor";
import { type MemoryContext, buildSystemPrompt } from "../lib/persona";
import { transcribeAudio } from "../lib/stt";
import type {
	AgentResponseChunk,
	AuditEvent,
	AuditFilter,
	ChatMessage,
	ProviderId,
} from "../lib/types";
import { parseEmotion } from "../lib/vrm/expression";
import { useAvatarStore } from "../stores/avatar";
import { useChatStore } from "../stores/chat";
import { useLogsStore } from "../stores/logs";
import { useProgressStore } from "../stores/progress";
import { useSkillsStore } from "../stores/skills";
import { AgentsTab } from "./AgentsTab";
import { ChannelsTab } from "./ChannelsTab";
import { CostDashboard } from "./CostDashboard";
import { DiagnosticsTab } from "./DiagnosticsTab";
import { HistoryTab } from "./HistoryTab";
import { PermissionModal } from "./PermissionModal";
import { SettingsTab } from "./SettingsTab";
import { SkillsTab } from "./SkillsTab";
import { ToolActivity } from "./ToolActivity";
import { WorkProgressPanel } from "./WorkProgressPanel";

type TabId =
	| "chat"
	| "progress"
	| "skills"
	| "channels"
	| "agents"
	| "diagnostics"
	| "settings"
	| "history";

const TAB_ICONS: Record<TabId, string> = {
	chat: "💬",
	history: "🕘",
	progress: "📊",
	skills: "🧩",
	channels: "🌐",
	agents: "🤖",
	diagnostics: "🩺",
	settings: "⚙️",
};

// Built-in skills are always available in UI (non-toggle). Prevent hidden config drift
// from disabling them via chat-originated config_update events.
const BUILTIN_SKILLS = new Set([
	"skill_time",
	"skill_system_status",
	"skill_memo",
	"skill_weather",
	"skill_notify_slack",
	"skill_notify_discord",
	"skill_naia_discord",
	"skill_skill_manager",
]);

function sanitizeDisabledSkills(disabled?: string[]): string[] | undefined {
	if (!disabled || disabled.length === 0) return undefined;
	const filtered = disabled.filter((name) => !BUILTIN_SKILLS.has(name));
	return filtered.length > 0 ? filtered : undefined;
}

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
	messages: ChatMessage[],
	apiKey: string,
	provider: ProviderId,
) {
	try {
		const rows = messages.map((m) => ({
			id: m.id,
			session_id: "",
			role: m.role,
			content: m.content,
			timestamp: m.timestamp,
			cost_json: null,
			tool_calls_json: null,
		}));
		const summary = await summarizeSession(rows, apiKey, provider);
		if (summary) {
			// Save summary to Gateway session metadata
			await patchGatewaySession("agent:main:main", { summary });
			Logger.info("ChatPanel", "Session summarized via Gateway");

			// Extract facts from summary
			const rawFacts = await extractFacts(rows, summary, apiKey, provider);
			for (const f of rawFacts) {
				const now = Date.now();
				await upsertFact({
					id: `fact-${f.key}-${now}`,
					key: f.key,
					value: f.value,
					source_session: null,
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
		ctx.discordDefaultUserId = cfg?.discordDefaultUserId;
		ctx.discordDmChannelId = cfg?.discordDmChannelId;

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

	// Load previous session from Gateway (SoT)
	useEffect(() => {
		if (sessionLoaded.current) return;
		sessionLoaded.current = true;

		const loadSession = async () => {
			const store = useChatStore.getState();
			store.setSessionId("agent:main:main");

			const messages = await getGatewayHistory("agent:main:main");
			if (messages.length > 0) {
				store.setMessages(messages);
				Logger.info("ChatPanel", "Session loaded from Gateway", {
					messageCount: messages.length,
				});
			}
		};

		loadSession().catch((err) => {
			Logger.warn("ChatPanel", "Failed to load session", {
				error: String(err),
			});
		});

		// Auto-discover Discord DM channel ID from Gateway sessions
		discoverAndPersistDiscordDmChannel().catch(() => {});
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

	// Discord messages are now shown in the dedicated Channels tab (ChannelsTab)
	// via direct Discord REST API, so no polling into main chat.

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
		const prevMessages = store.messages;
		store.newConversation();
		resetDiscordPollState();

		// Summarize previous session in background + extract facts
		if (prevMessages.length >= 2) {
			const config = loadConfig();
			if (config?.apiKey) {
				summarizePreviousSession(
					prevMessages,
					config.apiKey,
					config.provider || "gemini",
				);
			}
		}

		// Reset Gateway session and set local session ID
		try {
			await resetGatewaySession();
			useChatStore.getState().setSessionId("agent:main:main");
			Logger.info("ChatPanel", "New conversation started via Gateway");
		} catch (err) {
			Logger.warn("ChatPanel", "Failed to reset Gateway session", {
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

		useChatStore.getState().startStreaming();

		const requestId = generateRequestId();
		currentRequestId.current = requestId;
		const store = useChatStore.getState();

		const config = loadConfig();
			if (config?.provider === "nextain" && !config?.labKey) {
			useChatStore
				.getState()
				.appendStreamChunk(
					"Naia 계정 로그인이 필요합니다. 설정에서 로그인해주세요.",
				);
			useChatStore.getState().finishStreaming();
			return;
			}
			const isApiKeyOptionalProvider =
				config?.provider === "claude-code-cli" || config?.provider === "ollama";
			if (!isApiKeyOptionalProvider && !config?.apiKey && !config?.labKey) {
				useChatStore.getState().appendStreamChunk(t("chat.noApiKey"));
				useChatStore.getState().finishStreaming();
				return;
			}

		const history = store.messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({ role: m.role, content: m.content }));

		const ttsEnabled = config.ttsEnabled !== false;
		const activeProvider = config.provider || provider;
		// Derive ttsEngine from ttsProvider (new) or fall back to legacy ttsEngine
		// Only "google" provider uses direct Google TTS; all others use Gateway
		const cfgTtsProvider = config.ttsProvider;
		const ttsEngine: "google" | "openclaw" = cfgTtsProvider
			? (cfgTtsProvider === "google" || cfgTtsProvider === "nextain" ? "google" : "openclaw")
			: ((config.ttsEngine ?? "auto") === "google" ? "google" : "openclaw");
		const wantsGatewayForTts =
			ttsEnabled && ttsEngine === "openclaw";
		const memoryCtx = await buildMemoryContext();
		try {
			await sendChatMessage({
				message: text,
				provider: {
					provider: activeProvider,
					model: config.model || "gemini-2.5-flash",
					apiKey: config.apiKey,
					labKey: config.labKey,
				},
				history: history.slice(0, -1), // exclude last (just added) user msg
				onChunk: (chunk) => handleChunk(chunk, activeProvider),
				requestId,
				ttsVoice: ttsEnabled ? config.ttsVoice : undefined,
				ttsApiKey: ttsEnabled
					? (cfgTtsProvider === "google"
						? (config.googleApiKey || (activeProvider === "gemini" ? config.apiKey : ""))
						: cfgTtsProvider === "openai"
						? (config.openaiTtsApiKey || undefined)
						: cfgTtsProvider === "elevenlabs"
						? (config.elevenlabsApiKey || undefined)
						: undefined)
					: undefined,
				ttsEngine: ttsEnabled ? ttsEngine : undefined,
				ttsProvider: ttsEnabled ? cfgTtsProvider : undefined,
				systemPrompt: buildSystemPrompt(config.persona, memoryCtx),
				enableTools: config.enableTools,
				gatewayUrl:
					config.enableTools || wantsGatewayForTts
						? config.gatewayUrl || "ws://localhost:18789"
						: undefined,
				gatewayToken:
					config.enableTools || wantsGatewayForTts
						? config.gatewayToken
						: undefined,
				disabledSkills: config.enableTools
					? sanitizeDisabledSkills(config.disabledSkills)
					: undefined,
				routeViaGateway:
					config.enableTools && (config.chatRouting ?? "auto") !== "direct"
						? true
						: undefined,
				slackWebhookUrl: config.slackWebhookUrl,
				discordWebhookUrl: config.discordWebhookUrl,
				googleChatWebhookUrl: config.googleChatWebhookUrl,
				discordDefaultUserId: config.discordDefaultUserId,
				discordDefaultTarget: config.discordDefaultTarget,
				discordDmChannelId: config.discordDmChannelId,
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
				break;
			case "finish":
				if (store.isStreaming) {
					store.finishStreaming();
					setEmotion("neutral");
				}
				break;
			case "config_update": {
				const cfg = loadConfig();
				if (cfg) {
					// Ignore built-in skill toggles from chat/tool output.
					if (BUILTIN_SKILLS.has(chunk.skillName)) {
						Logger.info(
							"ChatPanel",
							"Ignored config_update for built-in skill",
							{
								skillName: chunk.skillName,
								action: chunk.action,
							},
						);
						break;
					}
					const disabled = cfg.disabledSkills ?? [];
					if (chunk.action === "enable_skill") {
						cfg.disabledSkills = disabled.filter((n) => n !== chunk.skillName);
					} else if (chunk.action === "disable_skill") {
						if (!disabled.includes(chunk.skillName)) {
							cfg.disabledSkills = [...disabled, chunk.skillName];
						}
					}
					saveConfig(cfg);
					useSkillsStore.getState().bumpConfigVersion();
				}
				break;
			}
			case "gateway_approval_request":
				// Gateway-originated approval — treat like local approval
				store.setPendingApproval({
					requestId: chunk.requestId,
					toolCallId: chunk.toolCallId,
					toolName: chunk.toolName,
					args: chunk.args,
					tier: 2,
					description: `Gateway: ${chunk.toolName}`,
				});
				break;
			case "log_entry":
				useLogsStore.getState().addEntry({
					level: chunk.level,
					message: chunk.message,
					timestamp: chunk.timestamp,
				});
				break;
			case "discord_message":
				// Discord DM messages are shown in the dedicated Channels tab.
				// Ignore them here to keep the main chat clean.
				break;
			case "error":
				store.appendStreamChunk(`\n[${t("chat.error")}] ${chunk.message}`);
				store.finishStreaming();
				setEmotion("neutral");
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
						title={t("progress.tabChat")}
						aria-label={t("progress.tabChat")}
						data-tooltip={t("progress.tabChat")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.chat}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "history" ? " active" : ""}`}
						onClick={() => handleTabChange("history")}
						title={t("history.tabHistory")}
						aria-label={t("history.tabHistory")}
						data-tooltip={t("history.tabHistory")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.history}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "progress" ? " active" : ""}`}
						onClick={() => handleTabChange("progress")}
						title={t("progress.tabProgress")}
						aria-label={t("progress.tabProgress")}
						data-tooltip={t("progress.tabProgress")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.progress}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "skills" ? " active" : ""}`}
						onClick={() => handleTabChange("skills")}
						title={t("skills.tabSkills")}
						aria-label={t("skills.tabSkills")}
						data-tooltip={t("skills.tabSkills")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.skills}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "channels" ? " active" : ""}`}
						onClick={() => handleTabChange("channels")}
						title={t("channels.tabChannels")}
						aria-label={t("channels.tabChannels")}
						data-tooltip={t("channels.tabChannels")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.channels}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "agents" ? " active" : ""}`}
						onClick={() => handleTabChange("agents")}
						title={t("agents.tabAgents")}
						aria-label={t("agents.tabAgents")}
						data-tooltip={t("agents.tabAgents")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.agents}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "diagnostics" ? " active" : ""}`}
						onClick={() => handleTabChange("diagnostics")}
						title={t("diagnostics.tabDiagnostics")}
						aria-label={t("diagnostics.tabDiagnostics")}
						data-tooltip={t("diagnostics.tabDiagnostics")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.diagnostics}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "settings" ? " active" : ""}`}
						onClick={() => handleTabChange("settings")}
						title={t("settings.title")}
						aria-label={t("settings.title")}
						data-tooltip={t("settings.title")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.settings}
						</span>
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

			{/* Skills tab */}
			{activeTab === "skills" && (
				<SkillsTab
					onAskAI={(message) => {
						setInput(message);
						setActiveTab("chat");
						setTimeout(() => {
							inputRef.current?.focus();
						}, 50);
					}}
				/>
			)}

			{/* Channels tab */}
			{activeTab === "channels" && (
				<ChannelsTab
					onAskAI={(message) => {
						setInput(message);
						setActiveTab("chat");
						setTimeout(() => {
							inputRef.current?.focus();
						}, 50);
					}}
				/>
			)}

			{/* Agents tab */}
			{activeTab === "agents" && <AgentsTab />}

			{/* Diagnostics tab */}
			{activeTab === "diagnostics" && <DiagnosticsTab />}

			{/* Settings tab */}
			{activeTab === "settings" && <SettingsTab />}

			{/* History tab */}
			{activeTab === "history" && (
				<HistoryTab
					onLoadSession={() => setActiveTab("chat")}
					onLoadDiscordSession={() => setActiveTab("channels")}
				/>
			)}

			{/* Cost dashboard (dropdown) */}
			{showCostDashboard && activeTab === "chat" && (
				<CostDashboard messages={messages} />
			)}

			{/* Messages (chat tab) */}
			<div
				className="chat-messages"
				style={{ display: activeTab === "chat" ? "flex" : "none" }}
			>
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
			<div
				className="chat-input-bar"
				style={{ display: activeTab === "chat" ? "flex" : "none" }}
			>
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
