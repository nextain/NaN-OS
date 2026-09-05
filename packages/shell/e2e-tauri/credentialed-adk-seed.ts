// 자격증명 등급(credentialed_live)의 살아 있는 기본 공급자를 격리 ADK 에 심는다 (#547).
//
// 왜 필요한가. 셸이 실어 보내는 provider 는 gRPC 경계에서 버려지는 것이 정본이고
// (agent_grpc.rs 의 "provider 제거"), 에이전트는 그 대신 **워크스페이스의**
// `naia-settings/config.json` 의 `llmRoles.main` 으로 활성 공급자를 재구성한다
// (naia-agent 의 adapters/naia-settings-store.ts, 폴백은 같은 자리의 `llm.json`).
// 그래서 e2e 가 자기 워크스페이스를 격리해 놓고 그 안에 아무것도 심지 않으면,
// 에이전트는 사람이 쓰던 실제 ADK 의 설정이나 그 자리에 남은 죽은 값
// (예: 한때 남았던 `ollama/e2e`, 지금 이 기계에만 있는 로컬 서버 주소)을 물고
// `provider error: fetch failed` 로 죽는다. 자격증명 등급 마흔다섯 개 중 서른셋이
// 두 기계에서 같은 자리에 걸린 이유가 그것이다.
//
// 심는 값은 대조군이 이미 통과시킨 것과 같다 — 나이아 게이트웨이(`nextain`)의
// `deepseek-v4-flash`. 게이트웨이는 리눅스·윈도우 양쪽에서 닿고, 기계마다 다른
// 로컬 서버를 전제하지 않는다.
//
// 키는 **파일에 쓰지 않는다.** `llmRoles.main.credentialRef` 에 환경 변수 *이름*만
// 적어 두면 에이전트가 자기 환경(`resolveSecret = env[ref] ?? 키체인`)에서 값을
// 찾는다. 그래서 이 함수가 만드는 config.json 에는 자격증명이 한 글자도 없다.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	type SeedableShellConfig,
	buildSeedShellConfig,
} from "../src/lib/config-seed.js";

/** 자격증명 등급의 기본 공급자. 대조군 70c 가 통과시킨 조합과 같다. */
export const CREDENTIALED_MAIN_PROVIDER = "nextain";
export const CREDENTIALED_MAIN_MODEL = "deepseek-v4-flash";

// 키 이름과 "하네스가 채우는 변수" 의 정본은 `harness-provided-env.mjs` 다.
// 회귀 러너의 선별 모듈(scripts/lib/regression-selection.mjs)이 맨 노드로 도는
// `.mjs` 라 `.ts` 를 읽을 수 없어, 정본을 `.mjs` 에 두고 이쪽이 읽는 방향으로
// 뒤집었다. 여기서 그대로 다시 내보내므로 이 모듈을 쓰던 자리는 그대로다 —
// 두 곳에 같은 목록을 적으면 다음에 하나가 바뀔 때 조용히 갈라진다.
export {
	CREDENTIALED_KEY_ENV,
	HARNESS_PROVIDED_ENV,
	HARNESS_PROVIDED_ENV_CONFS,
	credentialedSeedActive,
	credentialedSeedAvailable,
	harnessProvidedEnv,
} from "./harness-provided-env.mjs";
import { CREDENTIALED_KEY_ENV } from "./harness-provided-env.mjs";

type Env = Record<string, string | undefined>;

export interface CredentialedSeedOptions {
	provider?: string;
	model?: string;
	credentialRefEnv?: string;
}

/**
 * 심을 공급자를 환경에서 고른다. 이름은 codex 전용 환경이 이미 쓰는 것과 같다
 * (`NAIA_E2E_MAIN_PROVIDER`/`NAIA_E2E_MAIN_MODEL`) — 두 하네스가 다른 이름을 쓰면
 * 사람이 한쪽에만 값을 주고 다른 쪽이 조용히 기본값으로 도는 일이 생긴다.
 * 기본값은 제품의 배포 기본 경로이자 70c 가 통과시킨 조합이다.
 */
