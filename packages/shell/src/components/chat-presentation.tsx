import type { AgentResponseChunk } from "../lib/types";

type StructuredAgentChunk = Extract<
	AgentResponseChunk,
	{
		type:
			| "grounding"
			| "artifact"
			| "provider_session"
			| "processing_disclosure";
	}
>;

export function formatStructuredAgentChunk(
	chunk: StructuredAgentChunk,
): string {
	switch (chunk.type) {
		case "grounding": {
			const sources = chunk.sources
				.map((source) => {
					const uris = source.sourceUris.join(", ");
					return uris ? `${source.title} (${uris})` : source.title;
				})
				.join("; ");
			return `\n\n[Grounding: ${chunk.status}]${sources ? ` ${sources}` : ""}`;
		}
		case "artifact": {
			const name = chunk.artifact.name ?? chunk.artifact.id;
			return `\n\n[Artifact: ${chunk.artifact.kind} ${name}] id=${chunk.artifact.id} localRef=${chunk.artifact.localRef} ${chunk.artifact.mimeType}, ${chunk.artifact.sizeBytes} bytes`;
		}
		case "provider_session":
			return `\n\n[Provider session: ${chunk.state}] sessionId=${chunk.sessionId} providerSessionRef=${chunk.providerSessionRef}`;
		case "processing_disclosure": {
			const target = [chunk.provider, chunk.model].filter(Boolean).join("/");
			return `\n\n[Processing: ${chunk.workload} -> ${chunk.destination}, ${chunk.decision}] processingProfileRef=${chunk.processingProfileRef}${target ? ` ${target}` : ""}`;
		}
	}
}
