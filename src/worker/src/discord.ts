import {
	bootstrapAdminAccount,
	createLink,
	disableLink,
	getAccountByDiscordUserId,
	getLink,
	listLinks,
	listOwnedLinks,
	refreshLinkMetadata,
	updateLink,
} from "./store";
import { AccountRecord, LinkPage, LinkRecord } from "./types";
import {
	createLinkSchema,
	normalizeSlug,
	updateLinkSchema,
} from "./validation";
import { fetchTargetMetadata } from "./metadata";
import { canonicalTimestamp } from "./timestamps";

const EPHEMERAL = 1 << 6;
const COMPONENTS_V2 = 1 << 15;
const SESSION_TTL_SECONDS = 15 * 60;
const MANAGE_PAGE_SIZE = 2;

type DiscordUser = { id: string; username: string };
type Interaction = {
	type: number;
	application_id?: string;
	data?: {
		name?: string;
		custom_id?: string;
		target_id?: string;
		options?: Array<{ name: string; value?: string }>;
		resolved?: { messages?: Record<string, { content?: string }> };
		components?: unknown[];
	};
	member?: { user?: DiscordUser };
	user?: DiscordUser;
};
type CreateSession = {
	type: "create";
	user: DiscordUser;
	accountId: string;
	urls: string[];
	index: number;
};
type ManageSession = {
	type: "manage";
	userId: string;
	accountId: string;
	admin: boolean;
	cursor?: string;
	previous: string[];
};
type Session = CreateSession | ManageSession;

function sessionKey(id: string): string {
	return `discord-session:${id}`;
}
function sessionId(): string {
	return crypto.randomUUID().replaceAll("-", "");
}
function response(body: unknown, status = 200): Response {
	return Response.json(body, { status });
}
function ephemeral(content: string): Response {
	return response({
		type: 4,
		data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
	});
}
function v2(components: unknown[]): Response {
	return response({
		type: 4,
		data: {
			flags: EPHEMERAL | COMPONENTS_V2,
			components,
			allowed_mentions: { parse: [] },
		},
	});
}
function text(content: string): Record<string, unknown> {
	return { type: 10, content };
}
function button(
	customId: string,
	label: string,
	style = 2,
	disabled = false,
): Record<string, unknown> {
	return { type: 2, custom_id: customId, label, style, disabled };
}
function linkButton(url: string): Record<string, unknown> {
	return { type: 2, style: 5, label: "Open link", url };
}
function row(
	...components: Record<string, unknown>[]
): Record<string, unknown> {
	return { type: 1, components };
}
function container(
	...components: Record<string, unknown>[]
): Record<string, unknown> {
	return { type: 17, components };
}
function section(
	content: string,
	accessory: Record<string, unknown>,
): Record<string, unknown> {
	return { type: 9, components: [text(content)], accessory };
}
function shortUrl(origin: string, slug: string): string {
	return `${origin}/${encodeURIComponent(slug)}`;
}

function createdLinkResponse(
	origin: string,
	slug: string,
	remaining?: number,
	sessionIdValue?: string,
): Response {
	const url = shortUrl(origin, slug);
	const details =
		remaining === undefined
			? `## Link created\n${url}`
			: `## Link created\n${url}\n${remaining} link(s) remain in the selected message.`;
	const controls = sessionIdValue
		? [
				row(
					button(`short:next:${sessionIdValue}`, "Fill next URL", 1),
					button(`short:abort:${sessionIdValue}`, "Abort remaining", 4),
				),
			]
		: [];
	return v2([container(section(details, linkButton(url)), ...controls)]);
}

function modal(
	session: CreateSession,
	id: string,
	currentTitle?: string,
	customId = `short:create:${id}`,
): Response {
	const url = session.urls[session.index]!;
	const editing = customId.startsWith("short:edit-submit:");
	return response({
		type: 9,
		data: {
			custom_id: customId,
			title: editing
				? "Edit short link"
				: session.urls.length > 1
					? `Shorten ${session.index + 1}/${session.urls.length}`
					: "Create short link",
			components: [
				text(`Destination\n${url}`),
				...(!editing
					? [label("Custom slug (optional)", "slug", "AITSYS-GO")]
					: []),
				label(
					"Fallback title (optional)",
					"title",
					"Used if no page title is found",
					currentTitle,
				),
				label(
					editing
						? "New password (leave blank to keep)"
						: "Password (optional)",
					"password",
					"Protect this link",
					undefined,
					true,
				),
				label(
					"Expiry, UTC ISO-8601 (optional)",
					"expiresAt",
					"2026-12-31T23:59:00Z",
				),
			],
		},
	});
}

