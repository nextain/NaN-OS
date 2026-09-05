import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import {
	ensureAppReady,
	navigateToSettings,
	scrollToSection,
} from "../helpers/settings.js";

/**
 * 84 — Chat TTS Per Provider E2E
 *
 * For each TTS provider with an API key:
 * 1. Select TTS provider in settings UI
 * 2. Enter API key in UI
 * 3. Select voice in UI
 * 4. Enable TTS in UI
 * 5. Save settings
 * 6. Go to chat
 * 7. Send message
 * 8. Verify AI responds
 * 9. Verify no TTS error
 *
 * Tests the FULL flow: UI settings → save → chat → TTS audio response
 *
 * 루크 결정(2026-09-05): 그 전체 흐름은 **대표 제공자 하나에서만** 다시 잰다.
 * 나머지 TTS 제공자는 "설정에서 고를 수 있고 거절되지 않는가" 만 잰다.
 * 이유는 비용이다 — 여기서 도는 대화는 LLM 을 부르는데 그 호출은 TTS
 * 제공자가 무엇이든 같은 경로를 지난다. TTS 제공자 수만큼 모델 호출이
 * 곱해질 뿐 새로 재는 것이 없다. TTS 제공자별 실제 음성 API 호출은 80 번
 * 스펙(미리듣기)이 맡는다. 제공자 수는 그대로다 — 줄어드는 것은 제공자별
 * 단정의 깊이다.
 */
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const ELEVENLABS_KEY =
	process.env.ELEVENLABS_API_KEY ?? "";
const GOOGLE_KEY = process.env.GEMINI_API_KEY ?? "";

const TTS_PROVIDERS = [
	{ id: "edge", name: "Edge TTS", key: "", voice: "" },
	{ id: "openai", name: "OpenAI TTS", key: OPENAI_KEY, voice: "alloy" },
	{
		id: "google",
		name: "Google Cloud TTS",
		key: GOOGLE_KEY,
		voice: "ko-KR-Neural2-A",
	},
	{ id: "elevenlabs", name: "ElevenLabs", key: ELEVENLABS_KEY, voice: "" },
];

/**
 * 기능 단정을 지고 갈 대표 TTS 제공자.
 *
 * `edge` 를 고른 이유는 둘이다. 첫째, 이 저장소의 기본 TTS 제공자다 —
 * config 마이그레이션이 값이 없으면 `edge` 로 채우고, ChatArea 도
 * `config.ttsProvider || "edge"` 로 읽고, 80 번 스펙은 끝에서 `edge` 로
 * 되돌린다. 둘째, 키가 필요 없어 어떤 기계에서도 건너뛰지 않는다. 대표가
 * 키 때문에 skip 되면 기능 단정이 어디에서도 돌지 않은 채 초록만 남는다.
 */
const REPRESENTATIVE = "edge";

