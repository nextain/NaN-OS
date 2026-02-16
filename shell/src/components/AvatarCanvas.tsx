import type { VRM } from "@pixiv/three-vrm";
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
	Vector3,
	WebGLRenderer,
} from "three";
import { randFloat } from "three/src/math/MathUtils.js";
import { Logger } from "../lib/logger";
import {
	clipFromVRMAnimation,
	loadVRMAnimation,
	reAnchorRootPositionTrack,
} from "../lib/vrm/animation";
import { loadVrm } from "../lib/vrm/core";
import { randomSaccadeInterval } from "../lib/vrm/eye-motions";
import { useAvatarStore } from "../stores/avatar";

const LOOK_AT_TARGET = { x: 0, y: 0, z: -1 };
const MAX_DELTA = 0.05;

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

function updateBlink(vrm: VRM, delta: number, state: AnimationState) {
	if (!vrm.expressionManager) return;

	state.timeSinceLastBlink += delta;

	if (!state.isBlinking && state.timeSinceLastBlink >= state.nextBlinkTime) {
		state.isBlinking = true;
		state.blinkProgress = 0;
	}

	if (state.isBlinking) {
		state.blinkProgress += delta / BLINK_DURATION;
		const blinkValue = Math.sin(Math.PI * state.blinkProgress);
		vrm.expressionManager.setValue("blink", blinkValue);

		if (state.blinkProgress >= 1) {
			state.isBlinking = false;
			state.timeSinceLastBlink = 0;
			vrm.expressionManager.setValue("blink", 0);
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

export function AvatarCanvas() {
	const containerRef = useRef<HTMLDivElement>(null);
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

		// Renderer
		const renderer = new WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(container.clientWidth, container.clientHeight);
		container.appendChild(renderer.domElement);

		// Scene with gradient background
		const scene = new Scene();
		const bgCanvas = document.createElement("canvas");
		bgCanvas.width = 2;
		bgCanvas.height = 512;
		const ctx = bgCanvas.getContext("2d");
		if (ctx) {
			const grad = ctx.createLinearGradient(0, 0, 0, 512);
			grad.addColorStop(0, "#1a1412"); // dark top
			grad.addColorStop(0.5, "#2b2220"); // mid warm
			grad.addColorStop(1, "#3b2f2f"); // espresso bottom
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, 2, 512);
		}
		scene.background = new CanvasTexture(bgCanvas);

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

		// Render loop
		function tick() {
			if (disposed) return;
			frameId = requestAnimationFrame(tick);

			const delta = Math.min(clock.getDelta(), MAX_DELTA);

			if (mixer) {
				mixer.update(delta);
			}

			if (vrm) {
				vrm.humanoid?.update();
				updateBlink(vrm, delta, animState);
				updateSaccade(vrm, delta, animState);
				vrm.expressionManager?.update();
				vrm.springBoneManager?.update(delta);
			}

			renderer.render(scene, camera);
		}

		async function init() {
			Logger.info("AvatarCanvas", "Loading VRM model", { modelPath });

			const result = await loadVrm(modelPath, {
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
			Logger.info("AvatarCanvas", "VRM model loaded", {
				center: `${result.modelCenter.x.toFixed(2)},${result.modelCenter.y.toFixed(2)},${result.modelCenter.z.toFixed(2)}`,
			});

			camera.position.set(
				result.modelCenter.x + result.initialCameraOffset.x,
				result.modelCenter.y + result.initialCameraOffset.y,
				result.modelCenter.z + result.initialCameraOffset.z,
			);
			camera.lookAt(result.modelCenter);

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
		/>
	);
}
