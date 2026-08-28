import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/worker/test/**/*.test.ts"],
		exclude: ["src/worker/test/**/*.workers.test.ts"],
	},
	resolve: {
		alias: {
			"cloudflare:workers": resolve("src/worker/test/cloudflare-workers.ts"),
		},
	},
});
