/**
 * #502 실배선 — skill_environment 앱(환경) 도구 (FR-ENV-LIVE.3~5).
 *
 * 배선 = BGM 과 같은 앱 도구 경로(E1 — naia-agent 무변경):
 *   부팅 시 App.tsx 가 sendAppSkills(ENVIRONMENT_APP_ID, [SKILL_ENVIRONMENT]) 등록
 *   → agent 가 LLM 에 노출 → app_tool_call
 *   → ChatArea dispatchAppToolCall 의 환경 분기가 executeEnvironmentSkill 실행
 *   → EnvironmentSession 이 판정 → herdr_* Tauri 명령 → Rust → Herdr 소켓.
 *
 * 뇌가 보는 것은 불투명 손잡이와 네 가지 활동 상태뿐이다. pane_id 는 여기서 멈춘다.
 * 손잡이는 세션이 사는 동안 표면에 고정된다 — 목록을 본 뒤 명령을 넣기까지 사이에
 * 터미널이 닫혀도 손잡이가 다른 표면으로 옮겨 가지 않는다 (FR-ENV-STICKY.1~3).
 */

import { invoke } from "@tauri-apps/api/core";
import {
	EnvironmentSession,
	surfaceRef,
	type DispatchGrants,
	type EnvironmentCommandPort,
	type EnvironmentIntent,
} from "@nextain/naia-os-core/composition";
import type { NaiaTool } from "./app-registry";
import { Logger } from "./logger";

/** appExec 등록용 앱 id — 환경은 화면 앱이 아니라 상시 표면이라 app_skills_clear 대상이 아니다. */
export const ENVIRONMENT_APP_ID = "environment";

export const ENVIRONMENT_ACTIONS = ["observe", "focus", "interrupt", "run"] as const;
export type EnvironmentAction = (typeof ENVIRONMENT_ACTIONS)[number];

export const SKILL_ENVIRONMENT: NaiaTool = {
	name: "skill_environment",
	description:
		"사용자의 작업 표면(터미널·에이전트)을 관측하고 조작한다. observe=지금 무엇이 돌고 있는지 목록을 받는다(손잡이·이름·활동상태). focus=그 표면을 앞으로 가져온다. run=그 표면에서 요청을 실행한다. interrupt=그 표면에서 돌고 있는 것을 멈춘다. surface 인자에는 observe 가 준 손잡이를 그대로 쓴다 — 손잡이를 지어내지 않는다. 거절 사유가 오면 성공했다고 말하지 않는다.",
	parameters: {
		type: "object",
		properties: {
			action: {
				type: "string",
				enum: [...ENVIRONMENT_ACTIONS],
				description: ENVIRONMENT_ACTIONS.join(" | "),
			},
			surface: {
				type: "string",
				description: "observe 가 준 표면 손잡이. focus/run/interrupt 에 필요하다.",
			},
			request: {
				type: "string",
				description: "run 에서 그 표면에 시킬 일.",
			},
		},
		required: ["action"],
	},
	tier: 1,
};

/** Tauri 명령 경계. 코어는 이 포트만 보고 herdr 를 모른다. */
const tauriCommands: EnvironmentCommandPort = {
	invoke: (command, args) => invoke<unknown>(command, args as Record<string, unknown>),
};

/**
 * 셸 세션 하나가 손잡이 발행기를 든다. 모듈 수준인 이유는 손잡이가 대화 턴을 넘어
 * 살아남아야 하기 때문이다 — 관측한 턴과 조작하는 턴이 다르다.
 */
export const environmentSession = new EnvironmentSession();

/** 스냅샷을 실제로 가져와 관측을 갱신한다. 실패하면 null — 없는 것을 있는 척하지 않는다. */
export async function refreshEnvironment(): Promise<ReturnType<EnvironmentSession["latestReport"]>> {
	try {
		const snapshot = await invoke<unknown>("herdr_snapshot");
		return environmentSession.observeSnapshot(snapshot as never);
	} catch (e) {
		// Herdr 이 안 돌고 있는 것은 정상 상태다. 조용히 아무것도 모르는 상태로 둔다.
		Logger.info("environment", "herdr snapshot unavailable", { error: String(e) });
		return null;
	}
}

function toIntent(args: Record<string, unknown>): EnvironmentIntent | string {
	const action = typeof args.action === "string" ? args.action : "";
	const surface = typeof args.surface === "string" ? args.surface : "";
	const request = typeof args.request === "string" ? args.request : "";
	switch (action) {
		case "observe":
			return { kind: "observe" };
		case "focus":
			return surface ? { kind: "focus", surface: surfaceRef(surface) } : "focus 에는 표면 손잡이가 필요하다";
		case "interrupt":
			return surface ? { kind: "interrupt", surface: surfaceRef(surface) } : "interrupt 에는 표면 손잡이가 필요하다";
		case "run":
			return surface && request
				? { kind: "run", surface: surfaceRef(surface), request }
				: "run 에는 표면 손잡이와 요청이 모두 필요하다";
		default:
			return `모르는 동작: ${action || "(없음)"} — ${ENVIRONMENT_ACTIONS.join(" | ")} 중 하나여야 한다`;
	}
}

export interface EnvironmentSkillDeps {
	readonly refresh: () => Promise<unknown>;
	readonly commands: EnvironmentCommandPort;
	readonly grants: DispatchGrants;
	readonly session: EnvironmentSession;
}

/**
 * 도구 호출 하나를 실행하고 뇌가 읽을 결과 문자열을 낸다.
 * 거절과 오류를 성공처럼 쓰지 않는다 — 뇌가 실패를 성공으로 보고하는 경로를 막는다 (FR-ENV-LIVE.5).
 */
export async function executeEnvironmentSkill(
	args: Record<string, unknown>,
	deps: EnvironmentSkillDeps,
): Promise<string> {
	const intent = toIntent(args);
	if (typeof intent === "string") return `거절: ${intent}`;

	// 조작도 관측을 먼저 갱신한다. 사라진 표면의 손잡이가 무효가 되는 지점이다.
	await deps.refresh();

	if (intent.kind === "observe") {
		const report = deps.session.latestReport();
		if (report === null) return "관측 불가: 작업 표면 환경이 지금 응답하지 않는다";
		if (report.surfaces.length === 0) return "관측됨: 지금 열려 있는 작업 표면이 없다";
		const lines = report.surfaces.map(
			(s) => `${s.ref.token}\t${s.activity}${s.focused ? "\t(사용자가 보고 있음)" : ""}\t${s.label}`,
		);
		const tail = report.omitted > 0 ? `\n(상한 때문에 ${report.omitted}개는 싣지 못했다)` : "";
		return `작업 표면 ${report.surfaces.length}개:\n${lines.join("\n")}${tail}`;
	}

	const outcome = await deps.session.act(intent, deps.commands, deps.grants);
	if (outcome.ok) return `전달됨: ${intent.kind}`;
	if ("environmentError" in outcome) return `환경 오류: ${outcome.environmentError}`;
	return `거절: ${outcome.rejections.map((r) => `${r.code} — ${r.detail}`).join(" / ")}`;
}

/** 라이브 배선용 기본 의존. 터미널 입력 권한만 호출자가 정한다. */
export function liveEnvironmentDeps(terminalInput: boolean): EnvironmentSkillDeps {
	const grants: DispatchGrants = { workspaceObserve: true, terminalInput };
	return { refresh: refreshEnvironment, commands: tauriCommands, grants, session: environmentSession };
}
