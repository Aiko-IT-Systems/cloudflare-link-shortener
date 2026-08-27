import { Hono } from "hono";
import { requireAdmin, requireApiKey } from "./auth";
import { buildInfo } from "./build-info";
import { getPublicSiteMetadata, getSiteConfig } from "./config";
import { handleDiscordInteraction } from "./discord";
import { expired, homepage, notFound, passwordPrompt, privacyPolicy, robots, splash, unavailable } from "./html";
import { fetchTargetMetadata } from "./metadata";
import { jsonError, jsonSuccess } from "./responses";
import { createAccount, createLink, disableLink, getAccount, getAdminAccount, getLink, issueToken, linkDiscordUser, listAccounts, listLinks, listOwnedLinks, listTokens, ownsLink, refreshLinkMetadata, removeAccount, revokeToken, updateLink } from "./store";
import { AccountRecord, AuthPrincipal, LinkOwner, LinkRecord } from "./types";
import { createAccountSchema, createLinkSchema, disableLinkSchema, isReservedSlug, issueTokenSchema, linkDiscordUserSchema, normalizeSlug, SLUG_PATTERN, updateLinkSchema } from "./validation";

type AppEnv = { Bindings: Env; Variables: { principal: AuthPrincipal } };
const app = new Hono<AppEnv>();

function isExpired(record: { expiresAt?: string }): boolean {
	return record.expiresAt ? Date.parse(record.expiresAt) <= Date.now() : false;
}

function linkOwner(principal: AuthPrincipal): LinkOwner | undefined {
	return principal.kind === "account" ? { kind: "account", id: principal.account.id } : undefined;
}

function canManageLink(principal: AuthPrincipal, record: LinkRecord): boolean {
	return principal.kind === "admin" || (record.owner !== undefined && ownsLink(record.owner, linkOwner(principal)!));
}

function managedLink(principal: AuthPrincipal, record: LinkRecord | null): LinkRecord | undefined {
	return record && canManageLink(principal, record) ? record : undefined;
}

function cleanUpdates(updates: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(updates).map(([key, value]) => [key, value === null ? undefined : value]));
}

function publicAccount(account: { id: string; creatorName: string; createdAt: string; discordUserId?: string }): Omit<AccountRecord, "disabledAt" | "deletedAt" | "discordUserId"> & { discordUserId: string | null } {
	return {
		id: account.id,
		creatorName: account.creatorName,
		createdAt: account.createdAt,
		discordUserId: account.discordUserId ?? null
	};
}

app.get("/", (c) => homepage(getSiteConfig(c.env), c.req.url));
app.get("/privacy", (c) => privacyPolicy(getSiteConfig(c.env)));
app.get("/robots.txt", () => robots());
app.post("/discord/interactions", (c) => handleDiscordInteraction(c.req.raw, c.env, new URL(c.req.url).origin));
app.get("/api/v1/metadata", (c) => jsonSuccess({ apiVersion: 1, branding: getPublicSiteMetadata(c.env, c.req.url), build: buildInfo }));
app.get("/api/v1/connection-test", (c) => jsonSuccess({
		status: "ok",
		apiVersion: 1
	}));

app.use("/api/v1/*", requireApiKey);

app.get("/api/v1/me", async (c) => {
	const principal = c.get("principal");
	const account = principal.kind === "account" ? principal.account : await getAdminAccount(c.env);
	return account ? jsonSuccess(publicAccount(account)) : jsonError("No active account is linked to these credentials.", "invalid_auth", 401);
});

app.post("/api/v1/accounts", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const parsed = createAccountSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return jsonError("Invalid account payload.", "invalid_payload", 400);
	const result = await createAccount(c.env, parsed.data.id, parsed.data.creatorName, parsed.data.discordUserId);
	if (result === "duplicate") return jsonError("That account already exists.", "duplicate_account", 409);
	if (result === "discord_in_use") return jsonError("That Discord user is already linked to another account.", "discord_user_in_use", 409);
	return jsonSuccess(result, 201);
});

app.get("/api/v1/accounts", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const limit = Number.parseInt(c.req.query("limit") ?? "25", 10);
	return jsonSuccess(await listAccounts(c.env, c.req.query("cursor"), Number.isFinite(limit) ? limit : 25));
});