describe("84 — chat TTS per provider", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await ensureAppReady();
		dispose = autoApprovePermissions().dispose;
	});

	after(() => {
		dispose?.();
	});

	for (const prov of TTS_PROVIDERS) {
		const isRepresentative = prov.id === REPRESENTATIVE;

		describe(prov.name, () => {
			if (prov.key === "" && prov.id !== "edge") {
				// 키가 없으면 **건너뛴다**. 예전에는 여기서 통과하는 테스트를
				// 하나 만들었는데, 그러면 리포터에 PASS 로 올라가고 회귀 기록에도
				// "돌았다" 로 남는다 — 실제로는 이 공급자를 한 번도 검증하지
				// 않았는데 전수 커버로 세어진다.
				it.skip(`rewrite-needed: ${prov.name} 키가 없어 검증하지 못했다`, () => {});
				return;
			}

			it("should configure TTS provider + key + voice in settings UI", async () => {
				await navigateToSettings();
				const settingsTab = await $(S.settingsTab);
				await settingsTab.waitForDisplayed({ timeout: 10_000 });

				// Enable TTS
				await scrollToSection(S.ttsToggle);
				const ttsOn = await browser.execute(
					(sel: string) =>
						(document.querySelector(sel) as HTMLInputElement)?.checked ?? false,
					S.ttsToggle,
				);
				if (!ttsOn) {
					await browser.execute(
						(sel: string) =>
							(document.querySelector(sel) as HTMLInputElement)?.click(),
						S.ttsToggle,
					);
					await browser.pause(200);
				}

				// Select provider
				await scrollToSection(S.ttsProviderSelect);
				await browser.execute(
					(sel: string, val: string) => {
						const s = document.querySelector(sel) as HTMLSelectElement;
						if (s) {
							s.value = val;
							s.dispatchEvent(new Event("change", { bubbles: true }));
						}
					},
					S.ttsProviderSelect,
					prov.id,
				);
				await browser.pause(500);

				// Enter API key if needed
				if (prov.key) {
					const hasInput = await browser.execute(
						(sel: string) => !!document.querySelector(sel),
						S.ttsApiKeyInput,
					);
					if (hasInput) {
						await browser.execute(
							(sel: string, val: string) => {
								const input = document.querySelector(sel) as HTMLInputElement;
								if (!input) return;
								const setter = Object.getOwnPropertyDescriptor(
									window.HTMLInputElement.prototype,
									"value",
								)?.set;
								setter?.call(input, val);
								input.dispatchEvent(new Event("input", { bubbles: true }));
								input.dispatchEvent(new Event("change", { bubbles: true }));
							},
							S.ttsApiKeyInput,
							prov.key,
						);
						await browser.pause(200);
					}
				}

				// Select voice if specified
				if (prov.voice) {
					await browser.execute(
						(sel: string, val: string) => {
							const s = document.querySelector(sel) as HTMLSelectElement;
							if (s) {
								s.value = val;
								s.dispatchEvent(new Event("change", { bubbles: true }));
							}
						},
						S.ttsVoiceSelect,
						prov.voice,
					);
					await browser.pause(200);
				}

				// Save
				await browser.execute(() => {
					const btns = document.querySelectorAll("button");
					for (const btn of btns) {
						if (
							btn.textContent?.includes("저장") ||
							btn.textContent?.includes("Save")
						) {
							btn.click();
							return;
						}
					}
				});
				await browser.pause(1500);
			});

			if (!isRepresentative) {
				// 동작 여부만 잰다: 이 제공자를 설정에서 고르고 키를 넣었을 때
				// 화면이 그것을 거절하지 않는가.
				//
				// 여기 있던 기능 단정 — 실제로 대화를 한 번 돌려 응답을 받는
				// 것("should send chat message and get response with TTS")과
				// TTS 토글이 설정에 남았는지 확인하는 것
				// (`expect(config.ttsEnabled).toBe(true)`) — 은 지운 것이 아니라
				// 대표 제공자(edge) 경로로 옮겼다. 그 대화는 LLM 을 부르는데
				// 어떤 TTS 제공자를 골랐든 같은 경로이고, ttsEnabled 는 제공자별
				// 값이 아니라 전역 토글이다.
				it("should select provider without settings error (동작 여부만)", async () => {
					const error = await browser.execute(() => {
						return (
							document.querySelector(".settings-error")?.textContent?.trim() ??
							""
						);
					});
					expect(error).toBe("");
				});
				return;
			}

			it("should send chat message and get response with TTS", async () => {
				await browser.execute(
					(sel: string) =>
						(document.querySelector(sel) as HTMLElement)?.click(),
					S.chatTab,
				);
				const chatInput = await $(S.chatInput);
				await chatInput.waitForDisplayed({ timeout: 5_000 });

				await sendMessage("한마디만.");
				const response = await getLastAssistantMessage();
				expect(response.length).toBeGreaterThan(0);
			});

			it("should verify TTS enabled and no error", async () => {
				const config = await browser.execute(() => {
					const cfg = JSON.parse(localStorage.getItem("naia-config") ?? "{}");
					return { ttsEnabled: cfg.ttsEnabled };
				});
				expect(config.ttsEnabled).toBe(true);

				// Check no settings error visible
				const error = await browser.execute(() => {
					return (
						document.querySelector(".settings-error")?.textContent?.trim() ?? ""
					);
				});
				expect(error).toBe("");
			});
		});
	}
});
