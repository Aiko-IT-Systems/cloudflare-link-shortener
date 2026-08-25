import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import app from "../src";
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
		const keys = Array.from(this.values.keys())
			.filter((key) => key.startsWith(prefix))
			.map((name) => ({ name }));

		return {
			keys,
			list_complete: true,
			cacheStatus: null
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
		ASSETS: {
			fetch: async () => new Response("Not found", { status: 404 })
		} as Fetcher,
		SITE_NAME: "AITSYS Go",
		BRAND_LOGO_URL: "/logo.png",
		BRAND_LOGO_ALT: "Aiko IT Systems",
		FAVICON_URL: "/favicon.png",
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
});