app.delete("/api/v1/accounts/:accountId", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const adminAccount = await getAdminAccount(c.env);
	if (adminAccount?.id === c.req.param("accountId")) return jsonError("The administrator profile cannot be removed.", "administrator_account", 409);
	const removed = await removeAccount(c.env, c.req.param("accountId"));
	return removed
		? jsonSuccess({ accountId: removed.account.id, deletedAt: removed.account.deletedAt, revokedTokenCount: removed.revokedTokenCount })
		: jsonError("Account not found.", "account_not_found", 404);
});

app.put("/api/v1/accounts/:accountId/discord-user", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const parsed = linkDiscordUserSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return jsonError("Invalid Discord user payload.", "invalid_payload", 400);
	const result = await linkDiscordUser(c.env, c.req.param("accountId"), parsed.data.discordUserId);
	if (result === "not_found") return jsonError("Account not found.", "account_not_found", 404);
	if (result === "discord_in_use") return jsonError("That Discord user is already linked to another account.", "discord_user_in_use", 409);
	return jsonSuccess(result);
});

app.post("/api/v1/accounts/:accountId/tokens", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const account = await getAccount(c.env, c.req.param("accountId"));
	if (!account || account.disabledAt || account.deletedAt) return jsonError("Account not found.", "account_not_found", 404);
	const parsed = issueTokenSchema.safeParse(await c.req.json().catch(() => ({})));
	if (!parsed.success) return jsonError("Invalid token payload.", "invalid_payload", 400);
	const issued = await issueToken(c.env, account.id, parsed.data.label);
	return jsonSuccess({ token: issued.token, tokenId: issued.record.id, accountId: account.id, label: issued.record.label, createdAt: issued.record.createdAt }, 201);
});

app.post("/api/v1/tokens/:tokenId/revoke", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const record = await revokeToken(c.env, c.req.param("tokenId"));
	return record ? jsonSuccess({ tokenId: record.id, revokedAt: record.revokedAt }) : jsonError("Token not found.", "token_not_found", 404);
});

app.get("/api/v1/tokens", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const limit = Number.parseInt(c.req.query("limit") ?? "25", 10);
	return jsonSuccess(await listTokens(c.env, c.req.query("cursor"), Number.isFinite(limit) ? limit : 25));
});

app.get("/api/v1/admin/links", async (c) => {
	const denied = requireAdmin(c.get("principal"));
	if (denied) return denied;
	const limit = Number.parseInt(c.req.query("limit") ?? "25", 10);
	return jsonSuccess(await listLinks(c.env, c.req.query("cursor"), Number.isFinite(limit) ? limit : 25));
});

app.get("/api/v1/links", async (c) => {
	const principal = c.get("principal");
	let owner: LinkOwner | undefined = linkOwner(principal);
	if (principal.kind === "admin") {
		const kind = c.req.query("ownerKind");
		const id = c.req.query("ownerId");
		if ((kind === "account" || kind === "discord") && id) owner = { kind, id };
		else {
			const account = await getAdminAccount(c.env);
			if (!account) return jsonError("Set up the administrator profile in Discord or provide ownerKind and ownerId.", "owner_required", 400);
			owner = { kind: "account", id: account.id };
		}
	}
	const limit = Number.parseInt(c.req.query("limit") ?? "10", 10);
	return jsonSuccess(await listOwnedLinks(c.env, owner!, c.req.query("cursor"), Number.isFinite(limit) ? limit : 10));
});

app.post("/api/v1/links", async (c) => {
	const principal = c.get("principal");
	const parsed = createLinkSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return jsonError("Invalid link payload.", "invalid_payload", 400);
	const adminAccount = principal.kind === "admin" ? await getAdminAccount(c.env) : undefined;
	if (principal.kind === "admin" && !parsed.data.creator && !adminAccount) return jsonError("Admins must provide creator until an administrator profile has been set up.", "creator_required", 400);
	if (parsed.data.slug && isReservedSlug(parsed.data.slug)) return jsonError("That slug is reserved.", "reserved_slug", 400);

	const fetchedMetadata = await fetchTargetMetadata(parsed.data.destinationUrl);
	const result = await createLink(c.env, {
		...parsed.data,
		creator: principal.kind === "account" ? principal.account.creatorName : parsed.data.creator ?? adminAccount!.creatorName,
		...(principal.kind === "account" ? { owner: linkOwner(principal)! } : adminAccount ? { owner: { kind: "account" as const, id: adminAccount.id } } : {}),
		embedTitle: parsed.data.embedTitle ?? fetchedMetadata.embedTitle,
		embedDescription: parsed.data.embedDescription ?? fetchedMetadata.embedDescription,
		embedImageUrl: parsed.data.embedImageUrl ?? fetchedMetadata.embedImageUrl,
		embedSiteName: parsed.data.embedSiteName ?? fetchedMetadata.embedSiteName,
		metadataFetchedAt: fetchedMetadata.metadataFetchedAt
	});
	if (result === "duplicate") return jsonError("That slug already exists.", "duplicate_slug", 409);
	if (result === "reserved") return jsonError("That slug is reserved.", "reserved_slug", 400);
	return jsonSuccess(result, 201);
});