function adminSetupModal(): Response {
	return response({
		type: 9,
		data: {
			custom_id: "short:admin-setup",
			title: "Set up administrator profile",
			components: [
				label(
					"Public author name",
					"creatorName",
					"Shown as the author of your new links",
				),
			],
		},
	});
}

function label(
	labelText: string,
	customId: string,
	placeholder: string,
	value?: string,
	password = false,
): Record<string, unknown> {
	return {
		type: 18,
		label: labelText,
		component: {
			type: 4,
			custom_id: customId,
			style: 1,
			required: false,
			placeholder,
			...(value ? { value } : {}),
			...(password ? { style: 1 } : {}),
		},
	};
}

async function saveSession(
	env: Env,
	id: string,
	session: Session,
): Promise<void> {
	await env.LINKS.put(sessionKey(id), JSON.stringify(session), {
		expirationTtl: SESSION_TTL_SECONDS,
	});
}
async function loadSession(env: Env, id: string): Promise<Session | null> {
	return env.LINKS.get<Session>(sessionKey(id), "json");
}
async function clearSession(env: Env, id: string): Promise<void> {
	await env.LINKS.delete(sessionKey(id));
}

function userOf(interaction: Interaction): DiscordUser | undefined {
	return interaction.member?.user ?? interaction.user;
}

function extractUrls(content: string): string[] {
	const seen = new Set<string>();
	for (const candidate of content.match(/https:\/\/[^\s<>()]+/g) ?? []) {
		const trimmed = candidate.replace(/[),.!?]+$/, "");
		try {
			if (new URL(trimmed).protocol === "https:") seen.add(trimmed);
		} catch {
			/* Ignore malformed message text. */
		}
	}
	return [...seen];
}

function submittedValues(components: unknown[]): Record<string, string> {
	const values: Record<string, string> = {};
	const visit = (item: unknown): void => {
		if (!item || typeof item !== "object") return;
		const record = item as {
			custom_id?: unknown;
			value?: unknown;
			components?: unknown[];
			component?: unknown;
		};
		if (
			typeof record.custom_id === "string" &&
			typeof record.value === "string"
		)
			values[record.custom_id] = record.value.trim();
		for (const child of record.components ?? []) visit(child);
		visit(record.component);
	};
	for (const item of components) visit(item);
	return values;
}

async function verifyDiscordRequest(
	request: Request,
	env: Env,
): Promise<Uint8Array | undefined> {
	const signature = request.headers.get("x-signature-ed25519");
	const timestamp = request.headers.get("x-signature-timestamp");
	if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return undefined;
	if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000)
		return undefined;
	const raw = new Uint8Array(await request.arrayBuffer());
	const keyHex = env.DISCORD_PUBLIC_KEY;
	if (!/^[a-f\d]{64}$/i.test(keyHex) || !/^[a-f\d]{128}$/i.test(signature))
		return undefined;
	const hex = (value: string): Uint8Array =>
		Uint8Array.from(value.match(/.{1,2}/g) ?? [], (part) =>
			Number.parseInt(part, 16),
		);
	const data = new Uint8Array(
		new TextEncoder().encode(timestamp).byteLength + raw.byteLength,
	);
	data.set(new TextEncoder().encode(timestamp));
	data.set(raw, new TextEncoder().encode(timestamp).byteLength);
	const publicKey = await crypto.subtle.importKey(
		"raw",
		hex(keyHex),
		{ name: "Ed25519" },
		false,
		["verify"],
	);
	return (await crypto.subtle.verify(
		{ name: "Ed25519" },
		publicKey,
		hex(signature),
		data,
	))
		? raw
		: undefined;
}

function isDiscordAdmin(env: Env, user: DiscordUser): boolean {
	return (
		Boolean(env.DISCORD_ADMIN_USER_ID) && env.DISCORD_ADMIN_USER_ID === user.id
	);
}

function canManage(
	account: AccountRecord,
	record: LinkRecord,
	admin: boolean,
): boolean {
	return (
		admin ||
		(record.owner?.kind === "account" && record.owner.id === account.id)
	);
}

