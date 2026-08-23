import { describe, expect, it } from "vitest";
import {
	isWorkspaceMediaFile,
	resolveWorkspaceViewer,
	workspaceMediaMime,
} from "../viewer-registry";

describe("workspace viewer registry", () => {
	it.each([
		["song.mp3", "audio", "audio/mpeg"],
		["VOICE.WAV", "audio", "audio/wav"],
		["movie.mp4", "video", "video/mp4"],
	])("routes %s to %s", (path, viewer, mime) => {
		expect(resolveWorkspaceViewer(path)).toBe(viewer);
		expect(isWorkspaceMediaFile(path)).toBe(true);
		expect(workspaceMediaMime(path)).toBe(mime);
	});
	it("keeps unsupported media-like extensions in the editor", () =>
		expect(resolveWorkspaceViewer("movie.mkv")).toBe("editor"));
});
