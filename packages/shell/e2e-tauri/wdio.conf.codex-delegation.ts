import { config as codexConfig } from "./wdio.conf.codex.js";

// Explicit opt-in: this scenario performs one real Codex parent turn and one
// workspace-bound Codex child run. Keeping it out of the default Codex suite
// prevents routine builds and CI from consuming model quota.
export const config = {
	...codexConfig,
	specs: ["./specs/98-codex-chat-delegation.spec.ts"],
	mochaOpts: { ui: "bdd", timeout: 420_000 },
};
