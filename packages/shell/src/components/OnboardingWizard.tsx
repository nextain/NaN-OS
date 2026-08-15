import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import {
	buildNaiaConfigEnv,
	getAdkPath,
	listNaiaAssets,
	toAssetUrl,
	toLocalBlobUrl,
	writeAgentKey,
	writeNaiaConfig,
} from "../lib/adk-store";
import {
	DEFAULT_NVA_MODEL,
	isLegacyBundledVrmModel,
} from "../lib/avatar-presets";
import { detectGpuVramGb } from "../lib/capabilities/gpu";
import {
	isNewCore,
	reloadAgentSettings,
	sendAuthUpdate,
} from "../lib/chat-service";
import {
	type AppConfig,
	DEFAULT_LOCAL_VOICE_HOST,
	NAIA_WEB_BASE_URL,
	loadConfig,
	saveConfigSecure,
} from "../lib/config";
import { getLocale, t } from "../lib/i18n";
import {
	defaultClipOf,
	parseNvaManifest,
	resolveNvaAssetPath,
} from "../lib/nva";
import { OAUTH_CALLBACK_URL } from "../lib/oauth-callback-url";
import {
	type OnboardingSession,
	type StepInput,
	makeOnboardingSession,
} from "../lib/onboarding-core";
import { NAIA_SLOT_DEFAULTS, applyNaiaSlotDefaults } from "../lib/slots/model";
import { localVoiceFacadeUrlFromReady } from "../lib/voice/local-runtime";
import { useAppStore } from "../stores/app";
import { useAvatarStore } from "../stores/avatar";
import { useCascadeAvatarStore } from "../stores/cascade-avatar";
import { useChatStore } from "../stores/chat";

type Step =
	| "welcome"
	| "agentName"
	| "userName"
	| "speechStyle"
	| "character"
	| "background"
	| "provider"
	| "voice"
	| "complete";

const STEPS_WITHOUT_NAIA: Step[] = [
	"welcome",
	"agentName",
	"userName",
	"speechStyle",
	"character",
	"background",
	"provider",
	"voice",
	"complete",
];

const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "ogg", "avi"]);
function isVideo(url: string) {
	return VIDEO_EXTS.has(
		url.split("?")[0].split(".").pop()?.toLowerCase() ?? "",
	);
}

function stepChat(step: Step, name: string, user: string): string {
	const n = name || "나이아";
	const u = user ? `${user}님` : "";
	switch (step) {
		case "welcome":
			return "안녕하세요! 시작하기 전에 잠깐 확인해 주세요 😊";
		case "agentName":
			return "안녕하세요! 저는 나이아예요. 제 이름을 지어주세요! ✨";
		case "userName":
			return `${n}! 정말 좋은 이름이에요. 그럼 저는 당신을 어떻게 부를까요?`;
		case "speechStyle":
			return `${u || ""}! 어떤 말투로 대화할까요? 편한 걸 골라주세요 😊`;
		case "character":
			return "제 외모를 골라주세요! 마음에 드는 캐릭터가 있나요? 🌸";
		case "background":
			return "배경화면도 함께 골라볼까요? 클릭하면 바로 바뀌어요! 🌟";
		case "provider":
			return "거의 다 왔어요! 저의 두뇌를 연결해 주세요 🧠";
		case "voice":
			return "제 목소리도 골라주세요! 마음에 드는 음성을 미리 들어볼 수 있어요 🎙️";
		case "complete":
			return `${u ? u + ", " : ""}준비 완료! ${n}와 함께 시작해요! 🎉`;
	}
}

interface BgOption {
	url: string;
	label: string;
	path: string;
	type: "image" | "video" | "";
}

interface NaiaAuthPayload {
	naiaKey: string;
	naiaUserId?: string;
}

interface OnboardingSnapshot {
	agentName: string;
	userName: string;
	speechStyle: "casual" | "formal";
	honorific: string;
	extraPersona: string;
	selectedVrm: string;
	avatarProvider: "vrm" | "naia-video-avatar";
	selectedNva: string;
	backgrounds: BgOption[];
	selectedBg: string;
	naiaLoginDone: boolean;
	memoryEmbeddingProvider: "none" | "offline" | "vllm" | "ollama" | "naia";
	memoryLlmProvider: "none" | "naia" | "vllm" | "ollama";
	ttsEnabled: boolean;
	webVoiceLang: string;
	localVoiceEnabled: boolean;
}

function BackgroundThumbnail({
	background,
	className = "onboarding-step__bg-img",
}: {
	background: BgOption;
	className?: string;
}) {
	const [capturedFrame, setCapturedFrame] = useState("");

	useEffect(() => {
		if (background.type !== "video") return;
		const video = document.createElement("video");
		video.src = background.url;
		video.muted = true;
		video.preload = "auto";
		video.playsInline = true;
		let settled = false;
		const cleanup = () => {
			video.removeAttribute("src");
			video.load();
		};
		const capture = () => {
			if (settled || !video.videoWidth || !video.videoHeight) return;
			settled = true;
			const canvas = document.createElement("canvas");
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			canvas.getContext("2d")?.drawImage(video, 0, 0);
			try {
				setCapturedFrame(canvas.toDataURL("image/jpeg", 0.82));
			} catch {
				// asset:// may be canvas-tainted on some WebView2 versions.
			}
			cleanup();
		};
		video.onloadeddata = () => {
			const seekTo = Number.isFinite(video.duration)
				? Math.min(0.25, Math.max(0, video.duration / 20))
				: 0;
			if (seekTo > 0) video.currentTime = seekTo;
			else capture();
		};
		video.onseeked = capture;
		video.onerror = cleanup;
		video.load();
		return cleanup;
	}, [background.type, background.url]);

	if (capturedFrame) {
		return (
			<img src={capturedFrame} alt={background.label} className={className} />
		);
	}
	return (
		// #447-2: when the single-frame capture can't produce a still (e.g. a VP9
		// alpha .webm whose early frames are transparent, or a tainted canvas), a
		// metadata-only <video> paints nothing and the tile looks empty. Autoplay a
		// muted loop so the avatar/background is always visible in the grid.
		<video
			src={background.url}
			className={className}
			muted
			loop
			autoPlay
			preload="metadata"
			playsInline
			aria-label={background.label}
		/>
	);
}

