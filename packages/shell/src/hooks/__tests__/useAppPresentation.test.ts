// @vitest-environment jsdom
// 스플래시가 **없는 아바타를 기다리지 않는지** 고정한다.
//
// 왜 이 파일이 있는가: 2026-09-06 리눅스 실기 탐색에서 첫 실행의 스플래시가
// 8초를 머물렀다(#574). 그 8초 중 5초는 `useAppReady` 가 아바타가 다 실렸다는
// 신호를 기다린 시간이었는데, 그 실행에는 띄울 모델이 아예 없었다. 모델이
// 없으면 `AvatarCanvas` 는 아무것도 불러오지 않으므로 `isLoaded` 는 영영 참이
// 되지 않고, 스플래시는 시한이 다 될 때까지 그대로 있는다. 진행 표시도 없으니
// 사용자는 그저 멈춘 화면을 본다.
//
// 아바타 모델은 ADK 가 가진 자산이라 기본값이 빈 문자열이다. 그러니 이것은
// 자동 테스트만의 사정이 아니다 — 아직 캐릭터를 고르지 않았거나 비디오 아바타를
// 쓰는 사용자는 부팅마다 이 5초를 잃는다.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAvatarStore } from "../../stores/avatar";
import { useAppReady } from "../useAppPresentation";

vi.mock("../../lib/chat-service", () => ({
	isNewCore: () => false,
}));

vi.mock("../../lib/logger", () => ({
	Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** 이 훅이 보는 아바타 상태만 세운다. */
function setAvatar(modelPath: string, isLoaded: boolean): void {
	act(() => {
		useAvatarStore.setState({ modelPath, isLoaded });
	});
}

describe("useAppReady — 스플래시가 기다리는 것", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("띄울 모델이 없으면 기다리지 않고 곧장 준비된다", () => {
		setAvatar("", false);
		const { result } = renderHook(() => useAppReady(false, false, true));

		// 예전에는 여기서 거짓이었고, 아래 5초가 다 지나야 참이 됐다.
		expect(result.current).toBe(true);
	});

	it("모델이 있으면 다 실릴 때까지 기다린다", () => {
		setAvatar("/avatars/01-OL_Woman.vrm", false);
		const { result, rerender } = renderHook(() =>
			useAppReady(false, false, true),
		);

		// 이 반대 방향을 안 박으면, 위 수정은 "언제나 기다리지 않는다" 로
		// 느슨해져도 통과한다. 그러면 아바타가 반쯤 그려진 채 화면이 열린다.
		expect(result.current).toBe(false);

		setAvatar("/avatars/01-OL_Woman.vrm", true);
		rerender();
		expect(result.current).toBe(true);
	});

	it("모델이 있는데 안 실리면 5초 시한이 스플래시를 걷는다", () => {
		setAvatar("/avatars/01-OL_Woman.vrm", false);
		const { result, rerender } = renderHook(() =>
			useAppReady(false, false, true),
		);
		expect(result.current).toBe(false);

		// 안전망은 그대로 있어야 한다. 없으면 깨진 VRM 하나가 앱을 영영
		// 스플래시에 가둔다.
		act(() => {
			vi.advanceTimersByTime(5100);
		});
		rerender();
		expect(result.current).toBe(true);
	});

	it("로케일이 아직이면 모델이 없어도 준비되지 않는다", () => {
		setAvatar("", false);
		const { result } = renderHook(() => useAppReady(false, false, false));

		// 하이드레이션 전에 화면을 열면 라벨이 빈 채로 보인다. 이 수정이 그
		// 관문까지 열어 버리지 않았는지 못 박는다.
		expect(result.current).toBe(false);
	});
});
