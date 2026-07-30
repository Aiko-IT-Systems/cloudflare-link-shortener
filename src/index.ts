import { Hono } from "hono";
import { requireApiKey } from "./auth";
import { homepage, notFound, robots, splash, unavailable } from "./html";
import { jsonError, jsonSuccess } from "./responses";
import { createLink, disableLink, getLink } from "./store";
import { createLinkSchema, disableLinkSchema, isReservedSlug, normalizeSlug, SLUG_PATTERN } from "./validation";

const app = new Hono<{ Bindings: Env }>();

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

	const result = await createLink(c.env, parsed.data);
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

	return splash(record);
});

app.notFound(() => notFound());

export default app;
