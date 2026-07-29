import { config as embeddedConfig } from "./wdio.conf.codex.js";

export const config = {
	...embeddedConfig,
	specs: ["./specs/100-gateway-billing-vertical.spec.ts"],
};