function NvaThumbnail({ path, label }: { path: string; label: string }) {
	const [preview, setPreview] = useState<BgOption | null>(null);

	useEffect(() => {
		let disposed = false;
		const adkPath = getAdkPath();
		if (!adkPath) return;
		const sep = adkPath.includes("\\") ? "\\" : "/";
		const bundleDir =
			path.includes("/") || path.includes("\\")
				? path
				: `${adkPath}${sep}naia-settings${sep}nva-files${sep}${path}`;
		void invoke<string>("read_local_binary", {
			path: `${bundleDir}${sep}manifest.json`,
			allowedBase: adkPath,
		})
			.then(async (base64) => {
				const raw = atob(base64);
				const manifest = parseNvaManifest(
					new TextDecoder().decode(
						Uint8Array.from(raw, (char) => char.charCodeAt(0)),
					),
				);
				const clipPath = resolveNvaAssetPath(
					bundleDir,
					defaultClipOf(manifest).video,
				);
				const url = await toLocalBlobUrl(clipPath);
				if (!disposed)
					setPreview({ url, label, path: clipPath, type: "video" });
			})
			.catch(() => {});
		return () => {
			disposed = true;
		};
	}, [label, path]);

	if (!preview) {
		return <span className="onboarding-step__avatar-img" aria-hidden="true" />;
	}
	// #447-2: NVA clips are tall full-body 720×1280 portraits. object-fit alone
	// only picks a vertical band (still shows the whole body). Zoom into the head
	// by oversizing the media inside a fixed, clipped, top-aligned frame.
	return (
		<span className="onboarding-step__avatar-img onboarding-step__nva-crop">
			<BackgroundThumbnail
				background={preview}
				className="onboarding-step__nva-crop-media"
			/>
		</span>
	);
}

function getBackgroundMediaType(path: string): "image" | "video" | "" {
	if (isVideo(path)) return "video";
	const ext = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
	if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) {
		return "image";
	}
	return "";
}

