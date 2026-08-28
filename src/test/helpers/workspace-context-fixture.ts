// #501 계약 테스트용 대역 포트. 결정론 — 파일 시스템도 시계도 쓰지 않는다.
import type { ReadDeclaration, WorkspaceContextSourcePort } from "../../main/ports/workspace-context.js";
import { canonicalRoot, type CanonicalRoot } from "../../main/domain/workspace.js";
import { diagnostic, type ContextDeclaration, type DeclaredDocument } from "../../main/domain/workspace-context.js";

export const ROOT: CanonicalRoot = canonicalRoot("/ws");

export function doc(id: string, path: string, topics: readonly string[] = [], bytes = 100): DeclaredDocument {
  return { id, path, topics, bytes };
}

export function rootDeclaration(over: Partial<ContextDeclaration> = {}): ContextDeclaration {
  return {
    entrypoint: "AGENTS.md",
    documents: [doc("rules", "agents-rules.json"), doc("terms", "terminology.yaml", ["용어"]), doc("reqs", "requirements.yaml", ["요구사항"])],
    projects: [
      { name: "alpha", entrypoint: "projects/alpha/AGENTS.md", documents: [doc("alpha-rules", "projects/alpha/rules.json")] },
      { name: "beta", entrypoint: "projects/beta/AGENTS.md", documents: [doc("beta-terms", "projects/beta/terminology.yaml", ["용어"])] },
    ],
    skills: ["skill-a"],
    governance: ["governance.yaml"],
    ...over,
  };
}

export interface FakeOptions {
  readonly root?: ReadDeclaration;
  readonly projects?: Readonly<Record<string, ReadDeclaration>>;
  readonly missingPaths?: readonly string[];
  readonly fingerprints?: readonly string[];
}

export interface FakeSource extends WorkspaceContextSourcePort {
  readonly reads: string[];
  advanceFingerprint(): void;
}

/** 선언되지 않은 문서를 읽으려 하면 즉시 터진다 — 발견 범위 위반을 조용히 넘기지 않기 위해. */
export function fakeSource(options: FakeOptions = {}): FakeSource {
  const rootRead: ReadDeclaration = options.root ?? { ok: true, declaration: rootDeclaration() };
  const projects = options.projects ?? {};
  const missing = new Set(options.missingPaths ?? []);
  const prints = options.fingerprints ?? ["fp-1"];
  let printIndex = 0;
  const reads: string[] = [];
  return {
    reads,
    advanceFingerprint() {
      printIndex = Math.min(printIndex + 1, prints.length - 1);
    },
    async readRootDeclaration() {
      return rootRead;
    },
    async readProjectDeclaration(_root, project) {
      return (
        projects[project] ?? {
          ok: false,
          diagnostics: [diagnostic("entrypoint-missing", `projects/${project}/AGENTS.md`, ROOT.path)],
        }
      );
    },
    async documentExists(_root, relativePath) {
      return !missing.has(relativePath);
    },
    async readDocument(_root, relativePath) {
      reads.push(relativePath);
      return `본문:${relativePath}`;
    },
    async fingerprint() {
      return prints[printIndex] as string;
    },
  };
}
