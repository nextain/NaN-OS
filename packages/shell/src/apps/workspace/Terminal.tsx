import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { type IBufferRange, Terminal as XTerminal } from "@xterm/xterm";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { t } from "../../lib/i18n";
import { Logger } from "../../lib/logger";
import { resizePty, writePty } from "./pty-ipc";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
	pty_id: string;
	active: boolean;
	workingDir?: string;
	onExit: (pty_id: string) => void;
	onFileSelect?: (path: string) => void;
	onFileLocation?: (location: FileLocation) => void;
	/** Alt+click on a file path in terminal output → ask the conversation rail
	    about that file (instead of opening it in the document viewer). */
	onAskAi?: (path: string) => void;
}

export interface FileLocation {
	path: string;
	line?: number;
	column?: number;
}

export interface TerminalHandle {
	focus: () => void;
}

const FILE_PATH_RE =
	/(?:(?:[A-Za-z]:[\\/]|~\/|\.?\.?\/)[\w./\\-]*[\w-]+\.[\w]{1,10}|(?:src|lib|test|tests|dist|build|projects|packages|modules|node_modules|components|panels|scripts|agent|gateway|shell)[\\/][\w./\\-]*[\w-]+\.[\w]{1,10})(?::\d+){0,2}/g;

const FILE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"json",
	"yaml",
	"yml",
	"toml",
	"xml",
	"csv",
	"md",
	"txt",
	"log",
	"env",
	"rs",
	"go",
	"py",
	"rb",
	"java",
	"kt",
	"swift",
	"c",
	"cpp",
	"h",
	"hpp",
	"css",
	"scss",
	"less",
	"html",
	"svg",
	"sh",
	"bash",
	"zsh",
	"fish",
	"ps1",
	"bat",
	"cmd",
	"sql",
	"graphql",
	"proto",
	"wasm",
	"lock",
	"cargo",
	"toml",
	"rs",
]);

