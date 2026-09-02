import { z } from "@hono/zod-openapi";

export const RESERVED_SLUGS = new Set([
	"api",
	"favicon.ico",
	"robots.txt",
	"privacy",
]);

export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

export function isPublicHttpsUrl(value: string): boolean {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || url.username || url.password) return false;
		const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
		if (host === "localhost" || host.endsWith(".localhost")) return false;
		const parts = host.split(".");
		if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
			const octets = parts.map(Number);
			if (octets.some((octet) => octet > 255)) return false;
			const [first, second] = octets;
			return !(
				first === 0 ||
				first === 10 ||
				first === 127 ||
				first >= 224 ||
				(first === 100 && second >= 64 && second <= 127) ||
				(first === 169 && second === 254) ||
				(first === 172 && second >= 16 && second <= 31) ||
				(first === 192 && second === 168)
			);
		}
		if (host.includes(":"))
			return !(
				host === "::" ||
				host === "::1" ||
				/^f[cd][0-9a-f:]*$/i.test(host) ||
				/^fe[89ab][0-9a-f:]*$/i.test(host) ||
				/^::ffff:(?:127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2})$/i.test(host)
			);
		return true;
	} catch {
		return false;
	}
}

const httpsUrlSchema = z
	.string()
	.url()
	.refine(
		isPublicHttpsUrl,
		"destinationUrl must use a public https:// URL without credentials",
	);

export const createLinkSchema = z.object({
	destinationUrl: httpsUrlSchema,
	creator: z.string().trim().min(1).max(80).optional(),
	slug: z.string().trim().regex(SLUG_PATTERN).optional(),
	title: z.string().trim().min(1).max(120).optional(),
	embedTitle: z.string().trim().min(1).max(120).optional(),
	embedDescription: z.string().trim().min(1).max(240).optional(),
	embedImageUrl: httpsUrlSchema.optional(),
	embedSiteName: z.string().trim().min(1).max(80).optional(),
	password: z.string().trim().min(1).max(200).optional(),
	expiresAt: z.string().datetime({ offset: true }).optional(),
	suppressSocialPreview: z.boolean().optional(),
});

export const createAccountSchema = z.object({
	id: z
		.string()
		.trim()
		.regex(/^[a-z0-9][a-z0-9_-]{1,63}$/i),
	creatorName: z.string().trim().min(1).max(80),
	discordUserId: z
		.string()
		.trim()
		.regex(/^\d{17,20}$/)
		.optional(),
});

export const linkDiscordUserSchema = z.object({
	discordUserId: z
		.string()
		.trim()
		.regex(/^\d{17,20}$/),
});

export const issueTokenSchema = z.object({
	label: z.string().trim().min(1).max(80).optional(),
});

export const updateLinkSchema = z
	.object({
		destinationUrl: httpsUrlSchema.optional(),
		title: z.string().trim().min(1).max(120).nullable().optional(),
		embedTitle: z.string().trim().min(1).max(120).nullable().optional(),
		embedDescription: z.string().trim().min(1).max(240).nullable().optional(),
		embedImageUrl: httpsUrlSchema.nullable().optional(),
		embedSiteName: z.string().trim().min(1).max(80).nullable().optional(),
		password: z.string().trim().min(1).max(200).nullable().optional(),
		expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
		suppressSocialPreview: z.boolean().optional(),
	})
	.refine(
		(value) => Object.keys(value).length > 0,
		"At least one update is required.",
	);

export const disableLinkSchema = z.object({
	reason: z.string().trim().min(1).max(200).optional(),
});

export function normalizeSlug(slug: string): string {
	return slug.trim();
}

export function isReservedSlug(slug: string): boolean {
	return RESERVED_SLUGS.has(slug.toLowerCase());
}