export function credentialedSeedOptionsFromEnv(
	env: Env = process.env,
): CredentialedSeedOptions {
	return {
		...(env.NAIA_E2E_MAIN_PROVIDER?.trim()
			? { provider: env.NAIA_E2E_MAIN_PROVIDER.trim() }
			: {}),
		...(env.NAIA_E2E_MAIN_MODEL?.trim()
			? { model: env.NAIA_E2E_MAIN_MODEL.trim() }
			: {}),
	};
}

/**
 * 격리 ADK 에 쓸 config.json 내용. 순수 함수 — 파일도 환경도 건드리지 않는다.
 *
 * `llmRoles.main` 이 제품의 정본이고 최상위 `provider`/`model` 은 구 릴리스를 위한
 * 호환 거울이다(naia-settings-store 의 fromConfigJson 주석). 둘을 같이 적어야 셸의
 * 하이드레이션이 온보딩을 이미 마친 것으로 보고 자기 기본값으로 덮지 않는다
 * (e2e-tauri/helpers/settings.ts 의 ensureAppReady 가 `onboardingComplete` 와
 * provider 를 그 판정에 쓴다).
 */
export function buildCredentialedAdkConfig(
	adkPath: string,
	options: CredentialedSeedOptions = {},
): SeedableShellConfig {
	const provider = options.provider ?? CREDENTIALED_MAIN_PROVIDER;
	const model = options.model ?? CREDENTIALED_MAIN_MODEL;
	const credentialRef = options.credentialRefEnv ?? CREDENTIALED_KEY_ENV;
	return buildSeedShellConfig({
		provider,
		model,
		// 키는 여기에 없다. 셸도 `write_naia_config` 로 쓸 때 시크릿을 벗겨 낸다.
		apiKey: "",
		llmRoles: {
			main: { provider, model, credentialRef },
		},
		onboardingComplete: true,
		workspaceRoot: adkPath,
		appVisible: true,
		locale: "ko",
		enableTools: true,
		agentName: "Naia",
		userName: "Tester",
		persona: "Friendly AI companion",
		vrmModel: "/avatars/01-OL_Woman.vrm",
	});
}

export interface CredentialedSeedResult {
	adkPath: string;
	configPath: string;
	provider: string;
	model: string;
	credentialRefEnv: string;
}

/**
 * `<adkPath>/naia-settings/config.json` 에 살아 있는 기본 공급자를 쓴다.
 * 디렉터리는 없으면 만든다. 자리는 부르는 쪽이 정한다 — 이 함수는 실행 자리
 * 아래인지 알지 못하므로, 지울 수 있는 자리인지도 부르는 쪽 책임이다.
 */
export function seedCredentialedAdk(
	adkPath: string,
	options: CredentialedSeedOptions = {},
): CredentialedSeedResult {
	const root = resolve(adkPath);
	const settingsDir = resolve(root, "naia-settings");
	mkdirSync(settingsDir, { recursive: true });
	const configPath = resolve(settingsDir, "config.json");
	const config = buildCredentialedAdkConfig(root, options);
	writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
		mode: 0o600,
	});
	// 에이전트는 processing.json 을 라이브 설정 재적재의 신뢰 경계로 삼는다.
	// 갓 만든 워크스페이스에는 정책이 없으므로 빈 정책을 같이 둔다 —
	// 셸의 write_naia_config 가 하는 것과 같다.
	const processingPath = resolve(settingsDir, "processing.json");
	writeFileSync(
		processingPath,
		`${JSON.stringify({ version: 1, profiles: [], consents: [] }, null, 2)}\n`,
		{ mode: 0o600 },
	);
	return {
		adkPath: root,
		configPath,
		provider: config.provider ?? CREDENTIALED_MAIN_PROVIDER,
		model: config.model ?? CREDENTIALED_MAIN_MODEL,
		credentialRefEnv: options.credentialRefEnv ?? CREDENTIALED_KEY_ENV,
	};
}
