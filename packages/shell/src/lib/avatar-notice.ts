/**
 * 아바타 자리가 비었을 때 화면에 적을 한 줄.
 *
 * 왜 따로 두는가: `AvatarCanvas` 는 three.js 와 WebGL 을 끌어오는 무거운
 * 컴포넌트라, 그 안에 규칙을 두면 이 판단을 재려고 렌더러 전체를 세워야 한다.
 * 규칙만 떼어 놓으면 순수 함수로 고정할 수 있다.
 *
 * 무엇을 고치는 규칙인가: 아바타 모델은 ADK 가 가진 자산이라 기본값이 빈
 * 문자열이다(`avatar-presets.ts` 의 `DEFAULT_AVATAR_MODEL`). 그래서 아직
 * 캐릭터를 고르지 않았거나, 골라 둔 파일이 사라졌거나, 불러오다 실패하면 그
 * 자리가 그냥 검게 남는다. 예전에는 그 사실이 `data-avatar-load-error` 속성과
 * 로그에만 있었고 사람이 보는 화면에는 한 글자도 없었다 — 첫 실행 탐색에서
 * 스플래시가 걷힌 뒤 아무것도 없는 화면이 나온 것이 그것이다(#574).
 */
import { t } from "./i18n";

/** 불러오기가 실패한 단계 이름. `loadStage` 가 `error:<단계>` 모양일 때만 있다. */
export function avatarFailedStage(loadStage: string): string {
	return loadStage.startsWith("error:") ? loadStage.slice("error:".length) : "";
}

/**
 * 화면에 적을 안내. 빈 문자열이면 적지 않는다(정상적으로 그려지는 중이거나
 * 이미 그려진 상태).
 *
 * 문구는 `t()` 를 지난다. 로케일이 열넷인데 글자를 여기 박아 두면 나머지 열셋
 * 에서 한국어가 그대로 나오고, 사용성을 i18n 키로 재기로 한 축이 그 자리에서
 * 끊긴다. 실패 단계 이름은 값이므로 자리표시자로 넘긴다 — 문구를 코드에서
 * 이어 붙이면 어순이 다른 언어를 표현할 수 없다.
 */
export function avatarEmptyNotice(modelPath: string, loadStage: string): string {
	if (!modelPath) return t("avatar.noModel");
	const stage = avatarFailedStage(loadStage);
	if (!stage) return "";
	return t("avatar.loadFailed", { stage });
}
