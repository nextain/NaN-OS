async function invoke(command: string, args: Record<string, unknown>) {
 return browser.execute(async (name: string, input: Record<string, unknown>) => {
  const candidate = window as typeof window & { __TAURI_INTERNALS__?: { invoke: (n: string, a: unknown) => Promise<unknown> }; __TAURI__?: { core?: { invoke: (n: string, a: unknown) => Promise<unknown> } } };
  const fn = candidate.__TAURI_INTERNALS__?.invoke ?? candidate.__TAURI__?.core?.invoke;
  if (!fn) throw new Error("Tauri invoke unavailable");
  return fn(name, input);
 }, command, args);
}

describe("Radio queue through the isolated native Tauri Shell", () => {
 it("boots the exact paired Agent and accepts a correlated control message", async () => {
  await expect(invoke("send_to_agent_command", {
   message: JSON.stringify({ type: "tool_request", requestId: "radio-native-agent-health", toolName: "health_probe" }),
  })).resolves.toBeNull();
 });
 it("starts the owned built BGM sidecar without using the user port", async () => {
  const port = Number(process.env.NAIA_E2E_BGM_PORT ?? "18772");
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  expect(response.status).toBe(200);
  const health = await response.json();
  expect(health).toMatchObject({ ok: true });
  expect(health.nonce).toEqual(expect.any(String));
 });
 it("keeps B queued until the active fixture reports ended, then advances to B", async () => {
  const appRoot = await $(".app-root");
  await appRoot.waitForExist({ timeout: 30_000 });
  expect(await appRoot.getAttribute("data-ui-mode")).not.toBe("setup");
  const player = await $(".bgm-player");
  try {
   await player.waitForExist({ timeout: 30_000 });
  } catch (error) {
   const documentState = await browser.execute(() => ({ href: document.location.href, bodyText: document.body?.innerText?.slice(0, 2000) ?? "", rootHtml: document.getElementById("root")?.innerHTML.slice(0, 4000) ?? "" }));
   let browserLogs: unknown = [];
   try { browserLogs = await browser.getLogs("browser"); } catch { /* browser log endpoint is optional */ }
   throw new Error(`BGM player did not mount: ${String(error)}; document=${JSON.stringify(documentState)}; browserLogs=${JSON.stringify(browserLogs)}`);
  }
  await invoke("e2e_emit_bgm_event", { action: "play", videoId: "native-a", title: "Native Queue A" });
  await browser.waitUntil(async () => (await player.getAttribute("data-bgm-current-title")) === "Native Queue A", { timeout: 30_000, timeoutMsg: "A did not mount" });
  await invoke("e2e_emit_bgm_event", { action: "enqueue", videoId: "native-b", title: "Native Queue B" });
  expect(await player.getAttribute("data-bgm-current-title")).toBe("Native Queue A");
  expect(await player.getAttribute("data-bgm-queue-length")).toBe("1");
  const iframe = await $(".app-bg-iframe");
  await iframe.waitForExist({ timeout: 30_000 });
  expect(await iframe.getAttribute("src")).toContain("bgm-playback-fixture.html");
  await browser.switchToFrame(iframe);
  await $("#report-playing").click();
  await $("#report-ended").click();
  await browser.switchToParentFrame();
  await browser.waitUntil(async () => (await player.getAttribute("data-bgm-current-title")) === "Native Queue B", { timeout: 30_000, timeoutMsg: "B did not advance after observed end" });
  expect(await player.getAttribute("data-bgm-queue-length")).toBe("0");
  await invoke("e2e_emit_bgm_event", { action: "stop" });
  await browser.waitUntil(async () => (await player.getAttribute("data-bgm-playback-status")) === "ended", { timeout: 30_000, timeoutMsg: "stop did not end the active playback" });
  expect(await player.getAttribute("data-bgm-queue-length")).toBe("0");
 });
 // 출처: docs/user-scenarios.md S-RADIO-DJ-5 "명령 접수 성공만으로는 소개하지 않는다"
 // / docs/requirements.md FR-RADIO-DJ.5 "`ok: true`(명령 접수)만으로 곡 소개를 하지
 // 않는다". 옛 93-radio-bgm-observation(삭제됨) 의 검사를 네이티브 큐 관측으로 옮겼다(#557).
 it("does not announce a requested track until the local iframe reports playing", async () => {
  const player = await $(".bgm-player");
  await player.waitForExist({ timeout: 30_000 });
  await invoke("e2e_emit_bgm_event", { action: "play", videoId: "native-announce", title: "Native Announce Gate" });
  await browser.waitUntil(async () => (await player.getAttribute("data-bgm-playback-status")) === "loading", { timeout: 30_000, timeoutMsg: "the requested track never reached observed loading" });
  // 접수는 됐다 — 선택된 곡은 있는데, 소개할 수 있는 제목은 아직 없어야 한다.
  // (`.bgm-icon--playing` 은 재생 확인이 아니라 사용자 의도 표시다. BgmPlayer 의
  //  handleYtSelect 가 요청 즉시 켜므로 소개 게이트가 아니다 — 여기서 보지 않는다.)
  expect(await player.getAttribute("data-bgm-current-title")).toBe("Native Announce Gate");
  expect(await player.getAttribute("data-bgm-announced-title")).toBe("");
  const iframe = await $(".app-bg-iframe");
  await iframe.waitForExist({ timeout: 30_000 });
  expect(await iframe.getAttribute("src")).toContain("bgm-playback-fixture.html");
  await browser.switchToFrame(iframe);
  await $("#report-playing").click();
  await browser.switchToParentFrame();
  await browser.waitUntil(async () => (await player.getAttribute("data-bgm-announced-title")) === "Native Announce Gate", { timeout: 30_000, timeoutMsg: "observed iframe playing did not unlock the announceable title" });
  expect(await player.getAttribute("data-bgm-playback-status")).toBe("playing");
 });
 // 출처: docs/user-scenarios.md S-RADIO-DJ-1 "곡 A 다음 곡 B로 바꾼 뒤 늦게 도착한 A
 // 오류는 B의 상태나 소개를 바꾸지 않는다" / docs/requirements.md FR-RADIO-DJ.7
 // "CI에서 … A→B→늦은 A 오류 … 를 재현한다". 옛 93-radio-bgm-observation(삭제됨) 에 있던
 // 검사를 네이티브 큐 관측으로 옮겼다(#557).
 it("keeps track B pending when the detached track A iframe reports a late error", async () => {
  const player = await $(".bgm-player");
  await invoke("e2e_emit_bgm_event", { action: "play", videoId: "native-late-a", title: "Native Late A" });
  await browser.waitUntil(async () => ((await $(".app-bg-iframe").getAttribute("src")) ?? "").includes("videoId=native-late-a"), { timeout: 30_000, timeoutMsg: "track A iframe did not mount" });
  // A 프레임의 오류 발신기를 미리 붙잡는다. 다음 곡으로 넘어가면 React 가
  // iframe 요소를 통째로 갈아 끼우므로(AppShellFrame 의 key={backgroundVideoUrl}),
  // 이 함수 참조만이 떨어져 나간 A 문서로 통하는 유일한 길이다. 동시에 셸 창에
  // 도착하는 메시지를 기록해 둔다 — "늦은 오류가 실제로 도착했다" 를 증거로
  // 남겨야 이 검사가 아무것도 재지 않는 검사가 되지 않는다.
  await browser.execute(() => {
   const host = window as typeof window & { __naiaE2eLateReport?: () => void; __naiaE2eLateSeen?: string[] };
   const frame = document.querySelector(".app-bg-iframe") as HTMLIFrameElement | null;
   const reporter = (frame?.contentWindow as (Window & { __naiaE2eReportLateError?: () => void }) | null | undefined)?.__naiaE2eReportLateError;
   if (typeof reporter !== "function") throw new Error("track A fixture late-error reporter is unavailable");
   host.__naiaE2eLateReport = reporter;
   host.__naiaE2eLateSeen = [];
   window.addEventListener("message", (event: MessageEvent) => {
    if (typeof event.data === "string" && event.data.includes("onError")) {
     const active = document.querySelector(".app-bg-iframe") as HTMLIFrameElement | null;
     // 떨어져 나간 프레임이 보낸 것이라는 사실까지 함께 남긴다. WebKitGTK 는
     // 그런 메시지의 source 를 null 로 준다 — 셸이 이것을 활성 프레임의 것으로
     // 착각하면 B 가 error 로 덮인다(#557).
     host.__naiaE2eLateSeen?.push(`${event.data} detached=${String(!active || event.source !== active.contentWindow)}`);
    }
   });
  });
  await invoke("e2e_emit_bgm_event", { action: "play", videoId: "native-late-b", title: "Native Late B" });
  await browser.waitUntil(async () => ((await $(".app-bg-iframe").getAttribute("src")) ?? "").includes("videoId=native-late-b"), { timeout: 30_000, timeoutMsg: "track B iframe did not replace track A" });
  await browser.waitUntil(async () => (await player.getAttribute("data-bgm-playback-status")) === "loading", { timeout: 30_000, timeoutMsg: "track B did not enter observed loading" });
  await browser.execute(() => {
   const host = window as typeof window & { __naiaE2eLateReport?: () => void };
   if (!host.__naiaE2eLateReport) throw new Error("stored track A reporter is unavailable");
   host.__naiaE2eLateReport();
  });
  await browser.pause(500);
  // 자극이 실제로 셸 창까지 왔는가. 오지 않았다면 아래 단정은 아무것도 재지 않는다.
  const delivered = await browser.execute(() => (window as typeof window & { __naiaE2eLateSeen?: string[] }).__naiaE2eLateSeen ?? []);
  expect(delivered.join("|")).toContain("fixture_late_error");
  expect(delivered.join("|")).toContain("detached=true");
  // 그런데도 B 는 흔들리지 않는다.
  expect(await player.getAttribute("data-bgm-playback-status")).toBe("loading");
  expect(await player.getAttribute("data-bgm-current-title")).toBe("Native Late B");
  expect(await player.getAttribute("data-bgm-announced-title")).toBe("");
  await invoke("e2e_emit_bgm_event", { action: "stop" });
 });
});
