// FR-SHELL-ISO.1 (#425): 개발 인스턴스 포트/플래그 env 계약.
import { describe, expect, it } from "vitest";
import {
	DEV_BGM_PORT,
	DEV_OAUTH_CALLBACK_PORT,
	developmentInstanceEnv,
} from "../dev-instance.mjs";

describe("developmentInstanceEnv (FR-SHELL-ISO.1)", () => {
	it("dev 인스턴스 기본 포트는 운영(18791/18792)과 겹치지 않는다", () => {
		const env = developmentInstanceEnv({});
		expect(env.NAIA_DEV_INSTANCE).toBe("1");
		expect(env.NAIA_BGM_PORT).toBe(DEV_BGM_PORT);
		expect(env.NAIA_OAUTH_CALLBACK_PORT).toBe(DEV_OAUTH_CALLBACK_PORT);
		expect(env.NAIA_BGM_PORT).not.toBe("18791");
		expect(env.NAIA_OAUTH_CALLBACK_PORT).not.toBe("18792");
		expect(env.VITE_NAIA_BGM_BASE).toBe(`http://localhost:${DEV_BGM_PORT}`);
		expect(env.VITE_NAIA_OAUTH_CALLBACK_URL).toBe(
			`http://127.0.0.1:${DEV_OAUTH_CALLBACK_PORT}/auth/callback`,
		);
	});

	it("호출자가 지정한 포트/URL 은 보존한다", () => {
		const env = developmentInstanceEnv({
			NAIA_BGM_PORT: "20001",
			VITE_NAIA_OAUTH_CALLBACK_URL: "http://127.0.0.1:20002/auth/callback",
		});
		expect(env.NAIA_BGM_PORT).toBe("20001");
		expect(env.VITE_NAIA_BGM_BASE).toBe("http://localhost:20001");
		expect(env.VITE_NAIA_OAUTH_CALLBACK_URL).toBe(
			"http://127.0.0.1:20002/auth/callback",
		);
	});
});
