import { z } from "zod";

export const RESERVED_SLUGS = new Set([
	"api",
	"favicon.ico",
	"robots.txt",
	"privacy"
]);

export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

const httpsUrlSchema = z.string().url().refine((value) => {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}, "destinationUrl must use https://");

export const createLinkSchema = z.object({
	destinationUrl: httpsUrlSchema,
	creator: z.string().trim().min(1).max(80),
	slug: z.string().trim().regex(SLUG_PATTERN).optional(),
	title: z.string().trim().min(1).max(120).optional(),
	embedTitle: z.string().trim().min(1).max(120).optional(),
	embedDescription: z.string().trim().min(1).max(240).optional(),
	embedImageUrl: httpsUrlSchema.optional(),
	embedSiteName: z.string().trim().min(1).max(80).optional()
});

export const disableLinkSchema = z.object({
	reason: z.string().trim().min(1).max(200).optional()
});

export function normalizeSlug(slug: string): string {
	return slug.trim();
}

export function isReservedSlug(slug: string): boolean {
	return RESERVED_SLUGS.has(slug.toLowerCase());
}
