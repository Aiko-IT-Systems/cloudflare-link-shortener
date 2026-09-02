import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "@hono/zod-openapi";
import { buildInfo } from "./build-info";

const error = z
	.object({
		success: z.literal(false),
		errors: z.array(z.object({ code: z.string(), message: z.string() })).min(1),
	})
	.openapi("ApiError");

const build = z
	.object({
		version: z.string(),
		sha: z.string(),
		repository: z.url(),
	})
	.openapi("BuildInfo");

const branding = z
	.object({
		siteName: z.string(),
		brandLogoUrl: z.url(),
		brandLogoAlt: z.string(),
		faviconUrl: z.url(),
		brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
		privacyEmail: z.email(),
	})
	.openapi("Branding");

const account = z
	.object({
		id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/),
		creatorName: z.string().min(1).max(80),
		discordUserId: z.string().regex(/^\d{17,20}$/).nullable(),
		createdAt: z.iso.datetime(),
	})
	.openapi("Account");

const accountCreate = z
	.object({
		id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/),
		creatorName: z.string().min(1).max(80),
		discordUserId: z.string().regex(/^\d{17,20}$/).optional(),
	})
	.strict()
	.openapi("AccountCreate");

const discordUserLink = z
	.object({ discordUserId: z.string().regex(/^\d{17,20}$/) })
	.strict()
	.openapi("DiscordUserLink");

const tokenRecord = z
	.object({
		id: z.string(),
		accountId: z.string(),
		label: z.string().max(80).optional(),
		createdAt: z.iso.datetime(),
		revokedAt: z.iso.datetime().optional(),
	})
	.openapi("TokenRecord");

const tokenIssue = z
	.object({ label: z.string().min(1).max(80).optional() })
	.strict()
	.openapi("TokenIssue");

const issuedToken = z
	.object({
		token: z.string().openapi({
			description: "Secret issued token, returned exactly once. Store it securely.",
		}),
		tokenId: z.string(),
		accountId: z.string(),
		label: z.string().optional(),
		createdAt: z.iso.datetime(),
	})
	.openapi("IssuedToken");

const linkOwner = z
	.object({ kind: z.enum(["account", "discord"]), id: z.string() })
	.openapi("LinkOwner");

const link = z
	.object({
		slug: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/),
		destinationUrl: z.url(),
		creator: z.string(),
		createdAt: z.iso.datetime(),
		owner: linkOwner.optional(),
		title: z.string().max(120).optional(),
		embedTitle: z.string().max(120).optional(),
		embedDescription: z.string().max(240).optional(),
		embedImageUrl: z.url().optional(),
		embedVideoUrl: z.url().optional(),
		embedVideoWidth: z.number().int().positive().optional(),
		embedVideoHeight: z.number().int().positive().optional(),
		embedSiteName: z.string().max(80).optional(),
		metadataFetchedAt: z.iso.datetime().optional(),
		expiresAt: z.iso.datetime().optional(),
		suppressSocialPreview: z.boolean().optional(),
		hasPassword: z.boolean(),
		disabledAt: z.iso.datetime().optional(),
		disabledReason: z.string().optional(),
	})
	.openapi("Link");

const publicHttpsUrl = z.url().refine((value) => new URL(value).protocol === "https:");

const linkCreate = z
	.object({
		destinationUrl: publicHttpsUrl,
		creator: z.string().min(1).max(80).optional().openapi({ description: "Master tokens only; ignored for issued tokens." }),
		slug: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/).optional(),
		title: z.string().min(1).max(120).optional(),
		embedTitle: z.string().min(1).max(120).optional(),
		embedDescription: z.string().min(1).max(240).optional(),
		embedImageUrl: publicHttpsUrl.optional(),
		embedSiteName: z.string().min(1).max(80).optional(),
		password: z.string().min(1).max(200).optional().openapi({ writeOnly: true }),
		expiresAt: z.iso.datetime().optional(),
		suppressSocialPreview: z.boolean().optional(),
	})
	.strict()
	.openapi("LinkCreate");

