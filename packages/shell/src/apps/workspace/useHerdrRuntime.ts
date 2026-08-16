import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAdkPath } from "../../lib/adk-store";
import { t } from "../../lib/i18n";
import { Logger } from "../../lib/logger";
import type { TerminalHandle } from "./Terminal";
import { killPty } from "./pty-ipc";
import {
	HERDR_SNAPSHOT_INTERVAL_MS,
	type HerdrSnapshot,
	activeHerdrRoot,
	assertHerdrSnapshot,
	waitForHerdrReady,
	workspacePath,
} from "./herdr";

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
	// The file rail belongs to the focused Herdr Space. Do not briefly expose
	// the configured ADK directory (or a broad auto-detected parent) while the
	// authoritative Herdr snapshot is still loading.
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
			await waitForHerdrReady(refreshSnapshot);
			if (!mountedRef.current || generation !== launchGenerationRef.current) {
				await killPty(created.pty_id).catch(() => {});
				created = null;
				return;
			}
			setPty(created);
			created = null;
		} catch (error) {
			if (created) await killPty(created.pty_id).catch(() => {});
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
		// #447-6: the file-tree root is the user's chosen adk workspace, not the
		// shared herdr server's focused workspace. Herdr uses a shared global
		// socket, so its focused workspace is often an external session's cwd
		// (e.g. the dev repo alpha-adk). Following that would hijack the file tree
		// away from the workspace the user picked in onboarding/AdkSetup. Pin the
		// root to getAdkPath(); only fall back to herdr's focus when no adk path
		// is set at all.
		// Only react once Herdr actually reports a workspace (snapshot present);
		// launch failures leave this empty and must not trigger a bind.
		const herdrRoot = activeHerdrRoot(snapshot);
		if (!herdrRoot) return;
		// #447-6: pin the file-tree root to the user's chosen adk workspace, not
		// the Herdr snapshot's focused workspace. Herdr uses a shared global socket,
		// so its focus is often an external session's cwd (e.g. the dev repo
		// alpha-adk) which would hijack the tree away from the picked workspace.
		const targetRoot = getAdkPath() || herdrRoot;
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
