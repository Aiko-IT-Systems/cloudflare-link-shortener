import { customAlphabet } from "nanoid";
import { sha256 } from "./auth";
import {
	AccountRecord,
	LinkOwner,
	LinkPage,
	LinkRecord,
	TokenRecord,
} from "./types";
import {
	canonicalizeLinkTimestamps,
	canonicalizeWritableLinkTimestamps,
} from "./timestamps";
import { isReservedSlug, normalizeSlug, SLUG_PATTERN } from "./validation";

const randomSlug = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	8,
);
const randomId = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-",
	32,
);
const MAX_SLUG_ATTEMPTS = 8;

function keyFor(slug: string): string {
	return `link:${slug}`;
}
function accountKey(accountId: string): string {
	return `account:${accountId}`;
}
function discordAccountKey(discordUserId: string): string {
	return `discord-account:${discordUserId}`;
}
function adminAccountKey(): string {
	return "admin-account";
}
function tokenKey(tokenId: string): string {
	return `token:${tokenId}`;
}
function ownerPrefix(owner: LinkOwner): string {
	return `owner:${owner.kind}:${encodeURIComponent(owner.id)}:`;
}
function ownerKey(owner: LinkOwner, record: LinkRecord): string {
	return `${ownerPrefix(owner)}${record.createdAt}:${record.slug}`;
}
function discordIndexKey(record: LinkRecord): string {
	return `discord-link:${record.createdAt}:${record.slug}`;
}

export function ownsLink(
	owner: LinkOwner | undefined,
	expected: LinkOwner,
): boolean {
	return owner?.kind === expected.kind && owner.id === expected.id;
}

export async function getLink(
	env: Env,
	slug: string,
): Promise<LinkRecord | null> {
	return env.LINKS.get<LinkRecord>(keyFor(normalizeSlug(slug)), "json");
}

export async function putLink(env: Env, record: LinkRecord): Promise<void> {
	const writes: Promise<void>[] = [
		env.LINKS.put(keyFor(record.slug), JSON.stringify(record)),
	];
	if (record.owner)
		writes.push(env.LINKS.put(ownerKey(record.owner, record), record.slug));
	if (record.owner?.kind === "discord")
		writes.push(env.LINKS.put(discordIndexKey(record), record.slug));
	await Promise.all(writes);
}

type LinkInput = Omit<LinkRecord, "slug" | "createdAt" | "owner"> & {
	slug?: string;
	owner?: LinkOwner;
};

export async function createLink(
	env: Env,
	input: LinkInput,
): Promise<LinkRecord | "duplicate" | "reserved"> {
	const requestedSlug = input.slug ? normalizeSlug(input.slug) : undefined;
	if (requestedSlug) {
		if (!SLUG_PATTERN.test(requestedSlug) || isReservedSlug(requestedSlug))
			return "reserved";
		if (await getLink(env, requestedSlug)) return "duplicate";
		const record = toRecord({ ...input, slug: requestedSlug });
		await putLink(env, record);
		return record;
	}

	for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
		const slug = randomSlug();
		if (isReservedSlug(slug) || (await getLink(env, slug))) continue;
		const record = toRecord({ ...input, slug });
		await putLink(env, record);
		return record;
	}
	throw new Error("Could not generate a unique slug.");
}

export async function updateLink(
	env: Env,
	slug: string,
	updates: Partial<
		Omit<LinkRecord, "slug" | "creator" | "createdAt" | "owner">
	>,
): Promise<LinkRecord | null> {
	const record = await getLink(env, slug);
	if (!record) return null;
	const updated = canonicalizeWritableLinkTimestamps({ ...record, ...updates });
	await putLink(env, updated);
	return updated;
}

export async function disableLink(
	env: Env,
	slug: string,
	reason?: string,
): Promise<LinkRecord | null> {
	return updateLink(env, slug, {
		disabledAt: new Date().toISOString(),
		disabledReason: reason,
	});
}

export async function refreshLinkMetadata(
	env: Env,
	slug: string,
	metadata: Partial<
		Pick<
			LinkRecord,
			| "embedTitle"
			| "embedDescription"
			| "embedImageUrl"
			| "embedSiteName"
			| "metadataFetchedAt"
		>
	>,
): Promise<LinkRecord | null> {
	return updateLink(env, slug, {
		embedTitle: metadata.embedTitle,
		embedDescription: metadata.embedDescription,
		embedImageUrl: metadata.embedImageUrl,
		embedSiteName: metadata.embedSiteName,
		metadataFetchedAt: metadata.metadataFetchedAt ?? new Date().toISOString(),
	});
}

