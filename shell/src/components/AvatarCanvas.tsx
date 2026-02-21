import type { VRM } from "@pixiv/three-vrm";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import {
	AmbientLight,
	AnimationMixer,
	CanvasTexture,
	Clock,
	DirectionalLight,
	LoopRepeat,
	Object3D,
	PerspectiveCamera,
	Scene,
	TextureLoader,
	Vector3,
	WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { randFloat } from "three/src/math/MathUtils.js";
import { Logger } from "../lib/logger";
import {
	clipFromVRMAnimation,
	loadVRMAnimation,
	reAnchorRootPositionTrack,
} from "../lib/vrm/animation";
import { loadVrm } from "../lib/vrm/core";
import {
	buildExpressionResolver,
	createEmotionController,
} from "../lib/vrm/expression";
import { randomSaccadeInterval } from "../lib/vrm/eye-motions";
import { createMouthController } from "../lib/vrm/mouth";
import { useAvatarStore } from "../stores/avatar";

const LOOK_AT_TARGET = { x: 0, y: 0, z: -1 };
const MAX_DELTA = 0.05;
const CAMERA_STORAGE_KEY = "naia-camera";

interface SavedCamera {
	px: number;
	py: number;
	pz: number;
	tx: number;
	ty: number;
	tz: number;
}

function loadCameraState(): SavedCamera | null {
	try {
		const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as SavedCamera;
	} catch {
		return null;
	}
}

function saveCameraState(camera: PerspectiveCamera, target: Vector3): void {
	const state: SavedCamera = {
		px: camera.position.x,
		py: camera.position.y,
		pz: camera.position.z,
		tx: target.x,
		ty: target.y,
		tz: target.z,
	};
	localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(state));
}

const BLINK_DURATION = 0.2;
const MIN_BLINK_INTERVAL = 1;
const MAX_BLINK_INTERVAL = 6;

function randomBlinkInterval() {
	return (
		Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL) +
		MIN_BLINK_INTERVAL
	);
}

interface AnimationState {
	isBlinking: boolean;
	blinkProgress: number;
	timeSinceLastBlink: number;
	nextBlinkTime: number;
	nextSaccadeAfter: number;
	fixationTarget: Vector3;
	timeSinceLastSaccade: number;
}

function createAnimationState(): AnimationState {
	return {
		isBlinking: false,
		blinkProgress: 0,
		timeSinceLastBlink: 0,
		nextBlinkTime: randomBlinkInterval(),
		nextSaccadeAfter: -1,
		fixationTarget: new Vector3(),
		timeSinceLastSaccade: 0,
	};
}

function updateBlink(
	vrm: VRM,
	delta: number,
	state: AnimationState,
	blinkName: string,
) {
	if (!vrm.expressionManager) return;

	state.timeSinceLastBlink += delta;

	if (!state.isBlinking && state.timeSinceLastBlink >= state.nextBlinkTime) {
		state.isBlinking = true;
		state.blinkProgress = 0;
	}

	if (state.isBlinking) {
		state.blinkProgress += delta / BLINK_DURATION;
		const blinkValue = Math.sin(Math.PI * state.blinkProgress);
		vrm.expressionManager.setValue(blinkName, blinkValue);

		if (state.blinkProgress >= 1) {
			state.isBlinking = false;
			state.timeSinceLastBlink = 0;
			vrm.expressionManager.setValue(blinkName, 0);
			state.nextBlinkTime = randomBlinkInterval();
		}
	}
}

function updateSaccade(vrm: VRM, delta: number, state: AnimationState) {
	if (!vrm.expressionManager || !vrm.lookAt) return;

	if (state.timeSinceLastSaccade >= state.nextSaccadeAfter) {
		state.fixationTarget.set(
			LOOK_AT_TARGET.x + randFloat(-0.25, 0.25),
			LOOK_AT_TARGET.y + randFloat(-0.25, 0.25),
			LOOK_AT_TARGET.z,
		);
		state.timeSinceLastSaccade = 0;
		state.nextSaccadeAfter = randomSaccadeInterval() / 1000;
	}

	if (!vrm.lookAt.target) {
		vrm.lookAt.target = new Object3D();
	}

	vrm.lookAt.target.position.lerp(state.fixationTarget, 1);
	vrm.lookAt.update(delta);

	state.timeSinceLastSaccade += delta;
}

