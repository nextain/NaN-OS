// @vitest-environment jsdom
/**
 * 워크스페이스 앱이 레지스트리에 무엇으로 등록되는지, 그리고 도구 목록에
 * 어떤 계약이 적혀 있는지.
 *
 * 이 케이스들은 2026-09-05 에 `apps/__tests__/workspace-area.test.tsx` 에서
 * 옮겨 왔다. 그 파일은 지운 `WorkspaceCenterArea` 를 그리느라 함께 지워야
 * 했지만, 여기서 재는 것은 살아 있는 `apps/workspace/index.tsx` 다 —
 * 등록 자체와 도구 서술자는 Herdr 통합 뒤에도 그대로다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(async () => null),
}));

describe("Workspace app registry", () => {
	beforeEach(async () => {
		// index 를 불러야 등록이 일어난다.
		await import("../index");
	});

	it("registers workspace app as builtIn", async () => {
		const { appRegistry } = await import("../../../lib/app-registry");
		const app = appRegistry.get("workspace");

		expect(app).toBeDefined();
		expect(app?.builtIn).toBe(true);
		expect(app?.id).toBe("workspace");
	});

	it("workspace app has skill_workspace_get_sessions tool", async () => {
		const { appRegistry } = await import("../../../lib/app-registry");
		const tool = appRegistry
			.get("workspace")
			?.tools?.find((t) => t.name === "skill_workspace_get_sessions");

		expect(tool).toBeDefined();
		expect(tool?.tier).toBe(0);
	});

	it("workspace app has skill_workspace_open_file tool", async () => {
		const { appRegistry } = await import("../../../lib/app-registry");
		const tool = appRegistry
			.get("workspace")
			?.tools?.find((t) => t.name === "skill_workspace_open_file");

		expect(tool).toBeDefined();
		expect(tool?.tier).toBe(1);
	});

	it("workspace app has skill_workspace_focus_session tool", async () => {
		const { appRegistry } = await import("../../../lib/app-registry");
		const tool = appRegistry
			.get("workspace")
			?.tools?.find((t) => t.name === "skill_workspace_focus_session");

		expect(tool).toBeDefined();
		expect(tool?.tier).toBe(1);
	});

	it("workspace app has onActivate and onDeactivate hooks", async () => {
		const { appRegistry } = await import("../../../lib/app-registry");
		const app = appRegistry.get("workspace");

		expect(typeof app?.onActivate).toBe("function");
		expect(typeof app?.onDeactivate).toBe("function");
	});

	it("skill_workspace_send_to_session is registered in index.tsx tool descriptor list", async () => {
		const { WORKSPACE_TOOLS } = await import("../index");
		const descriptor = WORKSPACE_TOOLS.find(
			(t) => t.name === "skill_workspace_send_to_session",
		);
		expect(descriptor).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: asserted above
		const params = descriptor!.parameters!;
		expect(params.properties).toHaveProperty("dir");
		expect(params.properties).toHaveProperty("text");
		expect(params.required).toContain("dir");
		expect(params.required).toContain("text");
	});
});
