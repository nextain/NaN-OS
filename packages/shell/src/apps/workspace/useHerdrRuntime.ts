import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAdkPath } from "../../lib/adk-store";
import { t } from "../../lib/i18n";
import { Logger } from "../../lib/logger";
import type { TerminalHandle } from "./Terminal";
import {
	HERDR_SNAPSHOT_INTERVAL_MS,
	type HerdrSnapshot,
	activeHerdrRoot,
	assertHerdrSnapshot,
	waitForHerdrReady,
	workspacePath,
} from "./herdr";
import { killPty } from "./pty-ipc";

export interface PtyCreated {
	pty_id: string;
	pid: number;
}

export type HerdrSurface = "herdr" | "viewer";

export function useHerdrRuntime() {
	const [pty, setPty] = useState<PtyCreated | null>(null);
	const [launching, setLaunching] = useState(true);
	const [launchError, setLaunchError] = useState("");
	const [snapshot, setSnapshot] = useState<HerdrSnapshot | null>(null);
	const [snapshotError, setSnapshotError] = useState("");
	const [terminalReady, setTerminalReady] = useState(false);
	const [terminalError, setTerminalError] = useState("");
	const [surface, setSurface] = useState<HerdrSurface>("herdr");
	const [workspaceRoot, setWorkspaceRoot] = useState("");
	const terminalRef = useRef<TerminalHandle>(null);
	const mountedRef = useRef(false);
	const initialLaunchStartedRef = useRef(false);
	const launchGenerationRef = useRef(0);
	const rootGenerationRef = useRef(0);
	const snapshotGenerationRef = useRef(0);
	const locationGenerationRef = useRef(0);
	const snapshotRef = useRef<HerdrSnapshot | null>(null);

	useEffect(() => {
		snapshotRef.current = snapshot;
	}, [snapshot]);

	const refreshSnapshot = useCallback(async () => {
		const generation = ++snapshotGenerationRef.current;
		try {
			const value = await invoke<unknown>("herdr_snapshot");
			const next = assertHerdrSnapshot(value);
			if (generation !== snapshotGenerationRef.current) return;
			setSnapshot(next);
			setSnapshotError("");
		} catch (error) {
			if (generation === snapshotGenerationRef.current) {
				setSnapshotError(String(error));
			}
			throw error;
		}
	}, []);

	const launchHerdr = useCallback(async () => {
		const generation = ++launchGenerationRef.current;
		let created: PtyCreated | null = null;
		setLaunching(true);
		setLaunchError("");
		setTerminalReady(false);
		setTerminalError("");
		try {
			let dir = getAdkPath();
			if (!dir) dir = await invoke<string>("workspace_detect_adk_root");
			created = await invoke<PtyCreated>("herdr_pty_create", {
				dir,
				rows: 30,
				cols: 120,
			});
			if (!mountedRef.current || generation !== launchGenerationRef.current) {
				await killPty(created.pty_id).catch(() => {});
				created = null;
				return;
			}
			// Attach the renderer as soon as the PTY exists. Herdr can emit its
			// opening frame while the API readiness probe is still running and Tauri
			// events are not buffered; delaying this state update loses that frame on
			// clean Windows launches and leaves a healthy client behind an error card.
			setPty(created);
			await waitForHerdrReady(refreshSnapshot);
			if (!mountedRef.current || generation !== launchGenerationRef.current) {
				await killPty(created.pty_id).catch(() => {});
				setPty((current) =>
					current?.pty_id === created?.pty_id ? null : current,
				);
				created = null;
				return;
			}
			created = null;
		} catch (error) {
			if (created) {
				const failedPtyId = created.pty_id;
				await killPty(failedPtyId).catch(() => {});
				setPty((current) => (current?.pty_id === failedPtyId ? null : current));
			}
			if (!mountedRef.current || generation !== launchGenerationRef.current)
				return;
			setLaunchError(String(error));
		} finally {
			if (mountedRef.current && generation === launchGenerationRef.current)
				setLaunching(false);
		}
	}, [refreshSnapshot]);

	useEffect(() => {
		if (!pty || terminalReady) return;
		const timer = window.setTimeout(() => {
			setTerminalError(t("workspace.herdrNoFrame"));
		}, 8_000);
		return () => window.clearTimeout(timer);
	}, [pty, terminalReady]);

	const retryHerdr = useCallback(async () => {
		const prior = pty;
		setPty(null);
		setTerminalReady(false);
		setTerminalError("");
		if (prior) await killPty(prior.pty_id).catch(() => {});
		await launchHerdr();
	}, [launchHerdr, pty]);

	useEffect(() => {
		mountedRef.current = true;
		if (!initialLaunchStartedRef.current) {
			initialLaunchStartedRef.current = true;
			void launchHerdr();
		}
		return () => {
			mountedRef.current = false;
		};
	}, [launchHerdr]);

	useEffect(() => {
		if (!pty || launching) return;
		let disposed = false;
		let inFlight = false;
		const poll = async () => {
			if (disposed || inFlight) return;
			inFlight = true;
			try {
				await refreshSnapshot();
			} catch {
				// refreshSnapshot commits only the newest request's error.
			} finally {
				inFlight = false;
			}
		};
		void poll();
		const interval = window.setInterval(poll, HERDR_SNAPSHOT_INTERVAL_MS);
		return () => {
			disposed = true;
			snapshotGenerationRef.current++;
			window.clearInterval(interval);
		};
	}, [launching, pty, refreshSnapshot]);

	useEffect(() => {
		// #492: the configured file tree is independent from Herdr readiness.
		// Bind it immediately so a stopped or hung Herdr server cannot block files.
		// A refreshed snapshot deliberately retries a previously failed root bind.
		void snapshot;
		const configuredRoot = getAdkPath();
		if (!configuredRoot) return;
		if (configuredRoot.toLowerCase() === (workspaceRoot ?? "").toLowerCase())
			return;
		const generation = ++rootGenerationRef.current;
		locationGenerationRef.current++;
		invoke<string>("workspace_set_root", { root: configuredRoot })
			.then((canonical) => {
				if (generation === rootGenerationRef.current)
					setWorkspaceRoot(canonical);
			})
			.catch((error) => {
				if (generation !== rootGenerationRef.current) return;
				Logger.warn(
					"HerdrWorkspace",
					"Failed to bind configured workspace root",
					{
						error: String(error),
					},
				);
			});
	}, [snapshot, workspaceRoot]);

	useEffect(() => {
		// Without a configured ADK path, retain the legacy Herdr-focus fallback.
		if (getAdkPath()) return;
		const herdrRoot = activeHerdrRoot(snapshot);
		if (!herdrRoot) return;
		const targetRoot = herdrRoot;
		const generation = ++rootGenerationRef.current;
		locationGenerationRef.current++;
		// Case-insensitive on Windows: getAdkPath() may be "d:\naia-adk" while the
		// backend canonical is "D:\naia-adk". Without this the guard never matches
		// and every Herdr snapshot poll re-issues workspace_set_root. Null-safe:
		// workspace_set_root may resolve empty before the first bind.
		if (
			!targetRoot ||
			targetRoot.toLowerCase() === (workspaceRoot ?? "").toLowerCase()
		)
			return;
		invoke<string>("workspace_set_root", { root: targetRoot })
			.then((canonical) => {
				if (generation === rootGenerationRef.current)
					setWorkspaceRoot(canonical);
			})
			.catch((error) => {
				if (generation !== rootGenerationRef.current) return;
				Logger.warn("HerdrWorkspace", "Failed to follow Herdr workspace root", {
					error: String(error),
				});
			});
	}, [snapshot, workspaceRoot]);

	const showHerdr = useCallback(() => {
		setSurface("herdr");
		requestAnimationFrame(() => terminalRef.current?.focus());
	}, []);

	const findWorkspace = useCallback((target: string) => {
		const current = snapshotRef.current;
		if (!current) return undefined;
		return current.workspaces.find((space) => {
			const path = workspacePath(space, current.agents);
			const basename = path
				.replace(/[\\/]+$/, "")
				.split(/[\\/]/)
				.pop();
			return (
				space.workspace_id === target ||
				space.label === target ||
				path === target ||
				basename === target
			);
		});
	}, []);

	const focusTarget = useCallback(
		async (
			command: "herdr_focus_workspace" | "herdr_focus_agent",
			args: Record<string, unknown>,
		) => {
			showHerdr();
			try {
				await invoke(command, args);
				await refreshSnapshot();
			} catch (error) {
				setSnapshotError(String(error));
				throw error;
			}
		},
		[refreshSnapshot, showHerdr],
	);
	const focusWorkspace = useCallback(
		(workspaceId: string) =>
			focusTarget("herdr_focus_workspace", { workspaceId }),
		[focusTarget],
	);
	const focusAgent = useCallback(
		(paneId: string) => focusTarget("herdr_focus_agent", { paneId }),
		[focusTarget],
	);

	return {
		pty,
		launching,
		launchError,
		snapshot,
		snapshotError,
		surface,
		workspaceRoot,
		terminalRef,
		locationGenerationRef,
		snapshotRef,
		setSurface,
		refreshSnapshot,
		launchHerdr,
		retryHerdr,
		terminalReady,
		terminalError,
		onTerminalReady: () => {
			setTerminalReady(true);
			setTerminalError("");
		},
		showHerdr,
		findWorkspace,
		focusWorkspace,
		focusAgent,
		onPtyExit: () => {
			setPty(null);
			setLaunchError(t("workspace.herdrExited"));
		},
	};
}