async function listManageLinks(
	env: Env,
	session: ManageSession,
	cursor = session.cursor,
): Promise<LinkPage> {
	const loadPage = (nextCursor?: string): Promise<LinkPage> =>
		session.admin
			? listLinks(env, nextCursor, 1)
			: listOwnedLinks(
					env,
					{ kind: "account", id: session.accountId },
					nextCursor,
					1,
				);
	const items: LinkRecord[] = [];
	let nextCursor = cursor;
	while (true) {
		const page = await loadPage(nextCursor);
		const record = page.items[0];
		if (record && !record.disabledAt) {
			if (items.length === MANAGE_PAGE_SIZE)
				return { items, cursor: nextCursor };
			items.push(record);
		}
		if (!page.cursor) return { items };
		nextCursor = page.cursor;
	}
}

async function renderManage(
	env: Env,
	origin: string,
	sessionIdValue: string,
	session: ManageSession,
): Promise<Response> {
	const page = await listManageLinks(env, session);
	const cards = page.items.flatMap((record) => [
		container(
			section(
				`**/${record.slug}**\n${shortUrl(origin, record.slug)}\nDestination: ${record.destinationUrl}\nCreated ${canonicalTimestamp(record.createdAt)}${record.expiresAt ? `\nExpires ${canonicalTimestamp(record.expiresAt)}` : ""}`,
				linkButton(shortUrl(origin, record.slug)),
			),
			row(
				button(`short:edit:${record.slug}`, "Edit"),
				button(`short:refresh:${record.slug}`, "Refresh"),
				button(
					`short:preview:${record.slug}`,
					record.suppressSocialPreview ? "Enable preview" : "Suppress preview",
				),
				button(
					`short:clear-password:${record.slug}`,
					"Clear password",
					2,
					!record.password,
				),
				button(
					`short:disable:${record.slug}`,
					"Disable",
					4,
					Boolean(record.disabledAt),
				),
			),
		),
	]);
	const nav = row(
		button(
			`short:manage-prev:${sessionIdValue}`,
			"Previous",
			2,
			session.previous.length === 0,
		),
		button(`short:manage-next:${sessionIdValue}`, "Next", 2, !page.cursor),
	);
	return v2([
		container(
			text(
				session.admin ? "## All links (admin)" : "## Your linked-account links",
			),
		),
		...cards,
		container(nav),
	]);
}

async function handleCommand(
	interaction: Interaction,
	env: Env,
	origin: string,
	user: DiscordUser,
	account: AccountRecord,
): Promise<Response> {
	const name = interaction.data?.name?.toLowerCase();
	if (name === "shorten") {
		const url = interaction.data?.options?.find(
			(option) => option.name === "url",
		)?.value;
		if (!url || !extractUrls(url).length || extractUrls(url)[0] !== url)
			return ephemeral("Please provide one valid HTTPS URL.");
		const id = sessionId();
		const session: CreateSession = {
			type: "create",
			user,
			accountId: account.id,
			urls: [url],
			index: 0,
		};
		await saveSession(env, id, session);
		return modal(session, id);
	}
	if (name === "shorten link") {
		const target = interaction.data?.target_id;
		const content = target
			? (interaction.data?.resolved?.messages?.[target]?.content ?? "")
			: "";
		const urls = extractUrls(content);
		if (!urls.length)
			return ephemeral(
				"That message does not contain an HTTPS link I can shorten.",
			);
		const id = sessionId();
		const session: CreateSession = {
			type: "create",
			user,
			accountId: account.id,
			urls,
			index: 0,
		};
		await saveSession(env, id, session);
		return modal(session, id);
	}
	if (name === "manage") {
		const id = sessionId();
		const session: ManageSession = {
			type: "manage",
			userId: user.id,
			accountId: account.id,
			admin: isDiscordAdmin(env, user),
			previous: [],
		};
		await saveSession(env, id, session);
		return renderManage(env, origin, id, session);
	}
	return ephemeral("Unknown command.");
}

