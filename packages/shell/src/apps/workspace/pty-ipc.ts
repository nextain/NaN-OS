import { invoke } from "@tauri-apps/api/core";

export interface PtyExecResult {
	success: boolean;
	output: string;
	exit_code: number;
}

/** Tauri exposes Rust snake_case command parameters as camelCase JS keys. */
export function writePty(ptyId: string, data: string): Promise<void> {
	return invoke("pty_write", { ptyId, data });
}

export function attachPty(ptyId: string): Promise<void> {
	return invoke("pty_attach", { ptyId });
}

export function resizePty(
	ptyId: string,
	rows: number,
	cols: number,
): Promise<void> {
	return invoke("pty_resize", { ptyId, rows, cols });
}

export function killPty(ptyId: string): Promise<void> {
	return invoke("pty_kill", { ptyId });
}

export function executePty(
	dir: string,
	command: string,
	timeoutSecs?: number,
): Promise<PtyExecResult> {
	return invoke("pty_execute_sync", { dir, command, timeoutSecs });
}
