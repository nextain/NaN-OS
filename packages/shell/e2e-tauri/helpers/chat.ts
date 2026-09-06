import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { S } from "./selectors.js";

// Native Tauri acceptance runs own a per-port runtime directory. Keep their
// best-effort UI trace there so a successful run cannot dirty the checkout.
// Browser-only callers retain the historical local artifact location.
const UI_TRACE_DIR = process.env.NAIA_E2E_ARTIFACTS_DIR
	? resolve(process.env.NAIA_E2E_ARTIFACTS_DIR)
	: resolve(process.cwd(), "e2e-tauri/.artifacts");
const UI_TRACE_FILE = resolve(UI_TRACE_DIR, "ui-message-trace.ndjson");

type StopLogger = () => Promise<void>;

async function captureUiSnapshot(context: string): Promise<void> {
	try {
		const snapshot = await browser.execute(() => {
			const allAssistant = Array.from(
				document.querySelectorAll(".chat-message.assistant .message-content"),
			)
				.map((el) => el.textContent?.trim() ?? "")
				.filter((t) => t.length > 0);
			const lastAssistant = allAssistant[allAssistant.length - 1] ?? "";
			const toolNames = Array.from(
				document.querySelectorAll(".tool-activity .tool-name"),
			)
				.map((el) => el.textContent?.trim() ?? "")
				.filter((t) => t.length > 0);
			return {
				lastAssistant,
				assistantCount: allAssistant.length,
				toolNames,
				hasToolSuccess: !!document.querySelector(".tool-activity.tool-success"),
				hasToolError: !!document.querySelector(".tool-activity.tool-error"),
				isStreaming: !!document.querySelector(".cursor-blink"),
				hasPermissionModal: !!document.querySelector(".permission-btn-always"),
			};
		});
		mkdirSync(UI_TRACE_DIR, { recursive: true });
		appendFileSync(
			UI_TRACE_FILE,
			`${JSON.stringify({
				ts: new Date().toISOString(),
				context,
				...snapshot,
			})}\n`,
		);
	} catch {
		// best-effort trace; never block tests on tracing failure
	}
}

function startRealtimeUiLogger(context: string, intervalMs = 1000): StopLogger {
	let alive = true;
	const timer = setInterval(() => {
		if (!alive) return;
		void captureUiSnapshot(context);
	}, intervalMs);
	void captureUiSnapshot(`${context}:start`);
	return async () => {
		alive = false;
		clearInterval(timer);
		await captureUiSnapshot(`${context}:stop`);
	};
}
function createDeltaTracer(context: string) {
	let lastSignature = "";
	return async () => {
		try {
			const snapshot = await browser.execute(() => {
				const allAssistant = Array.from(
					document.querySelectorAll(".chat-message.assistant .message-content"),
				)
					.map((el) => el.textContent?.trim() ?? "")
					.filter((t) => t.length > 0);
				const toolNames = Array.from(
					document.querySelectorAll(".tool-activity .tool-name"),
				)
					.map((el) => el.textContent?.trim() ?? "")
					.filter((t) => t.length > 0);
				return {
					allAssistant,
					toolNames,
					hasToolSuccess: !!document.querySelector(
						".tool-activity.tool-success",
					),
					hasToolError: !!document.querySelector(".tool-activity.tool-error"),
					isStreaming: !!document.querySelector(".cursor-blink"),
					hasPermissionModal: !!document.querySelector(
						".permission-btn-always",
					),
				};
			});
			const signature = JSON.stringify(snapshot);
			if (signature === lastSignature) return;
			lastSignature = signature;
			mkdirSync(UI_TRACE_DIR, { recursive: true });
			appendFileSync(
				UI_TRACE_FILE,
				`${JSON.stringify({
					ts: new Date().toISOString(),
					context,
					...snapshot,
				})}\n`,
			);
		} catch {
			// best-effort trace
		}
	};
}

/**
 * Count existing assistant messages (completed, not streaming) before sending.
 */
export async function countCompletedAssistantMessages(): Promise<number> {
	return browser.execute((sel: string) => {
		// Only count non-streaming assistant messages
		return document.querySelectorAll(sel).length;
	}, ".chat-message.assistant:not(.streaming) .message-content");
}

/**
 * Count tool activity elements (success + error) currently in the DOM.
 */
