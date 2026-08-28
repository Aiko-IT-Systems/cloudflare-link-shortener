import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./src/worker/test/wrangler.test.jsonc" },
			miniflare: {
				bindings: {
					LINK_SHORTENER_API_KEY: "worker-test-secret",
					DISCORD_PUBLIC_KEY: "0".repeat(64),
					LINK_PASSWORD_PEPPER:
						"worker-runtime-password-pepper-at-least-32-bytes",
				},
			},
		}),
	],
	test: {
		include: ["src/worker/test/**/*.workers.test.ts"],
	},
});

