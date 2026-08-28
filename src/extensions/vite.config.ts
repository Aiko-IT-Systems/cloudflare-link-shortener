import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => ({
	root: resolve(import.meta.dirname),
	publicDir: resolve(import.meta.dirname, "static", mode),
	build: {
		outDir: resolve(import.meta.dirname, "..", "..", "dist", mode),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				popup: resolve(import.meta.dirname, "index.html"),
				options: resolve(import.meta.dirname, "options.html"),
			},
		},
	},
}));
