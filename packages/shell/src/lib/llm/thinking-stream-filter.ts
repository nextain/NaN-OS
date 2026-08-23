export interface ThinkingStreamOutput {
	visible: string;
	thinking: string;
}

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

function partialTagSuffixLength(text: string, tag: string): number {
	const lower = text.toLowerCase();
	const max = Math.min(lower.length, tag.length - 1);
	for (let length = max; length > 0; length -= 1) {
		if (tag.startsWith(lower.slice(-length))) return length;
	}
	return 0;
}

/**
 * Separates textual `<think>...</think>` blocks before visible rendering and
 * sentence-level TTS. A possible partial tag is retained until the next chunk,
 * so no tag boundary can leak reasoning into either downstream consumer.
 */
export class ThinkingStreamFilter {
	private buffer = "";
	private insideThinking = false;

	push(chunk: string): ThinkingStreamOutput {
		this.buffer += chunk;
		let visible = "";
		let thinking = "";

		while (this.buffer) {
			const tag = this.insideThinking ? CLOSE_TAG : OPEN_TAG;
			const lower = this.buffer.toLowerCase();
			const tagIndex = lower.indexOf(tag);

			if (tagIndex >= 0) {
				const content = this.buffer.slice(0, tagIndex);
				if (this.insideThinking) thinking += content;
				else visible += content;
				this.buffer = this.buffer.slice(tagIndex + tag.length);
				this.insideThinking = !this.insideThinking;
				continue;
			}

			const retainedLength = partialTagSuffixLength(this.buffer, tag);
			const safeLength = this.buffer.length - retainedLength;
			const content = this.buffer.slice(0, safeLength);
			if (this.insideThinking) thinking += content;
			else visible += content;
			this.buffer = this.buffer.slice(safeLength);
			break;
		}

		return { visible, thinking };
	}

	flush(): ThinkingStreamOutput {
		const output = this.insideThinking
			? { visible: "", thinking: this.buffer }
			: { visible: this.buffer, thinking: "" };
		this.reset();
		return output;
	}

	reset(): void {
		this.buffer = "";
		this.insideThinking = false;
	}
}