async function countToolActivities(): Promise<number> {
	return browser.execute(() => {
		return document.querySelectorAll(
			".tool-activity.tool-success, .tool-activity.tool-error",
		).length;
	});
}

const CHAT_ERROR_NOTICE_SELECTOR = ".chat-error-notice";
const CHAT_ERROR_LEAD_SELECTOR = ".chat-error-notice__lead";
const CHAT_ERROR_DETAIL_SELECTOR = ".chat-error-notice__detail-text";

type SendMessageWaitResult = boolean | { error: string };

/**
 * Read the rendered error notices, including the collapsed provider detail.
 * A message failure is rendered as a notice inside its own chat message, so
 * old failures remain in the DOM while later requests are being tested.
 */
async function getChatErrorNotices(): Promise<string[]> {
	return browser.execute(
		(noticeSelector: string, leadSelector: string, detailSelector: string) =>
			Array.from(document.querySelectorAll(noticeSelector))
				.map((notice) => {
					const lead =
						notice.querySelector(leadSelector)?.textContent?.trim() ?? "";
					const detail =
						notice.querySelector(detailSelector)?.textContent?.trim() ?? "";
					const text =
						[lead, detail].filter((part) => part.length > 0).join(": ") ||
						notice.textContent?.trim() ||
						"";
					return text.replace(/\s+/g, " ").slice(0, 4_000);
				})
				.filter((text) => text.length > 0),
		CHAT_ERROR_NOTICE_SELECTOR,
		CHAT_ERROR_LEAD_SELECTOR,
		CHAT_ERROR_DETAIL_SELECTOR,
	);
}

/**
 * Return one notice that was not present in the pre-send baseline. Matching
 * as a multiset handles duplicate old errors while still detecting a new
 * notice with identical text.
 */
function findNewChatErrorNotice(
	baseline: readonly string[],
	current: readonly string[],
): string | undefined {
	const remainingBaseline = [...baseline];
	for (const notice of current) {
		const oldIndex = remainingBaseline.indexOf(notice);
		if (oldIndex >= 0) {
			remainingBaseline.splice(oldIndex, 1);
			continue;
		}
		return notice;
	}
	return undefined;
}

async function getNewChatErrorNotice(
	baseline: readonly string[],
): Promise<string | undefined> {
	return findNewChatErrorNotice(baseline, await getChatErrorNotices());
}

function throwForChatError(result: SendMessageWaitResult): void {
	if (typeof result === "object" && result !== null && "error" in result) {
		throw new Error(`Chat request failed: ${result.error}`);
	}
}

/**
 * Return all completed assistant messages.
 */
export async function getCompletedAssistantMessages(): Promise<string[]> {
	return browser.execute(() => {
		return Array.from(
			document.querySelectorAll(
				".chat-message.assistant:not(.streaming) .message-content",
			),
		)
			.map((el) => el.textContent?.trim() ?? "")
			.filter((t) => t.length > 0);
	});
}

/**
 * Return assistant messages added after `beforeCount`.
 */
export async function getNewAssistantMessages(
	beforeCount: number,
): Promise<string[]> {
	const all = await getCompletedAssistantMessages();
	return all.slice(beforeCount);
}

/**
 * Set textarea value via JS (avoids React re-render stale element issues)
 * and click the send button.
 *
 * 내보내는 이유: 답변을 기다리지 않고 **보내기만** 해야 하는 스펙이 있다. 증거가
 * 화면이 아니라 밖에 남는 경우다(예: 알림이 정말 나갔는지는 받는 쪽이 안다).
 * 그런 스펙까지 `sendMessage` 로 최종 답을 기다리면, 답이 늦는 모델에서
 * 실패가 "알림이 안 갔다" 로 잘못 보인다.
 */
export async function sendMessageWithoutWaiting(text: string): Promise<void> {
	const input = await $(S.chatInput);
	await input.waitForEnabled({ timeout: 10_000 });
	await setTextareaAndSend(S.chatInput, text);
}

