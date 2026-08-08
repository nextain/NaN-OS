import { type NvaManifest, defaultClipOf, findPrebakedSpeech } from "../nva";
import type {
	AvatarPlaybackOptions,
	AvatarSpeechRenderer,
} from "./avatar-renderer";
import { NvaChromakeyGL } from "./nva-chromakey-gl";

interface Config {
	manifest: NvaManifest;
	locale: string;
	resolveAssetUrl: (path: string) => Promise<string>;
	onSpeaking?: (speaking: boolean) => void;
}

/** contain-fit draw rect (source aspect preserved, letterboxed within target). */
export function containRect(cw: number, ch: number, vw: number, vh: number) {
	if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0)
		return { dx: 0, dy: 0, dw: 0, dh: 0 };
	const scale = Math.min(cw / vw, ch / vh);
	const dw = vw * scale;
	const dh = vh * scale;
	return { dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh };
}

/** WebM alone can carry a real (VP9 yuva420p) alpha channel; other containers cannot. */
export function canCarryAlpha(clipPath: string): boolean {
	return /\.webm$/i.test(clipPath);
}

/**
 * GPU 없는 pre-baked NVA 비디오 재생기. Shell TTS가 오디오 합성·재생의 단일
 * 소유자이며, 이 렌더러는 절대 텍스트를 스스로 합성하지 않는다(브라우저
 * speechSynthesis 자동 폴백 없음). 두 가지만 담당한다:
 *   1) 정확히 일치하는 문구의 저작 클립(자체 녹음 음성 포함) 재생
 *   2) Shell의 실제 재생 시작/종료에 맞춘 idle/talking 비주얼 전환
 *
 * 표시는 숨은 `<video>`(디코드 버퍼)를 매 프레임 `<canvas>`(alpha:true)에 합성한다.
 * WebM 알파 클립은 그대로 drawImage, 알파를 가질 수 없는 컨테이너(mp4 등)는
 * `manifest.chroma_key`(또는 배경색 `background.color`)로 GPU 크로마키 처리해
 * 검은/불투명 배경이 노출되지 않게 한다.
 */
export class PrebakedAvatarRenderer implements AvatarSpeechRenderer {
	private video: HTMLVideoElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private keyer: NvaChromakeyGL | null = null;
	private keyerFailed = false;
	private currentKeyColor: string | undefined;
	private disposed = false;
	private generation = 0;
	private tail = Promise.resolve();
	private raf = 0;
	private running = false;

	constructor(private readonly config: Config) {}

	start(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
		this.video = video;
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d", { alpha: true });
		void this.playIdle();
		this.startDrawLoop();
	}

	async setVoice(): Promise<boolean> {
		return false;
	}

	hasAuthoredClip(text: string): boolean {
		return !!findPrebakedSpeech(this.config.manifest, text, this.config.locale)
			?.localized.clip;
	}

	async playAuthoredClip(
		text: string,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		const operation = this.tail.then(() =>
			this.playAuthoredClipNow(text, options),
		);
		this.tail = operation.catch(() => {});
		return operation;
	}

	private async playAuthoredClipNow(
		text: string,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		if (!this.video || this.disposed) return;
		const match = findPrebakedSpeech(
			this.config.manifest,
			text,
			this.config.locale,
		);
		if (!match?.localized.clip) return;
		const generation = ++this.generation;
		this.config.onSpeaking?.(true);
		try {
			await this.playClip(
				match.localized.clip,
				false,
				options?.muted ?? false,
				options,
			);
		} catch {
			options?.onPlaybackFailure?.();
		} finally {
			if (generation === this.generation && !this.disposed) {
				this.config.onSpeaking?.(false);
				await this.playIdle();
			}
		}
	}

	/** Switch idle/talking visual only. Shell owns the actual audio playback. */
	setSpeakingVisual(active: boolean): void {
		if (!this.video || this.disposed) return;
		this.generation++;
		this.config.onSpeaking?.(active);
		if (active) {
			const clip =
				this.config.manifest.vrm_slots?.visemes?.aiueo?.clip ??
				this.config.manifest.vrm_slots?.motions?.talking?.clip ??
				this.config.manifest.animations.talking?.clip ??
				this.config.manifest.animations.speak?.clip ??
				defaultClipOf(this.config.manifest).video;
			void this.playClip(clip, true, true);
		} else {
			void this.playIdle();
		}
	}

	private async playClip(
		path: string,
		loop: boolean,
		muted: boolean,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		const video = this.video;
		if (!video) throw new Error("NVA video is not mounted");
		this.currentKeyColor =
			this.config.manifest.chroma_key ??
			(canCarryAlpha(path) ? undefined : this.config.manifest.background?.color);
		video.src = await this.config.resolveAssetUrl(path);
		video.loop = loop;
		video.muted = muted;
		video.currentTime = 0;
		if (loop) {
			await video.play();
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const ready = () => options?.onPlaybackReady?.();
			const ended = () => resolve();
			const failed = () => reject(new Error("NVA clip playback failed"));
			video.addEventListener("playing", ready, { once: true });
			video.addEventListener("ended", ended, { once: true });
			video.addEventListener("error", failed, { once: true });
			video.play().catch(failed);
		});
	}

	private async playIdle(): Promise<void> {
		if (!this.video || this.disposed) return;
		await this.playClip(
			defaultClipOf(this.config.manifest).video,
			true,
			true,
		).catch(() => {});
	}

	/** 숨은 decode `<video>`를 매 프레임 표시 `<canvas>`에 합성(필요 시 크로마키). */
	private startDrawLoop(): void {
		if (this.running) return;
		this.running = true;
		const draw = () => {
			if (!this.running) return;
			const video = this.video;
			const canvas = this.canvas;
			const ctx = this.ctx;
			if (
				video &&
				canvas &&
				ctx &&
				video.readyState >= 2 &&
				video.videoWidth > 0 &&
				video.videoHeight > 0
			) {
				const rect = containRect(
					canvas.width,
					canvas.height,
					video.videoWidth,
					video.videoHeight,
				);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				if (rect.dw > 0 && rect.dh > 0) {
					const keyColor = this.currentKeyColor;
					let drew = false;
					if (keyColor && !this.keyerFailed) {
						try {
							if (!this.keyer) this.keyer = new NvaChromakeyGL({ keyColor });
							else this.keyer.setParams({ keyColor });
							const keyed = this.keyer.process(
								video,
								video.videoWidth,
								video.videoHeight,
							);
							ctx.drawImage(keyed, rect.dx, rect.dy, rect.dw, rect.dh);
							drew = true;
						} catch {
							// WebGL2 unavailable or context lost — fall back to a plain
							// (possibly opaque-backdrop) draw rather than a blank canvas.
							this.keyerFailed = true;
						}
					}
					if (!drew) ctx.drawImage(video, rect.dx, rect.dy, rect.dw, rect.dh);
				}
			}
			this.raf = requestAnimationFrame(draw);
		};
		this.raf = requestAnimationFrame(draw);
	}

	interrupt(): void {
		this.generation++;
		this.config.onSpeaking?.(false);
		void this.playIdle();
	}

	stop(): void {
		this.disposed = true;
		this.running = false;
		if (this.raf) cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.keyer?.dispose();
		this.keyer = null;
		this.interrupt();
		this.video?.pause();
		this.video = null;
		this.canvas = null;
		this.ctx = null;
	}
}
