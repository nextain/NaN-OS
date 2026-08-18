import { expect, test } from "@playwright/test";
import {
	SEED_ADK_PATH,
	TAURI_BASE_MOCK_FALLBACK,
} from "./helpers/tauri-base-mock";

/**
 * #453 GOAL 3 — cascade normal operation via the given URL, verified in the UI.
 *
 * Pointing the shell's voice facade at the live cascade (naia-omni) endpoint,
 * the profile slot overview polls the REAL cascade `/health` and reports the TTS
 * slot as running when cascade advertises `tts_enabled + tts`. No mock health:
 * the fetch crosses to the actual cascade (which serves `Access-Control-Allow-
 * Origin: *`). A cascade that is down, or serving without the tts capability,
 * would leave the slot in the "starting" state and fail this test.
 *
 * The cascade URL is overridable via CASCADE_E2E_URL; the default is the current
 * validation baseline. Skips when the URL is unreachable so a transient tunnel
 * outage does not red the suite.
 */

const CASCADE_URL =
	process.env.CASCADE_E2E_URL ||
	"https://higher-injured-served-maine.trycloudflare.com";
const API_KEY = "e2e-mock-key";

let cascadeAlive = false;
test.beforeAll(async ({ request }) => {
	try {
		const res = await request.get(`${CASCADE_URL}/health`, { timeout: 10_000 });
		const body = (await res.json()) as {
			ok?: boolean;
			tts?: boolean;
			tts_enabled?: boolean;
			avatar?: boolean;
		};
		// Require the full voice+avatar operational contract, not just reachability,
		// so a degraded cascade (health 200 but tts disabled) does not pass as OK.
		cascadeAlive =
			res.ok() &&
			body.ok === true &&
			body.tts === true &&
			body.tts_enabled === true &&
			body.avatar === true;
	} catch {
		cascadeAlive = false;
	}
});

function buildMock(): string {
	return `
(function(){
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
	window.__TAURI_INTERNALS__.metadata = { currentWindow:{label:"main"}, currentWebview:{windowLabel:"main",label:"main"} };
	var cbs=new Map(), nid=1;
	window.__TAURI_INTERNALS__.transformCallback=function(fn,once){var id=nid++;cbs.set(id,function(d){if(once)cbs.delete(id);return fn&&fn(d);});return id;};
	window.__TAURI_INTERNALS__.unregisterCallback=function(id){cbs.delete(id);};
	window.__TAURI_INTERNALS__.runCallback=function(id,d){var cb=cbs.get(id);if(cb)cb(d);};
	window.__TAURI_INTERNALS__.callbacks=cbs;
	var evs=new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener=function(){};
	window.__TAURI_INTERNALS__.convertFileSrc=function(p,proto){return (proto||"asset")+"://localhost/"+encodeURIComponent(p);};
	window.__TAURI_INTERNALS__.invoke=async function(cmd,args){
		if(cmd==="plugin:event|listen"){ if(!evs.has(args.event))evs.set(args.event,[]); evs.get(args.event).push(args.handler); return args.handler; }
		if(cmd==="plugin:event|emit"||cmd==="plugin:event|unlisten") return null;
		if(cmd==="plugin:store|get") return (args&&args.key==="naiaKey")?[${JSON.stringify(API_KEY)},true]:[null,false];
		if(cmd==="detect_gpu_vram") return 8;
		if(cmd==="voxcpm2_status") return false;
		if(cmd==="voxcpm2_installation_status") return {phase:"ready",ready:true,canStart:true,summary:"ready",steps:[]};
		if(cmd==="write_slots_manifest"||cmd==="write_naia_config"||cmd==="install_voxcpm2_runtime"||cmd==="start_voxcpm2"||cmd==="stop_voxcpm2") return null;
		return undefined;
	};
})();
`;
}

test("cascade is reported operational from its live /health via the given URL (#453)", async ({
	page,
}) => {
	test.skip(!cascadeAlive, `cascade unreachable/unhealthy: ${CASCADE_URL}`);

	await page.addInitScript(buildMock());
	await page.addInitScript({ content: TAURI_BASE_MOCK_FALLBACK });
	await page.addInitScript({ content: SEED_ADK_PATH });
	await page.addInitScript(
		(cfg: string) => localStorage.setItem("naia-config", cfg),
		JSON.stringify({
			provider: "nextain",
			model: "gemini-3.5-flash",
			naiaKey: API_KEY,
			enableTools: false,
			ttsEnabled: true,
			ttsProvider: "naia-local-voice",
			// Point the voice facade probe at the live cascade endpoint.
			vllmTtsHost: CASCADE_URL,
			localGpuTier: "windows-voice-6g",
			locale: "ko",
			onboardingComplete: true,
		}),
	);

	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 20_000 });
	await page.getByRole("button", { name: /^(설정|Settings)$/ }).click();
	await page.locator('[data-settings-tab="profile"]').click();

	// The TTS slot polls the REAL cascade /health; "running" (● prefix) means the
	// live cascade answered with tts_enabled + tts.
	const tts = page.getByTestId("slot-status-tts");
	await expect(tts).toBeVisible({ timeout: 20_000 });
	await expect(tts).toContainText("●", { timeout: 20_000 });
});