function setDefaultBackground(scene: Scene) {
	const bgCanvas = document.createElement("canvas");
	bgCanvas.width = 2;
	bgCanvas.height = 512;
	const ctx = bgCanvas.getContext("2d");
	if (ctx) {
		const grad = ctx.createLinearGradient(0, 0, 0, 512);
		grad.addColorStop(0, "#1a1412");
		grad.addColorStop(0.5, "#2b2220");
		grad.addColorStop(1, "#3b2f2f");
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 2, 512);
	}
	scene.background = new CanvasTexture(bgCanvas);
}

export function AvatarCanvas() {
	const containerRef = useRef<HTMLDivElement>(null);
	const debugRef = useRef<HTMLDivElement>(null);
	const modelPath = useAvatarStore((s) => s.modelPath);
	const animationPath = useAvatarStore((s) => s.animationPath);
	const setLoaded = useAvatarStore((s) => s.setLoaded);
	const setLoadProgress = useAvatarStore((s) => s.setLoadProgress);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;
		let frameId = 0;
		const clock = new Clock();
		const animState = createAnimationState();
		let vrm: VRM | null = null;
		let mixer: AnimationMixer | null = null;
		let emotionCtrl: ReturnType<typeof createEmotionController> | null = null;
		let mouthCtrl: ReturnType<typeof createMouthController> | null = null;
		let blinkExprName = "blink";

		// Renderer
		const renderer = new WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(container.clientWidth, container.clientHeight);
		container.appendChild(renderer.domElement);

		// Scene with gradient background
		const scene = new Scene();

		// Load background image (config path or bundled default)
		try {
			const configRaw = localStorage.getItem("naia-config");
			const config = configRaw ? JSON.parse(configRaw) : null;
			const bgSrc = config?.backgroundImage
				? convertFileSrc(config.backgroundImage)
				: "/assets/lounge-sunny.webp";
			const loader = new TextureLoader();
			loader.load(
				bgSrc,
				(texture) => {
					if (!disposed) scene.background = texture;
				},
				undefined,
				() => {
					Logger.warn(
						"AvatarCanvas",
						"Failed to load background image, using gradient",
					);
					setDefaultBackground(scene);
				},
			);
		} catch {
			setDefaultBackground(scene);
		}

		// Lighting — required for VRM MToon/PBR materials
		const ambientLight = new AmbientLight(0xffffff, 0.7);
		scene.add(ambientLight);

		const directionalLight = new DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(0.5, 1.0, 0.5).normalize();
		scene.add(directionalLight);

		// Camera
		const camera = new PerspectiveCamera(
			40,
			container.clientWidth / container.clientHeight,
			0.1,
			100,
		);

		// OrbitControls
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.enablePan = true;
		controls.enableZoom = true;
		controls.minDistance = 0.1;
		controls.maxDistance = 10;
		controls.maxPolarAngle = Math.PI; // no vertical limit
		controls.minPolarAngle = 0;

		// Set initial camera position immediately
		const savedCam = loadCameraState();
		if (savedCam) {
			camera.position.set(savedCam.px, savedCam.py, savedCam.pz);
			controls.target.set(savedCam.tx, savedCam.ty, savedCam.tz);
			Logger.info("AvatarCanvas", "Camera restored from saved state");
		} else {
			camera.position.set(0.0, 1.52, -0.71);
			controls.target.set(-0.02, 1.42, -0.19);
			Logger.info("AvatarCanvas", "Camera set to default position");
		}
		controls.update();

		// Save camera on control change
		let saveTimeout: ReturnType<typeof setTimeout> | null = null;
		controls.addEventListener("change", () => {
			if (saveTimeout) clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				saveCameraState(camera, controls.target);
			}, 500);
		});

		// Render loop
		function tick() {
			if (disposed) return;
			frameId = requestAnimationFrame(tick);

			const delta = Math.min(clock.getDelta(), MAX_DELTA);

			controls.update();

			if (mixer) {
				mixer.update(delta);
			}

			if (vrm) {
				vrm.humanoid?.update();
				updateBlink(vrm, delta, animState, blinkExprName);
				updateSaccade(vrm, delta, animState);
				emotionCtrl?.update(delta);
				mouthCtrl?.update(delta);
				vrm.expressionManager?.update();
				vrm.springBoneManager?.update(delta);
			}

			renderer.render(scene, camera);

			// Debug: show camera position
			if (debugRef.current) {
				const p = camera.position;
				const t = controls.target;
				debugRef.current.textContent =
					`pos: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}\n` +
					`tgt: ${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)}`;
			}
		}

		async function init() {
			// Convert absolute file paths for custom VRM models
			const vrmUrl = modelPath.startsWith("/")
				&& !modelPath.startsWith("/avatars/")
				? convertFileSrc(modelPath)
				: modelPath;
			Logger.info("AvatarCanvas", "Loading VRM model", { modelPath, vrmUrl });

			const result = await loadVrm(vrmUrl, {
				scene,
				lookAt: true,
				onProgress: (progress) => {
					if (progress.lengthComputable) {
						setLoadProgress(progress.loaded / progress.total);
					}
				},
			});

			if (disposed || !result) {
				if (!result) Logger.error("AvatarCanvas", "Failed to load VRM model");
				return;
			}

			vrm = result._vrm;
			emotionCtrl = createEmotionController(vrm);
			mouthCtrl = createMouthController(vrm);

			// Resolve blink expression name for VRM 0.0/1.0 compat
			if (vrm.expressionManager) {
				const resolve = buildExpressionResolver(
					vrm.expressionManager.expressionMap,
				);
				blinkExprName = resolve("blink") ?? "blink";
				const available = Object.keys(vrm.expressionManager.expressionMap);
				Logger.info("AvatarCanvas", "VRM expressions available", {
					count: available.length,
					names: available.join(", "),
					blinkResolved: blinkExprName,
				});
			}

			Logger.info("AvatarCanvas", "VRM model loaded", {
				center: `${result.modelCenter.x.toFixed(2)},${result.modelCenter.y.toFixed(2)},${result.modelCenter.z.toFixed(2)}`,
			});

			const vrmAnimation = await loadVRMAnimation(animationPath);
			if (disposed || !vrmAnimation) return;

			const clip = clipFromVRMAnimation(vrm, vrmAnimation);
			if (clip) {
				reAnchorRootPositionTrack(clip, vrm);
				mixer = new AnimationMixer(vrm.scene);
				const action = mixer.clipAction(clip);
				action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
				action.play();
				Logger.info("AvatarCanvas", "Idle animation started");
			}

			setLoaded(true);
		}

		// Subscribe to isSpeaking changes for lip sync
		let prevSpeaking = false;
		const unsubSpeaking = useAvatarStore.subscribe((state) => {
			if (state.isSpeaking !== prevSpeaking) {
				prevSpeaking = state.isSpeaking;
				mouthCtrl?.setSpeaking(state.isSpeaking);
			}
		});

		// Subscribe to currentEmotion changes for avatar expression
		let prevEmotion: string = "neutral";
		const unsubEmotion = useAvatarStore.subscribe((state) => {
			if (state.currentEmotion !== prevEmotion) {
				prevEmotion = state.currentEmotion;
				emotionCtrl?.setEmotion(state.currentEmotion);
			}
		});

		init();
		clock.start();
		frameId = requestAnimationFrame(tick);

		function onResize() {
			if (disposed || !container) return;
			const w = container.clientWidth;
			const h = container.clientHeight;
			renderer.setSize(w, h);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		}
		window.addEventListener("resize", onResize);

		return () => {
			disposed = true;
			window.removeEventListener("resize", onResize);
			cancelAnimationFrame(frameId);
			unsubSpeaking();
			unsubEmotion();
			mouthCtrl?.stop();
			if (saveTimeout) clearTimeout(saveTimeout);
			// Save camera position on unmount
			saveCameraState(camera, controls.target);
			controls.dispose();
			renderer.dispose();
			if (container.contains(renderer.domElement)) {
				container.removeChild(renderer.domElement);
			}
			Logger.debug("AvatarCanvas", "Disposed");
		};
	}, [modelPath, animationPath, setLoaded, setLoadProgress]);

	return (
		<div
			ref={containerRef}
			style={{ width: "100%", height: "100%", position: "relative" }}
		>
			<div
				ref={debugRef}
				style={{
					position: "absolute",
					bottom: 4,
					left: 4,
					fontSize: 9,
					fontFamily: "monospace",
					color: "rgba(255,255,255,0.5)",
					whiteSpace: "pre",
					pointerEvents: "none",
					zIndex: 1,
				}}
			/>
		</div>
	);
}