async function handleModal(
	interaction: Interaction,
	env: Env,
	origin: string,
	user: DiscordUser,
	account: AccountRecord,
	customId: string,
): Promise<Response> {
	const [, action, id] = customId.split(":");
	if (action === "edit-submit" && id) {
		const record = await getLink(env, normalizeSlug(id));
		if (!record || !canManage(account, record, isDiscordAdmin(env, user)))
			return ephemeral("Link not found.");
		const values = submittedValues(interaction.data?.components ?? []);
		const parsed = updateLinkSchema.safeParse({
			title: values.title || null,
			password: values.password || undefined,
			expiresAt: values.expiresAt || null,
		});
		if (!parsed.success)
			return ephemeral(
				"The updated details were invalid. Check the expiry format.",
			);
		await updateLink(
			env,
			record.slug,
			Object.fromEntries(
				Object.entries(parsed.data).map(([key, value]) => [
					key,
					value === null ? undefined : value,
				]),
			),
		);
		return ephemeral(`Updated ${shortUrl(origin, record.slug)}.`);
	}
	if (action !== "create" || !id)
		return ephemeral("This form is no longer valid.");
	const session = await loadSession(env, id);
	if (
		!session ||
		session.type !== "create" ||
		session.user.id !== user.id ||
		session.accountId !== account.id
	)
		return ephemeral("This form has expired or belongs to another user.");
	const values = submittedValues(interaction.data?.components ?? []);
	const payload = createLinkSchema.safeParse({
		destinationUrl: session.urls[session.index],
		slug: values.slug || undefined,
		title: values.title || undefined,
		password: values.password || undefined,
		expiresAt: values.expiresAt || undefined,
	});
	if (!payload.success)
		return ephemeral(
			"The link details were invalid. Please start again and check the expiry format.",
		);
	const metadata = await fetchTargetMetadata(payload.data.destinationUrl);
	const created = await createLink(env, {
		...payload.data,
		creator: user.username,
		owner: { kind: "account", id: account.id },
		embedTitle: metadata.embedTitle,
		embedDescription: metadata.embedDescription,
		embedImageUrl: metadata.embedImageUrl,
		embedSiteName: metadata.embedSiteName,
		metadataFetchedAt: metadata.metadataFetchedAt,
	});
	if (created === "duplicate")
		return ephemeral("That custom slug is already in use.");
	if (created === "reserved") return ephemeral("That custom slug is reserved.");
	session.index += 1;
	if (session.index >= session.urls.length) {
		await clearSession(env, id);
		return createdLinkResponse(origin, created.slug);
	}
	await saveSession(env, id, session);
	return createdLinkResponse(
		origin,
		created.slug,
		session.urls.length - session.index,
		id,
	);
}

async function handleAdminSetup(
	interaction: Interaction,
	env: Env,
	user: DiscordUser,
): Promise<Response> {
	if (!isDiscordAdmin(env, user))
		return ephemeral("Administrator access is required.");
	const creatorName = submittedValues(
		interaction.data?.components ?? [],
	).creatorName;
	if (!creatorName || creatorName.length > 80)
		return ephemeral(
			"Please provide a public author name up to 80 characters long.",
		);
	try {
		const account = await bootstrapAdminAccount(env, user.id, creatorName);
		return ephemeral(
			`Administrator profile ${account.id} is ready. Existing links now belong to it; run /manage again.`,
		);
	} catch {
		return ephemeral(
			"Could not set up the administrator profile. Please contact an administrator.",
		);
	}
}

