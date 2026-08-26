// adapters/workspace-fixture — #498 NFR-AGENT-BENCH.2 의 임시 워크스페이스 픽스처.
// 중첩 진입점과 여러 프로젝트를 가진 실제 디렉터리를 만든다. driven adapter — 파일 I/O 는 여기까지만.
// 만든 쪽이 dispose 를 호출한다. dispose 는 만든 루트 밖을 절대 지우지 않는다.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { WorkspaceFixture, WorkspaceFixturePort, WorkspaceFixtureSpec } from "../../main/ports/agent-bench.js";

/** 픽스처 루트 밖을 지우지 못하게 하는 안전장치. 경로가 접두사로 갇혀 있어야 한다. */
function isContained(root: string, candidate: string): boolean {
  const r = resolve(root);
  const c = resolve(candidate);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

export class TempWorkspaceFixtureAdapter implements WorkspaceFixturePort {
  constructor(private readonly baseDir: string = tmpdir()) {}

  async create(spec: WorkspaceFixtureSpec): Promise<WorkspaceFixture> {
    const root = await mkdtemp(join(this.baseDir, "naia-bench-"));
    await writeFile(join(root, spec.rootEntrypoint), rootEntrypointBody(spec), "utf8");
    for (const index of spec.mandatoryIndexes) {
      const target = join(root, index);
      if (!isContained(root, target)) throw new Error(`픽스처 경계 밖 인덱스: ${index}`);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, "{}\n", "utf8");
    }
    const projectsRoot = join(root, "projects");
    for (const project of spec.projects) {
      const dir = join(projectsRoot, project.name);
      // 루트 기준이 아니라 projects/ 기준으로 가둔다. `../x` 는 루트 안으로 정규화되지만
      // 의도한 하위 트리를 벗어나므로 픽스처 형상을 깨뜨린다.
      if (!isContained(projectsRoot, dir) || dir === projectsRoot) throw new Error(`픽스처 경계 밖 프로젝트: ${project.name}`);
      await mkdir(dir, { recursive: true });
      // 프로젝트 진입점도 자기 문서를 스스로 선언해야 한다. 제목만 있으면 실제 파서가
      // 선언 없음으로 보고 진입이 실패한다.
      await mkdir(join(dir, ".agents", "context"), { recursive: true });
      await writeFile(join(dir, ".agents", "context", "project-rules.yaml"), "{}\n", "utf8");
      await writeFile(
        join(dir, project.entrypoint),
        // 선언 경로는 루트 기준으로 해석된다(어댑터가 root.path 에서 찾는다).
        // 프로젝트 안에서 상대 경로로 적으면 declared-index-missing 이 된다.
        `# ${project.name}\n\n## Mandatory Reads\n\n- \`projects/${project.name}/.agents/context/project-rules.yaml\`\n`,
        "utf8",
      );
    }
    let disposed = false;
    return {
      root,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        if (!isContained(this.baseDir, root)) throw new Error(`픽스처 루트가 기준 디렉터리 밖: ${root}`);
        await rm(root, { recursive: true, force: true });
      },
    };
  }
}

/**
 * ⚠️ 경로는 백틱으로 감싸야 한다. 실제 파서(`listedPaths`)가 백틱 안의 경로만 읽는다 —
 *    맨 경로로 적으면 선언이 비어 `entrypoint-malformed` 가 된다. 대역 소스만 이 픽스처를
 *    소비하던 동안에는 이 사실이 드러나지 않았다(2026-08-26 실측).
 */
function rootEntrypointBody(spec: WorkspaceFixtureSpec): string {
  const indexes = spec.mandatoryIndexes.map((i) => `- \`${i}\``).join("\n");
  const projects = spec.projects.map((p) => `- \`projects/${p.name}/${p.entrypoint}\``).join("\n");
  return `# 픽스처 워크스페이스\n\n## Mandatory Reads\n\n${indexes}\n\n## Projects\n\n${projects}\n`;
}