const nullableText = (max: number) => z.string().min(1).max(max).nullable().optional();
const linkUpdate = z
	.object({
		destinationUrl: publicHttpsUrl.optional(),
		title: nullableText(120),
		embedTitle: nullableText(120),
		embedDescription: nullableText(240),
		embedImageUrl: publicHttpsUrl.nullable().optional(),
		embedSiteName: nullableText(80),
		password: z.string().min(1).max(200).nullable().optional().openapi({ writeOnly: true }),
		expiresAt: z.iso.datetime().nullable().optional(),
		suppressSocialPreview: z.boolean().optional(),
	})
	.strict()
	.openapi("LinkUpdate");

const disableLink = z.object({ reason: z.string().min(1).max(200).optional() }).strict().openapi("DisableLink");
const slugParam = z.object({ slug: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/).openapi({ param: { name: "slug", in: "path" } }) });
const accountIdParam = z.object({ accountId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/).openapi({ param: { name: "accountId", in: "path" } }) });
const tokenIdParam = z.object({ tokenId: z.string().openapi({ param: { name: "tokenId", in: "path" } }) });
const pagination = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().optional() });

const success = <T extends z.ZodType>(result: T) =>
	z.object({ success: z.literal(true), result });

const errorResponses = {
	400: { description: "Invalid request data.", content: { "application/json": { schema: error } }, },
	401: { description: "Missing, invalid, revoked, disabled, or deleted credentials.", content: { "application/json": { schema: error } }, },
	403: { description: "Credentials do not own the requested resource.", content: { "application/json": { schema: error } }, },
	404: { description: "The resource was not found or is not accessible.", content: { "application/json": { schema: error } }, },
	409: { description: "The request conflicts with existing state.", content: { "application/json": { schema: error } }, },
	413: { description: "The request body exceeds the endpoint limit.", content: { "application/json": { schema: error } }, },
} as const;

const bearerSecurity = [{ bearerAuth: [] }];
const htmlResponse = { description: "HTML response.", content: { "text/html": { schema: z.string() } } };
const textResponse = { description: "Plain-text response.", content: { "text/plain": { schema: z.string() } } };

