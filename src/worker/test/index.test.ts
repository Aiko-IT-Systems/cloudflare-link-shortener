import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import app from "../src";
import { extractEmbedMetadata, fetchTargetMetadata } from "../src/metadata";
import { createLink as createStoredLink } from "../src/store";
import { LinkRecord } from "../src/types";

class MemoryKV {
	private readonly values = new Map<string, string>();

	get(
		key: string,
		options?: Partial<KVNamespaceGetOptions<undefined>>,
	): Promise<string | null>;
	get(key: string, type: "text"): Promise<string | null>;
	get<T = unknown>(key: string, type: "json"): Promise<T | null>;
	get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
	get(key: string, type: "stream"): Promise<ReadableStream | null>;
	get(
		key: string,
		options?: KVNamespaceGetOptions<"text">,
	): Promise<string | null>;
	get<T = unknown>(
		key: string,
		options?: KVNamespaceGetOptions<"json">,
	): Promise<T | null>;
	get(
		key: string,
		options?: KVNamespaceGetOptions<"arrayBuffer">,
	): Promise<ArrayBuffer | null>;
	get(
		key: string,
		options?: KVNamespaceGetOptions<"stream">,
	): Promise<ReadableStream | null>;
	async get<T>(
		key: string,
		typeOrOptions?:
			| "json"
			| "text"
			| "arrayBuffer"
			| "stream"
			| Partial<KVNamespaceGetOptions<undefined>>,
	): Promise<T | string | ArrayBuffer | ReadableStream | null> {
		const value = this.values.get(key);
		if (value === undefined) {
			return null;
		}

		const type =
			typeof typeOrOptions === "string" ? typeOrOptions : typeOrOptions?.type;

		if (type === "json") {
			return JSON.parse(value) as T;
		}

		return value;
	}

	async put(
		key: string,
		value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
	): Promise<void> {
		if (typeof value === "string") {
			this.values.set(key, value);
			return;
		}

		throw new Error("MemoryKV test mock only supports string values.");
	}

	async delete(key: string): Promise<void> {
		this.values.delete(key);
	}

	async list<Metadata = unknown>(
		options?: KVNamespaceListOptions,
	): Promise<KVNamespaceListResult<Metadata, string>> {
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
			...(end < matching.length ? { cursor: `${end}` } : {}),
		};
	}

	getWithMetadata<Metadata = unknown>(
		key: string,
		options?: Partial<KVNamespaceGetOptions<undefined>>,
	): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		type: "text",
	): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<T = unknown, Metadata = unknown>(
		key: string,
		type: "json",
	): Promise<KVNamespaceGetWithMetadataResult<T, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		type: "arrayBuffer",
	): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		type: "stream",
	): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		options: KVNamespaceGetOptions<"text">,
	): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<T = unknown, Metadata = unknown>(
		key: string,
		options: KVNamespaceGetOptions<"json">,
	): Promise<KVNamespaceGetWithMetadataResult<T, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		options: KVNamespaceGetOptions<"arrayBuffer">,
	): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		options: KVNamespaceGetOptions<"stream">,
	): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
	async getWithMetadata<T, Metadata = unknown>(
		key: string,
		typeOrOptions?:
			| "json"
			| "text"
			| "arrayBuffer"
			| "stream"
			| Partial<KVNamespaceGetOptions<undefined>>,
	): Promise<
		KVNamespaceGetWithMetadataResult<
			T | string | ArrayBuffer | ReadableStream,
			Metadata
		>
	> {
		const value = await this.get<T>(key, typeOrOptions);
		return {
			value: value as T | string | null,
			metadata: null,
			cacheStatus: null,
		};
	}
}

class MemoryCoordinator {
	private claimed = false;
	private reservation?: string;
	private failures = 0;
	private windowStart?: number;
	private lockedUntil?: number;

	async reserve(key: string): Promise<boolean> {
		if (this.claimed || this.reservation) return false;
		this.reservation = key;
		return true;
	}

	async commit(key: string): Promise<void> {
		if (this.reservation !== key) return;
		this.claimed = true;
		this.reservation = undefined;
	}

	async release(key: string): Promise<void> {
		if (!this.claimed && this.reservation === key) this.reservation = undefined;
	}

	async unclaim(key: string): Promise<void> {
		if (this.reservation === key) this.reservation = undefined;
		this.claimed = false;
	}

	async allowPasswordAttempt(now: number) {
		return this.lockedUntil && this.lockedUntil > now
			? {
					allowed: false,
					retryAfterSeconds: Math.ceil((this.lockedUntil - now) / 1000),
			  }
			: { allowed: true };
	}

	async recordPasswordFailure(now: number) {
		if (!this.windowStart || now - this.windowStart > 15 * 60_000) {
			this.windowStart = now;
			this.failures = 0;
		}
		this.failures += 1;
		if (this.failures < 5) return {};
		const retryAfterSeconds = Math.min(
			60 * 2 ** (this.failures - 5),
			60 * 60,
		);
		this.lockedUntil = now + retryAfterSeconds * 1000;
		return { retryAfterSeconds };
	}

	async clearPasswordFailures(): Promise<void> {
		this.failures = 0;
		this.windowStart = undefined;
		this.lockedUntil = undefined;
	}
}

class MemoryCoordinatorNamespace {
	private readonly coordinators = new Map<string, MemoryCoordinator>();

	getByName(name: string): MemoryCoordinator {
		const existing = this.coordinators.get(name);
		if (existing) return existing;
		const created = new MemoryCoordinator();
		this.coordinators.set(name, created);
		return created;
	}
}

