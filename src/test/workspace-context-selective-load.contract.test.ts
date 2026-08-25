// #501 선택 로딩 계약 테스트 (P02) — FR-WORKSPACE-CONTEXT.2.
// 의도에 걸리는 것만 싣는가, 상한을 넘긴 것을 조용히 자르지 않는가, 결과가 결정적인가.
import { describe, it, expect } from "vitest";
import { selectDocuments, rootScope, type ContextDeclaration } from "../main/domain/workspace-context.js";
import { doc, rootDeclaration } from "./helpers/workspace-context-fixture.js";

const DECL: ContextDeclaration = rootDeclaration();
const WIDE = { maxDocuments: 10, maxBytes: 10_000 };

describe("의도 기반 선택 (FR-WORKSPACE-CONTEXT.2)", () => {
  it("의도가 비면 필수 문서만 싣는다", () => {
    const s = selectDocuments(DECL, { topics: [] }, WIDE);
    expect(s.loaded.map((d) => d.ref.id)).toEqual(["rules"]);
  });

  it("의도에 걸리는 문서만 추가로 싣는다", () => {
    const s = selectDocuments(DECL, { topics: ["용어"] }, WIDE);
    expect(s.loaded.map((d) => d.ref.id)).toEqual(["rules", "terms"]);
  });

  it("걸리지 않는 주제는 싣지 않는다 — 워크스페이스 전체를 밀어 넣지 않는다", () => {
    const s = selectDocuments(DECL, { topics: ["관계없는주제"] }, WIDE);
    expect(s.loaded.map((d) => d.ref.id)).toEqual(["rules"]);
  });

  it("로드 사유가 필수와 의도로 구분된다", () => {
    const s = selectDocuments(DECL, { topics: ["요구사항"] }, WIDE);
    expect(s.loaded.map((d) => [d.ref.id, d.reason])).toEqual([
      ["rules", "mandatory"],
      ["reqs", "intent-topic"],
    ]);
  });
});

describe("로드 상한 (FR-WORKSPACE-CONTEXT.2)", () => {
  it("문서 수 상한을 넘기면 못 실은 것을 dropped 에 남긴다", () => {
    const s = selectDocuments(DECL, { topics: ["용어", "요구사항"] }, { maxDocuments: 2, maxBytes: 10_000 });
    expect(s.loaded.map((d) => d.ref.id)).toEqual(["rules", "terms"]);
    expect(s.dropped.map((d) => d.id)).toEqual(["reqs"]);
  });

  it("바이트 상한을 넘기면 마찬가지로 남긴다", () => {
    const s = selectDocuments(DECL, { topics: ["용어", "요구사항"] }, { maxDocuments: 10, maxBytes: 150 });
    expect(s.loaded.map((d) => d.ref.id)).toEqual(["rules"]);
    expect(s.dropped.map((d) => d.id)).toEqual(["terms", "reqs"]);
    expect(s.totalBytes).toBe(100);
  });

  it("필수 문서가 상한에 걸려도 조용히 사라지지 않는다", () => {
    const decl = rootDeclaration({ documents: [doc("a", "a.json"), doc("b", "b.json")] });
    const s = selectDocuments(decl, { topics: [] }, { maxDocuments: 1, maxBytes: 10_000 });
    expect(s.loaded.map((d) => d.ref.id)).toEqual(["a"]);
    expect(s.dropped.map((d) => d.id)).toEqual(["b"]);
  });

  it("상한 안이면 dropped 가 비어 있다", () => {
    expect(selectDocuments(DECL, { topics: ["용어", "요구사항"] }, WIDE).dropped).toEqual([]);
  });
});

describe("결정성", () => {
  it("같은 입력이면 같은 순서로 나온다", () => {
    const a = selectDocuments(DECL, { topics: ["요구사항", "용어"] }, WIDE, rootScope());
    const b = selectDocuments(DECL, { topics: ["요구사항", "용어"] }, WIDE, rootScope());
    expect(a).toEqual(b);
    expect(a.loaded.map((d) => d.ref.id)).toEqual(["rules", "terms", "reqs"]);
  });
});