export function parseFileLocation(
	raw: string,
	cwd?: string,
): FileLocation | null {
	const match = raw.match(/^(.*\.[\w]{1,10})(?::(\d+))?(?::(\d+))?$/);
	if (!match) return null;
	let filePath = match[1];
	const ext = filePath.split(".").pop()?.toLowerCase();
	if (!ext || !FILE_EXTENSIONS.has(ext)) return null;
	// Home expansion is intentionally left to the trusted Rust boundary.
	if (
		!filePath.includes("/") &&
		!filePath.includes("\\") &&
		!filePath.match(/^[A-Za-z]:/)
	) {
		if (cwd) filePath = `${cwd}/${filePath}`;
		else return null;
	}
	return {
		path: filePath.replace(/\\/g, "/"),
		line: match[2] ? Number(match[2]) : undefined,
		column: match[3] ? Number(match[3]) : undefined,
	};
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
	function Terminal(
		{
			pty_id,
			active,
			workingDir,
			onExit,
			onFileSelect,
			onFileLocation,
			onAskAi,
		}: TerminalProps,
		ref,
	) {
		const containerRef = useRef<HTMLDivElement>(null);
		const termRef = useRef<XTerminal | null>(null);
		const fitRef = useRef<FitAddon | null>(null);
		const activeRef = useRef(active);
		activeRef.current = active;
		const onExitRef = useRef(onExit);
		onExitRef.current = onExit;
		const onFileSelectRef = useRef(onFileSelect);
		onFileSelectRef.current = onFileSelect;
		const onFileLocationRef = useRef(onFileLocation);
		onFileLocationRef.current = onFileLocation;
		const onAskAiRef = useRef(onAskAi);
		onAskAiRef.current = onAskAi;
		const workingDirRef = useRef(workingDir);
		workingDirRef.current = workingDir;

		useImperativeHandle(
			ref,
			() => ({
				focus: () => termRef.current?.focus(),
			}),
			[],
		);

		// A full-screen TUI (the embedded Herdr client) only repaints on a real
		// SIGWINCH. Two cases leave the surface blank with a plain resize:
		//   1. First attach — the client's opening frame can be emitted before this
		//      component's pty:output listener is registered (Tauri events are not
		//      buffered), so that frame is lost.
		//   2. Reattach — the fit size can equal the client's current size, so the
		//      resize is a no-op and the client never redraws.
		// Nudge to a distinct size then back so the PTY always sees a real size
		// change and the client redraws the whole screen into xterm.
		const forceRedraw = useCallback(() => {
			const term = termRef.current;
			const fit = fitRef.current;
			if (!activeRef.current || !term || !fit) return;
			fit.fit();
			const { rows, cols } = term;
			if (!rows || !cols) return;
			void resizePty(pty_id, Math.max(1, rows - 1), cols)
				.then(() => resizePty(pty_id, rows, cols))
				.catch(() => {});
		}, [pty_id]);

		useEffect(() => {
			const container = containerRef.current;
			if (!container) return;

			const term = new XTerminal({
				fontFamily: "'Fira Code', 'Noto Sans Mono', monospace",
				fontSize: 13,
				theme: { background: "#1a1a1a", foreground: "#d0d0d0" },
				scrollback: 2000,
				cursorBlink: true,
			});
			const fit = new FitAddon();
			term.loadAddon(fit);
			term.open(container);
			fit.fit();

			termRef.current = term;
			fitRef.current = fit;

			term.registerLinkProvider({
				provideLinks(lineNum, callback) {
					const line = term.buffer.active.getLine(lineNum - 1);
					if (!line) {
						callback(undefined);
						return;
					}
					const text = line.translateToString(true);
					FILE_PATH_RE.lastIndex = 0;
					const links: {
						range: IBufferRange;
						text: string;
						activate: (_e: MouseEvent, text: string) => void;
						leave: () => void;
						hover: () => void;
						dispose: () => void;
					}[] = [];
					let match = FILE_PATH_RE.exec(text);
					while (match !== null) {
						const resolved = parseFileLocation(match[0], workingDirRef.current);
						if (resolved) {
							const startCol = match.index + 1;
							const endCol = startCol + match[0].length;
							links.push({
								range: {
									start: { x: startCol, y: lineNum },
									end: { x: endCol, y: lineNum },
								},
								text: match[0],
								activate(e, linkText) {
									const location = parseFileLocation(
										linkText,
										workingDirRef.current,
									);
									if (!location) return;
									// Alt+click → ask the conversation rail about this file;
									// plain click → open it in the document viewer.
									if (e.altKey && onAskAiRef.current) {
										onAskAiRef.current(location.path);
									} else {
										onFileLocationRef.current?.(location);
										onFileSelectRef.current?.(location.path);
									}
								},
								leave() {},
								hover() {},
								dispose() {},
							});
						}
						match = FILE_PATH_RE.exec(text);
					}
					callback(links.length > 0 ? links : undefined);
				},
			});

			let cancelled = false;
			const pendingUnlistens: Array<() => void> = [];
			let observer: ResizeObserver | null = null;

			const outputListener = listen<string>(`pty:output:${pty_id}`, (e) => {
				term.write(e.payload);
			});
			const exitListener = listen<void>(`pty:exit:${pty_id}`, () => {
				if (cancelled) return;
				if (termRef.current) {
					termRef.current.write(
						`\r\n[${t("workspace.terminalProcessExited")}]\r\n`,
					);
				}
				onExitRef.current(pty_id);
			});

			const onDataDisposer = term.onData((data) => {
				writePty(pty_id, data).catch((e) => {
					Logger.warn("Terminal", "pty_write error", { error: String(e) });
				});
			});

			// A PTY can emit its first frame before this component mounts (notably when
			// the embedded Herdr client is reused). Register both listeners first, then
			// send SIGWINCH through pty_resize so full-screen TUIs redraw into xterm.
			Promise.all([outputListener, exitListener]).then((unlistens) => {
				if (cancelled) {
					for (const unlisten of unlistens) unlisten();
					return;
				}
				pendingUnlistens.push(...unlistens);
				const fitAndResize = () => {
					if (!activeRef.current || !fitRef.current || !termRef.current) return;
					fitRef.current.fit();
					const { rows, cols } = termRef.current;
					if (!rows || !cols) return;
					resizePty(pty_id, rows, cols).catch(() => {});
				};
				observer = new ResizeObserver(fitAndResize);
				observer.observe(container);
				// Initial attach: force a redraw so a lost opening frame cannot leave
				// the Herdr surface blank. Ongoing user-driven resizes go through
				// fitAndResize (real size changes already trigger a repaint).
				forceRedraw();
			});

			return () => {
				cancelled = true;
				observer?.disconnect();
				for (const fn of pendingUnlistens) fn();
				onDataDisposer.dispose();
				termRef.current = null;
				fitRef.current = null;
				term.dispose();
			};
		}, [pty_id, forceRedraw]);

		useEffect(() => {
			if (!active) return;
			// Switching back to the Herdr surface reattaches the same client; force a
			// redraw so a no-op resize cannot leave the restored surface blank.
			const id = setTimeout(forceRedraw, 50);
			return () => clearTimeout(id);
		}, [active, forceRedraw]);

		return (
			<div
				ref={containerRef}
				className="workspace-panel__terminal"
				style={active ? undefined : { opacity: 0, pointerEvents: "none" }}
			/>
		);
	},
);
