import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import app from "../src";
import { createLink as createStoredLink } from "../src/store";
import { LinkRecord } from "../src/types";

class MemoryKV {
	private readonly values = new Map<string, string>();

	get(key: string, options?: Partial<KVNamespaceGetOptions<undefined>>): Promise<string | null>;
	get(key: string, type: "text"): Promise<string | null>;
	get<T = unknown>(key: string, type: "json"): Promise<T | null>;
	get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
	get(key: string, type: "stream"): Promise<ReadableStream | null>;
	get(key: string, options?: KVNamespaceGetOptions<"text">): Promise<string | null>;
	get<T = unknown>(key: string, options?: KVNamespaceGetOptions<"json">): Promise<T | null>;
	get(key: string, options?: KVNamespaceGetOptions<"arrayBuffer">): Promise<ArrayBuffer | null>;
	get(key: string, options?: KVNamespaceGetOptions<"stream">): Promise<ReadableStream | null>;
	async get<T>(key: string, typeOrOptions?: "json" | "text" | "arrayBuffer" | "stream" | Partial<KVNamespaceGetOptions<undefined>>): Promise<T | string | ArrayBuffer | ReadableStream | null> {
		const value = this.values.get(key);
		if (value === undefined) {
			return null;
		}

		const type = typeof typeOrOptions === "string" ? typeOrOptions : typeOrOptions?.type;

		if (type === "json") {
			return JSON.parse(value) as T;
		}

		return value;
	}

	async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void> {
		if (typeof value === "string") {
			this.values.set(key, value);
			return;
		}

		throw new Error("MemoryKV test mock only supports string values.");
	}

	async delete(key: string): Promise<void> {
		this.values.delete(key);
	}

