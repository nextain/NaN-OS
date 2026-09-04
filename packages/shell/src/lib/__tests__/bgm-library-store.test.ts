import { beforeEach, describe, expect, it, vi } from "vitest";

const sandbox = vi.hoisted(() => ({
	read: vi.fn<(appId: string, path: string) => Promise<number[]>>(),
	write: vi.fn<(appId: string, path: string, bytes: number[]) => Promise<string>>(),
}));

vi.mock("../app-sandbox", () => ({
	readAppSandboxFile: sandbox.read,
	writeAppSandboxFile: sandbox.write,
}));

import { createEmptyBgmLibrary } from "../bgm-library";
import {
	bgmLibraryCache,
	loadBgmLibraryFromSandbox,
	persistBgmLibrary,
	resetBgmLibraryCache,
} from "../bgm-library-store";

function encode(value: unknown): number[] {
	return Array.from(new TextEncoder().encode(JSON.stringify(value)));
}

describe("bgm-library-store", () => {
	beforeEach(() => {
		resetBgmLibraryCache();
		sandbox.read.mockReset();
		sandbox.write.mockReset();
	});

	it("loads the sandbox file as the source of truth and primes the cache", async () => {
		const stored = {
			...createEmptyBgmLibrary(1),
			playlists: [
				{ id: "p1", name: "드라이브", tracks: [], createdAt: 1, updatedAt: 1 },
			],
			activePlaylistId: "p1",
		};
		sandbox.read.mockResolvedValue(encode(stored));

		const loaded = await loadBgmLibraryFromSandbox();

		expect(loaded.playlists.map((p) => p.name)).toEqual(["드라이브"]);
		expect(bgmLibraryCache()?.activePlaylistId).toBe("p1");
		expect(sandbox.write).not.toHaveBeenCalled();
	});

	it("migrates once to the sandbox when the file is missing", async () => {
		sandbox.read.mockRejectedValue(new Error("sandbox file does not exist"));
		sandbox.write.mockResolvedValue("ok");

		const loaded = await loadBgmLibraryFromSandbox();

		expect(loaded.playlists.length).toBeGreaterThan(0); // 기본 플레이리스트
		expect(sandbox.write).toHaveBeenCalledTimes(1);
		const [appId, path] = sandbox.write.mock.calls[0];
		expect(appId).toBe("land.naia.shell");
		expect(path).toBe("bgm/library.json");
	});

	it("persist writes the sandbox and updates the cache", async () => {
		sandbox.write.mockResolvedValue("ok");
		const state = createEmptyBgmLibrary(2);

		await persistBgmLibrary(state);

		expect(bgmLibraryCache()).toBe(state);
		expect(sandbox.write).toHaveBeenCalledTimes(1);
	});
});
