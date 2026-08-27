import { describe, expect, test } from "vitest";
import { mergeConfig, normalizeGitHubRepository, parseJsonc, selectProfile, validateConfig } from "../../../scripts/generate-worker-config.mjs";

const template = {
	workers_dev: false,
	preview_urls: false,
	secrets: { required: ["LINK_SHORTENER_API_KEY", "DISCORD_PUBLIC_KEY"] },
	kv_namespaces: [{ binding: "LINKS" }]
};

const aitsys = { name: "cloudflare-link-shortener", vars: { SITE_NAME: "AITSYS Go" }, kv_namespaces: [{ binding: "LINKS", id: "aits-kv" }] };

describe("Worker configuration generation", () => {
	test("recognizes canonical SSH and HTTPS origin URLs", () => {
		expect(normalizeGitHubRepository("git@github.com:Aiko-IT-Systems/cloudflare-link-shortener.git")).toBe("aiko-it-systems/cloudflare-link-shortener");
		expect(normalizeGitHubRepository("https://github.com/Aiko-IT-Systems/cloudflare-link-shortener.git")).toBe("aiko-it-systems/cloudflare-link-shortener");
		expect(normalizeGitHubRepository("https://github.com/friendly-cat/cloudflare-link-shortener.git")).toBe("friendly-cat/cloudflare-link-shortener");
	});

	test("uses AITSYS only for the canonical repository with an empty user profile", () => {
		expect(selectProfile({ userConfig: {}, aitsysConfig: aitsys, remoteUrl: "git@github.com:Aiko-IT-Systems/cloudflare-link-shortener.git" }).name).toBe("aitsys");
		expect(selectProfile({ userConfig: {}, aitsysConfig: aitsys, remoteUrl: "https://github.com/friendly-cat/cloudflare-link-shortener" }).name).toBe("template");
	});

	test("gives a non-empty user profile precedence over AITSYS", () => {
		const user = { name: "friendly-go", vars: { SITE_NAME: "Friendly Go" }, kv_namespaces: [{ binding: "LINKS", id: "friend-kv" }] };
		const profile = selectProfile({ userConfig: user, aitsysConfig: aitsys, remoteUrl: "git@github.com:Aiko-IT-Systems/cloudflare-link-shortener.git" });
		const generated = mergeConfig(template, profile.config);

		expect(profile.name).toBe("user");
		expect(generated).toMatchObject({ name: "friendly-go", vars: { SITE_NAME: "Friendly Go" } });
		expect(JSON.stringify(generated)).not.toContain("AITSYS Go");
	});

	test("keeps an empty fork configuration generic and automatically provisioned", () => {
		const profile = selectProfile({ userConfig: {}, aitsysConfig: aitsys, remoteUrl: undefined });
		const generated = mergeConfig(template, profile.config);

		expect(profile.name).toBe("template");
		expect(generated.kv_namespaces).toEqual([{ binding: "LINKS" }]);
		expect(JSON.stringify(generated)).not.toContain("aits-kv");
	});

	test("rejects configuration that weakens production-only or required bindings", () => {
		expect(() => validateConfig({ ...template, workers_dev: true })).toThrow("workers_dev");
		expect(() => validateConfig({ ...template, kv_namespaces: [] })).toThrow("LINKS");
		expect(() => validateConfig({ ...template, secrets_store_secrets: [] })).toThrow("Secret Store");
	});

	test("parses JSONC without treating URLs as comments", () => {
		expect(parseJsonc('{ // a comment\n "logo": "https://example.com/logo.png", }')).toEqual({ logo: "https://example.com/logo.png" });
	});
});
