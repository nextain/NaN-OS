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
		setLaunching(true);
		setLaunchError("");
		try {
			let dir = getAdkPath();
			if (!dir) dir = await invoke<string>("workspace_detect_adk_root");
			const created = await invoke<PtyCreated>("herdr_pty_create", {
				dir,
				rows: 30,
				cols: 120,
			});
			if (!mountedRef.current || generation !== launchGenerationRef.current)
				return;
			setPty(created);
			try {
				await refreshSnapshot();
			} catch {}
		} catch (error) {
			if (!mountedRef.current || generation !== launchGenerationRef.current)
				return;
			setLaunchError(String(error));
		} finally {
			if (mountedRef.current && generation === launchGenerationRef.current)
				setLaunching(false);
		}
	}, [refreshSnapshot]);

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
	}, [refreshSnapshot]);

	useEffect(() => {
		const snapshotRoot = activeHerdrRoot(snapshot);
		const generation = ++rootGenerationRef.current;
		locationGenerationRef.current++;
		if (!snapshotRoot || snapshotRoot === workspaceRoot) return;
		invoke<string>("workspace_set_root", { root: snapshotRoot })
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
