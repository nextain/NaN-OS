// 아바타 자리가 비었을 때 화면이 **말하는지** 를 고정한다.
//
// 왜 이 파일이 있는가: 2026-09-06 리눅스 실기 탐색에서, 첫 실행의 스플래시가
// 걷힌 뒤 화면이 완전히 비어 있었다 — 아바타도 없고 안내도 없었다(#574).
// 원인은 아바타 모델이 없다는 것이었는데, 그 사실은 `data-avatar-load-error`
// 속성과 로그에만 있었다. 사람이 보는 화면에는 한 글자도 없었으므로, 처음 쓰는
// 사람은 앱이 고장 난 것인지 자기가 무엇을 안 한 것인지 알 수 없다.
//
// 모델이 없는 상태 자체는 정상이다(모델은 ADK 자산이고 기본값이 비어 있다).
// 결함은 **그 상태를 말하지 않는 것**이다. 그래서 여기서 재는 것은 렌더러가
// 아니라 "무엇을 적을 것인가" 라는 판단이다.
import { beforeAll, describe, expect, it } from "vitest";
import { setLocale, t } from "../i18n";
import en from "../locales/en";
import ko from "../locales/ko";
import { avatarEmptyNotice, avatarFailedStage } from "../avatar-notice";

describe("아바타 빈 화면 안내", () => {
	beforeAll(async () => {
		await setLocale("en");
	});

	it("모델이 없으면 무엇을 해야 하는지 말한다", () => {
		const notice = avatarEmptyNotice("", "idle");

		// 빈 문자열이면 화면이 다시 침묵한다 — 그것이 고치려던 결함이다.
		expect(notice).not.toBe("");
		// 글자로 견주지 않는다. 로케일이 열넷이라 문구로 재면 한 언어에서만
		// 참인 단정이 되고, 그것이 이 저장소가 없애기로 한 부류다. 표에서
		// 읽은 값과 견주어 **배선**을 잰다.
		expect(notice).toBe(en["avatar.noModel"]);
	});

	it("불러오다 실패하면 어느 단계에서 실패했는지 말한다", () => {
		const notice = avatarEmptyNotice("/avatars/01-OL_Woman.vrm", "error:fetch");

		expect(notice).not.toBe("");
		// 단계 이름이 빠지면 "안 된다" 만 남는다. 사용자도 사람도 그것으로는
		// 파일이 없는 것인지 형식이 깨진 것인지 구별하지 못한다. 이 값은
		// 번역되지 않으므로 어느 로케일에서도 그대로 있어야 한다.
		expect(notice).toContain("fetch");
		expect(notice).toBe(t("avatar.loadFailed", { stage: "fetch" }));
	});

	it("로케일을 바꾸면 문구도 바뀐다 — 열넷 배선을 지난다", async () => {
		// 글자를 코드에 박아 두면 나머지 열셋에서 한국어가 그대로 나온다.
		// 실제로 로케일을 켜서 표가 갈리는지 본다.
		await setLocale("ko");
		expect(avatarEmptyNotice("", "idle")).toBe(ko["avatar.noModel"]);
		await setLocale("en");
		expect(avatarEmptyNotice("", "idle")).toBe(en["avatar.noModel"]);
		expect(ko["avatar.noModel"]).not.toBe(en["avatar.noModel"]);
	});

	it("정상적으로 그려지는 중이거나 다 그려졌으면 아무 말도 하지 않는다", () => {
		// 안내가 늘 떠 있으면 그것은 배경 잡음이 되고, 진짜 빈 화면일 때도
		// 사람이 읽지 않게 된다.
		expect(avatarEmptyNotice("/avatars/01-OL_Woman.vrm", "ready")).toBe("");
		expect(avatarEmptyNotice("/avatars/01-OL_Woman.vrm", "loading")).toBe("");
		expect(avatarEmptyNotice("/avatars/01-OL_Woman.vrm", "idle")).toBe("");
	});

	it("모델이 없는 것이 실패보다 앞선다", () => {
		// 모델을 지운 직후에는 앞선 실패 단계가 남아 있을 수 있다. 그때 "불러오기
		// 실패" 를 말하면 사용자는 없는 파일을 고치러 간다.
		const notice = avatarEmptyNotice("", "error:fetch");
		expect(notice).toBe(en["avatar.noModel"]);
		expect(notice).not.toContain("fetch");
	});

	it("실패 단계 이름을 loadStage 에서 그대로 꺼낸다", () => {
		expect(avatarFailedStage("error:parse")).toBe("parse");
		expect(avatarFailedStage("ready")).toBe("");
		expect(avatarFailedStage("idle")).toBe("");
	});
});