app.get("/api/v1/links/:slug", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));
	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) return jsonError("Invalid slug.", "invalid_slug", 400);
	const record = managedLink(c.get("principal"), await getLink(c.env, slug));
	return record ? jsonSuccess(record) : jsonError("Link not found.", "not_found", 404);
});

app.patch("/api/v1/links/:slug", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));
	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) return jsonError("Invalid slug.", "invalid_slug", 400);
	const existing = managedLink(c.get("principal"), await getLink(c.env, slug));
	if (!existing) return jsonError("Link not found.", "not_found", 404);
	const parsed = updateLinkSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return jsonError("Invalid update payload.", "invalid_payload", 400);
	const updates = cleanUpdates(parsed.data as Record<string, unknown>);
	if (typeof updates.destinationUrl === "string" && updates.destinationUrl !== existing.destinationUrl) {
		const metadata = await fetchTargetMetadata(updates.destinationUrl);
		for (const [key, value] of Object.entries(metadata)) if (!(key in updates)) updates[key] = value;
	}
	return jsonSuccess((await updateLink(c.env, slug, updates))!);
});

app.post("/api/v1/links/:slug/disable", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));
	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) return jsonError("Invalid slug.", "invalid_slug", 400);
	if (!managedLink(c.get("principal"), await getLink(c.env, slug))) return jsonError("Link not found.", "not_found", 404);
	const parsed = disableLinkSchema.safeParse(await c.req.json().catch(() => ({})));
	if (!parsed.success) return jsonError("Invalid disable payload.", "invalid_payload", 400);
	return jsonSuccess((await disableLink(c.env, slug, parsed.data.reason))!);
});

app.post("/api/v1/links/:slug/refresh-metadata", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));
	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) return jsonError("Invalid slug.", "invalid_slug", 400);
	const record = managedLink(c.get("principal"), await getLink(c.env, slug));
	if (!record) return jsonError("Link not found.", "not_found", 404);
	return jsonSuccess((await refreshLinkMetadata(c.env, slug, await fetchTargetMetadata(record.destinationUrl)))!);
});

app.get("/:slug", async (c) => {
	const siteConfig = getSiteConfig(c.env);
	const slug = normalizeSlug(c.req.param("slug"));
	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) return notFound(siteConfig);
	const record = await getLink(c.env, slug);
	if (!record) return notFound(siteConfig);
	if (record.disabledAt) return unavailable(siteConfig, record);
	if (isExpired(record)) return expired(siteConfig, record);
	if (record.password) return passwordPrompt(siteConfig, record);
	return splash(siteConfig, record, c.req.url);
});

app.post("/:slug", async (c) => {
	const siteConfig = getSiteConfig(c.env);
	const slug = normalizeSlug(c.req.param("slug"));
	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) return notFound(siteConfig);
	const record = await getLink(c.env, slug);
	if (!record) return notFound(siteConfig);
	if (record.disabledAt) return unavailable(siteConfig, record);
	if (isExpired(record)) return expired(siteConfig, record);
	if (!record.password) return splash(siteConfig, record, c.req.url);
	const body = await c.req.parseBody().catch(() => ({})) as Record<string, string | File>;
	const password = typeof body.password === "string" ? body.password : "";
	return password === record.password ? splash(siteConfig, record, c.req.url) : passwordPrompt(siteConfig, record, true);
});

app.notFound((c) => notFound(getSiteConfig(c.env)));

export default app;