function env(overrides: Partial<Env> = {}): Env {
	return {
		LINKS: new MemoryKV() as KVNamespace,
		LINK_COORDINATOR:
			new MemoryCoordinatorNamespace() as unknown as DurableObjectNamespace,
		LINK_SHORTENER_API_KEY: "test-secret",
		LINK_PASSWORD_PEPPER: "test-password-pepper-that-is-at-least-32-bytes",
		DISCORD_PUBLIC_KEY: "0".repeat(64),
		ASSETS: {
			fetch: async () => new Response("Not found", { status: 404 }),
		} as Fetcher,
		SITE_NAME: "AITSYS Go",
		BRAND_LOGO_URL: "/logo.png",
		BRAND_LOGO_ALT: "Aiko IT Systems",
		FAVICON_URL: "/favicon.png",
		BRAND_COLOR: "#fc0fc0",
		PRIVACY_EMAIL: "privacy@aitsys.dev",
		DISCORD_APPLICATION_ID: "",
		DISCORD_ADMIN_USER_ID: "",
		...overrides,
	};
}

function authed(init: RequestInit = {}): RequestInit {
	return {
		...init,
		headers: {
			Authorization: "Bearer test-secret",
			"Content-Type": "application/json",
			...init.headers,
		},
	};
}

async function create(
	envValue: Env,
	payload: Record<string, unknown>,
): Promise<Response> {
	return app.fetch(
		new Request(
			"https://go.aitsys.dev/api/v1/links",
			authed({
				method: "POST",
				body: JSON.stringify(payload),
			}),
		),
		envValue,
	);
}

async function submitPassword(
	envValue: Env,
	slug: string,
	password: string,
	clientAddress = "203.0.113.10",
): Promise<Response> {
	return app.fetch(
		new Request(`https://go.aitsys.dev/${slug}`, {
			method: "POST",
			headers: {
				"CF-Connecting-IP": clientAddress,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: `password=${encodeURIComponent(password)}`,
		}),
		envValue,
	);
}

function hex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function discordRequest(
	body: Record<string, unknown>,
	privateKey: CryptoKey,
	url = "https://go.aitsys.dev/api/v1/discord/interactions",
): Promise<Request> {
	const timestamp = `${Math.floor(Date.now() / 1000)}`;
	const json = JSON.stringify(body);
	const data = new TextEncoder().encode(timestamp + json);
	const signature = await crypto.subtle.sign(
		{ name: "Ed25519" },
		privateKey,
		data,
	);
	return new Request(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Signature-Ed25519": hex(signature),
			"X-Signature-Timestamp": timestamp,
		},
		body: json,
	});
}

