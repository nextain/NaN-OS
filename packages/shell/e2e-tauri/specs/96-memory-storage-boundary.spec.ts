import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const adkPath = process.env.NAIA_E2E_ADK_PATH;

async function tauriInvoke<T>(command: string): Promise<T> {
	return (await browser.execute(async (cmd: string) => {
		const w = window as unknown as {
			__TAURI_INTERNALS__?: { invoke: (name: string, value: unknown) => Promise<unknown> };
			__TAURI__?: { core?: { invoke: (name: string, value: unknown) => Promise<unknown> } };
		};
		const invoke = w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.core?.invoke;
		if (!invoke) throw new Error("Tauri invoke unavailable");
		return invoke(cmd, {});
	}, command)) as T;
}

describe("Naia Memory ADK settings storage boundary", () => {
	it("reads Agent's exact store through the real native Shell IPC", async () => {
		if (!adkPath) throw new Error("NAIA_E2E_ADK_PATH is required");

		const storePath = resolve(adkPath, "naia-settings", "memory", "store.json");
		const legacyPath = resolve(adkPath, "naia-settings", ".memory", "alpha-memory.json");
		mkdirSync(resolve(storePath, ".."), { recursive: true });
		mkdirSync(resolve(legacyPath, ".."), { recursive: true });
		writeFileSync(storePath, JSON.stringify({
			version: 1,
			facts: [{ id: "new-boundary", content: "memory/store.json", importance: 1 }],
		}), { mode: 0o600 });
		writeFileSync(legacyPath, JSON.stringify({
			version: 1,
			facts: [{ id: "legacy-boundary", content: ".memory/alpha-memory.json" }],
		}), { mode: 0o600 });

		const facts = await tauriInvoke<Array<{ id: string; content: string }>>("memory_get_all_facts");
		expect(facts.map((fact) => fact.id)).toEqual(["new-boundary"]);
		expect(facts[0]?.content).toBe("memory/store.json");
		expect(existsSync(storePath)).toBe(true);
		expect(JSON.parse(readFileSync(storePath, "utf8")).facts).toHaveLength(1);
	});
});
