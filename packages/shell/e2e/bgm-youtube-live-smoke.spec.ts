import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const LIVE_ENABLED = process.env.RADIO_DJ_LIVE_YOUTUBE === "1";
const LIVE_WALL_MS = Number(process.env.RADIO_DJ_LIVE_WALL_MS ?? 30_000);
const LIVE_PORT = Number(process.env.RADIO_DJ_LIVE_BGM_PORT ?? 18_801);
const SHELL_ORIGIN = "http://localhost:1420";

if (!Number.isSafeInteger(LIVE_WALL_MS) || LIVE_WALL_MS < 30_000) {
	throw new Error("RADIO_DJ_LIVE_WALL_MS must be an integer >= 30000");
}
if (!Number.isSafeInteger(LIVE_PORT) || LIVE_PORT < 1024 || LIVE_PORT > 65535) {
	throw new Error(
		"RADIO_DJ_LIVE_BGM_PORT must be an integer from 1024 to 65535",
	);
}

interface LiveSearchResult {
	id: string;
	title: string;
	duration: string;
	channel: string;
}

function durationSeconds(value: string): number {
	return value
		.split(":")
		.map(Number)
		.reduce((total, part) => total * 60 + part, 0);
}

test.describe("Radio DJ actual YouTube opt-in smoke", () => {
	test.skip(
		!LIVE_ENABLED,
		"Set RADIO_DJ_LIVE_YOUTUBE=1 to contact actual YouTube.",
	);
	test.describe.configure({ mode: "serial" });

	let sidecar: ChildProcess | undefined;
	let sidecarError = "";

	test.beforeAll(async () => {
		const entry = fileURLToPath(
			new URL("../../bgm-sidecar/dist/bgm-server-bin.js", import.meta.url),
		);
		sidecar = spawn(process.execPath, [entry], {
			stdio: ["ignore", "ignore", "pipe"],
			env: {
				...process.env,
				NAIA_BGM_PORT: String(LIVE_PORT),
				NAIA_BGM_HEALTH_NONCE: "radio-dj-live-playwright",
			},
		});
		sidecar.stderr?.on("data", (chunk) => {
			sidecarError = `${sidecarError}${String(chunk)}`.slice(-4_000);
		});
		await expect
			.poll(
				async () => {
					try {
						const response = await fetch(
							`http://127.0.0.1:${LIVE_PORT}/health`,
						);
						const body = (await response.json()) as {
							ok?: boolean;
							nonce?: string;
						};
						return response.ok && body.ok === true ? body.nonce : null;
					} catch {
						return null;
					}
				},
				{ timeout: 30_000, message: sidecarError },
			)
			.toBe("radio-dj-live-playwright");
	});

	test.afterAll(async () => {
		if (!sidecar || sidecar.exitCode !== null) return;
		sidecar.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(resolve, 5_000);
			sidecar?.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	});

	test("finds a long track and observes its real media clock advance", async ({
		browser,
	}) => {
		test.setTimeout(LIVE_WALL_MS + 90_000);
		const search = await fetch(
			`http://127.0.0.1:${LIVE_PORT}/yt/search?${new URLSearchParams({
				q: "12 hour relaxing music long mix",
				max: "8",
			})}`,
		);
		expect(search.ok, sidecarError).toBe(true);
		const body = (await search.json()) as { results?: LiveSearchResult[] };
		const selected = body.results?.find(
			(result) => durationSeconds(result.duration) >= 12 * 60,
		);
		expect(selected).toBeDefined();

		const context = await browser.newContext({
			extraHTTPHeaders: { referer: `${SHELL_ORIGIN}/` },
		});
		const page = await context.newPage();
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		const embed =
			`https://www.youtube-nocookie.com/embed/${selected?.id}` +
			`?autoplay=1&mute=1&enablejsapi=1&origin=${encodeURIComponent(SHELL_ORIGIN)}`;
		const response = await page.goto(embed, {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
			referer: `${SHELL_ORIGIN}/`,
		});
		expect(response?.status()).toBe(200);
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const video = document.querySelector("video");
						return {
							paused: video?.paused ?? true,
							readyState: video?.readyState ?? 0,
							mediaError: video?.error?.code ?? null,
						};
					}),
				{ timeout: 30_000 },
			)
			.toEqual({ paused: false, readyState: 4, mediaError: null });

		const sampleIntervalMs = Math.min(
			30_000,
			Math.max(5_000, Math.floor(LIVE_WALL_MS / 4)),
		);
		const samples: number[] = [];
		const startedAt = Date.now();
		while (Date.now() - startedAt < LIVE_WALL_MS) {
			await page.waitForTimeout(
				Math.min(sampleIntervalMs, LIVE_WALL_MS - (Date.now() - startedAt)),
			);
			const media = await page.evaluate(() => {
				const video = document.querySelector("video");
				return {
					paused: video?.paused ?? true,
					currentTime: video?.currentTime ?? 0,
					readyState: video?.readyState ?? 0,
					mediaError: video?.error?.code ?? null,
				};
			});
			expect(media).toMatchObject({
				paused: false,
				readyState: 4,
				mediaError: null,
			});
			samples.push(media.currentTime);
		}
		expect(samples.length).toBeGreaterThanOrEqual(4);
		expect(
			samples.every(
				(currentTime, index) => index === 0 || currentTime > samples[index - 1],
			),
		).toBe(true);
		expect(samples.at(-1) ?? 0).toBeGreaterThan(LIVE_WALL_MS / 1_000 - 5);
		expect(pageErrors).toEqual([]);
		await context.close();
	});
});
