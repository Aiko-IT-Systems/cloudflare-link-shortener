import { customAlphabet } from "nanoid";
import { LinkRecord } from "./types";
import { isReservedSlug, normalizeSlug, SLUG_PATTERN } from "./validation";

const randomSlug = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 8);
const MAX_SLUG_ATTEMPTS = 8;

function keyFor(slug: string): string {
	return `link:${slug}`;
}

export async function getLink(env: Env, slug: string): Promise<LinkRecord | null> {
	return env.LINKS.get<LinkRecord>(keyFor(normalizeSlug(slug)), "json");
}

export async function putLink(env: Env, record: LinkRecord): Promise<void> {
	await env.LINKS.put(keyFor(record.slug), JSON.stringify(record));
}

export async function createLink(env: Env, input: {
	destinationUrl: string;
	creator: string;
	title?: string;
	embedTitle?: string;
	embedDescription?: string;
	embedImageUrl?: string;
	embedSiteName?: string;
	metadataFetchedAt?: string;
	password?: string;
	expiresAt?: string;
	suppressSocialPreview?: boolean;
	slug?: string;
}): Promise<LinkRecord | "duplicate" | "reserved"> {
	const requestedSlug = input.slug ? normalizeSlug(input.slug) : undefined;

	if (requestedSlug) {
		if (!SLUG_PATTERN.test(requestedSlug) || isReservedSlug(requestedSlug)) {
			return "reserved";
		}

		const existing = await getLink(env, requestedSlug);
		if (existing) {
			return "duplicate";
		}

		const record = toRecord({ ...input, slug: requestedSlug });
		await putLink(env, record);
		return record;
	}

	for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
		const slug = randomSlug();
		if (isReservedSlug(slug)) {
			continue;
		}

		const existing = await getLink(env, slug);
		if (!existing) {
			const record = toRecord({ ...input, slug });
			await putLink(env, record);
			return record;
		}
	}

	throw new Error("Could not generate a unique slug.");
}

export async function disableLink(env: Env, slug: string, reason?: string): Promise<LinkRecord | null> {
	const record = await getLink(env, slug);
	if (!record) {
		return null;
	}

	const disabledRecord: LinkRecord = {
		...record,
		disabledAt: record.disabledAt ?? new Date().toISOString(),
		disabledReason: reason ?? record.disabledReason
	};

	await putLink(env, disabledRecord);
	return disabledRecord;
}

export async function refreshLinkMetadata(env: Env, slug: string, metadata: Partial<Pick<LinkRecord, "embedTitle" | "embedDescription" | "embedImageUrl" | "embedSiteName" | "metadataFetchedAt">>): Promise<LinkRecord | null> {
	const record = await getLink(env, slug);
	if (!record) {
		return null;
	}

	const refreshedRecord: LinkRecord = {
		...record,
		embedTitle: metadata.embedTitle,
		embedDescription: metadata.embedDescription,
		embedImageUrl: metadata.embedImageUrl,
		embedSiteName: metadata.embedSiteName,
		metadataFetchedAt: metadata.metadataFetchedAt ?? new Date().toISOString()
	};

	await putLink(env, refreshedRecord);
	return refreshedRecord;
}

function toRecord(input: {
	slug: string;
	destinationUrl: string;
	creator: string;
	title?: string;
	embedTitle?: string;
	embedDescription?: string;
	embedImageUrl?: string;
	embedSiteName?: string;
	metadataFetchedAt?: string;
	password?: string;
	expiresAt?: string;
	suppressSocialPreview?: boolean;
}): LinkRecord {
	return {
		slug: input.slug,
		destinationUrl: input.destinationUrl,
		creator: input.creator,
		title: input.title,
		embedTitle: input.embedTitle,
		embedDescription: input.embedDescription,
		embedImageUrl: input.embedImageUrl,
		embedSiteName: input.embedSiteName,
		metadataFetchedAt: input.metadataFetchedAt,
		password: input.password,
		expiresAt: input.expiresAt,
		suppressSocialPreview: input.suppressSocialPreview,
		createdAt: new Date().toISOString()
	};
}