describe("link shortener", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						`<!doctype html>
			<html>
				<head>
					<meta property="og:title" content="Target Embed Title">
					<meta property="og:description" content="Target embed description.">
					<meta property="og:image" content="/preview.png">
					<meta property="og:site_name" content="Target Site">
				</head>
			</html>`,
						{
							headers: { "Content-Type": "text/html; charset=utf-8" },
						},
					),
			),
		);
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
			title: "Pycord",
		});
		const body = (await response.json()) as { result: LinkRecord };

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
			creator: "Lulalaby",
		});
		const body = (await response.json()) as { result: LinkRecord };

		expect(response.status).toBe(201);
		expect(body.result.slug).toMatch(/^[A-Za-z0-9]{8}$/);
	});

	test("rejects missing and bad auth", async () => {
		const envValue = env();
		const missing = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", {
				method: "POST",
			}),
			envValue,
		);
		const bad = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", {
				method: "POST",
				headers: { Authorization: "Bearer wrong" },
			}),
			envValue,
		);

		expect(missing.status).toBe(401);
		expect(bad.status).toBe(401);
	});

	test("rejects invalid URLs, duplicate slugs, and reserved slugs", async () => {
		const envValue = env();
		const invalidUrl = await create(envValue, {
			slug: "bad-url",
			destinationUrl: "http://example.com",
			creator: "Lulalaby",
		});
		const first = await create(envValue, {
			slug: "dupe",
			destinationUrl: "https://example.com",
			creator: "Lulalaby",
		});
		const duplicate = await create(envValue, {
			slug: "dupe",
			destinationUrl: "https://example.org",
			creator: "Lulalaby",
		});
		const reserved = await create(envValue, {
			slug: "api",
			destinationUrl: "https://example.com",
			creator: "Lulalaby",
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
			creator: "Lulalaby",
		});

		const response = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links/readme", authed()),
			envValue,
		);
		const body = (await response.json()) as { result: LinkRecord };

		expect(response.status).toBe(200);
		expect(body.result.destinationUrl).toBe("https://aitsys.dev");
	});

	test("decodes HTML entities only once", () => {
		const metadata = extractEmbedMetadata(
			'<head><meta property="og:title" content="&amp;lt;script&amp;gt;"></head>',
			"https://example.test/",
		);

		expect(metadata.embedTitle).toBe("&lt;script&gt;");
	});

	test("extracts a public Instagram MP4 and renders it only through the short-link page", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						`<head>
							<meta property="og:title" content="Tiny reel">
							<meta property="og:image" content="https://scontent.example.cdninstagram.com/poster.jpg">
						</head>
						<script type="application/json">{"original_width":720,"original_height":1280,"video_versions":[{"url":"https://scontent.example.cdninstagram.com/reel.mp4?one=1\\u0026two=2"}]}</script>`,
						{ headers: { "Content-Type": "text/html" } },
					),
			),
		);

		const envValue = env();
		const created = await create(envValue, {
			slug: "tiny-reel",
			destinationUrl: "https://www.instagram.com/reel/Cat_123-/",
			creator: "Lulalaby",
		});
		const record = ((await created.json()) as { result: LinkRecord }).result;
		expect(record.embedVideoUrl).toBe(
			"https://scontent.example.cdninstagram.com/reel.mp4?one=1&two=2",
		);
		expect(record.embedVideoWidth).toBe(720);
		expect(record.embedVideoHeight).toBe(1280);

		const page = await app.fetch(
			new Request("https://go.aitsys.dev/tiny-reel"),
			envValue,
		);
		const html = await page.text();
		expect(html).toContain('property="og:video:type" content="video/mp4"');
		expect(html).toContain('property="og:video:width" content="720"');
		expect(html).toContain('content="https://scontent.example.cdninstagram.com/reel.mp4?one=1&two=2"');
	});

	test("does not turn an image-first Instagram carousel into a video embed", () => {
		const metadata = extractEmbedMetadata(
			`<head><meta property="og:image" content="https://scontent.example.cdninstagram.com/first.jpg"></head>
			<script type="application/json">{"carousel_media":[{"media_type":1},{"media_type":2,"video_versions":[{"url":"https://scontent.example.cdninstagram.com/later.mp4"}]}]}</script>`,
			"https://www.instagram.com/p/Cat_123-/",
		);
		expect(metadata.embedVideoUrl).toBeUndefined();
	});

	test("reads Instagram video state that appears after the ordinary metadata head", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						`<head><meta property="og:title" content="Late reel"></head>${" ".repeat(540_000)}<script type="application/json">{"video_versions":[{"url":"https://scontent.example.cdninstagram.com/late.mp4"}]}</script>`,
						{ headers: { "Content-Type": "text/html" } },
					),
			),
		);
		const metadata = await fetchTargetMetadata(
			"https://www.instagram.com/reel/Cat_123-/",
		);
		expect(metadata.embedVideoUrl).toBe(
			"https://scontent.example.cdninstagram.com/late.mp4",
		);
	});

	test("renders splash page and disables public access", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "hello",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
		});

		const splashResponse = await app.fetch(
			new Request("https://go.aitsys.dev/hello"),
			envValue,
		);
		const splashHtml = await splashResponse.text();

		const disableResponse = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/links/hello/disable",
				authed({
					method: "POST",
					body: JSON.stringify({ reason: "No longer needed" }),
				}),
			),
			envValue,
		);
		const disabledResponse = await app.fetch(
			new Request("https://go.aitsys.dev/hello"),
			envValue,
		);
		const disabledHtml = await disabledResponse.text();

		expect(splashResponse.status).toBe(200);
		expect(splashHtml).toContain("Continue to destination");
		expect(splashHtml).toContain(
			'<meta property="og:title" content="Target Embed Title">',
		);
		expect(splashHtml).toContain(
			'<meta property="og:image" content="https://aitsys.dev/preview.png">',
		);
		expect(disableResponse.status).toBe(200);
		expect(disabledResponse.status).toBe(410);
		expect(disabledHtml).not.toContain("Continue to destination");
	});

	test("refreshes target embed metadata", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "refresh-me",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
		});

		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(
				`<!doctype html>
			<html>
				<head>
					<meta property="og:title" content="Refreshed Title">
					<meta name="description" content="Refreshed description.">
				</head>
			</html>`,
				{
					headers: { "Content-Type": "text/html; charset=utf-8" },
				},
			),
		);

		const response = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/links/refresh-me/refresh-metadata",
				authed({
					method: "POST",
				}),
			),
			envValue,
		);
		const body = (await response.json()) as { result: LinkRecord };

		expect(response.status).toBe(200);
		expect(body.result.embedTitle).toBe("Refreshed Title");
		expect(body.result.embedDescription).toBe("Refreshed description.");
	});

	test("requires a password before rendering the destination splash", async () => {
		const envValue = env();
		const createResponse = await create(envValue, {
			slug: "secret",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
			password: "meow",
		});
		const created = (await createResponse.json()) as {
			result: LinkRecord & { hasPassword?: boolean };
		};
		const stored = await envValue.LINKS.get<LinkRecord>("link:secret", "json");
		expect(created.result.hasPassword).toBe(true);
		expect(created.result.password).toBeUndefined();
		expect(created.result.passwordVerifier).toBeUndefined();
		expect(stored?.password).toBeUndefined();
		expect(stored?.passwordVerifier?.algorithm).toBe("HMAC-SHA-256");

		const promptResponse = await app.fetch(
			new Request("https://go.aitsys.dev/secret"),
			envValue,
		);
		const promptHtml = await promptResponse.text();
		const badResponse = await submitPassword(envValue, "secret", "wrong");
		const goodResponse = await submitPassword(envValue, "secret", "meow");
		const goodHtml = await goodResponse.text();

		expect(promptResponse.status).toBe(200);
		expect(promptHtml).toContain("Password");
		expect(promptHtml).not.toContain("Continue to destination");
		expect(badResponse.status).toBe(401);
		expect(goodResponse.status).toBe(200);
		expect(goodHtml).toContain("Continue to destination");
	});

	test("never returns password material and requires explicit password updates", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "managed-secret",
			destinationUrl: "https://example.com",
			creator: "Security Cat",
			password: "first password",
		});

		for (const path of [
			"/api/v1/links/managed-secret",
			"/api/v1/admin/links",
		]) {
			const response = await app.fetch(
				new Request(`https://go.aitsys.dev${path}`, authed()),
				envValue,
			);
			const text = await response.text();
			expect(response.status, path).toBe(200);
			expect(text).toContain('"hasPassword":true');
			expect(text).not.toContain('"password":');
			expect(text).not.toContain("passwordVerifier");
		}

		const titleOnly = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links/managed-secret", {
				...authed({ method: "PATCH" }),
				body: JSON.stringify({ title: "Still protected" }),
			}),
			envValue,
		);
		expect(await titleOnly.json()).toMatchObject({
			result: { hasPassword: true, title: "Still protected" },
		});
		expect(
			(await submitPassword(envValue, "managed-secret", "first password"))
				.status,
		).toBe(200);

		const replaced = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links/managed-secret", {
				...authed({ method: "PATCH" }),
				body: JSON.stringify({ password: "replacement" }),
			}),
			envValue,
		);
		expect(await replaced.json()).toMatchObject({
			result: { hasPassword: true },
		});
		expect(
			(await submitPassword(envValue, "managed-secret", "replacement")).status,
		).toBe(200);

		const cleared = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links/managed-secret", {
				...authed({ method: "PATCH" }),
				body: JSON.stringify({ password: null }),
			}),
			envValue,
		);
		expect(await cleared.json()).toMatchObject({
			result: { hasPassword: false },
		});
		expect(
			(
				await app.fetch(
					new Request("https://go.aitsys.dev/managed-secret"),
					envValue,
				)
			).status,
		).toBe(200);
	});

	test("upgrades a legacy plaintext password after a successful unlock", async () => {
		const envValue = env();
		await envValue.LINKS.put(
			"link:legacy-password",
			JSON.stringify({
				slug: "legacy-password",
				destinationUrl: "https://example.com",
				creator: "Legacy Cat",
				createdAt: "2026-08-01T00:00:00.000Z",
				password: "old secret",
			}),
		);
		expect(
			(await submitPassword(envValue, "legacy-password", "old secret")).status,
		).toBe(200);
		const upgraded = await envValue.LINKS.get<LinkRecord>(
			"link:legacy-password",
			"json",
		);
		expect(upgraded?.password).toBeUndefined();
		expect(upgraded?.passwordVerifier?.algorithm).toBe("HMAC-SHA-256");
	});

	test("isolates password throttling by a hashed client identity", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "throttled",
			destinationUrl: "https://example.com",
			creator: "Rate Limit Cat",
			password: "correct",
		});
		for (let attempt = 0; attempt < 4; attempt += 1)
			expect(
				(await submitPassword(envValue, "throttled", "wrong", "203.0.113.1"))
					.status,
			).toBe(401);
		expect(
			(await submitPassword(envValue, "throttled", "wrong", "203.0.113.1"))
				.status,
		).toBe(429);
		expect(
			(await submitPassword(envValue, "throttled", "wrong", "203.0.113.2"))
				.status,
		).toBe(401);
	});

	test("renders expired links without the destination button", async () => {
		const envValue = env();
		await create(envValue, {
			slug: "old",
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
			expiresAt: "2020-01-01T00:00:00.000Z",
		});

		const response = await app.fetch(
			new Request("https://go.aitsys.dev/old"),
			envValue,
		);
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
			suppressSocialPreview: true,
		});

		const quietResponse = await app.fetch(
			new Request("https://go.aitsys.dev/quiet"),
			envValue,
		);
		const quietHtml = await quietResponse.text();
		const homeResponse = await app.fetch(
			new Request("https://go.aitsys.dev/"),
			envValue,
		);
		const homeHtml = await homeResponse.text();

		expect(quietHtml).not.toContain('property="og:title"');
		expect(quietHtml).not.toContain('name="twitter:card"');
		expect(homeHtml).toContain(
			'<meta property="og:title" content="Private link shortener">',
		);
		expect(homeHtml).toContain(
			'<meta property="og:image" content="https://go.aitsys.dev/logo.png">',
		);
		expect(homeHtml).toContain(
			"Host your own: https://github.com/Aiko-IT-Systems/cloudflare-link-shortener",
		);
		expect(homeHtml).toContain('<link rel="icon" href="/favicon.png">');
	});

	test("serves the privacy policy with its configured contact at its reserved public route", async () => {
		const response = await app.fetch(
			new Request("https://go.aitsys.dev/privacy"),
			env({ PRIVACY_EMAIL: "privacy@cats.example" }),
		);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain("Privacy");
		expect(html).toContain('href="mailto:privacy@cats.example"');
		expect(html).toContain("privacy@cats.example");
		expect(html).toContain("Google Play's in-app update service");
		expect(html).toContain("device metadata");
		expect(html).toContain(
			"does not use advertising, analytics, click tracking, cookies, or telemetry",
		);
		expect(html).toContain("Cloudflare Workers");
		expect(html).toContain("Cloudflare KV");
		expect(html).toContain("may be publicly visible");
		expect(html).toContain("browser extension storage, which is not encrypted");
		expect(html).toContain("Android Keystore");
		expect(html).toContain("randomly salted, keyed cryptographic verifier");
		expect(html).toContain("never return password material");
		expect(html).toContain(
			"keyed one-way identifier from the requesting network address",
		);
		expect(html).toContain("automatically deleted");
		expect(response.headers.get("Content-Security-Policy")).toContain(
		"frame-ancestors 'none'",
	);
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(html).toContain("excludes it from Android backup");
		expect(html).toContain("up to 15 minutes");
		expect(html).toContain("Google Play");
		expect(html).toContain("retains existing public links");
		expect(html).toContain(
			'<meta property="og:title" content="Privacy policy">',
		);
		expect(html).toContain(
			'<meta property="og:url" content="https://go.aitsys.dev/privacy">',
		);
		expect(html).toContain(
			'<meta property="og:image" content="https://go.aitsys.dev/logo.png">',
		);
		expect(html).toContain(
			"Self-host: https://github.com/Aiko-IT-Systems/cloudflare-link-shortener",
		);
	});

	test("renders configured site branding and escapes its HTML attributes", async () => {
		const envValue = env({
			SITE_NAME: "Cats & Code",
			BRAND_LOGO_URL: "/custom/logo.svg?light=1&wide=1",
			BRAND_LOGO_ALT: 'Cats "R" Us & friends',
			FAVICON_URL: "/custom/favicon.svg?pink=1&small=1",
		});

		const response = await app.fetch(
			new Request("https://short.example/"),
			envValue,
		);
		const html = await response.text();

		expect(html).toContain(
			"<title>Private link shortener · Cats &amp; Code</title>",
		);
		expect(html).toContain(
			'<img class="brand-logo" src="/custom/logo.svg?light=1&amp;wide=1" alt="Cats &quot;R&quot; Us &amp; friends">',
		);
		expect(html).toContain(
			'<link rel="icon" href="/custom/favicon.svg?pink=1&amp;small=1">',
		);
		expect(html).toContain(
			'<meta property="og:image" content="https://short.example/custom/logo.svg?light=1&amp;wide=1">',
		);
		expect(html).toContain(
			'<meta property="og:site_name" content="Cats &amp; Code">',
		);
	});

	test("exposes public absolute branding metadata without API authentication", async () => {
		const envValue = env({
			SITE_NAME: "Cats & Code",
			BRAND_LOGO_URL: "/custom/logo.svg",
			BRAND_LOGO_ALT: "A custom cat logo",
			FAVICON_URL: "https://assets.example/favicon.svg",
			BRAND_COLOR: "#aabbcc",
			PRIVACY_EMAIL: "privacy@cats.example",
		});

		const response = await app.fetch(
			new Request("https://short.example/api/v1/metadata"),
			envValue,
		);
		const body = (await response.json()) as {
			success: boolean;
			result: {
				apiVersion: number;
				branding: Record<string, string>;
				build: Record<string, string>;
			};
		};

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
					brandColor: "#aabbcc",
					privacyEmail: "privacy@cats.example",
				},
				build: {
					version: "development",
					sha: "local",
					repository:
						"https://github.com/Aiko-IT-Systems/cloudflare-link-shortener",
				},
			},
		});
	});

	test("issues revocable account tokens and isolates owned links", async () => {
		const envValue = env();
		const admin = authed({
			method: "POST",
			body: JSON.stringify({ id: "friend", creatorName: "Friendly Cat" }),
		});
		const accountResponse = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/accounts", admin),
			envValue,
		);
		expect(accountResponse.status).toBe(201);
		const accountList = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/accounts", authed()),
			envValue,
		);
		expect(
			(
				(await accountList.json()) as {
					result: { items: Array<{ id: string }> };
				}
			).result.items.map((account) => account.id),
		).toEqual(["friend"]);

		const tokenResponse = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts/friend/tokens",
				authed({ method: "POST", body: JSON.stringify({ label: "Firefox" }) }),
			),
			envValue,
		);
		const issued = (await tokenResponse.json()) as {
			result: { token: string; tokenId: string };
		};
		expect(issued.result.token).toMatch(/^aig_/);

		const userHeaders = {
			Authorization: `Bearer ${issued.result.token}`,
			"Content-Type": "application/json",
		};
		const meResponse = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/me", { headers: userHeaders }),
			envValue,
		);
		expect(meResponse.status).toBe(200);
		expect(await meResponse.json()).toEqual({
			success: true,
			result: {
				id: "friend",
				creatorName: "Friendly Cat",
				createdAt: expect.any(String),
				discordUserId: null,
			},
		});
		const ownResponse = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", {
				method: "POST",
				headers: userHeaders,
				body: JSON.stringify({
					destinationUrl: "https://example.com",
					creator: "Pretend Admin",
					slug: "friend-link",
				}),
			}),
			envValue,
		);
		const own = (await ownResponse.json()) as { result: LinkRecord };
		expect(ownResponse.status).toBe(201);
		expect(own.result.creator).toBe("Friendly Cat");
		expect(own.result.owner).toEqual({ kind: "account", id: "friend" });

		await create(envValue, {
			destinationUrl: "https://aitsys.dev",
			creator: "Lulalaby",
			slug: "admin-link",
		});
		const hidden = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links/admin-link", {
				headers: userHeaders,
			}),
			envValue,
		);
		expect(hidden.status).toBe(404);

		const listed = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", {
				headers: userHeaders,
			}),
			envValue,
		);
		const page = (await listed.json()) as { result: { items: LinkRecord[] } };
		expect(page.result.items.map((link) => link.slug)).toEqual(["friend-link"]);

		const update = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links/friend-link", {
				method: "PATCH",
				headers: userHeaders,
				body: JSON.stringify({ title: "Edited" }),
			}),
			envValue,
		);
		expect(update.status).toBe(200);

		const revoke = await app.fetch(
			new Request(
				`https://go.aitsys.dev/api/v1/tokens/${issued.result.tokenId}/revoke`,
				authed({ method: "POST" }),
			),
			envValue,
		);
		expect(revoke.status).toBe(200);
		const revoked = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", {
				headers: userHeaders,
			}),
			envValue,
		);
		expect(revoked.status).toBe(401);

		const secondTokenResponse = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts/friend/tokens",
				authed({ method: "POST", body: JSON.stringify({ label: "Chrome" }) }),
			),
			envValue,
		);
		const secondIssued = (await secondTokenResponse.json()) as {
			result: { token: string };
		};
		const removal = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts/friend",
				authed({ method: "DELETE" }),
			),
			envValue,
		);
		const removed = (await removal.json()) as {
			result: { revokedTokenCount: number };
		};
		expect(removal.status).toBe(200);
		expect(removed.result.revokedTokenCount).toBe(1);
		const removedToken = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", {
				headers: { Authorization: `Bearer ${secondIssued.result.token}` },
			}),
			envValue,
		);
		expect(removedToken.status).toBe(401);
		const emptyAccountList = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/accounts", authed()),
			envValue,
		);
		expect(
			((await emptyAccountList.json()) as { result: { items: unknown[] } })
				.result.items,
		).toEqual([]);
	});

	test("reuses a Discord identity after its previous account is removed", async () => {
		const envValue = env();
		const discordUserId = "234567890123456789";
		const createAccountRequest = (id: string) =>
			new Request("https://go.aitsys.dev/api/v1/accounts", {
				...authed({ method: "POST" }),
				body: JSON.stringify({
					id,
					creatorName: `${id} Cat`,
					discordUserId,
				}),
			});
		expect((await app.fetch(createAccountRequest("first-cat"), envValue)).status).toBe(
			201,
		);
		expect(
			(
				await app.fetch(
					new Request(
						"https://go.aitsys.dev/api/v1/accounts/first-cat",
						authed({ method: "DELETE" }),
					),
					envValue,
				)
			).status,
		).toBe(200);
		expect((await app.fetch(createAccountRequest("second-cat"), envValue)).status).toBe(
			201,
		);
	});

	test("lists all links and sanitized token records for administrators", async () => {
		const envValue = env();
		await create(envValue, {
			destinationUrl: "https://one.example",
			creator: "Admin Cat",
			slug: "one",
		});
		await create(envValue, {
			destinationUrl: "https://two.example",
			creator: "Admin Cat",
			slug: "two",
		});
		await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts",
				authed({
					method: "POST",
					body: JSON.stringify({ id: "shell-cat", creatorName: "Shell Cat" }),
				}),
			),
			envValue,
		);
		const firstTokenResponse = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts/shell-cat/tokens",
				authed({
					method: "POST",
					body: JSON.stringify({ label: "Laptop" }),
				}),
			),
			envValue,
		);
		const firstToken = (await firstTokenResponse.json()) as {
			result: { token: string };
		};
		await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts/shell-cat/tokens",
				authed({
					method: "POST",
					body: JSON.stringify({ label: "Desktop" }),
				}),
			),
			envValue,
		);

		const firstLinkPage = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/admin/links?limit=1", authed()),
			envValue,
		);
		const firstLinks = (await firstLinkPage.json()) as {
			result: { items: LinkRecord[]; cursor: string };
		};
		expect(firstLinks.result.items).toHaveLength(1);
		expect(firstLinks.result.cursor).toBeTruthy();
		const secondLinkPage = await app.fetch(
			new Request(
				`https://go.aitsys.dev/api/v1/admin/links?limit=1&cursor=${encodeURIComponent(firstLinks.result.cursor)}`,
				authed(),
			),
			envValue,
		);
		expect(
			((await secondLinkPage.json()) as { result: { items: LinkRecord[] } })
				.result.items,
		).toHaveLength(1);

		const tokenList = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/tokens?limit=100", authed()),
			envValue,
		);
		const tokens = (await tokenList.json()) as {
			result: { items: Array<Record<string, unknown>> };
		};
		expect(tokens.result.items).toHaveLength(2);
		expect(tokens.result.items.map((token) => token.label).sort()).toEqual([
			"Desktop",
			"Laptop",
		]);
		expect(
			tokens.result.items.every(
				(token) => !("digest" in token) && !("token" in token),
			),
		).toBe(true);

		const userHeaders = { Authorization: `Bearer ${firstToken.result.token}` };
		expect(
			(
				await app.fetch(
					new Request("https://go.aitsys.dev/api/v1/admin/links", {
						headers: userHeaders,
					}),
					envValue,
				)
			).status,
		).toBe(403);
		expect(
			(
				await app.fetch(
					new Request("https://go.aitsys.dev/api/v1/tokens", {
						headers: userHeaders,
					}),
					envValue,
				)
			).status,
		).toBe(403);
	});

	test("verifies Discord interactions and queues multiple message links", async () => {
		const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
			"sign",
			"verify",
		]);
		const publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
		const envValue = env({
			DISCORD_APPLICATION_ID: "discord-app",
			DISCORD_PUBLIC_KEY: publicKey,
		});
		const user = { id: "234567890123456789", username: "DiscordCat" };
		const discordUrl =
			"https://custom-short.example/api/v1/discord/interactions";
		const invalid = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/discord/interactions", {
				method: "POST",
				body: "{}",
			}),
			envValue,
		);
		expect(invalid.status).toBe(401);
		const unlinked = await app.fetch(
			await discordRequest(
				{
					type: 2,
					application_id: "discord-app",
					user,
					data: { name: "manage" },
				},
				keys.privateKey,
				discordUrl,
			),
			envValue,
		);
		expect(JSON.stringify(await unlinked.json())).toContain(
			"not linked to an active shortener account",
		);
		const account = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts",
				authed({
					method: "POST",
					body: JSON.stringify({
						id: "discord-cat",
						creatorName: "Discord Cat",
						discordUserId: user.id,
					}),
				}),
			),
			envValue,
		);
		expect(account.status).toBe(201);

		const messageCommand = {
			type: 2,
			application_id: "discord-app",
			user,
			data: {
				name: "Shorten link",
				target_id: "message",
				resolved: {
					messages: {
						message: {
							content: "https://first.example and https://second.example",
						},
					},
				},
			},
		};
		const start = await app.fetch(
			await discordRequest(messageCommand, keys.privateKey, discordUrl),
			envValue,
		);
		const modal = (await start.json()) as {
			type: number;
			data: { custom_id: string };
		};
		expect(modal.type).toBe(9);

		const submitted = await app.fetch(
			await discordRequest(
				{
					type: 5,
					application_id: "discord-app",
					user,
					data: {
						custom_id: modal.data.custom_id,
						components: [
							{ type: 18, component: { custom_id: "slug", value: "first" } },
						],
					},
				},
				keys.privateKey,
				discordUrl,
			),
			envValue,
		);
		const next = (await submitted.json()) as {
			type: number;
			data: { components: Array<{ components?: Array<{ content?: string }> }> };
		};
		expect(next.type).toBe(4);
		expect(JSON.stringify(next.data.components)).toContain("Fill next URL");
		expect(JSON.stringify(next.data.components)).toContain(
			"https://custom-short.example/first",
		);
	});

	test("serves public Discord information commands without a linked account", async () => {
		const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
			"sign",
			"verify",
		]);
		const publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
		const envValue = env({
			DISCORD_APPLICATION_ID: "discord-app",
			DISCORD_ADMIN_USER_ID: "admin-user",
			DISCORD_PUBLIC_KEY: publicKey,
			PRIVACY_EMAIL: "privacy@example.test",
		});
		await envValue.LINKS.put("admin-account", "admin-account");
		const user = { id: "unlinked-user", username: "Curious Cat" };
		const expectations = [
			["about", "self-hosted link shortener"],
			["privacy", "privacy@example.test"],
			["debug", "Status: **ok**"],
		] as const;

		for (const [name, expectedContent] of expectations) {
			const result = await app.fetch(
				await discordRequest(
					{
						type: 2,
						application_id: "discord-app",
						user,
						data: { name },
					},
					keys.privateKey,
				),
				envValue,
			);
			expect(result.status).toBe(200);
			const body = (await result.json()) as {
				type: number;
				data: { content: string; flags: number };
			};
			expect(body.type).toBe(4);
			expect(body.data.flags).toBe(64);
			expect(body.data.content).toContain(expectedContent);
			if (name === "privacy") {
				expect(body.data.content).toContain("salted, keyed verifier");
				expect(body.data.content).toContain(
					"keyed one-way client-address identifier",
				);
				expect(body.data.content).toContain("automatically deleted");
				expect(body.data.content).toContain(
					"Google Play-distributed Android installs use Google Play's in-app update service",
				);
				expect(body.data.content).toContain("does not receive that update-check data");
			}
		}
	});

	test("bootstraps one administrator profile and migrates every link", async () => {
		const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
			"sign",
			"verify",
		]);
		const publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
		const user = { id: "123456789012345678", username: "Admin Cat" };
		const envValue = env({
			DISCORD_APPLICATION_ID: "discord-app",
			DISCORD_ADMIN_USER_ID: user.id,
			DISCORD_PUBLIC_KEY: publicKey,
		});
		await create(envValue, {
			destinationUrl: "https://example.com",
			creator: "Legacy Cat",
			slug: "legacy-link",
		});
		await createStoredLink(envValue, {
			slug: "legacy-discord-admin",
			destinationUrl: "https://example.org",
			creator: "Old Admin Cat",
			owner: { kind: "discord", id: user.id },
		});
		await create(envValue, {
			destinationUrl: "https://example.net",
			creator: "Legacy Cat",
			slug: "legacy-link-two",
		});
		await create(envValue, {
			destinationUrl: "https://example.edu",
			creator: "Legacy Cat",
			slug: "legacy-link-three",
		});
		await create(envValue, {
			destinationUrl: "https://example.dev",
			creator: "Legacy Cat",
			slug: "legacy-link-four",
		});
		await createStoredLink(envValue, {
			slug: "disabled-link",
			destinationUrl: "https://disabled.example",
			creator: "Legacy Cat",
			disabledAt: "2026-08-25T00:00:00.000Z",
		});
		const begin = await app.fetch(
			await discordRequest(
				{
					type: 2,
					application_id: "discord-app",
					user,
					data: { name: "manage" },
				},
				keys.privateKey,
			),
			envValue,
		);
		const setup = (await begin.json()) as {
			type: number;
			data: { custom_id: string };
		};
		expect(setup.type).toBe(9);
		expect(setup.data.custom_id).toBe("short:admin-setup");
		const complete = await app.fetch(
			await discordRequest(
				{
					type: 5,
					application_id: "discord-app",
					user,
					data: {
						custom_id: setup.data.custom_id,
						components: [
							{
								type: 18,
								component: { custom_id: "creatorName", value: "Gremlin Lala" },
							},
						],
					},
				},
				keys.privateKey,
			),
			envValue,
		);
		expect(JSON.stringify(await complete.json())).toContain(
			"Administrator profile",
		);
		const manage = await app.fetch(
			await discordRequest(
				{
					type: 2,
					application_id: "discord-app",
					user,
					data: { name: "manage" },
				},
				keys.privateKey,
			),
			envValue,
		);
		const body = (await manage.json()) as {
			data: {
				components: Array<{
					type: number;
					components: Array<{ type: number }>;
				}>;
			};
		};
		expect(JSON.stringify(body)).toContain("All links (admin)");
		expect(JSON.stringify(body)).toContain("legacy-link");
		expect(JSON.stringify(body)).toContain("https://go.aitsys.dev/legacy-link");
		expect(JSON.stringify(body)).toContain('"type":9');
		expect(JSON.stringify(body)).toContain('"style":5');
		expect(JSON.stringify(body)).not.toContain("disabled-link");
		expect(body.data.components).toHaveLength(4);
		expect(
			body.data.components.every(
				(component) =>
					component.type === 17 &&
					component.components.every((child) => child.type !== 17),
			),
		).toBe(true);
		const owned = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", authed()),
			envValue,
		);
		expect(
			((await owned.json()) as { result: { items: LinkRecord[] } }).result.items
				.map((link) => link.slug)
				.sort(),
		).toEqual([
			"disabled-link",
			"legacy-discord-admin",
			"legacy-link",
			"legacy-link-four",
			"legacy-link-three",
			"legacy-link-two",
		]);
		const removeProfile = await app.fetch(
			new Request(
				`https://go.aitsys.dev/api/v1/accounts/admin-${user.id}`,
				authed({ method: "DELETE" }),
			),
			envValue,
		);
		expect(removeProfile.status).toBe(409);
	});

	test("migrates legacy Discord links into a newly linked account", async () => {
		const envValue = env();
		const discordUserId = "345678901234567890";
		await createStoredLink(envValue, {
			slug: "legacy-discord",
			destinationUrl: "https://example.com",
			creator: "Discord Cat",
			owner: { kind: "discord", id: discordUserId },
		});
		const account = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts",
				authed({
					method: "POST",
					body: JSON.stringify({
						id: "discord-owner",
						creatorName: "Discord Cat",
						discordUserId,
					}),
				}),
			),
			envValue,
		);
		expect(account.status).toBe(201);
		const token = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/accounts/discord-owner/tokens",
				authed({ method: "POST", body: JSON.stringify({ label: "Shell" }) }),
			),
			envValue,
		);
		const issued = (await token.json()) as { result: { token: string } };
		const links = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/links", {
				headers: { Authorization: `Bearer ${issued.result.token}` },
			}),
			envValue,
		);
		expect(
			(
				(await links.json()) as { result: { items: LinkRecord[] } }
			).result.items.map((link) => link.slug),
		).toEqual(["legacy-discord"]);
	});

	test("returns legacy timestamps as canonical UTC Z values without rewriting them on read", async () => {
		const envValue = env();
		const legacy: LinkRecord = {
			slug: "legacy-time",
			destinationUrl: "https://example.com/legacy-time",
			creator: "Legacy Cat",
			createdAt: "2026-08-26T20:10:00+02:00",
			expiresAt: "2027-01-31T12:00:00+01:00",
			metadataFetchedAt: "2026-08-26T20:15:00+02:00",
		};
		await envValue.LINKS.put("link:legacy-time", JSON.stringify(legacy));

		const read = await app.fetch(
			new Request("https://go.aitsys.dev/api/v1/admin/links", authed()),
			envValue,
		);
		const returned = (
			(await read.json()) as { result: { items: LinkRecord[] } }
		).result.items[0]!;
		expect(returned.createdAt).toBe("2026-08-26T18:10:00.000Z");
		expect(returned.expiresAt).toBe("2027-01-31T11:00:00.000Z");
		expect(returned.metadataFetchedAt).toBe("2026-08-26T18:15:00.000Z");
		expect(await envValue.LINKS.get("link:legacy-time")).toBe(
			JSON.stringify(legacy),
		);
		const patched = await app.fetch(
			new Request(
				"https://go.aitsys.dev/api/v1/links/legacy-time",
				authed({
					method: "PATCH",
					body: JSON.stringify({ expiresAt: "2027-02-01T12:00:00+01:00" }),
				}),
			),
			envValue,
		);
		expect(
			((await patched.json()) as { result: LinkRecord }).result.expiresAt,
		).toBe("2027-02-01T11:00:00.000Z");
		const afterUpdate = await envValue.LINKS.get<LinkRecord>(
			"link:legacy-time",
			"json",
		);
		expect(afterUpdate?.createdAt).toBe(legacy.createdAt);
		expect(afterUpdate?.expiresAt).toBe("2027-02-01T11:00:00.000Z");

		const created = await create(envValue, {
			destinationUrl: "https://example.com/new-time",
			creator: "New Cat",
			slug: "new-time",
			expiresAt: "2027-01-31T12:00:00+01:00",
		});
		expect(
			((await created.json()) as { result: LinkRecord }).result.expiresAt,
		).toBe("2027-01-31T11:00:00.000Z");
		const stored = await envValue.LINKS.get<LinkRecord>(
			"link:new-time",
			"json",
		);
		expect(stored?.expiresAt).toBe("2027-01-31T11:00:00.000Z");
	});
});