export async function listOwnedLinks(
	env: Env,
	owner: LinkOwner,
	cursor?: string,
	limit = 10,
): Promise<LinkPage> {
	const page = await env.LINKS.list({
		prefix: ownerPrefix(owner),
		cursor,
		limit: Math.min(Math.max(limit, 1), 25),
	});
	const values = await Promise.all(
		page.keys.map(async (key) => {
			const slug = await env.LINKS.get(key.name);
			return slug ? getLink(env, slug) : null;
		}),
	);
	const items = values.filter(
		(record): record is LinkRecord =>
			record !== null && ownsLink(record.owner, owner),
	);
	return "cursor" in page ? { items, cursor: page.cursor } : { items };
}

export async function listDiscordLinks(
	env: Env,
	cursor?: string,
	limit = 10,
): Promise<LinkPage> {
	const page = await env.LINKS.list({
		prefix: "discord-link:",
		cursor,
		limit: Math.min(Math.max(limit, 1), 25),
	});
	const values = await Promise.all(
		page.keys.map(async (key) => {
			const slug = await env.LINKS.get(key.name);
			return slug ? getLink(env, slug) : null;
		}),
	);
	const items = values.filter(
		(record): record is LinkRecord => record?.owner?.kind === "discord",
	);
	return "cursor" in page ? { items, cursor: page.cursor } : { items };
}

export async function listLinks(
	env: Env,
	cursor?: string,
	limit = 10,
): Promise<LinkPage> {
	const page = await env.LINKS.list({
		prefix: "link:",
		cursor,
		limit: Math.min(Math.max(limit, 1), 25),
	});
	const items = (
		await Promise.all(
			page.keys.map((key) => env.LINKS.get<LinkRecord>(key.name, "json")),
		)
	).filter((record): record is LinkRecord => record !== null);
	return "cursor" in page ? { items, cursor: page.cursor } : { items };
}

export type TokenSummary = Omit<TokenRecord, "digest">;

export async function listTokens(
	env: Env,
	cursor?: string,
	limit = 25,
): Promise<{ items: TokenSummary[]; cursor?: string }> {
	const page = await env.LINKS.list({
		prefix: "token:",
		cursor,
		limit: Math.min(Math.max(limit, 1), 100),
	});
	const values = await Promise.all(
		page.keys.map((key) => env.LINKS.get<TokenRecord>(key.name, "json")),
	);
	const items = values
		.filter((record): record is TokenRecord => record !== null)
		.map(({ digest: _digest, ...record }) => record);
	return "cursor" in page ? { items, cursor: page.cursor } : { items };
}

export async function getAccount(
	env: Env,
	accountId: string,
): Promise<AccountRecord | null> {
	return env.LINKS.get<AccountRecord>(accountKey(accountId), "json");
}
export async function getAccountByDiscordUserId(
	env: Env,
	discordUserId: string,
): Promise<AccountRecord | null> {
	const accountId = await env.LINKS.get(discordAccountKey(discordUserId));
	if (!accountId) return null;
	const account = await getAccount(env, accountId);
	return account &&
		!account.disabledAt &&
		!account.deletedAt &&
		account.discordUserId === discordUserId
		? account
		: null;
}
export async function getToken(
	env: Env,
	tokenId: string,
): Promise<TokenRecord | null> {
	return env.LINKS.get<TokenRecord>(tokenKey(tokenId), "json");
}

export async function listAccounts(
	env: Env,
	cursor?: string,
	limit = 25,
): Promise<{ items: AccountRecord[]; cursor?: string }> {
	const page = await env.LINKS.list({
		prefix: "account:",
		cursor,
		limit: Math.min(Math.max(limit, 1), 100),
	});
	const values = await Promise.all(
		page.keys.map((key) => env.LINKS.get<AccountRecord>(key.name, "json")),
	);
	const items = values.filter(
		(account): account is AccountRecord =>
			account !== null && !account.deletedAt,
	);
	return "cursor" in page ? { items, cursor: page.cursor } : { items };
}

