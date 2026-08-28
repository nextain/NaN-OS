// domain/workspace-entrypoint — #501 진입점 Markdown 파싱. 순수. 파일 I/O 0.
// 어댑터가 둘(파일 시스템·관측 포트)이라 파싱이 어느 한쪽에 붙어 있으면 다른 쪽이 그 어댑터를
// 통째로 끌고 온다. 셸 번들에 node:fs 가 딸려 들어가는 것을 막으려면 여기 있어야 한다.
import type { ContextDeclaration, DeclaredDocument, ProjectDeclaration } from "./workspace-context.js";

const HEADING = /^#{1,6}\s+(.*)$/;
const BACKTICKED = /`([^`]+)`/;

/** 지정한 제목으로 시작하는 절의 본문 줄. 다음 같은 수준 이상 제목에서 끊는다. */
export function sectionLines(markdown: string, titlePrefix: string): readonly string[] {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let depth = 0;
  let inside = false;
  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m) {
      const level = (line.match(/^#+/) ?? ["#"])[0].length;
      const title = (m[1] ?? "").trim();
      if (inside && level <= depth) break;
      if (!inside && title.toLowerCase().startsWith(titlePrefix.toLowerCase())) {
        inside = true;
        depth = level;
      }
      continue;
    }
    if (inside) out.push(line);
  }
  return out;
}

/** 목록 항목에서 첫 백틱 경로만 뽑는다. 설명 문구의 다른 백틱은 무시한다. */
function listedPaths(lines: readonly string[]): readonly string[] {
  const paths: string[] = [];
  for (const line of lines) {
    if (!/^\s*(?:[-*+]|\d+\.)\s/.test(line)) continue;
    const m = BACKTICKED.exec(line);
    const p = m?.[1]?.trim();
    if (p) paths.push(p);
  }
  return paths;
}

/**
 * 진입점 선언 파싱.
 * `Mandatory Reads` 절의 백틱 경로가 필수 문서, `Projects` 절의 항목이 프로젝트 진입점이다.
 * ⚠️ 주제가 붙은 선택 문서(FR-WORKSPACE-CONTEXT.2)를 선언하는 절 형식은 아직 정하지 않았다 —
 *    실제 진입점들이 그런 절을 갖고 있지 않다. 그래서 여기서 나오는 문서는 전부 필수(topics 빈 배열)다.
 *    형식을 지어내지 않는다.
 */
export function parseDeclaration(entrypoint: string, markdown: string): ContextDeclaration {
  const documents: DeclaredDocument[] = listedPaths(sectionLines(markdown, "Mandatory Reads")).map((path) => ({
    id: path,
    path,
    topics: [],
    bytes: 0,
  }));
  const projects: ProjectDeclaration[] = listedPaths(sectionLines(markdown, "Projects")).map((path) => ({
    name: path.split(/[\\/]/).filter((s) => s !== "projects")[0] ?? path,
    entrypoint: path,
    documents: [],
  }));
  return { entrypoint, documents, projects, skills: [], governance: [] };
}

/** 진입점 이름이 프로젝트 이름으로 쓰이지 못하게 막는다. `../x` 는 join 뒤 루트 안으로 정규화된다. */
export function isSafeProjectName(project: string): boolean {
  return project.length > 0 && !/[\\/]/.test(project) && project !== "." && project !== "..";
}
