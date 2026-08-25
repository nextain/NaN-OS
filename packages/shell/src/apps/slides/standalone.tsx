import React from "react";
import { createRoot } from "react-dom/client";
import type { AppContext, NaiaContextBridge, ToolHandler } from "../../lib/app-registry";
import { SlidesCenterArea } from "./SlidesCenterArea";
import "./standalone.css";

const handlers = new Map<string, ToolHandler>();

const bridge: NaiaContextBridge = {
	pushContext(context: AppContext) {
		window.parent.postMessage({ type: "naia-app:context", context }, "*");
	},
	onToolCall(name, handler) {
		handlers.set(name, handler);
		return () => handlers.delete(name);
	},
	async logBehavior() {},
	async queryBehavior() { return []; },
	async getSecret() { return null; },
	async setSecret() {},
	async readFile() { throw new Error("Use the Slides file picker"); },
	async runShell() { throw new Error("Shell access is not required by Naia Slides"); },
};

window.addEventListener("message", async (event) => {
	const message = event.data;
	if (event.source !== window.parent || message?.type !== "naia-tool-call") return;
	const handler = handlers.get(message.tool);
	try {
		const result = handler ? await handler(message.args ?? {}) : `No handler registered for tool: ${message.tool}`;
		window.parent.postMessage({ type: "naia-tool-result", id: message.id, result }, "*");
	} catch (error) {
		window.parent.postMessage({ type: "naia-tool-result", id: message.id, error: error instanceof Error ? error.message : String(error) }, "*");
	}
});

createRoot(document.getElementById("root")!).render(
	<React.StrictMode><SlidesCenterArea naia={bridge} /></React.StrictMode>,
);
