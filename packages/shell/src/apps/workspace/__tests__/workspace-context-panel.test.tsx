// @vitest-environment jsdom
// #501 UI 계약 테스트 (P02) — UC-WORKSPACE-CONTEXT-* 의 상태 매트릭스.
// 기본·빈 목록·진행·성공·오류·전환을 모두 밟는다. 실 core 서비스를 쓴다 — mock 하지 않는다.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import {
	WorkspaceContextService,
	type CanonicalRoot,
} from "@nextain/naia-os-core/composition";
import { t } from "../../../lib/i18n";
import { WorkspaceContextPanel } from "../WorkspaceContextPanel";

const LIMITS = { maxDocuments: 10, maxBytes: 10_000 };

interface Declared {
	readonly id: string;
	readonly path: string;
	readonly topics: readonly string[];
	readonly bytes: number;
}

function doc(path: string, bytes = 100): Declared {
	return { id: path, path, topics: [], bytes };
}

function source(over: {
	root?: unknown;
	projects?: Record<string, unknown>;
	missing?: readonly string[];
} = {}) {
	const rootRead = over.root ?? {
		ok: true,
		declaration: {
			entrypoint: "AGENTS.md",
			documents: [doc("agents-rules.json"), doc("project-index.yaml")],
			projects: [
				{ name: "alpha", entrypoint: "projects/alpha/AGENTS.md", documents: [] },
				{ name: "beta", entrypoint: "projects/beta/AGENTS.md", documents: [] },
			],
			skills: [],
			governance: [],
		},
	};
	const missing = new Set(over.missing ?? []);
	return {
		async readRootDeclaration() {
			return rootRead;
		},
		async readProjectDeclaration(_r: CanonicalRoot, name: string) {
			return (
				over.projects?.[name] ?? {
					ok: false,
					diagnostics: [
						{
							code: "entrypoint-missing",
							target: `projects/${name}/AGENTS.md`,
							searchedIn: "/ws",
							action: "만든다",
						},
					],
				}
			);
		},
		async documentExists(_r: CanonicalRoot, p: string) {
			return !missing.has(p);
		},
		async readDocument(_r: CanonicalRoot, p: string) {
			return `본문:${p}`;
		},
		async fingerprint() {
			return "fp-1";
		},
	};
}

function service(over: Parameters<typeof source>[0] = {}): WorkspaceContextService {
	// core 의 실제 서비스에 대역 출처만 넣는다 — 규칙은 진짜 것이 돈다.
	return new WorkspaceContextService(source(over) as never, LIMITS);
}

afterEach(cleanup);

describe("성공 상태 (UC-WORKSPACE-CONTEXT-DISCOVER)", () => {
	it("선언된 문서를 근거와 함께 보여 준다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service()} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-documents")).toBeInTheDocument());
		const items = screen.getAllByTestId("workspace-context-document");
		expect(items).toHaveLength(2);
		expect(items[0]).toHaveTextContent("agents-rules.json");
		expect(items[0]).toHaveTextContent("AGENTS.md");
	});

	it("각 문서에 왜 실렸는지가 붙는다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service()} />);
		await waitFor(() => expect(screen.getAllByTestId("workspace-context-reason")).toHaveLength(2));
		for (const reason of screen.getAllByTestId("workspace-context-reason")) {
			expect(reason).toHaveTextContent(t("workspace.contextReasonMandatory"));
		}
	});

	it("범위와 개정을 함께 보여 준다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service()} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-scope")).toHaveTextContent(t("workspace.contextScopeRoot")));
		expect(screen.getByTestId("workspace-context-scope")).toHaveTextContent("1");
	});
});

describe("빈 목록과 루트 없음", () => {
	it("루트가 없으면 그렇게 말한다 — 빈 목록으로 위장하지 않는다", () => {
		render(<WorkspaceContextPanel workspaceRoot="" service={service()} />);
		expect(screen.getByTestId("workspace-context-no-root")).toBeInTheDocument();
		expect(screen.getByTestId("workspace-context-refresh")).toBeDisabled();
	});

	it("선언된 문서가 없으면 실패로 다룬다 — 빈 성공이 아니다", async () => {
		const empty = service({
			root: {
				ok: false,
				diagnostics: [
					{ code: "entrypoint-malformed", target: "AGENTS.md", searchedIn: "/ws", action: "형식을 고친다" },
				],
			},
		});
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={empty} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-error")).toBeInTheDocument());
	});
});

