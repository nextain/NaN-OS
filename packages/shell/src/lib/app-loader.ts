import { invoke } from "@tauri-apps/api/core";
import { createGenericInstalledApp } from "../apps/generic-installed/GenericInstalledApp";
import { useAppStore } from "../stores/app";
import { Logger } from "./logger";
import { appRegistry } from "./app-registry";
import type { NaiaTool } from "./app-registry";

interface InstalledAppManifest {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	/** Inline SVG content loaded from iconUrl by Rust app_list_installed */
	iconSvg?: string;
	names?: Record<string, string>;
	version?: string;
	/** Tools the app exposes to Naia (declared in app.json). */
	tools?: NaiaTool[];
	/** Absolute path to index.html if present */
	htmlEntry?: string;
	/**
	 * Keep the app mounted across app switches (default true). An app may set
	 * false in its manifest to be unmounted when it loses focus (e.g. a purely
	 * stateless view where re-render is cheap and a fresh start is preferable).
	 */
	keepAlive?: boolean;
}

/**
 * Read manifests from ~/.naia/apps/ via Tauri command and register each
 * as a GenericInstalledApp. Bumps appListVersion so AppBar re-renders.
 *
 * Skips apps already registered (e.g. built-ins or re-loaded after restart).
 */
export async function loadInstalledApps(): Promise<void> {
	let manifests: InstalledAppManifest[];
	try {
		Logger.debug("AppLoader", "Invoking app_list_installed");
		manifests = await invoke<InstalledAppManifest[]>("app_list_installed");
	} catch (err) {
		Logger.warn("AppLoader", "Failed to load installed apps", {
			err: String(err),
		});
		return;
	}

	Logger.info("AppLoader", `Found ${manifests.length} installed app(s)`);

	for (const manifest of manifests) {
		if (appRegistry.get(manifest.id)) {
			Logger.debug(
				"AppLoader",
				`App already registered, skipping: ${manifest.id}`,
			);
			continue;
		}

		appRegistry.register({
			id: manifest.id,
			name: manifest.name,
			names: manifest.names,
			icon: manifest.icon,
			iconSvg: manifest.iconSvg,
			htmlEntry: manifest.htmlEntry,
			tools: manifest.tools,
			source: "installed",
			// Keep installed apps mounted across app switches — same treatment as
			// built-ins (browser/workspace/settings). An installed app renders an
			// iframe whose in-page state (e.g. a Slides deck's open PDF) is DOM
			// state: unmounting the slot destroys the iframe and loses it. Hidden
			// keepAlive slots use opacity:0, not unmount, so the iframe survives a
			// round-trip to another app and back. An app may opt out with
			// keepAlive:false in its manifest.
			keepAlive: manifest.keepAlive ?? true,
			center: createGenericInstalledApp(manifest.htmlEntry, manifest.tools),
		});

		Logger.info("AppLoader", `Registered installed app: ${manifest.id}`);
	}

	useAppStore.getState().bumpAppListVersion();
}

/**
 * Delete an installed app from disk and unregister it only after deletion succeeds.
 * Bumps appListVersion so AppBar re-renders.
 */
export async function removeInstalledApp(appId: string): Promise<void> {
	Logger.info("AppLoader", `Removing installed app: ${appId}`);

	try {
		await invoke("app_remove_installed", { appId });
		Logger.debug("AppLoader", `Disk removal complete: ${appId}`);
	} catch (err) {
		Logger.error("AppLoader", `Disk removal failed: ${appId}`, {
			err: String(err),
		});
		throw err;
	}

	appRegistry.unregister(appId);
	useAppStore.getState().bumpAppListVersion();
	Logger.debug("AppLoader", `App unregistered: ${appId}`);
}
