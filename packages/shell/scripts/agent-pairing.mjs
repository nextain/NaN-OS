import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const shellDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(shellDir, "agent-pairing.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (!/^[0-9a-f]{40}$/.test(manifest.agentCommit)) {
	throw new Error(`Invalid paired Agent commit in ${manifestPath}`);
}
if (!/^[0-9a-f]{64}$/.test(manifest.protoSha256)) {
	throw new Error(`Invalid paired Agent proto SHA256 in ${manifestPath}`);
}

export const REQUIRED_AGENT_COMMIT = manifest.agentCommit;
export const REQUIRED_PROTO_SHA256 = manifest.protoSha256;