function getNaiaWebBaseUrl() {
	return NAIA_WEB_BASE_URL;
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
	const setAvatarModelPath = useAvatarStore((s) => s.setModelPath);
	const setBackgroundVideoUrl = useAvatarStore((s) => s.setBackgroundVideoUrl);
	const setBackgroundMediaType = useAvatarStore(
		(s) => s.setBackgroundMediaType,
	);
	const addMessage = useChatStore((s) => s.addMessage);

	const hasNaiaKey = !!localStorage.getItem("naia-remote-key");
	// Always use full steps so user can see/confirm the provider connection during onboarding
	const STEPS = STEPS_WITHOUT_NAIA;

	const [step, setStep] = useState<Step>("welcome");
	const [agentName, setAgentName] = useState("");
	const [userName, setUserName] = useState("");
	const [speechStyle, setSpeechStyle] = useState<"casual" | "formal">("casual");
	const [honorific, setHonorific] = useState("");
	const [extraPersona, setExtraPersona] = useState("");
	const [naiaVrms, setNaiaVrms] = useState<string[]>([]);
	const [selectedVrm, setSelectedVrm] = useState("");
	const [naiaNvas, setNaiaNvas] = useState<string[]>([]);
	// 기본 아바타 = NVA(비디오). GPU 없이도 동작하므로 가장 넓은 사용자 도달을 위해
	// 신규 온보딩 기본값으로 밀어준다. VRM 은 명시 선택 시에만.
	const [avatarProvider, setAvatarProvider] = useState<
		"vrm" | "naia-video-avatar"
	>("naia-video-avatar");
	const [selectedNva, setSelectedNva] = useState("");
	const [backgrounds, setBackgrounds] = useState<BgOption[]>([]);
	const [selectedBg, setSelectedBg] = useState("");
	// Provider step state
	const [naiaLoginWaiting, setNaiaLoginWaiting] = useState(false);
	const [naiaLoginDone, setNaiaLoginDone] = useState(hasNaiaKey);
	const [detectedVramGb, setDetectedVramGb] = useState<number | null>(null);
	// Voice step state — default ON with the free Web TTS engine (FR-VOICE onboarding).
	const [ttsEnabled, setTtsEnabled] = useState(true);
	const [webVoiceURI, setWebVoiceURI] = useState("");
	const [webVoices, setWebVoices] = useState<SpeechSynthesisVoice[]>([]);
	const [voicePreviewing, setVoicePreviewing] = useState(false);
	const [localVoiceEnabled, setLocalVoiceEnabled] = useState(false);
	const [localVoiceBusy, setLocalVoiceBusy] = useState(false);
	const [localVoiceMsg, setLocalVoiceMsg] = useState("");
	const [localVoiceInstallation, setLocalVoiceInstallation] = useState<{
		canStart: boolean;
		ready: boolean;
		summary: string;
	} | null>(null);
	// Auth payload from OAuth — held until wizard completes
	const [naiaAuthPayload, setNaiaAuthPayload] =
		useState<NaiaAuthPayload | null>(null);
	const [completing, setCompleting] = useState(false);
	const [completionError, setCompletionError] = useState("");
	// memoryAI step state — default to "naia" when Naia key already present
	const [memoryEmbeddingProvider, setMemoryEmbeddingProvider] = useState<
		"none" | "offline" | "vllm" | "ollama" | "naia"
	>(hasNaiaKey ? "naia" : "none");
	const [memoryLlmProvider, setMemoryLlmProvider] = useState<
		"none" | "naia" | "vllm" | "ollama"
	>(hasNaiaKey ? "naia" : "none");
	const naiaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestRef = useRef<OnboardingSnapshot | null>(null);
	const onboardingGpuSummary =
		detectedVramGb != null
			? t("onboard.connect.vramDetected").replace(
					"{vram}",
					String(detectedVramGb),
				)
			: t("onboard.connect.vramUnknown");
	const onboardingGpuRecommendation =
		detectedVramGb != null
			? t("onboard.connect.localVoiceAvailable")
			: t("onboard.connect.vramCloud");

	useEffect(() => {
		detectGpuVramGb().then(setDetectedVramGb);
	}, []);

	// Populate the Web TTS voice list. Some platforms (WebView2 included)
	// deliver the real list asynchronously via `onvoiceschanged` instead of
	// synchronously from getVoices() on first call.
	useEffect(() => {
		if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
		const applyVoices = () => {
			const voices = window.speechSynthesis.getVoices();
			if (voices.length === 0) return;
			setWebVoices(voices);
			setWebVoiceURI((current) => {
				if (current && voices.some((voice) => voice.voiceURI === current))
					return current;
				const locale = getLocale();
				const matched =
					voices.find((voice) =>
						voice.lang?.toLowerCase().startsWith(locale),
					) ??
					voices.find((voice) =>
						voice.lang?.toLowerCase().startsWith(locale.split("-")[0]),
					) ??
					voices[0];
				return matched?.voiceURI ?? "";
			});
		};
		applyVoices();
		window.speechSynthesis.onvoiceschanged = applyVoices;
		return () => {
			window.speechSynthesis.onvoiceschanged = null;
		};
	}, []);

	function previewWebVoice() {
		if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
		window.speechSynthesis.cancel();
		const voice = webVoices.find((item) => item.voiceURI === webVoiceURI);
		const utter = new SpeechSynthesisUtterance(t("onboard.voice.previewText"));
		if (voice) utter.voice = voice;
		utter.lang = voice?.lang || getLocale();
		utter.onstart = () => setVoicePreviewing(true);
		utter.onend = () => setVoicePreviewing(false);
		utter.onerror = () => setVoicePreviewing(false);
		window.speechSynthesis.speak(utter);
	}

	async function refreshCascadeInstallationForOnboarding(): Promise<{
		canStart: boolean;
		ready: boolean;
		summary: string;
	} | null> {
		try {
			const status = await invoke<unknown>("cascade_installation_status");
			if (
				!status ||
				typeof status !== "object" ||
				typeof (status as { canStart?: unknown }).canStart !== "boolean" ||
				typeof (status as { ready?: unknown }).ready !== "boolean" ||
				typeof (status as { summary?: unknown }).summary !== "string"
			) {
				return null;
			}
			const installation = status as {
				canStart: boolean;
				ready: boolean;
				summary: string;
			};
			setLocalVoiceInstallation(installation);
			return installation;
		} catch {
			setLocalVoiceInstallation(null);
			return null;
		}
	}

	useEffect(() => {
		if (detectedVramGb != null && detectedVramGb >= 6) {
			void refreshCascadeInstallationForOnboarding();
		}
	}, [detectedVramGb]);

	/**
	 * Actually starts/stops the local VoxCPM2 runtime (same start_cascade /
	 * stop_cascade lifecycle SettingsTab's Voice toggle uses) instead of only
	 * saving a preference flag — a saved-but-never-started flag would be a
	 * false "ready" state (WNV-06).
	 */
	async function toggleLocalVoice() {
		if (localVoiceBusy) return;
		setLocalVoiceMsg("");
		if (localVoiceEnabled) {
			setLocalVoiceBusy(true);
			try {
				await invoke("stop_cascade");
			} catch {
				/* best-effort teardown — onboarding never blocks on this */
			} finally {
				useCascadeAvatarStore.getState().setLocalFacadeUrl(null);
				setLocalVoiceEnabled(false);
				setLocalVoiceBusy(false);
			}
			return;
		}
		if (detectedVramGb == null || detectedVramGb < 6) return;
		setLocalVoiceBusy(true);
		try {
			const installation = await refreshCascadeInstallationForOnboarding();
			if (!installation?.canStart) {
				setLocalVoiceMsg(installation?.summary ?? t("settings.cascadeError"));
				return;
			}
			// A resolved CASCADE_READY payload only proves ports were bound — Rust
			// checks the facade too, so re-confirm readiness the same way
			// SettingsTab's startCascadeAndConfirm does before trusting "ready".
			const ready = await invoke<string>("start_cascade", {
				expectedLoaderProfile: "windows_trt_6g",
			});
			const afterStart = await refreshCascadeInstallationForOnboarding();
			if (!afterStart?.ready) {
				setLocalVoiceMsg(afterStart?.summary ?? t("settings.cascadeError"));
				return;
			}
			useCascadeAvatarStore
				.getState()
				.setLocalFacadeUrl(localVoiceFacadeUrlFromReady(ready));
			setLocalVoiceEnabled(true);
		} catch (error) {
			setLocalVoiceMsg(`${t("settings.cascadeError")}: ${String(error)}`);
		} finally {
			setLocalVoiceBusy(false);
		}
	}

	// UC12 step-flow graft(step2): isNewCore 일 때 assets/단계 전이/auth 를 core 컨트롤러 경유(mirror).
	// React=nav 권위(back/skip 견고), core=forward mirror(draft 누적·순서 불변식·provider-naia 게이트).
	// 영속은 completeWith(snapshot, step1) 유지. 미설정=old 경로 비파괴.
	const newCore = isNewCore();
	const sessionRef = useRef<OnboardingSession | null>(null);
	function core(): OnboardingSession | null {
		if (!newCore) return null;
		if (!sessionRef.current) sessionRef.current = makeOnboardingSession();
		return sessionRef.current;
	}
	// 현재 React state → core StepInput(전진 mirror용; core draft 는 persist 에 안 쓰임 = 값은 상태일관성/게이트용).
	// "voice"는 core-domain(@nextain/naia-os-core onboarding.ts)의 Step 에 없는 셸-전용 단계라 mirror 대상이
	// 아니다 — null 을 반환해 goNext 가 submit 을 건너뛴다(core 상태머신은 이 단계를 모르는 채 비파괴 유지).
	function buildStepInput(s: Step): StepInput | null {
		switch (s) {
			case "welcome":
				return { step: "welcome" };
			case "agentName":
				return { step: "agentName", agentName: agentName.trim() || "나이아" };
			case "userName":
				return {
					step: "userName",
					userName: userName.trim(),
					honorific: honorific.trim() || undefined,
				};
			case "speechStyle":
				return {
					step: "speechStyle",
					speechStyle,
					extraPersona: extraPersona.trim() || undefined,
				};
			case "character":
				return {
					step: "character",
					vrmModel:
						avatarProvider === "vrm" ? selectedVrm || undefined : undefined,
				};
			case "background": {
				const bgPath = backgrounds.find((b) => b.url === selectedBg)?.path;
				return { step: "background", background: bgPath };
			}
			case "provider":
				return {
					step: "provider",
					// naiaLoginDone → nextain(게이트는 onNaiaAuthCallback 가 해제); 아니면 저장 provider 또는 nextain 기본.
					provider: naiaLoginDone
						? "nextain"
						: (loadConfig()?.provider ?? "nextain"),
				};
			case "complete":
				return { step: "complete" };
			case "voice":
				return null;
		}
	}

	const stepIndex = STEPS.indexOf(step);
	const didMount = useRef(false);
	const transitioning = useRef(false);

	useEffect(() => {
		latestRef.current = {
			agentName,
			userName,
			speechStyle,
			honorific,
			extraPersona,
			selectedVrm,
			avatarProvider,
			selectedNva,
			backgrounds,
			selectedBg,
			naiaLoginDone,
			memoryEmbeddingProvider,
			memoryLlmProvider,
			ttsEnabled,
			webVoiceLang:
				webVoices.find((voice) => voice.voiceURI === webVoiceURI)?.lang ?? "",
			localVoiceEnabled,
		};
	});

	// Load VRM list from naia-settings (newCore: core 가 LISTING 소유 → path 만 사용)
	useEffect(() => {
		const c = core();
		const load = c
			? c.assets("vrm-files").then((refs) => refs.map((r) => r.path))
			: listNaiaAssets("vrm-files");
		load
			.then((paths) => {
				const vrms = paths.filter((p) => p.toLowerCase().endsWith(".vrm"));
				setNaiaVrms(vrms);
				if (vrms.length > 0) {
					setSelectedVrm((prev) => {
						const savedFilename = prev.split(/[/\\]/).pop() ?? "";
						const isInstalled = vrms.some(
							(path) => path.split(/[/\\]/).pop() === savedFilename,
						);
						return !prev || isLegacyBundledVrmModel(prev) || !isInstalled
							? vrms[0]
							: prev;
					});
				}
			})
			.catch(() => {});
	}, []);

	useEffect(() => {
		listNaiaAssets("nva-files")
			.then((paths) => {
				setNaiaNvas(paths);
				if (paths.length === 0) return;
				// 기본은 나이아 실사(naia) — 목록 순서상 첫 항목(alpha 등)이 아니라
				// DEFAULT_NVA_MODEL 을 우선한다. 없으면 첫 항목으로 폴백.
				const naia = paths.find(
					(p) => p.split(/[/\\]/).pop() === DEFAULT_NVA_MODEL,
				);
				const chosen = naia ?? paths[0];
				let seeded = false;
				setSelectedNva((prev) => {
					if (prev) return prev;
					seeded = true;
					return chosen;
				});
				// #447-2: default provider is NVA — surface the default pick on the
				// live canvas behind the wizard without waiting for a click.
				if (seeded && avatarProvider === "naia-video-avatar") {
					publishAvatarChoice(
						"naia-video-avatar",
						chosen.split(/[/\\]/).pop() ?? chosen,
					);
				}
			})
			.catch(() => {});
	}, []);

	// Reset background on mount
	useEffect(() => {
		if (!didMount.current) {
			didMount.current = true;
			setBackgroundVideoUrl("");
			setBackgroundMediaType("");
		}
	}, [setBackgroundMediaType, setBackgroundVideoUrl]);

	// Load backgrounds from naia-settings (newCore: core LISTING → path; 셸은 path 에서 blob/asset URL 재유도)
	useEffect(() => {
		const c = core();
		const load = c
			? c.assets("background").then((refs) => refs.map((r) => r.path))
			: listNaiaAssets("background");
		load
			.then(async (paths) => {
				const bgs: BgOption[] = await Promise.all(
					paths.map(async (p) => {
						const type = getBackgroundMediaType(p);
						// Videos: use asset:// URL (blob URL crashes WebView2 for large files).
						const url =
							type === "video" ? toAssetUrl(p) : await toLocalBlobUrl(p);
						return {
							url,
							label:
								p
									.split(/[/\\]/)
									.pop()
									?.replace(/\.[^.]+$/, "") ?? p,
							path: p,
							type,
						};
					}),
				);
				setBackgrounds(bgs);
				if (bgs.length > 0) {
					// #447-3: default to naia-dawn-city (matches App DEFAULT_BG_VIDEO).
					// Fall back to the first available background if not found.
					const defaultBg =
						bgs.find((b) => b.path.toLowerCase().includes("dawn-city")) ??
						bgs[0];
					setSelectedBg(defaultBg.url);
				}
			})
			.catch(() => {});
	}, []);

	// Keep a ref to onComplete so the listener never needs to re-register when the
	// parent re-renders (which would create a new function reference each time).
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	// When Naia login completes: 게이트 해제. sub-LLM = naia(Gemini flash-lite 경로),
	// embedding = CPU offline(R2-1). 6슬롯 전체 기본값은 saveCompletedConfig 의 applyNaiaSlotDefaults 가 일괄 적용.
	useEffect(() => {
		if (naiaLoginDone) {
			setMemoryEmbeddingProvider("offline");
			setMemoryLlmProvider("naia");
		}
	}, [naiaLoginDone]);

	// Listen for Naia OAuth callback in provider step.
	// [] dep — register once. onCompleteRef.current always points to latest prop.
	useEffect(() => {
		const unlisten = listen<NaiaAuthPayload>("naia_auth_complete", (event) => {
			if (naiaTimerRef.current) clearTimeout(naiaTimerRef.current);
			localStorage.setItem("naia-remote-key", event.payload.naiaKey);
			if (event.payload.naiaUserId) {
				localStorage.setItem("naia-remote-user-id", event.payload.naiaUserId);
			}
			setNaiaLoginWaiting(false);
			setNaiaLoginDone(true);
			setNaiaAuthPayload(event.payload);
			// Cache before sending so crash-restart can replay the key.
			invoke("store_startup_message", {
				message: JSON.stringify({
					type: "auth_update",
					naiaKey: event.payload.naiaKey,
				}),
			})
				.catch(() => {})
				.then(() => sendAuthUpdate(event.payload.naiaKey).catch(() => {}));
			// core mirror(비파괴 추가): naiaLoginDone=게이트 해제 + NAIA_ANYLLM_API_KEY 키체인
			// (idempotent, completeWith 와 동값). 기존 sendAuthUpdate(런타임 push)·store_startup_message 유지 = 보완.
			void core()
				?.onNaiaAuthCallback(event.payload.naiaKey)
				.catch(() => {});
			// Advance to complete step after Naia login
			setStep("complete");
		});
		return () => {
			unlisten.then((fn) => fn());
			if (naiaTimerRef.current) clearTimeout(naiaTimerRef.current);
		};
	}, []);

	function goNext() {
		if (transitioning.current) return;
		const next = STEPS[stepIndex + 1];
		if (!next) return;
		// core forward mirror(비차단): 떠나는 현재 step 의 input 을 컨트롤러에 제출(draft·순서·게이트 행사).
		// 게이트 차단/step-mismatch 시 no-op — UI nav 는 막지 않음(persist=snapshot 무영향).
		// buildStepInput 이 null(core-domain 에 없는 셸-전용 단계, 예: voice)이면 제출을 건너뛴다.
		const stepInput = buildStepInput(step);
		if (stepInput) {
			void core()
				?.submit(stepInput)
				.catch(() => {});
		}
		transitioning.current = true;
		setStep(next);
		setTimeout(() => {
			// "complete" message is added by handleComplete after saving — skip here
			if (next !== "complete") {
				addMessage({
					role: "assistant",
					content: stepChat(
						next,
						agentName.trim() || "나이아",
						userName.trim(),
					),
				});
			}
			transitioning.current = false;
		}, 300);
	}

	function goBack() {
		const prev = STEPS[stepIndex - 1];
		if (!prev) return;
		setStep(prev);
	}

	// #447-2: reflect the avatar choice on the live canvas behind the wizard.
	// A fresh install has no saved config yet during onboarding, so writing to
	// config here would no-op (loadConfig() === null). Instead announce the pick
	// on a dedicated preview event that App applies to the live avatar canvas
	// directly (VRM via the avatar store, NVA via the video canvas). Completion
	// still persists avatarProvider/nvaModel through saveCompletedConfig.
	function publishAvatarChoice(
		provider: "vrm" | "naia-video-avatar",
		model: string,
	) {
		window.dispatchEvent(
			new CustomEvent("naia-avatar-preview", {
				detail: { provider, model },
			}),
		);
	}

	function handleVrmSelect(path: string) {
		setAvatarProvider("vrm");
		setSelectedVrm(path);
		setAvatarModelPath(path);
		publishAvatarChoice("vrm", path.split(/[/\\]/).pop() ?? path);
	}

	function handleNvaSelect(path: string) {
		setAvatarProvider("naia-video-avatar");
		setSelectedNva(path);
		publishAvatarChoice("naia-video-avatar", path.split(/[/\\]/).pop() ?? path);
	}

	function handleBgSelect(url: string) {
		setSelectedBg(url);
		const bg = backgrounds.find((item) => item.url === url);
		setBackgroundMediaType(bg?.type ?? "");
		setBackgroundVideoUrl(url);
	}

	async function handleNaiaLogin() {
		setNaiaLoginWaiting(true);
		naiaTimerRef.current = setTimeout(
			() => setNaiaLoginWaiting(false),
			180_000,
		);
		try {
			const lang = getLocale();
			// Onboarding runs before the browser panel is mounted, so
			// browser_open_login would succeed but the panel can't show.
			// Use the system browser directly instead.
			const state = await invoke<string>("generate_oauth_state").catch(
				() => "",
			);
			const params = new URLSearchParams({
				redirect: "desktop",
				// www.naia.land buildLoginRedirect requires BOTH redirect=desktop
				// AND app=naia-os (2026-05-28 security gate) — without `app` it
				// redirects to /dashboard and the desktop callback never fires.
				app: "naia-os",
				source: "desktop",
				// #341 옵션 B — Linux dev:tauri 에서 naia:// scheme OS 미등록
				// 우회. Rust 측이 127.0.0.1:18792/auth/callback 에서 HTTP 로
				// 받아 동일한 naia_auth_complete 이벤트 emit. 운영 웹 측이
				// redirect_uri 받으면 그 URL 로 redirect; 받지 못해도 기존
				// deep-link path 가 fallback.
				redirect_uri: OAUTH_CALLBACK_URL,
			});
			if (state) params.set("state", state);
			await openUrl(
				`${getNaiaWebBaseUrl()}/${lang}/login?${params.toString()}`,
			);
		} catch {
			setNaiaLoginWaiting(false);
		}
	}

	async function saveCompletedConfig(
		auth?: NaiaAuthPayload,
		snapshot: OnboardingSnapshot = {
			agentName,
			userName,
			speechStyle,
			honorific,
			extraPersona,
			selectedVrm,
			avatarProvider,
			selectedNva,
			backgrounds,
			selectedBg,
			naiaLoginDone,
			memoryEmbeddingProvider,
			memoryLlmProvider,
			ttsEnabled,
			webVoiceLang:
				webVoices.find((voice) => voice.voiceURI === webVoiceURI)?.lang ?? "",
			localVoiceEnabled,
		},
	) {
		// Own-key setup is no longer collected in onboarding (#447-5) — the full
		// Settings screen owns provider + model + key. A fresh install defaults to
		// the Naia account provider; returning users keep their saved config.
		// Typed as a partial so optional carry-over fields (workspaceRoot,
		// ttsProvider) read as `string | undefined` off the fresh-install fallback.
		const base: Partial<AppConfig> = loadConfig() ?? {
			provider: "nextain",
			model: NAIA_SLOT_DEFAULTS.main.model,
		};
		const vrmPath =
			snapshot.avatarProvider === "vrm"
				? snapshot.selectedVrm || naiaVrms[0] || undefined
				: undefined;
		const nvaPath =
			snapshot.avatarProvider === "naia-video-avatar"
				? snapshot.selectedNva || naiaNvas[0] || undefined
				: undefined;
		const selectedBgOption = snapshot.backgrounds.find(
			(bg) => bg.url === snapshot.selectedBg,
		);
		const bgFilename = selectedBgOption?.path.split(/[/\\]/).pop() ?? undefined;

		const speechDesc =
			snapshot.speechStyle === "casual"
				? "casually and warmly"
				: snapshot.speechStyle === "formal"
					? "formally and professionally"
					: "respectfully using honorifics";
		const personaBase = `You are ${snapshot.agentName.trim() || "Naia"}, an AI companion. Speak ${speechDesc}.`;
		const persona = snapshot.extraPersona?.trim()
			? `${personaBase}\n\n${snapshot.extraPersona.trim()}`
			: personaBase;
		// auth(naia 로그인) 시: 6슬롯 Gemini 기본값은 applyNaiaSlotDefaults 가 아래서 일괄 적용.
		// 따라서 auth 시에는 스냅샣 memory provider 를 주입하지 않고(비파괴 기본값 적용이 채움),
		// BYO 시에만 사용자 선택값을 유지한다.
		const completedFlat: Record<string, unknown> = {
			...base,
			provider: auth ? "nextain" : base.provider,
			model: auth ? base.model || NAIA_SLOT_DEFAULTS.main.model : base.model,
			agentName: snapshot.agentName.trim() || "Naia",
			userName: snapshot.userName.trim() || undefined,
			speechStyle: snapshot.speechStyle,
			honorific: snapshot.honorific.trim() || undefined,
			vrmModel: vrmPath,
			avatarProvider: snapshot.avatarProvider,
			nvaModel: nvaPath,
			backgroundVideo: bgFilename,
			persona,
			...(auth ? { naiaKey: auth.naiaKey, naiaUserId: auth.naiaUserId } : {}),
			workspaceRoot: getAdkPath() || base.workspaceRoot || undefined,
			onboardingComplete: true,
			...(snapshot.localVoiceEnabled
				? {
						ttsEnabled: true,
						ttsProvider: "naia-local-voice" as const,
						localVoiceEnabled: true,
						vllmTtsHost: DEFAULT_LOCAL_VOICE_HOST,
					}
				: {
						ttsEnabled: snapshot.ttsEnabled,
						ttsProvider: snapshot.ttsEnabled
							? ("browser" as const)
							: base.ttsProvider,
						...(snapshot.ttsEnabled && snapshot.webVoiceLang
							? { voice: snapshot.webVoiceLang }
							: {}),
					}),
			...(!auth && snapshot.memoryEmbeddingProvider !== "none"
				? { memoryEmbeddingProvider: snapshot.memoryEmbeddingProvider }
				: {}),
			...(!auth && snapshot.memoryLlmProvider !== "none"
				? { memoryLlmProvider: snapshot.memoryLlmProvider }
				: {}),
		};
		// FR-SLOT.3 / R2-1: naia 게이트 통과 시 미설정 슬롯에 Gemini 기본값 자동 적용(비파괴).
		const finalConfig: AppConfig = auth
			? applyNaiaSlotDefaults(completedFlat as unknown as AppConfig)
			: (completedFlat as unknown as AppConfig);
		await saveConfigSecure(finalConfig);

		if (vrmPath) setAvatarModelPath(vrmPath);
		return finalConfig as unknown as Record<string, unknown>;
	}

	async function handleComplete() {
		if (completing) return;
		setCompleting(true);
		setCompletionError("");
		try {
			const completedFlat = await saveCompletedConfig(
				naiaAuthPayload ?? undefined,
			);
			// UC12 graft (isNewCore): 새 core OnboardingController.completeWith(§D 신규계약)가
			// categorize(secret/ui/agent) + persist(secret=키체인 전담, stale-credential fix) + markComplete.
			// 미설정(기본)=기존 writeNaiaConfig/writeAgentKey 경로 보존(비파괴). UC1 chat-service graft 와 동일.
			if (newCore) {
				await core()?.completeWith(completedFlat);
			} else {
				// G-01: sync to naia-settings/config.json so standalone agent picks up the onboarding result.
				const saved = loadConfig();
				if (saved)
					await writeNaiaConfig({
						...(saved as unknown as Record<string, unknown>),
						...buildNaiaConfigEnv(saved),
					});
				// Write naiaKey to OS keychain so standalone naia-agent can read it.
				if (typeof completedFlat.naiaKey === "string")
					await writeAgentKey(
						String(completedFlat.provider || "nextain"),
						"naiaKey",
						completedFlat.naiaKey,
					);
				// (gateway sync 제거됨 2026-06-12 — gateway.json 미사용 죽은 경로. config 영속=naia-settings,
				//  naiaKey=키체인(위 writeAgentKey). own-key(apiKey)=설정 화면 담당. memory 설정 연결=다른 세션 재설계.)
			}
			await reloadAgentSettings();
			if (typeof completedFlat.naiaKey === "string") {
				await sendAuthUpdate(completedFlat.naiaKey);
			}
			addMessage({
				role: "assistant",
				content: stepChat(
					"complete",
					agentName.trim() || "나이아",
					userName.trim(),
				),
			});
			setTimeout(onComplete, 1200);
		} catch (error) {
			setCompletionError(
				getLocale() === "ko"
					? `설정을 적용하지 못했습니다. 다시 시도해 주세요. (${String(error)})`
					: `Could not apply settings. Please try again. (${String(error)})`,
			);
		} finally {
			setCompleting(false);
		}
	}

	// #447-5: "직접 설정" no longer collects a provider-less key inline. It finishes
	// onboarding with the Naia-account default and opens the full Settings screen,
	// which owns provider + model + key selection. setActiveApp persists in the app
	// store, so Settings is focused once the main app mounts after onboarding.
	function handleGoToSettings() {
		useAppStore.getState().setActiveApp("settings");
		void handleComplete();
	}

	const isFirst = stepIndex === 0;
	const isCompleteStep = step === "complete";
	const progressSteps = STEPS.slice(0, -1); // exclude "complete" from dot indicators

	return (
		<div className="onboarding-panel">
			{/* Progress dots */}
			<div className="onboarding-progress">
				{progressSteps.map((s, i) => (
					<div
						key={s}
						className={`onboarding-progress__dot${
							s === step ? " onboarding-progress__dot--active" : ""
						}${i < stepIndex ? " onboarding-progress__dot--done" : ""}`}
					/>
				))}
			</div>

			{/* Step content */}
			<div className="onboarding-step">
				{step === "welcome" && (
					<>
						<h2 className="onboarding-step__title">Naia Alpha</h2>
						<div className="onboarding-welcome">
							<p className="onboarding-welcome__text">
								{t("onboard.welcome.opensourceDesc")}
							</p>
							<div className="onboarding-welcome__badge">⚠ Alpha</div>
							<p className="onboarding-welcome__text">
								{t("onboard.welcome.alphaDesc")}
							</p>
							<button
								type="button"
								className="onboarding-welcome__github-btn"
								onClick={() =>
									import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
										openUrl("https://github.com/nextain/naia-os"),
									)
								}
							>
								{t("onboard.welcome.githubBtn")}
							</button>
							<button
								type="button"
								className="onboarding-welcome__github-btn"
								onClick={() =>
									import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
										openUrl("https://discord.com/invite/FGYJN7auty"),
									)
								}
							>
								{t("onboard.welcome.discordBtn")}
							</button>
							<button
								type="button"
								className="onboarding-welcome__github-btn"
								onClick={() =>
									import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
										openUrl("https://www.naia.land/donation"),
									)
								}
							>
								{t("onboard.welcome.donationBtn")}
							</button>
						</div>
					</>
				)}

				{step === "agentName" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.agentName.title")}
						</h2>
						<input
							className="onboarding-step__input"
							value={agentName}
							onChange={(e) => setAgentName(e.target.value)}
							placeholder="Naia"
							maxLength={20}
							autoFocus
							onKeyDown={(e) => e.key === "Enter" && goNext()}
						/>
						<p className="onboarding-step__hint">
							{t("onboard.agentName.description")}
						</p>
					</>
				)}

				{step === "userName" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.userName.title").replace(
								"{agent}",
								agentName.trim() || "나이아",
							)}
						</h2>
						<input
							className="onboarding-step__input"
							value={userName}
							onChange={(e) => setUserName(e.target.value)}
							placeholder={t("onboard.name.placeholder")}
							maxLength={20}
							autoFocus
							onKeyDown={(e) => e.key === "Enter" && goNext()}
						/>
						<p className="onboarding-step__hint">
							{t("onboard.userName.description")}
						</p>
					</>
				)}

				{step === "speechStyle" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.speechStyle.title").replace(
								"{agent}",
								agentName.trim() || "나이아",
							)}
						</h2>
						<div className="onboarding-step__options">
							{(["casual", "formal"] as const).map((style) => (
								<button
									key={style}
									type="button"
									className={`onboarding-step__option${speechStyle === style ? " onboarding-step__option--selected" : ""}`}
									onClick={() => setSpeechStyle(style)}
								>
									<span className="onboarding-step__option-label">
										{style === "casual"
											? t("onboard.speechStyle.casual")
											: t("onboard.speechStyle.formal")}
									</span>
									<span className="onboarding-step__option-desc">
										{style === "casual"
											? t("onboard.speechStyle.casualDesc")
											: t("onboard.speechStyle.formalDesc")}
									</span>
								</button>
							))}
						</div>
						<input
							className="onboarding-step__input onboarding-step__input--sm"
							value={honorific}
							onChange={(e) => setHonorific(e.target.value)}
							placeholder={t("onboard.speechStyle.honorificPlaceholder")}
							maxLength={10}
						/>
						<textarea
							className="onboarding-step__input onboarding-step__input--persona"
							value={extraPersona}
							onChange={(e) => setExtraPersona(e.target.value)}
							placeholder="추가 페르소나 설정 (선택) — 성격, 말투 스타일, 행동 규칙 등을 자유롭게 입력하세요."
							rows={5}
						/>
					</>
				)}

				{step === "character" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.character.title")
								.replace("{user}", userName.trim() || "")
								.replace("{agent}", agentName.trim() || "나이아")}
						</h2>
						<div className="onboarding-step__avatar-grid">
							{naiaVrms.length === 0 && naiaNvas.length === 0 ? (
								<p className="onboarding-step__hint onboarding-step__hint--warn">
									{t("onboard.character.empty")}
								</p>
							) : (
								<>
									{naiaVrms.map((path) => {
										const filename = path.split(/[/\\]/).pop() ?? path;
										const label = filename.replace(/\.vrm$/i, "");
										const thumb = `/avatars/${filename.replace(/\.vrm$/i, ".webp")}`;
										return (
											<button
												key={path}
												type="button"
												aria-pressed={
													avatarProvider === "vrm" && selectedVrm === path
												}
												className={`onboarding-step__avatar-card${avatarProvider === "vrm" && selectedVrm === path ? " onboarding-step__avatar-card--selected" : ""}`}
												onClick={() => handleVrmSelect(path)}
											>
												<img
													src={thumb}
													className="onboarding-step__avatar-img"
													alt={label}
													onError={(e) => {
														(
															e.currentTarget as HTMLImageElement
														).style.display = "none";
													}}
												/>
												<span className="onboarding-step__avatar-badge">
													VRM
												</span>
												<span className="onboarding-step__avatar-label">
													{label}
												</span>
											</button>
										);
									})}
									{naiaNvas.map((path) => {
										const filename = path.split(/[/\\]/).pop() ?? path;
										const label = filename.replace(/\.nva$/i, "");
										return (
											<button
												key={path}
												type="button"
												aria-pressed={
													avatarProvider === "naia-video-avatar" &&
													selectedNva === path
												}
												className={`onboarding-step__avatar-card${avatarProvider === "naia-video-avatar" && selectedNva === path ? " onboarding-step__avatar-card--selected" : ""}`}
												onClick={() => handleNvaSelect(path)}
											>
												<NvaThumbnail path={path} label={label} />
												<span className="onboarding-step__avatar-badge">
													NVA
												</span>
												<span className="onboarding-step__avatar-label">
													{label}
												</span>
											</button>
										);
									})}
								</>
							)}
						</div>
						<p className="onboarding-step__hint">
							{t("onboard.character.hint")}
						</p>
					</>
				)}

				{step === "background" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.background.title")}
						</h2>
						<div className="onboarding-step__bg-grid">
							{backgrounds.map((bg) => (
								<button
									key={bg.url}
									type="button"
									className={`onboarding-step__bg-card${selectedBg === bg.url ? " onboarding-step__bg-card--selected" : ""}`}
									onClick={() => handleBgSelect(bg.url)}
								>
									{bg.type === "video" ? (
										<BackgroundThumbnail background={bg} />
									) : (
										<img
											src={bg.url}
											alt={bg.label}
											className="onboarding-step__bg-img"
										/>
									)}
									<span className="onboarding-step__bg-label">{bg.label}</span>
								</button>
							))}
						</div>
						<p className="onboarding-step__hint">
							{t("onboard.background.hint")}
						</p>
					</>
				)}

				{step === "provider" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.connect.title")}
						</h2>
						<p className="onboarding-step__hint">
							{t("onboard.connect.description")}
						</p>
						<div className="onboarding-step__provider-done">
							<span className="onboarding-step__provider-check">
								{t("onboard.connect.gpuBadge")}
							</span>
							<p>
								{onboardingGpuSummary}
								<br />
								{onboardingGpuRecommendation}
								<br />
								{t("onboard.connect.runtimeBoundary")}
							</p>
						</div>
						{naiaLoginDone ? (
							<>
								<div className="onboarding-step__provider-done">
									<span className="onboarding-step__provider-check">
										{t("onboard.connect.okBadge")}
									</span>
									<p>{t("onboard.lab.connected")}</p>
								</div>
								<button
									type="button"
									className="onboarding-step__link onboarding-step__link--muted"
									onClick={goNext}
									style={{ marginTop: 16 }}
								>
									{t("onboard.next")}
								</button>
							</>
						) : (
							<>
								<button
									type="button"
									className="onboarding-step__naia-btn"
									onClick={handleNaiaLogin}
									disabled={naiaLoginWaiting}
									style={{ marginTop: 16, width: "100%" }}
								>
									{naiaLoginWaiting
										? t("onboard.lab.waiting")
										: t("onboard.connect.naiaPath")}
								</button>
								{/* #447-5: own-key/provider setup moved out of onboarding —
								    "직접 설정" finishes onboarding and opens the full Settings
								    screen (provider + model + key) instead of a provider-less
								    inline key box. "나중에 설정" keeps configuring later. */}
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 8,
										marginTop: 12,
									}}
								>
									<button
										type="button"
										className="onboarding-step__link"
										onClick={handleGoToSettings}
									>
										{t("onboard.connect.byoPath")}
									</button>
									<button
										type="button"
										className="onboarding-step__link onboarding-step__link--muted"
										onClick={goNext}
									>
										{t("onboard.connect.setupLater")}
									</button>
								</div>
							</>
						)}
					</>
				)}

				{step === "voice" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.voice.title")}
						</h2>
						<p className="onboarding-step__hint">
							{t("onboard.voice.description")}
						</p>
						<div className="onboarding-step__options">
							<button
								type="button"
								className={`onboarding-step__option${ttsEnabled ? " onboarding-step__option--selected" : ""}`}
								onClick={() => setTtsEnabled(true)}
							>
								<span className="onboarding-step__option-label">
									{t("onboard.voice.on")}
								</span>
							</button>
							<button
								type="button"
								className={`onboarding-step__option${!ttsEnabled ? " onboarding-step__option--selected" : ""}`}
								onClick={() => setTtsEnabled(false)}
							>
								<span className="onboarding-step__option-label">
									{t("onboard.voice.off")}
								</span>
							</button>
						</div>
						{ttsEnabled && webVoices.length > 0 && (
							<div className="onboarding-step__voice-picker">
								<select
									className="onboarding-step__input"
									value={webVoiceURI}
									onChange={(e) => setWebVoiceURI(e.target.value)}
								>
									{webVoices.map((voice) => (
										<option key={voice.voiceURI} value={voice.voiceURI}>
											{voice.name} ({voice.lang})
										</option>
									))}
								</select>
								<button
									type="button"
									className="onboarding-step__link"
									onClick={previewWebVoice}
									disabled={voicePreviewing}
								>
									{voicePreviewing
										? t("onboard.voice.previewing")
										: t("onboard.voice.preview")}
								</button>
							</div>
						)}
						{detectedVramGb != null && detectedVramGb >= 6 && (
							<div className="onboarding-step__provider-done">
								<span className="onboarding-step__provider-check">
									{t("onboard.voice.localBadge")}
								</span>
								<p>{t("onboard.voice.localHint")}</p>
								<button
									type="button"
									className={`onboarding-step__option${localVoiceEnabled ? " onboarding-step__option--selected" : ""}`}
									style={{ marginTop: 8 }}
								onClick={toggleLocalVoice}
								disabled={
									localVoiceBusy || localVoiceInstallation?.canStart !== true
								}
								>
									<span className="onboarding-step__option-label">
										{localVoiceBusy
											? t("onboard.voice.localBusy")
											: localVoiceEnabled
												? t("onboard.voice.localOn")
												: t("onboard.voice.localOff")}
									</span>
								</button>
							{localVoiceMsg && (
									<p className="onboarding-step__hint onboarding-step__hint--warn">
										{localVoiceMsg}
									</p>
								)}
							</div>
						)}
					</>
				)}

				{step === "complete" && (
					<>
						<h2 className="onboarding-step__title">
							{t("onboard.complete.greeting").replace(
								"{name}",
								userName.trim() || "게스트",
							)}
							{localVoiceInstallation?.canStart === false && !localVoiceMsg && (
								<p className="onboarding-step__hint onboarding-step__hint--warn">
									{localVoiceInstallation.summary}
								</p>
							)}
						</h2>
						<p className="onboarding-step__hint">
							{t("onboard.complete.ready").replace(
								"{agent}",
								agentName.trim() || "나이아",
							)}
						</p>
					</>
				)}
			</div>

			{/* Navigation */}
			<div className="onboarding-step__actions">
				{isCompleteStep && completionError && (
					<p
						role="alert"
						className="onboarding-step__hint onboarding-step__hint--warn onboarding-step__completion-error"
					>
						{completionError}
					</p>
				)}
				{!isFirst && !isCompleteStep && (
					<button
						type="button"
						className="onboarding-step__back-btn"
						onClick={goBack}
					>
						{t("onboard.back")}
					</button>
				)}
				{/* Provider step: skip handled internally; other steps show Next/Start */}
				{step !== "provider" && (
					<button
						type="button"
						className="onboarding-step__next-btn"
						onClick={isCompleteStep ? handleComplete : goNext}
						disabled={isCompleteStep && completing}
					>
						{isCompleteStep && completing
							? getLocale() === "ko"
								? "설정 적용 중…"
								: "Applying settings…"
							: isCompleteStep
								? t("onboard.complete.start")
								: t("onboard.next")}
					</button>
				)}
				{step === "provider" && naiaLoginDone && (
					<button
						type="button"
						className="onboarding-step__next-btn"
						onClick={goNext}
					>
						{t("onboard.next")}
					</button>
				)}
			</div>
		</div>
	);
}
