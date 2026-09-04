import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { Document, Page as PdfPage, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { AppCenterProps } from "../../lib/app-registry";
import { appRegistry } from "../../lib/app-registry";
import { t } from "../../lib/i18n";
import { Logger } from "../../lib/logger";
import {
	EMPTY_SLIDE_PRESENTER_STATE,
	boundedDeckContext,
	narrationForPage,
	parseSlideSpeakerNotes,
	reduceSlidePresenter,
} from "../../lib/slide-presenter";
import {
	SLIDE_PRESENTER_SPEECH_RESULT_EVENT,
	type SlidePresenterSpeechResult,
	cancelSlidePresenterSpeech,
	requestSlidePresenterSpeech,
} from "../../lib/slide-presenter-events";
import { useTabSkills } from "../../lib/tab-skills";
import { startSlidesRecording, stopSlidesRecording } from "../../lib/app-sandbox";
import { useAppStore } from "../../stores/app";
import "./slides.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const TAG = "SlidesCenterArea";

export interface SlidesAppApi {
	start: () => void;
	pause: () => void;
	resume: () => void;
	stop: () => void;
	next: () => void;
	previous: () => void;
	goto: (page: number) => void;
}

function stateLabel(mode: string): string {
	const key = `slides.state.${mode}` as Parameters<typeof t>[0];
	return t(key);
}

export function SlidesCenterArea({ naia }: AppCenterProps) {
	const [state, dispatch] = useReducer(
		reduceSlidePresenter,
		EMPTY_SLIDE_PRESENTER_STATE,
	);
	const stateRef = useRef(state);
	stateRef.current = state;
	const [pdfFile, setPdfFile] = useState<File | null>(null);
	const [pdfName, setPdfName] = useState("");
	const [scriptName, setScriptName] = useState("");
	const [speakerNotes, setSpeakerNotes] = useState<Map<number, string>>(
		new Map(),
	);
	const [pageTexts, setPageTexts] = useState<string[]>([]);
	const [viewerWidth, setViewerWidth] = useState(960);
	const viewerRef = useRef<HTMLDivElement>(null);
	const [recording, setRecording] = useState(false);
	const [recordingError, setRecordingError] = useState<string | null>(null);
	const [focusMode, setFocusMode] = useState(false);
	const [notesVisible, setNotesVisible] = useState(true);
	const activeSpeechRef = useRef<string | null>(null);
	const notesRef = useRef(speakerNotes);
	const pageTextsRef = useRef(pageTexts);
	notesRef.current = speakerNotes;
	pageTextsRef.current = pageTexts;

	useTabSkills(viewerRef, naia);

	const currentNarration = useMemo(
		() => narrationForPage(state.page, speakerNotes, pageTexts),
		[state.page, speakerNotes, pageTexts],
	);

	const deckContext = useMemo(
		() => boundedDeckContext(pageTexts, speakerNotes),
		[pageTexts, speakerNotes],
	);

	const cancelSpeech = useCallback(() => {
		const requestId = activeSpeechRef.current;
		activeSpeechRef.current = null;
		cancelSlidePresenterSpeech({
			requestId: requestId ?? undefined,
			generation: stateRef.current.generation,
		});
	}, []);

	const runAction = useCallback(
		(
			action:
				| "start"
				| "pause"
				| "resume"
				| "stop"
				| "next"
				| "previous"
				| "question",
		) => {
			if (["pause", "stop", "next", "previous", "question"].includes(action)) {
				cancelSpeech();
			}
			dispatch({ type: action });
			Logger.info(TAG, "presentation action", {
				action,
				page: stateRef.current.page,
			});
		},
		[cancelSpeech],
	);

	const gotoPage = useCallback(
		(page: number) => {
			cancelSpeech();
			dispatch({ type: "goto", page });
		},
		[cancelSpeech],
	);

	useEffect(() => {
		if (state.mode !== "presenting" || state.speech !== "requested") return;
		const text = currentNarration.trim();
		if (!text) {
			dispatch({
				type: "speech-failed",
				generation: state.generation,
				error: "empty_narration",
			});
			return;
		}
		const requestId = `slides-${state.generation}-${state.page}`;
		activeSpeechRef.current = requestId;
		requestSlidePresenterSpeech({
			requestId,
			generation: state.generation,
			page: state.page,
			text,
		});
		dispatch({ type: "speech-requested", generation: state.generation });
		Logger.info(TAG, "narration requested", {
			page: state.page,
			generation: state.generation,
			characters: text.length,
		});
	}, [
		currentNarration,
		state.generation,
		state.mode,
		state.page,
		state.speech,
	]);

	useEffect(() => {
		const onResult = (event: Event) => {
			const detail = (event as CustomEvent<SlidePresenterSpeechResult>).detail;
			if (!detail || detail.requestId !== activeSpeechRef.current) return;
			activeSpeechRef.current = null;
			if (detail.status === "finished") {
				dispatch({ type: "speech-finished", generation: detail.generation });
				return;
			}
			if (detail.status === "failed") {
				dispatch({
					type: "speech-failed",
					generation: detail.generation,
					error: detail.error ?? "speech_failed",
				});
			}
		};
		window.addEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
		return () => {
			window.removeEventListener(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, onResult);
			cancelSpeech();
		};
	}, [cancelSpeech]);

	useEffect(() => {
		const element = viewerRef.current;
		if (!element) return;
		const update = () =>
			setViewerWidth(Math.max(280, element.clientWidth - 32));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (window.parent === window) return;
		const onMessage = (event: MessageEvent) => {
			if (event.source !== window.parent || event.data?.type !== "naia-slides:speech-result") return;
			window.dispatchEvent(new CustomEvent(SLIDE_PRESENTER_SPEECH_RESULT_EVENT, { detail: event.data.detail }));
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (window.parent === window && useAppStore.getState().activeApp !== "slides") return;
			if (
				(event.target as HTMLElement | null)?.matches("input, textarea, select")
			)
				return;
			if (["ArrowRight", "PageDown"].includes(event.key)) {
				event.preventDefault();
				runAction("next");
			} else if (["ArrowLeft", "PageUp"].includes(event.key)) {
				event.preventDefault();
				runAction("previous");
			} else if (event.key === " ") {
				event.preventDefault();
				runAction(stateRef.current.mode === "presenting" ? "pause" : "resume");
			} else if (event.key === "Escape") {
				runAction("stop");
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [runAction]);

	useEffect(() => {
		const onFocusShortcut = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "f") return;
			if ((event.target as HTMLElement | null)?.matches("input, textarea, select")) return;
			event.preventDefault();
			setFocusMode((focused) => !focused);
		};
		window.addEventListener("keydown", onFocusShortcut);
		return () => window.removeEventListener("keydown", onFocusShortcut);
	}, []);
	useEffect(() => {
		const context = {
			type: "slides",
			data: {
				fileName: pdfName,
				scriptName,
				state: state.mode,
				page: state.page,
				totalPages: state.totalPages,
				currentSlideText: pageTexts[state.page - 1] ?? "",
				currentSpeakerNote: currentNarration,
				deckContext,
			},
		};
		naia.pushContext(context);
	}, [
		currentNarration,
		deckContext,
		naia,
		pageTexts,
		pdfName,
		scriptName,
		state.mode,
		state.page,
		state.totalPages,
	]);

	useEffect(() => {
		const unsubscribe = naia.onToolCall(
			"skill_slide_presenter",
			async (args) => {
				const action = String(args.action ?? "status");
				const current = stateRef.current;
				if (action === "goto") {
					gotoPage(Number(args.page ?? current.page));
				} else if (action === "get_context") {
					return JSON.stringify({
						page: current.page,
						totalPages: current.totalPages,
						state: current.mode,
						currentSlideText: pageTextsRef.current[current.page - 1] ?? "",
						currentSpeakerNote: narrationForPage(
							current.page,
							notesRef.current,
							pageTextsRef.current,
						),
						deckContext: boundedDeckContext(
							pageTextsRef.current,
							notesRef.current,
						),
					});
				} else if (
					action !== "status" &&
					[
						"start",
						"pause",
						"resume",
						"stop",
						"next",
						"previous",
						"question",
					].includes(action)
				) {
					runAction(
						action as
							| "start"
							| "pause"
							| "resume"
							| "stop"
							| "next"
							| "previous"
							| "question",
					);
				}
				const next = stateRef.current;
				return JSON.stringify({
					ok: next.totalPages > 0,
					state: next.mode,
					page: next.page,
					totalPages: next.totalPages,
				});
			},
		);
		return unsubscribe;
	}, [gotoPage, naia, runAction]);

	useEffect(() => {
		if (window.parent !== window) return;
		appRegistry.updateApi("slides", {
			start: () => runAction("start"),
			pause: () => runAction("pause"),
			resume: () => runAction("resume"),
			stop: () => runAction("stop"),
			next: () => runAction("next"),
			previous: () => runAction("previous"),
			goto: gotoPage,
		});
		return () => appRegistry.updateApi("slides", undefined);
	}, [gotoPage, runAction]);

	async function loadScript(file: File) {
		const markdown = await file.text();
		setSpeakerNotes(parseSlideSpeakerNotes(markdown));
		setScriptName(file.name);
		Logger.info(TAG, "speaker script loaded", { fileName: file.name });
	}

	async function toggleRecording() {
		try {
			setRecordingError(null);
			if (!recording) {
				await startSlidesRecording();
				setRecording(true);
				return;
			}
			const output = await stopSlidesRecording();
			setRecording(false);
			const fileName = output.split(/[\\/]/).pop();
			if (fileName) await naia.openInWorkspace?.(`video/${fileName}`);
		} catch (error) {
			setRecording(false);
			setRecordingError(String(error));
		}
	}

	return (
		<section
			className="slides-app"
			aria-label={t("slides.title")}
			data-focus={focusMode}
			data-state={state.mode}
			data-notes-visible={notesVisible}
		>
			<header className="slides-app__header">
				<div>
					<h1>{t("slides.title")}</h1>
					<p>{t("slides.subtitle")}</p>
				</div>
				<div className="slides-app__file-actions">
					<label className="slides-app__file-button">
						{t("slides.openPdf")}
						<input
							aria-label={t("slides.openPdf")}
							type="file"
							accept="application/pdf,.pdf"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								if (!file) return;
								cancelSpeech();
								setPdfFile(file);
								setPdfName(file.name);
								setPageTexts([]);
								dispatch({ type: "load" });
								Logger.info(TAG, "PDF selected", {
									fileName: file.name,
									bytes: file.size,
								});
							}}
						/>
					</label>
					<label className="slides-app__file-button slides-app__file-button--secondary">
						{t("slides.openScript")}
						<input
							aria-label={t("slides.openScript")}
							type="file"
							accept="text/markdown,text/plain,.md,.txt"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								if (file) void loadScript(file);
							}}
						/>
					</label>
				<button
					type="button"
					className="slides-app__focus-button"
					onClick={() => setFocusMode((focused) => !focused)}
				>
					{focusMode ? t("slides.focusExit") : t("slides.focusStart")}
				</button>
				</div>
			</header>
				<button
					type="button"
					className="slides-app__focus-button"
					onClick={() => setNotesVisible((visible) => !visible)}
				>
					{notesVisible ? t("slides.notesHide") : t("slides.notesShow")}
				</button>

			<output className="slides-app__status" aria-live="polite">
				<span className="slides-app__state-dot" />
				<strong>{stateLabel(state.mode)}</strong>
				<span>{pdfName || t("slides.noPdf")}</span>
				{scriptName ? <span>{scriptName}</span> : null}
			</output>

			<div className="slides-app__workspace">
				<div
					className="slides-app__viewer"
					ref={viewerRef}
					data-testid="slides-viewer"
				>
					{pdfFile ? (
						<Document
							file={pdfFile}
							onLoadSuccess={async (document) => {
								dispatch({ type: "loaded", totalPages: document.numPages });
								const texts: string[] = [];
								for (let page = 1; page <= document.numPages; page++) {
									const pdfPage = await document.getPage(page);
									const content = await pdfPage.getTextContent();
									texts.push(
										content.items
											.map((item) => ("str" in item ? item.str : ""))
											.join(" ")
											.replace(/\s+/g, " ")
											.trim(),
									);
								}
								setPageTexts(texts);
								Logger.info(TAG, "PDF ready", { pages: document.numPages });
							}}
							onLoadError={(error) => {
								dispatch({
									type: "fail",
									error: String(error.message ?? error),
								});
								Logger.warn(TAG, "PDF load failed", { error: String(error) });
							}}
							loading={
								<div className="slides-app__empty">{t("slides.loading")}</div>
							}
							error={
								<div className="slides-app__empty slides-app__empty--error">
									{t("slides.loadError")}
								</div>
							}
						>
							{state.totalPages > 0 ? (
								<PdfPage
									key={`${pdfName}-${state.page}`}
									pageNumber={state.page}
									width={viewerWidth}
									renderAnnotationLayer={false}
									renderTextLayer={false}
									className="slides-app__page"
								/>
							) : null}
						</Document>
					) : (
						<div className="slides-app__empty">
							<div className="slides-app__empty-icon">▣</div>
							<h2>{t("slides.emptyTitle")}</h2>
							<p>{t("slides.emptyBody")}</p>
						</div>
					)}
				</div>

				<aside className="slides-app__notes" aria-label={t("slides.notes")}>
					<div className="slides-app__progress">
						<span>{t("slides.current")}</span>
						<strong>
							{state.totalPages > 0
								? `${state.page} / ${state.totalPages}`
								: "—"}
						</strong>
					</div>
					<h2>{t("slides.notes")}</h2>
					<p data-testid="slides-current-note">
						{state.totalPages > 0 ? currentNarration : t("slides.noNotes")}
					</p>
					<div className="slides-app__shortcuts">
						<span>← →</span>
						<span>{t("slides.shortcutNavigate")}</span>
						<span>Space</span>
						<span>{t("slides.shortcutPause")}</span>
					</div>
				</aside>
			</div>

			<footer
				className="slides-app__controls"
				aria-label={t("slides.controls")}
			>
				<button
					type="button"
					onClick={() => runAction("previous")}
					disabled={state.totalPages === 0 || state.page <= 1}
					aria-label={t("slides.previous")}
				>
					←
				</button>
				<button
					type="button"
					className="slides-app__primary"
					onClick={() =>
						runAction(
							state.mode === "presenting"
								? "pause"
								: state.mode === "paused" || state.mode === "answering"
									? "resume"
									: "start",
						)
					}
					disabled={state.totalPages === 0}
				>
					{state.mode === "presenting"
						? t("slides.pause")
						: state.mode === "paused" || state.mode === "answering"
							? t("slides.resume")
							: t("slides.start")}
				</button>
				<button
					type="button"
					onClick={() => runAction("stop")}
					disabled={state.totalPages === 0}
				>
					{t("slides.stop")}
				</button>
				<button
					type="button"
					onClick={() => runAction("next")}
					disabled={state.totalPages === 0 || state.page >= state.totalPages}
					aria-label={t("slides.next")}
				>
					→
				</button>
				<label className="slides-app__page-input">
					{t("slides.goto")}
					<input
						type="number"
						min={1}
						max={Math.max(1, state.totalPages)}
						value={state.page}
						disabled={state.totalPages === 0}
						onChange={(event) => gotoPage(Number(event.currentTarget.value))}
					/>
				</label>
				<button
					type="button"
					onClick={() => void viewerRef.current?.requestFullscreen()}
					disabled={state.totalPages === 0}
				>
					{t("slides.fullscreen")}
				</button>
				<button
					type="button"
					onClick={() => void toggleRecording()}
					disabled={state.totalPages === 0}
					aria-label={recording ? t("slides.recordStop") : t("slides.recordStart")}
				>
					{recording ? t("slides.recordStop") : t("slides.recordStart")}
				</button>
			</footer>
			{state.error ? (
				<div className="slides-app__error" role="alert">
					{t("slides.speechError")}
				</div>
			) : null}
			{recordingError ? (
				<div className="slides-app__error" role="alert">{recordingError}</div>
			) : null}
		</section>
	);
}