async function setTextareaAndSend(
	selector: string,
	text: string,
): Promise<void> {
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLTextAreaElement | null;
			if (!el) throw new Error(`Element ${sel} not found`);
			el.focus();
			const nativeSetter = Object.getOwnPropertyDescriptor(
				HTMLTextAreaElement.prototype,
				"value",
			)?.set;
			if (nativeSetter) {
				nativeSetter.call(el, val);
			} else {
				el.value = val;
			}
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		selector,
		text,
	);

	// Wait for React state to settle, then click send button via JS (WebDriver click unsupported in some Tauri versions)
	await browser.pause(100);
	await browser.execute((sel: string) => {
		const btn = document.querySelector(sel) as HTMLButtonElement | null;
		if (btn) btn.click();
	}, S.chatSendBtn);
}

/**
 * Send a message in the chat input and wait for the assistant to finish responding.
 * Uses DOM queries (not element refs) to avoid stale element issues in WebKitGTK.
 */
export async function sendMessage(
	text: string,
	options: { completedMessageTimeoutMs?: number } = {},
): Promise<void> {
	const traceDelta = createDeltaTracer(`sendMessage:${text.slice(0, 80)}`);
	const beforeCount = await countCompletedAssistantMessages();
	const beforeToolCount = await countToolActivities();

	try {
		await traceDelta();
		const input = await $(S.chatInput);
		await input.waitForEnabled({ timeout: 10_000 });
		const beforeChatErrors = await getChatErrorNotices();

		await setTextareaAndSend(S.chatInput, text);

		// Wait for streaming to start — query DOM fresh each check
		const streamingStart = await browser.waitUntil(
			async () => {
				await traceDelta();
				const error = await getNewChatErrorNotice(beforeChatErrors);
				if (error) return { error };
				const started = await browser.execute(
					(sel: string) => !!document.querySelector(sel),
					S.cursorBlink,
				);
				return started;
			},
			{ timeout: 60_000, timeoutMsg: "Streaming did not start (cursor-blink)" },
		);
		throwForChatError(streamingStart);

		// Wait for streaming to finish — cursor-blink disappears
		const streamingFinish = await browser.waitUntil(
			async () => {
				await traceDelta();
				const error = await getNewChatErrorNotice(beforeChatErrors);
				if (error) return { error };
				const finished = await browser.execute(
					(sel: string) => !document.querySelector(sel),
					S.cursorBlink,
				);
				return finished;
			},
			{
				timeout: 180_000,
				timeoutMsg: "Streaming did not finish (cursor-blink still visible)",
			},
		);
		throwForChatError(streamingFinish);

		// Wait for a new completed assistant message OR NEW tool activity.
		// Uses count-based check to avoid stale tool-activity from previous specs.
		const responseReady = await browser.waitUntil(
			async () => {
				await traceDelta();
				const error = await getNewChatErrorNotice(beforeChatErrors);
				if (error) return { error };
				const state = await browser.execute(
					(baseCount: number, baseToolCount: number, msgSel: string) => {
						const msgs = document.querySelectorAll(msgSel);
						const hasNewMsg =
							msgs.length > baseCount &&
							(msgs[msgs.length - 1]?.textContent?.trim()?.length ?? 0) > 0;
						const currentToolCount = document.querySelectorAll(
							".tool-activity.tool-success, .tool-activity.tool-error",
						).length;
						const hasNewTool = currentToolCount > baseToolCount;
						return {
							hasNewMsg,
							hasNewTool,
							msgCount: msgs.length,
							currentToolCount,
						};
					},
					beforeCount,
					beforeToolCount,
					".chat-message.assistant:not(.streaming) .message-content",
				);
				return state.hasNewMsg || state.hasNewTool;
			},
			{
				timeout: options.completedMessageTimeoutMs ?? 60_000,
				timeoutMsg: `Completed assistant message did not appear (beforeMsgs=${beforeCount}, beforeTools=${beforeToolCount})`,
			},
		);
		throwForChatError(responseReady);

		// If new tool activity appeared but no new completed message yet, wait for follow-up
		const needsFollowUp = await browser.execute(
			(baseCount: number, baseToolCount: number) => {
				const msgs = document.querySelectorAll(
					".chat-message.assistant:not(.streaming) .message-content",
				);
				const currentToolCount = document.querySelectorAll(
					".tool-activity.tool-success, .tool-activity.tool-error",
				).length;
				const hasNewTool = currentToolCount > baseToolCount;
				const hasNewMsg =
					msgs.length > baseCount &&
					(msgs[msgs.length - 1]?.textContent?.trim()?.length ?? 0) > 0;
				return hasNewTool && !hasNewMsg;
			},
			beforeCount,
			beforeToolCount,
		);
		if (needsFollowUp) {
			// Wait for follow-up streaming to complete
			const followUpReady = await browser.waitUntil(
				async () => {
					await traceDelta();
					const error = await getNewChatErrorNotice(beforeChatErrors);
					if (error) return { error };
					const count = await countCompletedAssistantMessages();
					if (count <= beforeCount) return false;
					const text = await browser.execute((sel: string) => {
						const msgs = document.querySelectorAll(sel);
						return msgs[msgs.length - 1]?.textContent?.trim() ?? "";
					}, ".chat-message.assistant:not(.streaming) .message-content");
					return text.length > 0;
				},
				{
					timeout: 120_000,
					timeoutMsg: `Follow-up message after tool execution did not appear (beforeMsgs=${beforeCount}, beforeTools=${beforeToolCount})`,
				},
			);
			throwForChatError(followUpReady);
		}

		// Note: placeholder detection removed — too aggressive for tool-calling scenarios.
		// Tool success verification is handled by waitForToolSuccess() in individual specs.
	} finally {
		await traceDelta();
	}
}

