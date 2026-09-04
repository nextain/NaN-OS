import { useEffect, useState } from "react";
import { isNewCore } from "../lib/chat-service";
import type { ThemeId } from "../lib/config";
import { Logger } from "../lib/logger";
import { useAvatarStore } from "../stores/avatar";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "ogg", "avi"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

function hasExtension(url: string, extensions: Set<string>): boolean {
	const extension = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
	return extensions.has(extension);
}

export function getBackgroundMediaType(path: string): "image" | "video" | "" {
	if (hasExtension(path, VIDEO_EXTENSIONS)) return "video";
	if (hasExtension(path, IMAGE_EXTENSIONS)) return "image";
	return "";
}

export function applyTheme(theme: ThemeId) {
	const resolved =
		theme === "system"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
				? "midnight"
				: "espresso"
			: theme;
	document.documentElement.setAttribute("data-theme", resolved);
}

export function useAppReady(
	showAdkSetup: boolean,
	showOnboarding: boolean,
	localeHydrated: boolean,
): boolean {
	const avatarLoaded = useAvatarStore((state) => state.isLoaded);
	const [timedOut, setTimedOut] = useState(false);
	const skipAvatarWait = showAdkSetup || showOnboarding || isNewCore();

	useEffect(() => {
		if (skipAvatarWait || avatarLoaded) return;
		const timeout = setTimeout(() => {
			Logger.warn("App", "useAppReady: 5 s timeout — forcing splash dismiss");
			setTimedOut(true);
		}, 5000);
		return () => clearTimeout(timeout);
	}, [skipAvatarWait, avatarLoaded]);

	if (!localeHydrated) return false;
	if (skipAvatarWait) return true;
	return avatarLoaded || timedOut;
}

export function useShowAppWindow() {
	useEffect(() => {
		try {
			void getCurrentWindow()
				.show()
				.catch((error) =>
					Logger.warn("App", "failed to show window", { error: String(error) }),
				);
		} catch (error) {
			Logger.warn("App", "failed to show window (sync)", {
				error: String(error),
			});
		}
		Logger.debug("App", "window shown on first render");
	}, []);
}

export function useBackgroundFallback(
	url: string,
	mediaType: "iframe" | "image" | "video" | "",
) {
	const [fallback, setFallback] = useState<{
		url: string;
		type: "image" | "video";
	} | null>(null);

	useEffect(() => {
		if (!url || mediaType === "iframe") return;
		const type =
			mediaType === "video" || hasExtension(url, VIDEO_EXTENSIONS)
				? "video"
				: "image";
		setFallback({ url, type });
	}, [url, mediaType]);

	return fallback;
}
import { getCurrentWindow } from "@tauri-apps/api/window";
