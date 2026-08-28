#!/usr/bin/env node
// #502 — `herdr api schema --json` 을 계약 대조에 필요한 만큼만 남긴다.
// 원본은 250KB 가 넘어 리뷰가 불가능하다. 여기서 뽑는 것은 우리 계약이 실제로 기대는 사실뿐이다:
// 메서드 목록, 이벤트 종류, 요청/응답 필수 필드, 그리고 개정·순번·멱등 필드의 존재 여부.
// 사용: node src/test/harness/distill-herdr-schema.mjs < schema.json > src/test/fixtures/herdr-protocol-19.json
import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] ? readFileSync(process.argv[2], "utf8") : readFileSync(0, "utf8");
const schema = JSON.parse(input);

function methodsOf(request) {
  const out = [];
  for (const variant of request.oneOf ?? []) {
    const method = variant.properties?.method ?? {};
    const name = method.const ?? (method.enum ?? [])[0];
    if (name) out.push(name);
  }
  return out.sort();
}

function fieldOwners(node, field, path = "", found = []) {
  if (node && typeof node === "object") {
    if (!Array.isArray(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (key === field && value && typeof value === "object" && "type" in value) found.push(path);
        fieldOwners(value, field, path ? `${path}/${key}` : key, found);
      }
    } else {
      node.forEach((value, i) => fieldOwners(value, field, `${path}[${i}]`, found));
    }
  }
  return found;
}

function ownerNames(field) {
  return [
    ...new Set(
      fieldOwners(schema, field)
        .map((p) => p.split("/$defs/")[1]?.split("/")[0])
        .filter(Boolean),
    ),
  ].sort();
}

const distilled = {
  _why: "herdr api schema --json 의 대조용 축약본. 재생성 = src/test/harness/distill-herdr-schema.mjs",
  protocol: schema.protocol,
  schemaVersion: schema.schema_version,
  methods: methodsOf(schema.schemas.request),
  eventKinds: schema.schemas.event.$defs?.EventKind?.enum ?? [],
  requestRequired: schema.schemas.request.required ?? [],
  successResponseRequired: schema.schemas.success_response.required ?? [],
  errorResponseRequired: schema.schemas.error_response.required ?? [],
  eventRequired: schema.schemas.event.required ?? [],
  revisionCarriers: ownerNames("revision"),
  sequenceCarriers: ownerNames("seq"),
  hasIdempotencyKey: JSON.stringify(schema).toLowerCase().includes("idempot"),
};

const output = `${JSON.stringify(distilled, null, 2)}\n`;
if (process.argv[3]) writeFileSync(process.argv[3], output, "utf8");
else process.stdout.write(output);
