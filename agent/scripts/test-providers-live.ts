import { buildProvider } from "../src/providers/factory.js";

async function testProvider(
	name: string,
	providerId: any,
	model: string,
	apiKey: string,
) {
	console.log(`\n=== Testing ${name} (${model}) ===`);
	try {
		const provider = buildProvider({
			provider: providerId,
			model,
			apiKey,
		});

		const stream = provider.stream(
			[{ role: "user", content: "Say exactly the word 'Hello'" }],
			"You are a helpful assistant.",
		);

		let fullText = "";
		for await (const chunk of stream) {
			if (chunk.type === "text") {
				fullText += chunk.text;
				process.stdout.write(chunk.text);
			}
		}
		console.log(`\n✅ ${name} Success! Response length: ${fullText.length}`);
	} catch (error) {
		console.error(`\n❌ ${name} Failed: ${(error as Error).message}`);
	}
}

async function main() {
	console.log("🚀 Starting Provider Live E2E Tests...\n");

	// 1. Anthropic (Claude)
	await testProvider(
		"Anthropic",
		"anthropic",
		"claude-3-haiku-20240307",
		process.env.ANTHROPIC_API_KEY || "",
	);

	// 2. Ollama (Local)
	await testProvider("Ollama", "ollama", "deepseek-r1:8b", "ollama");

	console.log("\n🎉 All Live E2E tests completed!");
}

main();
