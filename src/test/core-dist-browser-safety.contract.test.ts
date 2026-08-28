// 배포 표면 가드 — 이 패키지의 dist 는 브라우저 셸(Tauri 웹뷰)이 소비한다.
// node 전용 import 가 배포 대상에 들어가면 셸 빌드가 깨진다(2026-08-26 실제로 깨뜨렸다).
// 문서로 적어 두는 대신 테스트가 막는다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const MAIN = resolve(__dirname, "..", "main");
// node 전용 어댑터는 배포 대상 밖(src/test/harness)에 둔다. tsconfig.build.json 이 src/test 를 이미
// 제외하므로 빌드 설정을 건드리지 않고도 배포 표면이 깨끗하게 유지된다.
const HARNESS_DIR = resolve(__dirname, "harness");
const NODE_IMPORT = /from\s+["']node:/;

function walk(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("배포 표면에 node 전용 import 가 없다", () => {
  const shipped = walk(MAIN);

  it("src/main 에 실제로 파일이 있다 — 목록이 비어 공허하게 통과하지 않는다", () => {
    expect(shipped.length).toBeGreaterThan(20);
  });

  it.each(["node:fs", "node:fs/promises", "node:path", "node:os", "node:child_process"])(
    "%s 를 배포 대상이 import 하지 않는다",
    (mod) => {
      const offenders = shipped.filter((f) => readFileSync(f, "utf8").includes(`from "${mod}"`));
      expect(offenders.map((f) => f.slice(MAIN.length + 1))).toEqual([]);
    },
  );

  it("어떤 형태의 node: import 도 배포 대상에 없다", () => {
    const offenders = shipped.filter((f) => NODE_IMPORT.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.slice(MAIN.length + 1))).toEqual([]);
  });

  it("node 전용 하네스는 실제로 존재하고 node 를 쓴다 — 규칙이 실효 없는 채로 통과하지 않는다", () => {
    const harness = walk(HARNESS_DIR);
    expect(harness.length).toBeGreaterThan(0);
    expect(harness.some((f) => NODE_IMPORT.test(readFileSync(f, "utf8")))).toBe(true);
  });

  it("빌드 설정이 하네스가 있는 src/test 를 제외한다", () => {
    const config = JSON.parse(readFileSync(resolve(MAIN, "..", "..", "tsconfig.build.json"), "utf8"));
    expect(config.exclude).toContain("src/test");
    expect(config.include).toEqual(["src/main"]);
  });
});
