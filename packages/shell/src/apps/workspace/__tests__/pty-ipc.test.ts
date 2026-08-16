import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	attachPty,
	executePty,
	killPty,
	resizePty,
	writePty,
} from "../pty-ipc";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("native PTY IPC contract", () => {
	beforeEach(() => vi.mocked(invoke).mockReset());

	it("uses the camelCase ptyId required by Tauri", async () => {
		vi.mocked(invoke).mockResolvedValue(undefined);
		await attachPty("pty-7");
		await writePty("pty-7", "hello");
		await resizePty("pty-7", 30, 120);
		await killPty("pty-7");
		expect(invoke).toHaveBeenNthCalledWith(1, "pty_attach", {
			ptyId: "pty-7",
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "pty_write", {
			ptyId: "pty-7",
			data: "hello",
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "pty_resize", {
			ptyId: "pty-7",
			rows: 30,
			cols: 120,
		});
		expect(invoke).toHaveBeenNthCalledWith(4, "pty_kill", { ptyId: "pty-7" });
	});

	it("uses camelCase timeoutSecs for synchronous execution", async () => {
		vi.mocked(invoke).mockResolvedValue({
			success: true,
			output: "ok",
			exit_code: 0,
		});
		await executePty("/work/naia", "pwd", 15);
		expect(invoke).toHaveBeenCalledWith("pty_execute_sync", {
			dir: "/work/naia",
			command: "pwd",
			timeoutSecs: 15,
		});
	});
});