async function migrateDiscordLinksToAccount(
	env: Env,
	discordUserId: string,
	accountId: string,
): Promise<void> {
	let cursor: string | undefined;
	do {
		const page = await env.LINKS.list({
			prefix: ownerPrefix({ kind: "discord", id: discordUserId }),
			cursor,
			limit: 1000,
		});
		const records = await Promise.all(
			page.keys.map(async (key) => {
				const slug = await env.LINKS.get(key.name);
				return slug ? getLink(env, slug) : null;
			}),
		);
		await Promise.all(
			records
				.filter(
					(record): record is LinkRecord =>
						record !== null &&
						ownsLink(record.owner, { kind: "discord", id: discordUserId }),
				)
				.map((record) => moveLinkToAccount(env, record, accountId)),
		);
		cursor = "cursor" in page ? page.cursor : undefined;
	} while (cursor);
}

async function moveLinkToAccount(
	env: Env,
	record: LinkRecord,
	accountId: string,
): Promise<void> {
	const owner: LinkOwner = { kind: "account", id: accountId };
	if (ownsLink(record.owner, owner)) return;
	const updated = { ...record, owner };
	const writes: Promise<void>[] = [
		env.LINKS.put(keyFor(record.slug), JSON.stringify(updated)),
		env.LINKS.put(ownerKey(owner, updated), record.slug),
	];
	if (record.owner)
		writes.push(env.LINKS.delete(ownerKey(record.owner, record)));
	if (record.owner?.kind === "discord")
		writes.push(env.LINKS.delete(discordIndexKey(record)));
	await Promise.all(writes);
}

async function migrateAllLinksToAccount(
	env: Env,
	accountId: string,
): Promise<void> {
	let cursor: string | undefined;
	do {
		const page = await env.LINKS.list({ prefix: "link:", cursor, limit: 1000 });
		const records = await Promise.all(
			page.keys.map((key) => env.LINKS.get<LinkRecord>(key.name, "json")),
		);
		await Promise.all(
			records
				.filter((record): record is LinkRecord => record !== null)
				.map((record) => moveLinkToAccount(env, record, accountId)),
		);
		cursor = "cursor" in page ? page.cursor : undefined;
	} while (cursor);
}

export async function createAccount(
	env: Env,
	id: string,
	creatorName: string,
	discordUserId?: string,
): Promise<AccountRecord | "duplicate" | "discord_in_use"> {
	if (await getAccount(env, id)) return "duplicate";
	if (discordUserId && (await env.LINKS.get(discordAccountKey(discordUserId))))
		return "discord_in_use";
	const account: AccountRecord = {
		id,
		creatorName,
		createdAt: new Date().toISOString(),
		...(discordUserId ? { discordUserId } : {}),
	};
	await env.LINKS.put(accountKey(id), JSON.stringify(account));
	if (discordUserId) {
		await env.LINKS.put(discordAccountKey(discordUserId), id);
		await migrateDiscordLinksToAccount(env, discordUserId, id);
	}
	return account;
}

export async function linkDiscordUser(
	env: Env,
	accountId: string,
	discordUserId: string,
): Promise<AccountRecord | "not_found" | "discord_in_use"> {
	const account = await getAccount(env, accountId);
	if (!account || account.disabledAt || account.deletedAt) return "not_found";
	const mappedAccountId = await env.LINKS.get(discordAccountKey(discordUserId));
	if (mappedAccountId && mappedAccountId !== account.id)
		return "discord_in_use";
	if (account.discordUserId && account.discordUserId !== discordUserId)
		await env.LINKS.delete(discordAccountKey(account.discordUserId));
	const updated = { ...account, discordUserId };
	await Promise.all([
		env.LINKS.put(accountKey(accountId), JSON.stringify(updated)),
		env.LINKS.put(discordAccountKey(discordUserId), accountId),
	]);
	await migrateDiscordLinksToAccount(env, discordUserId, accountId);
	return updated;
}

export async function getAdminAccount(env: Env): Promise<AccountRecord | null> {
	const accountId = await env.LINKS.get(adminAccountKey());
	if (!accountId) return null;
	const account = await getAccount(env, accountId);
	return account && !account.disabledAt && !account.deletedAt ? account : null;
}

