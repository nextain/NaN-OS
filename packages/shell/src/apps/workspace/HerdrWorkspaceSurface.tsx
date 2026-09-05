import { type RefObject, Suspense, lazy, useState } from "react";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { t } from "../../lib/i18n";
import { DocTabBar } from "./DocTabBar";
import type { EditorHandle } from "./Editor";
import type {
	FileLocation,
	TerminalHandle,
} from "./Terminal";
import { type HerdrSnapshot, focusedHerdrAgent } from "./herdr";
import type { HerdrSurface, PtyCreated } from "./useHerdrRuntime";

const loadEditor = () =>
	import("./Editor").then((module) => ({ default: module.Editor }));

const LazyTerminal = lazy(() =>
	import("./Terminal").then((module) => ({ default: module.Terminal })),
);

interface SurfaceProps {
	pty: PtyCreated | null;
	launching: boolean;
	launchError: string;
	snapshot: HerdrSnapshot | null;
	snapshotError: string;
	terminalReady: boolean;
	terminalError: string;
	surface: HerdrSurface;
	workspaceRoot: string;
	terminalRef: RefObject<TerminalHandle>;
	editorRef: RefObject<EditorHandle>;
	openDocs: string[];
	openFilePath: string;
	launchHerdr: () => Promise<void>;
	retryHerdr: () => Promise<void>;
	onTerminalReady: () => void;
	showHerdr: () => void;
	onPtyExit: () => void;
	openLocation: (location: FileLocation) => Promise<void>;
	setOpenFilePath: (path: string) => void;
	closeDoc: (path: string) => void;
	sendToNaia: (path: string) => void;
	editorLoader?: typeof loadEditor;
}

export function HerdrWorkspaceSurface(props: SurfaceProps) {
	const focused = focusedHerdrAgent(props.snapshot);
	const editorLoader = props.editorLoader ?? loadEditor;
	const [editorLoadAttempt, setEditorLoadAttempt] = useState(0);
	const [LazyEditor, setLazyEditor] = useState(() => lazy(editorLoader));
	const retryEditorLoad = () => {
		setLazyEditor(lazy(editorLoader));
		setEditorLoadAttempt((attempt) => attempt + 1);
	};
	return (
		<main className="herdr-workspace__main">
			<div
				className="herdr-workspace__terminal-layer"
				aria-hidden={props.surface !== "herdr"}
			>
				{props.pty ? (
					<Suspense fallback={null}>
						<LazyTerminal
							ref={props.terminalRef}
							pty_id={props.pty.pty_id}
							active={props.surface === "herdr"}
							workingDir={
								focused?.foreground_cwd || focused?.cwd || props.workspaceRoot
							}
							onExit={props.onPtyExit}
							onReady={props.onTerminalReady}
							onFileLocation={(location) => void props.openLocation(location)}
						/>
					</Suspense>
				) : (
					<div className="herdr-workspace__state">
						<span>
							{props.launchError ||
								(props.launching
									? t("workspace.herdrStarting")
									: t("workspace.herdrExited"))}
						</span>
						{!props.launching && (
							<button type="button" onClick={props.launchHerdr}>
								{t("workspace.herdrRetry")}
							</button>
						)}
					</div>
				)}
				{props.pty && !props.terminalReady && (
					<div
						className="herdr-workspace__state herdr-workspace__state--overlay"
						role={props.terminalError ? "alert" : "status"}
						aria-live="polite"
					>
						<span>{props.terminalError || t("workspace.herdrStarting")}</span>
						{props.terminalError && (
							<button type="button" onClick={props.retryHerdr}>
								{t("workspace.herdrRetry")}
							</button>
						)}
					</div>
				)}
			</div>
			{props.surface === "viewer" && props.openFilePath && (
				<div className="herdr-workspace__viewer" data-testid="workspace-viewer">
					<div className="herdr-workspace__viewer-bar">
						<button
							type="button"
							onClick={props.showHerdr}
							aria-label={t("workspace.herdrBackLabel")}
						>
							{t("workspace.herdrBack")}
						</button>
						<DocTabBar
							docs={props.openDocs}
							activeDoc={props.openFilePath}
							onSelect={props.setOpenFilePath}
							onClose={props.closeDoc}
							onAskAi={props.sendToNaia}
						/>
					</div>
					<div className="herdr-workspace__editor">
						<ErrorBoundary
							key={editorLoadAttempt}
							scope="HerdrWorkspaceEditor"
							fallback={
								<div className="herdr-workspace__state" role="alert">
									<span>{t("workspace.editorLoadError")}</span>
									<button type="button" onClick={retryEditorLoad}>
										{t("common.retry")}
									</button>
								</div>
							}
						>
							<Suspense
								fallback={
									<output className="herdr-workspace__state">
										{t("workspace.editorLoading")}
									</output>
								}
							>
								<LazyEditor
									ref={props.editorRef}
									filePath={props.openFilePath}
								/>
							</Suspense>
						</ErrorBoundary>
					</div>
				</div>
			)}
			{props.snapshotError && (
				<div className="herdr-workspace__warning">
					{t("workspace.herdrSync")}: {props.snapshotError}
				</div>
			)}
		</main>
	);
}
