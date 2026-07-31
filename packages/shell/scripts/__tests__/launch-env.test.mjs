import { expect, test } from "vitest";

import { interactiveLaunchEnv } from "../launch-env.mjs";

test("interactive launch removes native E2E workspace overrides", () => {
	const source = {
		PATH: "C:/Windows/System32",
		CAFE_DEBUG_E2E: "1",
		NAIA_E2E_ADK_PATH: "C:/tmp/e2e/workspace",
		NAIA_E2E_RUNTIME_DIR: "C:/tmp/e2e/runtime",
		VITE_NAIA_E2E_ADK_PATH: "C:/tmp/e2e/workspace",
		VITE_NAIA_E2E_AUTOCHAT: "1",
		TAURI_WEBDRIVER_PORT: "4450",
		WEBVIEW2_USER_DATA_FOLDER: "C:/tmp/e2e/webview2",
		NAIA_AGENT_SCRIPT: "C:/paired/agent.mjs",
	};

	const actual = interactiveLaunchEnv(source);

	expect(actual).toEqual({
		PATH: "C:/Windows/System32",
		NAIA_AGENT_SCRIPT: "C:/paired/agent.mjs",
	});
	expect(source.NAIA_E2E_ADK_PATH).toBe("C:/tmp/e2e/workspace");
});

test("interactive launch preserves user and paired-runtime settings", () => {
	const actual = interactiveLaunchEnv({
		NAIA_PROD_KEY: "secret",
		NAIA_AGENT_SCRIPT: "C:/paired/agent.mjs",
		NAIA_AGENT_PROTO_DIR: "C:/paired/grpc",
		NAIA_CASCADE_LOADER_DIR: "C:/cascade",
		VITE_NAIA_NEW_CORE: "1",
	});

	expect(actual.NAIA_PROD_KEY).toBe("secret");
	expect(actual.NAIA_AGENT_SCRIPT).toBe("C:/paired/agent.mjs");
	expect(actual.NAIA_AGENT_PROTO_DIR).toBe("C:/paired/grpc");
	expect(actual.NAIA_CASCADE_LOADER_DIR).toBe("C:/cascade");
	expect(actual.VITE_NAIA_NEW_CORE).toBe("1");
});
