import react from "@vitejs/plugin-react";
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	plugins: [
		react(),
		{
			name: "naia-slides-package-index",
			closeBundle() {
				const source = resolve(__dirname, "dist-slides/slides.html");
				if (existsSync(source)) {
					renameSync(source, resolve(__dirname, "dist-slides/index.html"));
				}
			},
		},
	],
	publicDir: "src/apps/slides/package-public",
	build: {
		outDir: "dist-slides",
		emptyOutDir: true,
		rollupOptions: {
			input: { index: resolve(__dirname, "slides.html") },
		},
	},
});