export async function bootstrapAdminAccount(
	env: Env,
	discordUserId: string,
	creatorName: string,
): Promise<AccountRecord> {
	let account = await getAccountByDiscordUserId(env, discordUserId);
	if (account) {
		account = { ...account, creatorName };
		await env.LINKS.put(accountKey(account.id), JSON.stringify(account));
	} else {
		const created = await createAccount(
			env,
			`admin-${discordUserId}`,
			creatorName,
			discordUserId,
		);
		if (typeof created === "string")
			throw new Error("Could not create the administrator account.");
		account = created;
	}
	await env.LINKS.put(adminAccountKey(), account.id);
	await migrateAllLinksToAccount(env, account.id);
	return account;
}

export async function issueToken(
	env: Env,
	accountId: string,
	label?: string,
): Promise<{ record: TokenRecord; token: string }> {
	const tokenId = randomId();
	const token = `aig_${tokenId}.${randomId()}${randomId()}`;
	const record: TokenRecord = {
		id: tokenId,
		accountId,
		label,
		digest: await sha256(token),
		createdAt: new Date().toISOString(),
	};
	await env.LINKS.put(tokenKey(tokenId), JSON.stringify(record));
	return { record, token };
}

export async function revokeToken(
	env: Env,
	tokenId: string,
): Promise<TokenRecord | null> {
	const record = await getToken(env, tokenId);
	if (!record) return null;
	const revoked = {
		...record,
		revokedAt: record.revokedAt ?? new Date().toISOString(),
	};
	await env.LINKS.put(tokenKey(tokenId), JSON.stringify(revoked));
	return revoked;
}

export async function removeAccount(
	env: Env,
	accountId: string,
): Promise<{ account: AccountRecord; revokedTokenCount: number } | null> {
	const account = await getAccount(env, accountId);
	if (!account || account.deletedAt) return null;

	let cursor: string | undefined;
	let revokedTokenCount = 0;
	do {
		const page = await env.LINKS.list({
			prefix: "token:",
			cursor,
			limit: 1000,
		});
		const tokens = await Promise.all(
			page.keys.map((key) => env.LINKS.get<TokenRecord>(key.name, "json")),
		);
		const matching = tokens.filter(
			(token): token is TokenRecord =>
				token !== null && token.accountId === accountId && !token.revokedAt,
		);
		await Promise.all(
			matching.map(async (token) => {
				await env.LINKS.put(
					tokenKey(token.id),
					JSON.stringify({ ...token, revokedAt: new Date().toISOString() }),
				);
				revokedTokenCount += 1;
			}),
		);
		cursor = "cursor" in page ? page.cursor : undefined;
	} while (cursor);

	const deleted = {
		...account,
		deletedAt: new Date().toISOString(),
		disabledAt: account.disabledAt ?? new Date().toISOString(),
	};
	const configuredAdminAccountId = await env.LINKS.get(adminAccountKey());
	await Promise.all([
		env.LINKS.put(accountKey(accountId), JSON.stringify(deleted)),
		...(account.discordUserId
			? [env.LINKS.delete(discordAccountKey(account.discordUserId))]
			: []),
		...(configuredAdminAccountId === accountId
			? [env.LINKS.delete(adminAccountKey())]
			: []),
	]);
	return { account: deleted, revokedTokenCount };
}

function toRecord(input: LinkInput & { slug: string }): LinkRecord {
	return canonicalizeLinkTimestamps({
		slug: input.slug,
		destinationUrl: input.destinationUrl,
		creator: input.creator,
		createdAt: new Date().toISOString(),
		...(input.owner ? { owner: input.owner } : {}),
		...(input.title ? { title: input.title } : {}),
		...(input.embedTitle ? { embedTitle: input.embedTitle } : {}),
		...(input.embedDescription
			? { embedDescription: input.embedDescription }
			: {}),
		...(input.embedImageUrl ? { embedImageUrl: input.embedImageUrl } : {}),
		...(input.embedSiteName ? { embedSiteName: input.embedSiteName } : {}),
		...(input.metadataFetchedAt
			? { metadataFetchedAt: input.metadataFetchedAt }
			: {}),
		...(input.password ? { password: input.password } : {}),
		...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
		...(input.suppressSocialPreview ? { suppressSocialPreview: true } : {}),
	});
}
