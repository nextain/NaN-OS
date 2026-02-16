import { useEffect, useRef, useState } from "react";
import { type AudioRecorder, startRecording } from "../lib/audio-recorder";
import { sendChatMessage } from "../lib/chat-service";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import { buildSystemPrompt } from "../lib/persona";
import { transcribeAudio } from "../lib/stt";
import type { AgentResponseChunk } from "../lib/types";
import { parseEmotion } from "../lib/vrm/expression";
import { useAvatarStore } from "../stores/avatar";
import { useChatStore } from "../stores/chat";

function generateRequestId(): string {
	return `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatCost(cost: number): string {
	if (cost < 0.001) return `$${cost.toFixed(6)}`;
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	return `$${cost.toFixed(3)}`;
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

interface ChatPanelProps {
	onOpenSettings?: () => void;
}

export function ChatPanel({ onOpenSettings }: ChatPanelProps) {
	const [input, setInput] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const recorderRef = useRef<AudioRecorder | null>(null);

	const messages = useChatStore((s) => s.messages);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const streamingContent = useChatStore((s) => s.streamingContent);
	const totalSessionCost = useChatStore((s) => s.totalSessionCost);
	const provider = useChatStore((s) => s.provider);

	// Read STT toggle from config
	const configRaw = localStorage.getItem("cafelua-config");
	const sttEnabled = configRaw
		? JSON.parse(configRaw).sttEnabled !== false
		: true;

	const setEmotion = useAvatarStore((s) => s.setEmotion);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
	}, [messages, streamingContent]);

	async function handleSend() {
		const text = input.trim();
		if (!text || isStreaming) return;

		setInput("");
		useChatStore.getState().addMessage({ role: "user", content: text });
		useChatStore.getState().startStreaming();

		const requestId = generateRequestId();
		const store = useChatStore.getState();

		// Load config from localStorage
		const configRaw = localStorage.getItem("cafelua-config");
		const config = configRaw ? JSON.parse(configRaw) : null;
		if (!config?.apiKey) {
			useChatStore.getState().appendStreamChunk(t("chat.noApiKey"));
			useChatStore.getState().finishStreaming();
			return;
		}

		const history = store.messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({ role: m.role, content: m.content }));

		const ttsEnabled = config.ttsEnabled !== false;
		try {
			await sendChatMessage({
				message: text,
				provider: {
					provider: config.provider || provider,
					model: config.model || "gemini-2.5-flash",
					apiKey: config.apiKey,
				},
				history: history.slice(0, -1), // exclude last (just added) user msg
				onChunk: handleChunk,
				requestId,
				ttsVoice: ttsEnabled ? config.ttsVoice : undefined,
				ttsApiKey: ttsEnabled ? config.googleApiKey : undefined,
				systemPrompt: buildSystemPrompt(config.persona),
			});
		} catch (err) {
			useChatStore
				.getState()
				.appendStreamChunk(`\n[${t("chat.error")}] ${String(err)}`);
			useChatStore.getState().finishStreaming();
		}
	}

	function handleChunk(chunk: AgentResponseChunk) {
		const store = useChatStore.getState();

		switch (chunk.type) {
			case "text": {
				store.appendStreamChunk(chunk.text);
				// Parse emotion from first text chunk
				if (store.streamingContent.length === chunk.text.length) {
					const { emotion } = parseEmotion(chunk.text);
					if (emotion !== "neutral") {
						setEmotion(emotion);
					}
				}
				break;
			}
			case "audio":
				playBase64Audio(chunk.data);
				break;
			case "usage":
				store.finishStreaming();
				store.addCostEntry({
					inputTokens: chunk.inputTokens,
					outputTokens: chunk.outputTokens,
					cost: chunk.cost,
					provider: provider,
					model: chunk.model,
				});
				break;
			case "finish":
				if (store.isStreaming) {
					store.finishStreaming();
				}
				break;
			case "error":
				store.appendStreamChunk(`\n[${t("chat.error")}] ${chunk.message}`);
				store.finishStreaming();
				break;
		}
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

			const configRaw = localStorage.getItem("cafelua-config");
			const config = configRaw ? JSON.parse(configRaw) : null;
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

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<div className="chat-panel">
			{/* Header with session cost */}
			<div className="chat-header">
				<span className="chat-title">Alpha</span>
				<div className="chat-header-right">
					{totalSessionCost > 0 && (
						<span className="cost-badge session-cost">
							{formatCost(totalSessionCost)}
						</span>
					)}
					{onOpenSettings && (
						<button
							type="button"
							className="settings-icon-btn"
							onClick={onOpenSettings}
							title={t("chat.settings")}
						>
							&#9881;
						</button>
					)}
				</div>
			</div>

			{/* Messages */}
			<div className="chat-messages">
				{messages.map((msg) => (
					<div key={msg.id} className={`chat-message ${msg.role}`}>
						<div className="message-content">
							{msg.role === "assistant"
								? parseEmotion(msg.content).cleanText
								: msg.content}
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
						<div className="message-content">
							{streamingContent ? parseEmotion(streamingContent).cleanText : ""}
							<span className="cursor-blink">▌</span>
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="chat-input-bar">
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
					disabled={isStreaming || isRecording}
					className="chat-input"
				/>
				<button
					type="button"
					onClick={handleSend}
					disabled={isStreaming || !input.trim()}
					className="chat-send-btn"
				>
					↑
				</button>
			</div>
		</div>
	);
}