async function handleComponent(
	interaction: Interaction,
	env: Env,
	origin: string,
	user: DiscordUser,
	account: AccountRecord,
	customId: string,
): Promise<Response> {
	const [, action, value] = customId.split(":");
	if (!action || !value) return ephemeral("This control is no longer valid.");
	if (action === "next" || action === "abort") {
		const session = await loadSession(env, value);
		if (
			!session ||
			session.type !== "create" ||
			session.user.id !== user.id ||
			session.accountId !== account.id
		)
			return ephemeral("This batch has expired or belongs to another user.");
		if (action === "abort") {
			await clearSession(env, value);
			return v2([
				container(
					text("## Batch stopped\nLinks already created remain available."),
				),
			]);
		}
		return modal(session, value);
	}
	if (action.startsWith("manage-")) {
		const session = await loadSession(env, value);
		if (
			!session ||
			session.type !== "manage" ||
			session.userId !== user.id ||
			session.accountId !== account.id
		)
			return ephemeral("This page has expired or belongs to another user.");
		if (action === "manage-next") {
			const page = await listManageLinks(env, session);
			if (!page.cursor) return renderManage(env, origin, value, session);
			session.previous.push(session.cursor ?? "");
			session.cursor = page.cursor;
		} else {
			session.cursor = session.previous.pop() || undefined;
		}
		await saveSession(env, value, session);
		return renderManage(env, origin, value, session);
	}
	const record = await getLink(env, normalizeSlug(value));
	const admin = isDiscordAdmin(env, user);
	if (!record || !canManage(account, record, admin))
		return ephemeral("Link not found.");
	if (action === "edit") {
		const id = sessionId();
		const session: CreateSession = {
			type: "create",
			user,
			accountId: account.id,
			urls: [record.destinationUrl],
			index: 0,
		};
		return modal(session, id, record.title, `short:edit-submit:${record.slug}`);
	}
	if (action === "refresh") {
		await refreshLinkMetadata(
			env,
			record.slug,
			await fetchTargetMetadata(record.destinationUrl),
		);
		return ephemeral(
			`Metadata refreshed for ${shortUrl(origin, record.slug)}.`,
		);
	}
	if (action === "preview") {
		await updateLink(env, record.slug, {
			suppressSocialPreview: !record.suppressSocialPreview,
		});
		return ephemeral(
			`Social preview ${record.suppressSocialPreview ? "enabled" : "suppressed"} for ${shortUrl(origin, record.slug)}.`,
		);
	}
	if (action === "clear-password") {
		await updateLink(env, record.slug, { password: undefined });
		return ephemeral(
			`Cleared the password for ${shortUrl(origin, record.slug)}.`,
		);
	}
	if (action === "disable")
		return v2([
			container(
				section(
					`Disable ${shortUrl(origin, record.slug)}? This cannot be undone from Discord.`,
					linkButton(shortUrl(origin, record.slug)),
				),
				row(
					button(`short:confirm-disable:${record.slug}`, "Disable link", 4),
					button("short:cancel", "Cancel"),
				),
			),
		]);
	if (action === "confirm-disable") {
		await disableLink(env, record.slug, "Disabled from Discord manage.");
		return ephemeral(`Disabled ${shortUrl(origin, record.slug)}.`);
	}
	return ephemeral("Unknown link action.");
}

export async function handleDiscordInteraction(
	request: Request,
	env: Env,
	origin = new URL(request.url).origin,
): Promise<Response> {
	if (request.method !== "POST")
		return new Response("Method not allowed", { status: 405 });
	let raw: Uint8Array | undefined;
	try {
		raw = await verifyDiscordRequest(request, env);
	} catch {
		return new Response("Invalid request signature.", { status: 401 });
	}
	if (!raw) return new Response("Invalid request signature.", { status: 401 });
	let interaction: Interaction;
	try {
		interaction = JSON.parse(new TextDecoder().decode(raw)) as Interaction;
	} catch {
		return new Response("Invalid JSON.", { status: 400 });
	}
	if (
		interaction.application_id &&
		env.DISCORD_APPLICATION_ID &&
		interaction.application_id !== env.DISCORD_APPLICATION_ID
	)
		return new Response("Unknown application.", { status: 401 });
	if (interaction.type === 1) return response({ type: 1 });
	const user = userOf(interaction);
	if (!user) return new Response("Missing user.", { status: 400 });
	const account = await getAccountByDiscordUserId(env, user.id);
	if (!account) {
		if (
			interaction.type === 2 &&
			interaction.data?.name?.toLowerCase() === "manage" &&
			isDiscordAdmin(env, user)
		)
			return adminSetupModal();
		if (
			interaction.type === 5 &&
			interaction.data?.custom_id === "short:admin-setup" &&
			isDiscordAdmin(env, user)
		)
			return handleAdminSetup(interaction, env, user);
		return ephemeral(
			"Your Discord user ID is not linked to an active shortener account. Ask an administrator to link it first.",
		);
	}
	if (interaction.type === 2)
		return handleCommand(interaction, env, origin, user, account);
	if (interaction.type === 5 && interaction.data?.custom_id)
		return handleModal(
			interaction,
			env,
			origin,
			user,
			account,
			interaction.data.custom_id,
		);
	if (interaction.type === 3 && interaction.data?.custom_id)
		return handleComponent(
			interaction,
			env,
			origin,
			user,
			account,
			interaction.data.custom_id,
		);
	return ephemeral("Unsupported interaction.");
}
