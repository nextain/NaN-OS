export interface AvatarPlaybackOptions {
	muted?: boolean;
	onPlaybackReady?: () => void;
	onPlaybackFailure?: () => void;
}

/** ChatArea가 사용하는 아바타 발화 포트. */
export interface AvatarSpeechRenderer {
	speak(
		text: string,
		audioWav?: Uint8Array,
		opts?: AvatarPlaybackOptions,
	): Promise<void>;
	speakAudio(
		audioBase64: string,
		sampleRate?: number,
		opts?: AvatarPlaybackOptions,
	): Promise<void>;
	setNextText?(text: string): void;
	setVoice(refUrl: string | null | undefined): Promise<boolean>;
	interrupt(): void;
	stop(): void;
}
