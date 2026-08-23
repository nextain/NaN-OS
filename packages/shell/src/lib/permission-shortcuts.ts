export type PermissionDecision = "once" | "always" | "reject";
import {
	type ShortcutPlatform,
	shortcutPlatform,
} from "./platform-shortcuts";

export const PERMISSION_SHORTCUTS = [
	{ decision: "once", key: "y" },
	{ decision: "always", key: "a" },
	{ decision: "reject", key: "n" },
] as const satisfies readonly {
	decision: PermissionDecision;
	key: string;
}[];

export function permissionShortcutPlatform(
	platform = typeof navigator === "undefined" ? "" : navigator.platform,
): ShortcutPlatform {
	return shortcutPlatform(platform);
}

export function permissionShortcutLabel(
	decision: PermissionDecision,
	platform = permissionShortcutPlatform(),
): string {
	const shortcut = PERMISSION_SHORTCUTS.find(
		(item) => item.decision === decision,
	);
	if (!shortcut) return "";
	const key = shortcut.key.toUpperCase();
	return platform === "macos" ? `⌥${key}` : `Alt+${key}`;
}

export function permissionDecisionFromKeyboardEvent(
	event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key" | "repeat">,
): PermissionDecision | null {
	if (
		!event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey ||
		event.repeat
	) {
		return null;
	}
	return (
		PERMISSION_SHORTCUTS.find(
			(shortcut) => shortcut.key === event.key.toLowerCase(),
		)?.decision ?? null
	);
}
