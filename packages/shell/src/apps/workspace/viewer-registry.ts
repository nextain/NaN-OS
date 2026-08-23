export type WorkspaceViewerKind =
	| "editor"
	| "preview"
	| "image"
	| "csv"
	| "log"
	| "pdf"
	| "hwp"
	| "audio"
	| "video";

const VIEWERS: ReadonlyArray<{
	kind: WorkspaceViewerKind;
	extensions: readonly string[];
}> = [
	{ kind: "image", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
	{ kind: "pdf", extensions: ["pdf"] },
	{ kind: "csv", extensions: ["csv"] },
	{ kind: "log", extensions: ["log"] },
	{ kind: "hwp", extensions: ["hwp", "hwpx"] },
	{ kind: "audio", extensions: ["mp3", "wav"] },
	{ kind: "video", extensions: ["mp4"] },
	{ kind: "preview", extensions: ["md", "markdown", "mdx"] },
];

export function resolveWorkspaceViewer(filePath: string): WorkspaceViewerKind {
	const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
	return (
		VIEWERS.find(({ extensions }) => extensions.includes(extension))?.kind ??
		"editor"
	);
}

export function isWorkspaceMediaFile(filePath: string): boolean {
	return ["audio", "video"].includes(resolveWorkspaceViewer(filePath));
}

export function workspaceMediaMime(filePath: string): string {
	const extension = filePath.split(".").pop()?.toLowerCase();
	return extension === "mp3"
		? "audio/mpeg"
		: extension === "wav"
			? "audio/wav"
			: extension === "mp4"
				? "video/mp4"
				: "application/octet-stream";
}
