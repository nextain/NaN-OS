import { type NvaManifest, defaultClipOf, findPrebakedSpeech } from "../nva";
import type {
	AvatarPlaybackOptions,
	AvatarSpeechRenderer,
} from "./avatar-renderer";

interface Config {
	manifest: NvaManifest;
	locale: string;
	resolveAssetUrl: (path: string) => Promise<string>;
	onSpeaking?: (speaking: boolean) => void;
}

function pcm16ToWav(base64: string, sampleRate: number): Uint8Array {
	const pcm = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	const wav = new Uint8Array(44 + pcm.length);
	const view = new DataView(wav.buffer);
	const text = (offset: number, value: string) => {
		for (let index = 0; index < value.length; index++)
			wav[offset + index] = value.charCodeAt(index);
	};
	text(0, "RIFF");
	view.setUint32(4, 36 + pcm.length, true);
	text(8, "WAVEfmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, "data");
	view.setUint32(40, pcm.length, true);
	wav.set(pcm, 44);
	return wav;
}

export class PrebakedAvatarRenderer implements AvatarSpeechRenderer {
	private video: HTMLVideoElement | null = null;
	private audio: HTMLAudioElement | null = null;
	private generation = 0;
	private disposed = false;
	private nextText = "";
	private tail = Promise.resolve();

	constructor(private readonly config: Config) {}
	start(video: HTMLVideoElement): void {
		this.video = video;
		void this.playIdle();
	}
	setNextText(text: string): void {
		this.nextText = text;
	}
	async setVoice(): Promise<boolean> {
		return false;
	}

	async speak(
		text: string,
		wav?: Uint8Array,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		const operation = this.tail.then(() => this.speakNow(text, wav, options));
		this.tail = operation.catch(() => {});
		return operation;
	}
	async speakAudio(
		base64: string,
		rate = 24000,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		const text = this.nextText;
		this.nextText = "";
		return this.speak(text, pcm16ToWav(base64, rate), options);
	}

	private async speakNow(
		text: string,
		wav?: Uint8Array,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		if (!this.video || this.disposed) return;
		const generation = ++this.generation;
		const match = findPrebakedSpeech(
			this.config.manifest,
			text,
			this.config.locale,
		);
		this.config.onSpeaking?.(true);
		try {
			if (match?.localized.clip) {
				await this.playClip(
					match.localized.clip,
					false,
					options?.muted ?? false,
					options,
				);
				return;
			}
			const visual =
				this.config.manifest.vrm_slots?.visemes?.aiueo?.clip ??
				this.config.manifest.vrm_slots?.motions?.talking?.clip ??
				this.config.manifest.animations.talking?.clip ??
				this.config.manifest.animations.speak?.clip ??
				defaultClipOf(this.config.manifest).video;
			await this.playClip(visual, true, true);
			if (wav) await this.playAudio(wav, generation, options);
			else await this.browserSpeech(text, generation, options);
		} catch {
			options?.onPlaybackFailure?.();
		} finally {
			if (generation === this.generation && !this.disposed) {
				this.config.onSpeaking?.(false);
				await this.playIdle();
			}
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

	private async playAudio(
		wav: Uint8Array,
		generation: number,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		const url = URL.createObjectURL(
			new Blob(
				[
					wav.buffer.slice(
						wav.byteOffset,
						wav.byteOffset + wav.byteLength,
					) as ArrayBuffer,
				],
				{ type: "audio/wav" },
			),
		);
		try {
			await new Promise<void>((resolve, reject) => {
				const audio = new Audio(url);
				this.audio = audio;
				audio.muted = options?.muted ?? false;
				audio.onplaying = () => options?.onPlaybackReady?.();
				audio.onended = () => resolve();
				audio.onerror = () => reject(new Error("NVA audio playback failed"));
				if (generation !== this.generation) resolve();
				else audio.play().catch(reject);
			});
		} finally {
			this.audio = null;
			URL.revokeObjectURL(url);
		}
	}

	private async browserSpeech(
		text: string,
		generation: number,
		options?: AvatarPlaybackOptions,
	): Promise<void> {
		if (!text || !("speechSynthesis" in window))
			throw new Error("No NVA speech audio");
		await new Promise<void>((resolve, reject) => {
			const utterance = new SpeechSynthesisUtterance(text);
			utterance.lang = this.config.locale;
			utterance.onstart = () => options?.onPlaybackReady?.();
			utterance.onend = () => resolve();
			utterance.onerror = () => reject(new Error("Browser speech failed"));
			if (generation !== this.generation) resolve();
			else window.speechSynthesis.speak(utterance);
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
	interrupt(): void {
		this.generation++;
		this.audio?.pause();
		this.audio = null;
		if ("speechSynthesis" in window) window.speechSynthesis.cancel();
		this.config.onSpeaking?.(false);
		void this.playIdle();
	}
	stop(): void {
		this.disposed = true;
		this.interrupt();
		this.video?.pause();
		this.video = null;
	}
}