/**
 * Get the text content of the last completed assistant message.
 */
export async function getLastAssistantMessage(): Promise<string> {
	return browser.execute(() => {
		const msgs = document.querySelectorAll(
			".chat-message.assistant:not(.streaming) .message-content",
		);
		if (msgs.length === 0) throw new Error("No assistant messages found");
		return msgs[msgs.length - 1]?.textContent?.trim() ?? "";
	});
}

/**
 * Wait for at least one tool-success activity to appear in the page.
 */
export async function waitForToolSuccess(): Promise<void> {
	try {
		await browser.waitUntil(
			async () => {
				const hardError = await browser.execute(() => {
					const msgs = document.querySelectorAll(
						".chat-message.assistant .message-content",
					);
					const last = msgs[msgs.length - 1]?.textContent?.trim() ?? "";
					return /\[오류\]|unauthorized|gateway token missing|API key not valid|Bad Request/i.test(
						last,
					);
				});
				if (hardError) {
					throw new Error("Hard error text detected in assistant message");
				}
				return browser.execute(
					(sel: string) => !!document.querySelector(sel),
					S.toolSuccess,
				);
			},
			{ timeout: 60_000, timeoutMsg: "Tool success activity did not appear" },
		);
	} catch (err) {
		const detail = await browser.execute(() => {
			const msgs = document.querySelectorAll(
				".chat-message.assistant .message-content",
			);
			const lastAssistant =
				msgs[msgs.length - 1]?.textContent?.trim()?.slice(0, 400) ?? "(none)";
			const tools = Array.from(
				document.querySelectorAll(".tool-activity .tool-name"),
			).map((el) => el.textContent?.trim() ?? "");
			return {
				lastAssistant,
				tools,
			};
		});
		throw new Error(
			`Tool success activity did not appear. lastAssistant="${detail.lastAssistant}" tools=${JSON.stringify(detail.tools)} cause=${String(err)}`,
		);
	}
}

/**
 * Get the name of the latest tool activity shown in the UI.
 */
export async function getLastToolName(): Promise<string> {
	return browser.execute(() => {
		const items = document.querySelectorAll(".tool-activity[data-tool-name]");
		if (items.length > 0) {
			return items[items.length - 1]?.getAttribute("data-tool-name") ?? "";
		}
		// Fallback to display text
		const labels = document.querySelectorAll(".tool-activity .tool-name");
		return labels[labels.length - 1]?.textContent?.trim() ?? "";
	});
}

/**
 * Ask for an independent verification using a spawned sub-agent.
 * Returns the final assistant verification text.
 */
export async function verifyWithSubAgent(subject: string): Promise<string> {
	await sendMessage(
		`방금 결과를 독립적으로 검증해줘. sessions_spawn 도구를 사용해서 교차검증 후 반드시 'VALID' 또는 'INVALID'로 시작해서 한 문장으로 답해. 대상: ${subject}`,
	);
	await waitForToolSuccess();
	return getLastAssistantMessage();
}