	async list<Metadata = unknown>(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<Metadata, string>> {
		const prefix = options?.prefix ?? "";
		const matching = Array.from(this.values.keys())
			.filter((key) => key.startsWith(prefix))
			.map((name) => ({ name }));
		const start = options?.cursor ? Number.parseInt(options.cursor, 10) : 0;
		const limit = options?.limit ?? matching.length;
		const end = Math.min(start + limit, matching.length);
		const keys = matching.slice(start, end);

		return {
			keys,
			list_complete: end >= matching.length,
			cacheStatus: null,
			...(end < matching.length ? { cursor: `${end}` } : {})
		};
	}

	getWithMetadata<Metadata = unknown>(key: string, options?: Partial<KVNamespaceGetOptions<undefined>>): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<Metadata = unknown>(key: string, type: "text"): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<T = unknown, Metadata = unknown>(key: string, type: "json"): Promise<KVNamespaceGetWithMetadataResult<T, Metadata>>;
	getWithMetadata<Metadata = unknown>(key: string, type: "arrayBuffer"): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
	getWithMetadata<Metadata = unknown>(key: string, type: "stream"): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
	getWithMetadata<Metadata = unknown>(key: string, options: KVNamespaceGetOptions<"text">): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<T = unknown, Metadata = unknown>(key: string, options: KVNamespaceGetOptions<"json">): Promise<KVNamespaceGetWithMetadataResult<T, Metadata>>;
	getWithMetadata<Metadata = unknown>(key: string, options: KVNamespaceGetOptions<"arrayBuffer">): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
	getWithMetadata<Metadata = unknown>(key: string, options: KVNamespaceGetOptions<"stream">): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
	async getWithMetadata<T, Metadata = unknown>(key: string, typeOrOptions?: "json" | "text" | "arrayBuffer" | "stream" | Partial<KVNamespaceGetOptions<undefined>>): Promise<KVNamespaceGetWithMetadataResult<T | string | ArrayBuffer | ReadableStream, Metadata>> {
		const value = await this.get<T>(key, typeOrOptions);
		return {
			value: value as T | string | null,
			metadata: null,
			cacheStatus: null
		};
	}
}

function env(overrides: Partial<Env> = {}): Env {
	return {
		LINKS: new MemoryKV() as KVNamespace,
		LINK_SHORTENER_API_KEY: {
			get: async () => "test-secret"
		},
		DISCORD_PUBLIC_KEY: {
			get: async () => "0".repeat(64)
		},
		ASSETS: {
			fetch: async () => new Response("Not found", { status: 404 })
		} as Fetcher,
		SITE_NAME: "AITSYS Go",
		BRAND_LOGO_URL: "/logo.png",
		BRAND_LOGO_ALT: "Aiko IT Systems",
		FAVICON_URL: "/favicon.png",
		BRAND_COLOR: "#fc0fc0",
		DISCORD_APPLICATION_ID: "",
		DISCORD_ADMIN_USER_ID: "",
		...overrides
	};
}

function authed(init: RequestInit = {}): RequestInit {
	return {
		...init,
		headers: {
			"Authorization": "Bearer test-secret",
			"Content-Type": "application/json",
			...init.headers
		}
	};
}

async function create(envValue: Env, payload: Record<string, unknown>): Promise<Response> {
	return app.fetch(new Request("https://go.aitsys.dev/api/v1/links", authed({
		method: "POST",
		body: JSON.stringify(payload)
	})), envValue);
}

function hex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function discordRequest(body: Record<string, unknown>, privateKey: CryptoKey, url = "https://go.aitsys.dev/discord/interactions"): Promise<Request> {
	const timestamp = `${Math.floor(Date.now() / 1000)}`;
	const json = JSON.stringify(body);
	const data = new TextEncoder().encode(timestamp + json);
	const signature = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, data);
	return new Request(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Signature-Ed25519": hex(signature), "X-Signature-Timestamp": timestamp }, body: json });
}

describe("link shortener", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(`<!doctype html>
			<html>
				<head>
					<meta property="og:title" content="Target Embed Title">
					<meta property="og:description" content="Target embed description.">
					<meta property="og:image" content="/preview.png">
					<meta property="og:site_name" content="Target Site">
				</head>
			</html>`, {
			headers: { "Content-Type": "text/html; charset=utf-8" }
		})));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("creates a link with a custom slug", async () => {
		const envValue = env();
		const response = await create(envValue, {
			slug: "pycord",
			destinationUrl: "https://pycord.dev",
			creator: "Lulalaby",
			title: "Pycord"
		});
		const body = await response.json() as { result: LinkRecord };

		expect(response.status).toBe(201);
		expect(body.result.slug).toBe("pycord");
		expect(body.result.creator).toBe("Lulalaby");
		expect(body.result.embedTitle).toBe("Target Embed Title");
		expect(body.result.embedImageUrl).toBe("https://pycord.dev/preview.png");
	});

	test("creates a link with an 8 character generated slug", async () => {
		const envValue = env();
		const response = await create(envValue, {
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby"
		});
		const body = await response.json() as { result: LinkRecord };

		expect(response.status).toBe(201);
		expect(body.result.slug).toMatch(/^[A-Za-z0-9]{8}$/);
	});

	test("rejects missing and bad auth", async () => {
		const envValue = env();
		const missing = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", {
			method: "POST"
		}), envValue);
		const bad = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", {
			method: "POST",
			headers: { Authorization: "Bearer wrong" }
		}), envValue);

		expect(missing.status).toBe(401);
		expect(bad.status).toBe(401);
	});

	test("rejects invalid URLs, duplicate slugs, and reserved slugs", async () => {
		const envValue = env();
		const invalidUrl = await create(envValue, {
			slug: "bad-url",
			destinationUrl: "http://example.com",
			creator: "Lulalaby"
		});
		const first = await create(envValue, {
			slug: "dupe",
			destinationUrl: "https://example.com",
			creator: "Lulalaby"
		});
		const duplicate = await create(envValue, {
			slug: "dupe",
			destinationUrl: "https://example.org",
			creator: "Lulalaby"
		});
		const reserved = await create(envValue, {
			slug: "api",
			destinationUrl: "https://example.com",
			creator: "Lulalaby"
		});

		expect(invalidUrl.status).toBe(400);
		expect(first.status).toBe(201);
		expect(duplicate.status).toBe(409);
		expect(reserved.status).toBe(400);
	});

	test("reads link metadata", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "readme",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby"
		});

		const response = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links/readme", authed()), envValue);
		const body = await response.json() as { result: LinkRecord };

		expect(response.status).toBe(200);
		expect(body.result.destinationUrl).toBe("https://aitsys.dev");
	});

	test("renders splash page and disables public access", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "hello",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby"
		});

		const splashResponse = await app.fetch(new Request("https://go.aitsys.dev/hello"), envValue);
		const splashHtml = await splashResponse.text();

		const disableResponse = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links/hello/disable", authed({
			method: "POST",
			body: JSON.stringify({ reason: "No longer needed" })
		})), envValue);
		const disabledResponse = await app.fetch(new Request("https://go.aitsys.dev/hello"), envValue);
		const disabledHtml = await disabledResponse.text();

		expect(splashResponse.status).toBe(200);
		expect(splashHtml).toContain("Continue to destination");
		expect(splashHtml).toContain('<meta property="og:title" content="Target Embed Title">');
		expect(splashHtml).toContain('<meta property="og:image" content="https://aitsys.dev/preview.png">');
		expect(disableResponse.status).toBe(200);
		expect(disabledResponse.status).toBe(410);
		expect(disabledHtml).not.toContain("Continue to destination");
	});

	test("refreshes target embed metadata", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "refresh-me",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby"
		});

		vi.mocked(fetch).mockResolvedValueOnce(new Response(`<!doctype html>
			<html>
				<head>
					<meta property="og:title" content="Refreshed Title">
					<meta name="description" content="Refreshed description.">
				</head>
			</html>`, {
			headers: { "Content-Type": "text/html; charset=utf-8" }
		}));

		const response = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links/refresh-me/refresh-metadata", authed({
			method: "POST"
		})), envValue);
		const body = await response.json() as { result: LinkRecord };

		expect(response.status).toBe(200);
		expect(body.result.embedTitle).toBe("Refreshed Title");
		expect(body.result.embedDescription).toBe("Refreshed description.");
	});

	test("requires a password before rendering the destination splash", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "secret",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
			password: "meow"
		});

		const promptResponse = await app.fetch(new Request("https://go.aitsys.dev/secret"), envValue);
		const promptHtml = await promptResponse.text();
		const badResponse = await app.fetch(new Request("https://go.aitsys.dev/secret", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "password=wrong"
		}), envValue);
		const goodResponse = await app.fetch(new Request("https://go.aitsys.dev/secret", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "password=meow"
		}), envValue);
		const goodHtml = await goodResponse.text();

		expect(promptResponse.status).toBe(200);
		expect(promptHtml).toContain("Password");
		expect(promptHtml).not.toContain("Continue to destination");
		expect(badResponse.status).toBe(401);
		expect(goodResponse.status).toBe(200);
		expect(goodHtml).toContain("Continue to destination");
	});

	test("renders expired links without the destination button", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "old",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
			expiresAt: "2020-01-01T00:00:00.000Z"
		});

		const response = await app.fetch(new Request("https://go.aitsys.dev/old"), envValue);
		const html = await response.text();

		expect(response.status).toBe(410);
		expect(html).toContain("expired");
		expect(html).not.toContain("Continue to destination");
	});

	test("suppresses social preview tags for marked links and exposes homepage preview", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "quiet",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
			suppressSocialPreview: true
		});

		const quietResponse = await app.fetch(new Request("https://go.aitsys.dev/quiet"), envValue);
		const quietHtml = await quietResponse.text();
		const homeResponse = await app.fetch(new Request("https://go.aitsys.dev/"), envValue);
		const homeHtml = await homeResponse.text();

		expect(quietHtml).not.toContain('property="og:title"');
		expect(quietHtml).not.toContain('name="twitter:card"');
		expect(homeHtml).toContain('<meta property="og:title" content="Private link shortener">');
		expect(homeHtml).toContain('<meta property="og:image" content="https://go.aitsys.dev/logo.png">');
		expect(homeHtml).toContain('<link rel="icon" href="/favicon.png">');
	});

	test("renders configured site branding and escapes its HTML attributes", async () => {
		const envValue = env({
			SITE_NAME: "Cats & Code",
			BRAND_LOGO_URL: "/custom/logo.svg?light=1&wide=1",
			BRAND_LOGO_ALT: 'Cats "R" Us & friends',
			FAVICON_URL: "/custom/favicon.svg?pink=1&small=1"
		});

		const response = await app.fetch(new Request("https://short.example/"), envValue);
		const html = await response.text();

		expect(html).toContain("<title>Private link shortener · Cats &amp; Code</title>");
		expect(html).toContain('<img class="brand-logo" src="/custom/logo.svg?light=1&amp;wide=1" alt="Cats &quot;R&quot; Us &amp; friends">');
		expect(html).toContain('<link rel="icon" href="/custom/favicon.svg?pink=1&amp;small=1">');
		expect(html).toContain('<meta property="og:image" content="https://short.example/custom/logo.svg?light=1&amp;wide=1">');
		expect(html).toContain('<meta property="og:site_name" content="Cats &amp; Code">');
	});

	test("exposes public absolute branding metadata without API authentication", async () => {
		const envValue = env({
			SITE_NAME: "Cats & Code",
			BRAND_LOGO_URL: "/custom/logo.svg",
			BRAND_LOGO_ALT: "A custom cat logo",
			FAVICON_URL: "https://assets.example/favicon.svg",
			BRAND_COLOR: "#aabbcc"
		});

		const response = await app.fetch(new Request("https://short.example/api/v1/metadata"), envValue);
		const body = await response.json() as { success: boolean; result: { apiVersion: number; branding: Record<string, string> } };

		expect(response.status).toBe(200);
		expect(body).toEqual({
			success: true,
			result: {
				apiVersion: 1,
				branding: {
					siteName: "Cats & Code",
					brandLogoUrl: "https://short.example/custom/logo.svg",
					brandLogoAlt: "A custom cat logo",
					faviconUrl: "https://assets.example/favicon.svg",
					brandColor: "#aabbcc"
				}
			}
		});
	});

	test("issues revocable account tokens and isolates owned links", async () => {
		const envValue = env();
		const admin = authed({ method: "POST", body: JSON.stringify({ id: "friend", creatorName: "Friendly Cat" }) });
		const accountResponse = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts", admin), envValue);
		expect(accountResponse.status).toBe(201);
		const accountList = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts", authed()), envValue);
		expect((await accountList.json() as { result: { items: Array<{ id: string }> } }).result.items.map((account) => account.id)).toEqual(["friend"]);

		const tokenResponse = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts/friend/tokens", authed({ method: "POST", body: JSON.stringify({ label: "Firefox" }) })), envValue);
		const issued = await tokenResponse.json() as { result: { token: string; tokenId: string } };
		expect(issued.result.token).toMatch(/^aig_/);

		const userHeaders = { Authorization: `Bearer ${issued.result.token}`, "Content-Type": "application/json" };
		const ownResponse = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", { method: "POST", headers: userHeaders, body: JSON.stringify({ destinationUrl: "https://example.com", creator: "Pretend Admin", slug: "friend-link" }) }), envValue);
		const own = await ownResponse.json() as { result: LinkRecord };
		expect(ownResponse.status).toBe(201);
		expect(own.result.creator).toBe("Friendly Cat");
		expect(own.result.owner).toEqual({ kind: "account", id: "friend" });

		await create(envValue, { destinationUrl: "https://aitsys.dev", creator: "Lulalaby", slug: "admin-link" });
		const hidden = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links/admin-link", { headers: userHeaders }), envValue);
		expect(hidden.status).toBe(404);

		const listed = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", { headers: userHeaders }), envValue);
		const page = await listed.json() as { result: { items: LinkRecord[] } };
		expect(page.result.items.map((link) => link.slug)).toEqual(["friend-link"]);

		const update = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links/friend-link", { method: "PATCH", headers: userHeaders, body: JSON.stringify({ title: "Edited" }) }), envValue);
		expect(update.status).toBe(200);

		const revoke = await app.fetch(new Request(`https://go.aitsys.dev/api/v1/tokens/${issued.result.tokenId}/revoke`, authed({ method: "POST" })), envValue);
		expect(revoke.status).toBe(200);
		const revoked = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", { headers: userHeaders }), envValue);
		expect(revoked.status).toBe(401);

		const secondTokenResponse = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts/friend/tokens", authed({ method: "POST", body: JSON.stringify({ label: "Chrome" }) })), envValue);
		const secondIssued = await secondTokenResponse.json() as { result: { token: string } };
		const removal = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts/friend", authed({ method: "DELETE" })), envValue);
		const removed = await removal.json() as { result: { revokedTokenCount: number } };
		expect(removal.status).toBe(200);
		expect(removed.result.revokedTokenCount).toBe(1);
		const removedToken = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", { headers: { Authorization: `Bearer ${secondIssued.result.token}` } }), envValue);
		expect(removedToken.status).toBe(401);
		const emptyAccountList = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts", authed()), envValue);
		expect((await emptyAccountList.json() as { result: { items: unknown[] } }).result.items).toEqual([]);
	});

	test("verifies Discord interactions and queues multiple message links", async () => {
		const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
		const publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
		const envValue = env({ DISCORD_APPLICATION_ID: "discord-app", DISCORD_PUBLIC_KEY: { get: async () => publicKey } as SecretsStoreSecret });
		const user = { id: "234567890123456789", username: "DiscordCat" };
		const discordUrl = "https://custom-short.example/discord/interactions";
		const invalid = await app.fetch(new Request("https://go.aitsys.dev/discord/interactions", { method: "POST", body: "{}" }), envValue);
		expect(invalid.status).toBe(401);
		const unlinked = await app.fetch(await discordRequest({ type: 2, application_id: "discord-app", user, data: { name: "manage" } }, keys.privateKey, discordUrl), envValue);
		expect(JSON.stringify(await unlinked.json())).toContain("not linked to an active shortener account");
		const account = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts", authed({ method: "POST", body: JSON.stringify({ id: "discord-cat", creatorName: "Discord Cat", discordUserId: user.id }) })), envValue);
		expect(account.status).toBe(201);

		const messageCommand = {
			type: 2,
			application_id: "discord-app",
			user,
			data: { name: "Shorten link", target_id: "message", resolved: { messages: { message: { content: "https://first.example and https://second.example" } } } }
		};
		const start = await app.fetch(await discordRequest(messageCommand, keys.privateKey, discordUrl), envValue);
		const modal = await start.json() as { type: number; data: { custom_id: string } };
		expect(modal.type).toBe(9);

		const submitted = await app.fetch(await discordRequest({ type: 5, application_id: "discord-app", user, data: { custom_id: modal.data.custom_id, components: [{ type: 18, component: { custom_id: "slug", value: "first" } }] } }, keys.privateKey, discordUrl), envValue);
		const next = await submitted.json() as { type: number; data: { components: Array<{ components?: Array<{ content?: string }> }> } };
		expect(next.type).toBe(4);
		expect(JSON.stringify(next.data.components)).toContain("Fill next URL");
		expect(JSON.stringify(next.data.components)).toContain("https://custom-short.example/first");
	});

	test("bootstraps one administrator profile and migrates every link", async () => {
		const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
		const publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
		const user = { id: "123456789012345678", username: "Admin Cat" };
		const envValue = env({ DISCORD_APPLICATION_ID: "discord-app", DISCORD_ADMIN_USER_ID: user.id, DISCORD_PUBLIC_KEY: { get: async () => publicKey } as SecretsStoreSecret });
		await create(envValue, { destinationUrl: "https://example.com", creator: "Legacy Cat", slug: "legacy-link" });
		await createStoredLink(envValue, { slug: "legacy-discord-admin", destinationUrl: "https://example.org", creator: "Old Admin Cat", owner: { kind: "discord", id: user.id } });
		await create(envValue, { destinationUrl: "https://example.net", creator: "Legacy Cat", slug: "legacy-link-two" });
		await create(envValue, { destinationUrl: "https://example.edu", creator: "Legacy Cat", slug: "legacy-link-three" });
		await create(envValue, { destinationUrl: "https://example.dev", creator: "Legacy Cat", slug: "legacy-link-four" });
		await createStoredLink(envValue, { slug: "disabled-link", destinationUrl: "https://disabled.example", creator: "Legacy Cat", disabledAt: "2026-08-25T00:00:00.000Z" });
		const begin = await app.fetch(await discordRequest({ type: 2, application_id: "discord-app", user, data: { name: "manage" } }, keys.privateKey), envValue);
		const setup = await begin.json() as { type: number; data: { custom_id: string } };
		expect(setup.type).toBe(9);
		expect(setup.data.custom_id).toBe("short:admin-setup");
		const complete = await app.fetch(await discordRequest({ type: 5, application_id: "discord-app", user, data: { custom_id: setup.data.custom_id, components: [{ type: 18, component: { custom_id: "creatorName", value: "Gremlin Lala" } }] } }, keys.privateKey), envValue);
		expect(JSON.stringify(await complete.json())).toContain("Administrator profile");
		const manage = await app.fetch(await discordRequest({ type: 2, application_id: "discord-app", user, data: { name: "manage" } }, keys.privateKey), envValue);
		const body = await manage.json() as { data: { components: Array<{ type: number; components: Array<{ type: number }> }> } };
		expect(JSON.stringify(body)).toContain("All links (admin)");
		expect(JSON.stringify(body)).toContain("legacy-link");
		expect(JSON.stringify(body)).toContain("https://go.aitsys.dev/legacy-link");
		expect(JSON.stringify(body)).toContain('"type":9');
		expect(JSON.stringify(body)).toContain('"style":5');
		expect(JSON.stringify(body)).not.toContain("disabled-link");
		expect(body.data.components).toHaveLength(4);
		expect(body.data.components.every((component) => component.type === 17 && component.components.every((child) => child.type !== 17))).toBe(true);
		const owned = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", authed()), envValue);
		expect((await owned.json() as { result: { items: LinkRecord[] } }).result.items.map((link) => link.slug).sort()).toEqual(["disabled-link", "legacy-discord-admin", "legacy-link", "legacy-link-four", "legacy-link-three", "legacy-link-two"]);
		const removeProfile = await app.fetch(new Request(`https://go.aitsys.dev/api/v1/accounts/admin-${user.id}`, authed({ method: "DELETE" })), envValue);
		expect(removeProfile.status).toBe(409);
	});

	test("migrates legacy Discord links into a newly linked account", async () => {
		const envValue = env();
		const discordUserId = "345678901234567890";
		await createStoredLink(envValue, { slug: "legacy-discord", destinationUrl: "https://example.com", creator: "Discord Cat", owner: { kind: "discord", id: discordUserId } });
		const account = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts", authed({ method: "POST", body: JSON.stringify({ id: "discord-owner", creatorName: "Discord Cat", discordUserId }) })), envValue);
		expect(account.status).toBe(201);
		const token = await app.fetch(new Request("https://go.aitsys.dev/api/v1/accounts/discord-owner/tokens", authed({ method: "POST", body: JSON.stringify({ label: "Shell" }) })), envValue);
		const issued = await token.json() as { result: { token: string } };
		const links = await app.fetch(new Request("https://go.aitsys.dev/api/v1/links", { headers: { Authorization: `Bearer ${issued.result.token}` } }), envValue);
		expect((await links.json() as { result: { items: LinkRecord[] } }).result.items.map((link) => link.slug)).toEqual(["legacy-discord"]);
	});
});

