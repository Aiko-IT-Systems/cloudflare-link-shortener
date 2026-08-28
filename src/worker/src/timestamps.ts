import { LinkRecord } from "./types";

const linkTimestampFields = [
	"createdAt",
	"metadataFetchedAt",
	"expiresAt",
	"disabledAt",
] as const;
const writableLinkTimestampFields = [
	"metadataFetchedAt",
	"expiresAt",
	"disabledAt",
] as const;
const apiTimestampFields = new Set([
	"createdAt",
	"metadataFetchedAt",
	"expiresAt",
	"disabledAt",
	"deletedAt",
	"revokedAt",
]);

/**
 * Presents a valid ISO timestamp in the API's canonical UTC form. Invalid
 * legacy values are deliberately preserved so a read never silently changes
 * their meaning.
 */
export function canonicalTimestamp(value: string): string {
	const milliseconds = Date.parse(value);
	return Number.isNaN(milliseconds)
		? value
		: new Date(milliseconds).toISOString();
}

export function canonicalizeLinkTimestamps<T extends LinkRecord>(record: T): T {
	return canonicalizeTimestampFields(record, linkTimestampFields);
}

/** Preserves legacy `createdAt` values because KV ownership indexes use them. */
export function canonicalizeWritableLinkTimestamps<T extends LinkRecord>(
	record: T,
): T {
	return canonicalizeTimestampFields(record, writableLinkTimestampFields);
}

function canonicalizeTimestampFields<T extends LinkRecord>(
	record: T,
	fields: readonly (keyof LinkRecord)[],
): T {
	const result = { ...record };
	for (const field of fields) {
		const value = result[field];
		if (typeof value === "string") {
			Object.assign(result, { [field]: canonicalTimestamp(value) });
		}
	}
	return result;
}

/**
 * API-only compatibility patcher for nested timestamp-bearing records
 * (including paginated lists). KV is intentionally never rewritten while a
 * client reads.
 */
export function patchApiTimestamps<T>(value: T): T {
	if (Array.isArray(value)) return value.map(patchApiTimestamps) as T;
	if (!value || typeof value !== "object") return value;

	const record = Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, child]) => [
			key,
			apiTimestampFields.has(key) && typeof child === "string"
				? canonicalTimestamp(child)
				: patchApiTimestamps(child),
		]),
	);
	return record as T;
}
