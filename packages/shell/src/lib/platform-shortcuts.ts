export type ShortcutPlatform = "macos" | "other";

export function shortcutPlatform(
	platform = typeof navigator === "undefined" ? "" : navigator.platform,
): ShortcutPlatform {
	return /mac/i.test(platform) ? "macos" : "other";
}

export function primaryModifierLabel(
	platform: ShortcutPlatform = shortcutPlatform(),
): string {
	return platform === "macos" ? "Command" : "Ctrl";
}

export function hasPrimaryModifier(
	event: Pick<MouseEvent, "ctrlKey" | "metaKey">,
	platform: ShortcutPlatform = shortcutPlatform(),
): boolean {
	return platform === "macos"
		? event.metaKey && !event.ctrlKey
		: event.ctrlKey && !event.metaKey;
}
