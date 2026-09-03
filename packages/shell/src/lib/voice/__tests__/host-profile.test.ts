import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("../../logger", () => ({
	Logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { resetVoiceHostProfileCache, voiceHostProfile } from "../host-profile";

describe("voiceHostProfile (#537)", () => {
	beforeEach(() => {
		invoke.mockReset();
		resetVoiceHostProfileCache();
	});

	it("기계가 답한 프로파일을 그대로 전한다", async () => {
		invoke.mockResolvedValue({
			profile: "linux_trt_6g",
			gpus: [
				{ index: 0, freeMib: 20011, totalMib: 24576 },
				{ index: 1, freeMib: 24014, totalMib: 24576 },
			],
			gpuChoiceIsMeaningful: true,
			defaultGpuIndex: 1,
		});
		const host = await voiceHostProfile();
		expect(host.profile).toBe("linux_trt_6g");
		expect(host.gpuChoiceIsMeaningful).toBe(true);
		expect(host.defaultGpuIndex).toBe(1);
	});

	it("한 번만 묻는다 — 화면 여러 곳이 불러도 왕복은 하나다", async () => {
		invoke.mockResolvedValue({
			profile: "linux_trt_6g",
			gpus: [],
			gpuChoiceIsMeaningful: false,
			defaultGpuIndex: null,
		});
		await Promise.all([
			voiceHostProfile(),
			voiceHostProfile(),
			voiceHostProfile(),
		]);
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	it("묻지 못하면 모른다고 답한다 — 이름을 지어내지 않는다", async () => {
		invoke.mockRejectedValue(new Error("no tauri"));
		const host = await voiceHostProfile();
		expect(host.profile).toBeNull();
		expect(host.gpus).toEqual([]);
		expect(host.gpuChoiceIsMeaningful).toBe(false);
	});

	it("답이 일부만 와도 빠진 자리는 모름으로 채운다", async () => {
		invoke.mockResolvedValue({ profile: "linux_trt_6g" });
		const host = await voiceHostProfile();
		expect(host.profile).toBe("linux_trt_6g");
		expect(host.gpus).toEqual([]);
		expect(host.defaultGpuIndex).toBeNull();
	});
});
