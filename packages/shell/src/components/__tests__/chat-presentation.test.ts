// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formatStructuredAgentChunk } from "../chat-presentation";

describe("formatStructuredAgentChunk", () => {
	it("formats grounding sources without losing provenance", () => {
		expect(
			formatStructuredAgentChunk({
				type: "grounding",
				requestId: "request-1",
				status: "grounded",
				sources: [
					{
						title: "Naia docs",
						sourceUris: ["https://naia.nextain.io/docs"],
					},
				],
			}),
		).toBe(
			"\n\n[Grounding: grounded] Naia docs (https://naia.nextain.io/docs)",
		);
	});

	it("formats artifact metadata", () => {
		expect(
			formatStructuredAgentChunk({
				type: "artifact",
				requestId: "request-1",
				artifact: {
					id: "artifact-1",
					kind: "image",
					name: "report.md",
					localRef: "/tmp/report.md",
					mimeType: "text/markdown",
					sizeBytes: 42,
				},
			}),
		).toContain("[Artifact: image report.md] id=artifact-1");
	});

	it("formats provider session and processing disclosure state", () => {
		expect(
			formatStructuredAgentChunk({
				type: "provider_session",
				requestId: "request-1",
				state: "started",
				sessionId: "session-1",
				providerSessionRef: "provider-1",
			}),
		).toContain("[Provider session: started]");

		expect(
			formatStructuredAgentChunk({
				type: "processing_disclosure",
				requestId: "request-1",
				workload: "main_llm",
				destination: "external_cloud",
				decision: "allowed",
				processingProfileRef: "profile-1",
				provider: "openai",
				model: "gpt-5",
			}),
		).toContain("openai/gpt-5");
	});
});
