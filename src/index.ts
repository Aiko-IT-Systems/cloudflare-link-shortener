import { Hono } from "hono";
import { requireApiKey } from "./auth";
import { expired, homepage, notFound, passwordPrompt, robots, splash, unavailable } from "./html";
import { fetchTargetMetadata } from "./metadata";
import { jsonError, jsonSuccess } from "./responses";
import { createLink, disableLink, getLink, refreshLinkMetadata } from "./store";
import { createLinkSchema, disableLinkSchema, isReservedSlug, normalizeSlug, SLUG_PATTERN } from "./validation";

const app = new Hono<{ Bindings: Env }>();

function isExpired(record: { expiresAt?: string }): boolean {
	return record.expiresAt ? Date.parse(record.expiresAt) <= Date.now() : false;
}

app.get("/", () => homepage());
app.get("/robots.txt", () => robots());

app.use("/api/v1/*", requireApiKey);

app.post("/api/v1/links", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = createLinkSchema.safeParse(body);

	if (!parsed.success) {
		return jsonError("Invalid link payload.", "invalid_payload", 400);
	}

	if (parsed.data.slug && isReservedSlug(parsed.data.slug)) {
		return jsonError("That slug is reserved.", "reserved_slug", 400);
	}

	const fetchedMetadata = await fetchTargetMetadata(parsed.data.destinationUrl);
	const result = await createLink(c.env, {
		...parsed.data,
		embedTitle: parsed.data.embedTitle ?? fetchedMetadata.embedTitle,
		embedDescription: parsed.data.embedDescription ?? fetchedMetadata.embedDescription,
		embedImageUrl: parsed.data.embedImageUrl ?? fetchedMetadata.embedImageUrl,
		embedSiteName: parsed.data.embedSiteName ?? fetchedMetadata.embedSiteName,
		metadataFetchedAt: fetchedMetadata.metadataFetchedAt,
		password: parsed.data.password,
		expiresAt: parsed.data.expiresAt,
		suppressSocialPreview: parsed.data.suppressSocialPreview
	});
	if (result === "duplicate") {
		return jsonError("That slug already exists.", "duplicate_slug", 409);
	}

	if (result === "reserved") {
		return jsonError("That slug is reserved.", "reserved_slug", 400);
	}

	return jsonSuccess(result, 201);
});

app.get("/api/v1/links/:slug", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));

	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) {
		return jsonError("Invalid slug.", "invalid_slug", 400);
	}

	const record = await getLink(c.env, slug);
	if (!record) {
		return jsonError("Link not found.", "not_found", 404);
	}

	return jsonSuccess(record);
});

app.post("/api/v1/links/:slug/disable", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));

	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) {
		return jsonError("Invalid slug.", "invalid_slug", 400);
	}

	const body = await c.req.json().catch(() => ({}));
	const parsed = disableLinkSchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Invalid disable payload.", "invalid_payload", 400);
	}

	const record = await disableLink(c.env, slug, parsed.data.reason);
	if (!record) {
		return jsonError("Link not found.", "not_found", 404);
	}

	return jsonSuccess(record);
});

app.post("/api/v1/links/:slug/refresh-metadata", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));

	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) {
		return jsonError("Invalid slug.", "invalid_slug", 400);
	}

	const record = await getLink(c.env, slug);
	if (!record) {
		return jsonError("Link not found.", "not_found", 404);
	}

	const metadata = await fetchTargetMetadata(record.destinationUrl);
	const refreshedRecord = await refreshLinkMetadata(c.env, slug, metadata);
	if (!refreshedRecord) {
		return jsonError("Link not found.", "not_found", 404);
	}

	return jsonSuccess(refreshedRecord);
});

app.get("/:slug", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));

	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) {
		return notFound();
	}

	const record = await getLink(c.env, slug);
	if (!record) {
		return notFound();
	}

	if (record.disabledAt) {
		return unavailable(record);
	}

	if (isExpired(record)) {
		return expired(record);
	}

	if (record.password) {
		return passwordPrompt(record);
	}

	return splash(record, c.req.url);
});

app.post("/:slug", async (c) => {
	const slug = normalizeSlug(c.req.param("slug"));

	if (!SLUG_PATTERN.test(slug) || isReservedSlug(slug)) {
		return notFound();
	}

	const record = await getLink(c.env, slug);
	if (!record) {
		return notFound();
	}

	if (record.disabledAt) {
		return unavailable(record);
	}

	if (isExpired(record)) {
		return expired(record);
	}

	if (!record.password) {
		return splash(record, c.req.url);
	}

	const body = await c.req.parseBody().catch(() => ({})) as Record<string, string | File>;
	const password = typeof body.password === "string" ? body.password : "";
	if (password !== record.password) {
		return passwordPrompt(record, true);
	}

	return splash(record, c.req.url);
});

app.notFound(() => notFound());

export default app;