export function registerOpenApiDocumentation(registry: OpenAPIRegistry): void {
	registry.registerComponent("securitySchemes", "bearerAuth", {
		type: "http",
		scheme: "bearer",
		bearerFormat: "opaque token",
		description: "Master credential or issued `aig_…` account token. Never put credentials in URLs.",
	});

	registry.registerPath({ method: "get", path: "/openapi.json", tags: ["Public"], summary: "Get this generated OpenAPI 3.0 document", responses: { 200: { description: "OpenAPI JSON document.", content: { "application/json": { schema: z.object({ openapi: z.string(), info: z.object({ title: z.string(), version: z.string() }).passthrough(), paths: z.record(z.string(), z.unknown()) }).passthrough() } } } } });
	registry.registerPath({ method: "get", path: "/", tags: ["Browser"], summary: "Render the instance home page", responses: { 200: htmlResponse } });
	registry.registerPath({ method: "get", path: "/privacy", tags: ["Browser"], summary: "Render the privacy policy", responses: { 200: htmlResponse } });
	registry.registerPath({ method: "get", path: "/robots.txt", tags: ["Browser"], summary: "Get crawler policy", responses: { 200: textResponse } });
	registry.registerPath({ method: "get", path: "/api/v1/metadata", tags: ["Public"], summary: "Get branding and deployed build metadata", responses: { 200: { description: "Public metadata.", content: { "application/json": { schema: success(z.object({ apiVersion: z.literal(1), branding, build })) } } } } });
	registry.registerPath({ method: "get", path: "/api/v1/connection-test", tags: ["Public"], summary: "Check instance connectivity", description: "Unauthenticated; does not validate a bearer token.", responses: { 200: { description: "Connectivity and configuration health.", content: { "application/json": { schema: success(z.object({ status: z.enum(["ok", "degraded"]), apiVersion: z.literal(1), checks: z.record(z.string(), z.unknown()), cloudflare: z.record(z.string(), z.unknown()).nullable(), durationMs: z.number().nonnegative(), build })) } } } } });
	registry.registerPath({ method: "get", path: "/api/v1/me", tags: ["Identity"], summary: "Get the account associated with credentials", description: "The master credential resolves to the administrator profile. `discordUserId` is null when it is not linked.", security: bearerSecurity, responses: { 200: { description: "Authenticated account.", content: { "application/json": { schema: success(account) } } }, 401: errorResponses[401] } });

	registry.registerPath({ method: "get", path: "/api/v1/accounts", tags: ["Accounts"], summary: "List active accounts", description: "Master-only.", security: bearerSecurity, request: { query: pagination }, responses: { 200: { description: "Account page.", content: { "application/json": { schema: success(z.object({ items: z.array(account), cursor: z.string().optional() })) } } }, ...errorResponses } });
	registry.registerPath({ method: "post", path: "/api/v1/accounts", tags: ["Accounts"], summary: "Create an account", description: "Master-only.", security: bearerSecurity, request: { body: { required: true, content: { "application/json": { schema: accountCreate } } } }, responses: { 201: { description: "Account created.", content: { "application/json": { schema: success(account) } } }, ...errorResponses } });
	registry.registerPath({ method: "delete", path: "/api/v1/accounts/{accountId}", tags: ["Accounts"], summary: "Remove an account and revoke its active tokens", description: "Master-only. Public links are retained. The administrator profile cannot be removed.", security: bearerSecurity, request: { params: accountIdParam }, responses: { 200: { description: "Removal result.", content: { "application/json": { schema: success(z.object({ accountId: z.string(), deletedAt: z.iso.datetime(), revokedTokenCount: z.number().int().nonnegative() })) } } }, ...errorResponses } });
	registry.registerPath({ method: "put", path: "/api/v1/accounts/{accountId}/discord-user", tags: ["Accounts"], summary: "Link a Discord user to an account", description: "Master-only. Migrates legacy links owned by that Discord identity.", security: bearerSecurity, request: { params: accountIdParam, body: { required: true, content: { "application/json": { schema: discordUserLink } } } }, responses: { 200: { description: "Updated account.", content: { "application/json": { schema: success(account) } } }, ...errorResponses } });

	registry.registerPath({ method: "post", path: "/api/v1/accounts/{accountId}/tokens", tags: ["Tokens"], summary: "Issue a revocable account token", description: "Master-only. The secret value is returned only once.", security: bearerSecurity, request: { params: accountIdParam, body: { required: false, content: { "application/json": { schema: tokenIssue } } } }, responses: { 201: { description: "Token issued.", content: { "application/json": { schema: success(issuedToken) } } }, ...errorResponses } });
	registry.registerPath({ method: "get", path: "/api/v1/tokens", tags: ["Tokens"], summary: "List sanitized issued token records", description: "Master-only. Token values and digests are never returned.", security: bearerSecurity, request: { query: pagination }, responses: { 200: { description: "Token page.", content: { "application/json": { schema: success(z.object({ items: z.array(tokenRecord), cursor: z.string().optional() })) } } }, ...errorResponses } });
	registry.registerPath({ method: "post", path: "/api/v1/tokens/{tokenId}/revoke", tags: ["Tokens"], summary: "Revoke an issued token", description: "Master-only and idempotent for known token records.", security: bearerSecurity, request: { params: tokenIdParam }, responses: { 200: { description: "Revocation result.", content: { "application/json": { schema: success(z.object({ tokenId: z.string(), revokedAt: z.iso.datetime() })) } } }, ...errorResponses } });

	registry.registerPath({ method: "get", path: "/api/v1/admin/links", tags: ["Links"], summary: "List every link", description: "Master-only.", security: bearerSecurity, request: { query: pagination.extend({ limit: z.coerce.number().int().min(1).max(25).optional() }) }, responses: { 200: { description: "Link page.", content: { "application/json": { schema: success(z.object({ items: z.array(link), cursor: z.string().optional() })) } } }, ...errorResponses } });
	registry.registerPath({ method: "get", path: "/api/v1/links", tags: ["Links"], summary: "List accessible links", description: "Issued tokens list account-owned links. A master credential may select `ownerKind` and `ownerId`.", security: bearerSecurity, request: { query: pagination.extend({ limit: z.coerce.number().int().min(1).max(25).optional(), ownerKind: z.enum(["account", "discord"]).optional(), ownerId: z.string().optional() }) }, responses: { 200: { description: "Link page.", content: { "application/json": { schema: success(z.object({ items: z.array(link), cursor: z.string().optional() })) } } }, ...errorResponses } });
	registry.registerPath({ method: "post", path: "/api/v1/links", tags: ["Links"], summary: "Create a link", description: "Automatic destination metadata is fetched. Explicit embed fields override fetched values.", security: bearerSecurity, request: { body: { required: true, content: { "application/json": { schema: linkCreate } } } }, responses: { 201: { description: "Link created.", content: { "application/json": { schema: success(link) } } }, ...errorResponses } });
	registry.registerPath({ method: "get", path: "/api/v1/links/{slug}", tags: ["Links"], summary: "Get an accessible link", security: bearerSecurity, request: { params: slugParam }, responses: { 200: { description: "Link.", content: { "application/json": { schema: success(link) } } }, ...errorResponses } });
	registry.registerPath({ method: "patch", path: "/api/v1/links/{slug}", tags: ["Links"], summary: "Update an accessible link", description: "Use null to clear optional fields. Omit password to retain it; use a string to replace it or null to remove it.", security: bearerSecurity, request: { params: slugParam, body: { required: true, content: { "application/json": { schema: linkUpdate } } } }, responses: { 200: { description: "Updated link.", content: { "application/json": { schema: success(link) } } }, ...errorResponses } });
	registry.registerPath({ method: "post", path: "/api/v1/links/{slug}/refresh-metadata", tags: ["Links"], summary: "Refresh destination metadata", security: bearerSecurity, request: { params: slugParam }, responses: { 200: { description: "Updated link.", content: { "application/json": { schema: success(link) } } }, ...errorResponses } });
	registry.registerPath({ method: "post", path: "/api/v1/links/{slug}/disable", tags: ["Links"], summary: "Disable an accessible link", security: bearerSecurity, request: { params: slugParam, body: { required: false, content: { "application/json": { schema: disableLink } } } }, responses: { 200: { description: "Disabled link.", content: { "application/json": { schema: success(link) } } }, ...errorResponses } });

	registry.registerPath({ method: "get", path: "/{slug}", tags: ["Browser"], summary: "Open a public short link", description: "Returns an HTML splash, password prompt, expired/unavailable page, or not-found page.", request: { params: slugParam }, responses: { 200: htmlResponse, 404: htmlResponse } });
	registry.registerPath({ method: "post", path: "/{slug}", tags: ["Browser"], summary: "Submit a protected-link password", description: "Only URL-encoded forms are accepted. The entire form is limited to 8 KiB and failed attempts are throttled per client and slug.", request: { params: slugParam, body: { required: true, content: { "application/x-www-form-urlencoded": { schema: z.object({ password: z.string().min(1).max(200) }) } } } }, responses: { 200: htmlResponse, 404: htmlResponse, 413: textResponse } });
	registry.registerPath({ method: "post", path: "/api/v1/discord/interactions", tags: ["Discord"], summary: "Handle a Discord interaction", description: "Discord-only webhook. Raw requests require current Ed25519 signature headers. Supports Pings, application and message commands, component interactions, and modal submissions.", request: { headers: z.object({ "x-signature-ed25519": z.string().regex(/^[a-f\d]{128}$/i), "x-signature-timestamp": z.string().regex(/^\d+$/) }), body: { required: true, content: { "application/json": { schema: z.object({ type: z.number().int(), application_id: z.string().optional(), data: z.record(z.string(), z.unknown()).optional() }).passthrough() } } } }, responses: { 200: { description: "Discord interaction callback.", content: { "application/json": { schema: z.object({ type: z.number().int(), data: z.record(z.string(), z.unknown()).optional() }).passthrough() } } }, 400: textResponse, 401: textResponse, 405: textResponse, 413: textResponse } });
}

export function openApiDocument(origin: string) {
	return {
		// API Shield's uploaded schemas support OAS 3.0.x, not OAS 3.1.
		// In particular, this emits `nullable: true` rather than JSON Schema's
		// 3.1-only `type: ["string", "null"]` representation.
		openapi: "3.0.3" as const,
		info: {
			title: "AITSYS Go API",
			version: buildInfo.version,
			description: "Generated from the Worker route annotations. JSON success responses use `{ success: true, result }`; errors use `{ success: false, errors }`. Returned timestamps use canonical UTC ISO-8601 with milliseconds and a trailing Z.",
			license: { name: "Apache-2.0" },
		},
		servers: [{ url: origin, description: "This deployed AITSYS Go instance" }],
		tags: [
			{ name: "Public" }, { name: "Identity" }, { name: "Accounts" }, { name: "Tokens" }, { name: "Links" }, { name: "Discord" }, { name: "Browser" },
		],
	};
}