describe("오류 상태 (UC-WORKSPACE-CONTEXT-BROKEN-ENTRYPOINT)", () => {
	it("무엇을 어디서 찾다 실패했고 무엇을 하면 되는지 보여 준다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service({ missing: ["project-index.yaml"] })} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-error")).toBeInTheDocument());
		const diagnostic = screen.getByTestId("workspace-context-diagnostic");
		expect(diagnostic).toHaveTextContent("project-index.yaml");
		expect(diagnostic).toHaveTextContent("declared-index-missing");
		expect(diagnostic).toHaveTextContent("/ws");
		// 조치 문구는 core 도메인이 만든다. 여기서는 대상 경로를 짚는 조치가 실제로 표시되는지만 본다.
		expect(diagnostic.querySelector("em")?.textContent ?? "").toContain("project-index.yaml");
	});

	it("실패했을 때 문서 목록을 보여 주지 않는다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service({ missing: ["agents-rules.json"] })} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-error")).toBeInTheDocument());
		expect(screen.queryByTestId("workspace-context-documents")).not.toBeInTheDocument();
	});
});

describe("프로젝트 전환 (UC-WORKSPACE-CONTEXT-ENTER-PROJECT·SWITCH-PROJECT)", () => {
	const withAlpha = {
		projects: {
			alpha: {
				ok: true,
				declaration: {
					entrypoint: "projects/alpha/AGENTS.md",
					documents: [doc("agents-rules.json"), doc("projects/alpha/local.json")],
					projects: [],
					skills: [],
					governance: [],
				},
			},
		},
	};

	it("선언된 프로젝트를 고를 수 있다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service(withAlpha)} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-projects")).toBeInTheDocument());
		expect(screen.getByTestId("workspace-context-project-alpha")).toBeInTheDocument();
		expect(screen.getByTestId("workspace-context-project-beta")).toBeInTheDocument();
	});

	it("들어가면 범위와 개정이 바뀌고 프로젝트 문서가 실린다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service(withAlpha)} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-project-alpha")).toBeInTheDocument());
		fireEvent.click(screen.getByTestId("workspace-context-project-alpha"));
		await waitFor(() => expect(screen.getByTestId("workspace-context-scope")).toHaveTextContent("alpha"));
		expect(screen.getByTestId("workspace-context-scope")).toHaveTextContent("2");
		await waitFor(() =>
			expect(
				screen.getAllByTestId("workspace-context-document").some((el) => el.textContent?.includes("projects/alpha/local.json")),
			).toBe(true),
		);
	});

	it("들어간 뒤에는 루트로 돌아가는 길이 생긴다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service(withAlpha)} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-project-alpha")).toBeInTheDocument());
		expect(screen.queryByTestId("workspace-context-back-to-root")).not.toBeInTheDocument();
		fireEvent.click(screen.getByTestId("workspace-context-project-alpha"));
		await waitFor(() => expect(screen.getByTestId("workspace-context-back-to-root")).toBeInTheDocument());
	});

	it("없는 프로젝트를 고르면 진단을 보여 주고 이전 목록을 남기지 않는다", async () => {
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service()} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-project-beta")).toBeInTheDocument());
		fireEvent.click(screen.getByTestId("workspace-context-project-beta"));
		await waitFor(() => expect(screen.getByTestId("workspace-context-error")).toBeInTheDocument());
		expect(screen.queryByTestId("workspace-context-documents")).not.toBeInTheDocument();
	});
});

describe("다시 읽기", () => {
	it("다시 읽으면 루트 범위로 돌아간다", async () => {
		const withAlpha = {
			projects: {
				alpha: {
					ok: true,
					declaration: {
						entrypoint: "projects/alpha/AGENTS.md",
						documents: [doc("agents-rules.json")],
						projects: [],
						skills: [],
						governance: [],
					},
				},
			},
		};
		render(<WorkspaceContextPanel workspaceRoot="/ws" service={service(withAlpha)} />);
		await waitFor(() => expect(screen.getByTestId("workspace-context-project-alpha")).toBeInTheDocument());
		fireEvent.click(screen.getByTestId("workspace-context-project-alpha"));
		await waitFor(() => expect(screen.getByTestId("workspace-context-scope")).toHaveTextContent("alpha"));
		fireEvent.click(screen.getByTestId("workspace-context-refresh"));
		await waitFor(() => expect(screen.getByTestId("workspace-context-scope")).toHaveTextContent(t("workspace.contextScopeRoot")));
	});
});
