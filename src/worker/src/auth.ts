import { Context, Next } from "hono";
import { jsonError } from "./responses";
import { getAccount, getToken } from "./store";
import { AuthPrincipal } from "./types";

function encodeSecret(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

export function timingSafeEqual(left: string, right: string): boolean {
	const leftBytes = encodeSecret(left);
	const rightBytes = encodeSecret(right);
	const maxLength = Math.max(leftBytes.byteLength, rightBytes.byteLength);
	let diff = leftBytes.byteLength ^ rightBytes.byteLength;
	for (let index = 0; index < maxLength; index += 1) {
		diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return diff === 0;
}

export async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encodeSecret(value));
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function issuedTokenId(token: string): string | undefined {
	return /^aig_([A-Za-z0-9_-]{32})\.[A-Za-z0-9_-]{64}$/.exec(token)?.[1];
}

export async function authenticate(
	env: Env,
	token: string,
): Promise<AuthPrincipal | undefined> {
	const configuredToken = env.LINK_SHORTENER_API_KEY;
	if (timingSafeEqual(token, configuredToken)) return { kind: "admin" };

	const tokenId = issuedTokenId(token);
	if (!tokenId) return undefined;
	const record = await getToken(env, tokenId);
	if (
		!record ||
		record.revokedAt ||
		!timingSafeEqual(await sha256(token), record.digest)
	)
		return undefined;
	const account = await getAccount(env, record.accountId);
	if (!account || account.disabledAt || account.deletedAt) return undefined;
	return { kind: "account", account, token: record };
}

export async function requireApiKey(
	c: Context<{ Bindings: Env; Variables: { principal: AuthPrincipal } }>,
	next: Next,
): Promise<Response | void> {
	const header = c.req.header("Authorization");
	if (!header?.startsWith("Bearer "))
		return jsonError("Missing bearer token.", "missing_auth", 401);
	const token = header.slice("Bearer ".length).trim();
	if (!token) return jsonError("Missing bearer token.", "missing_auth", 401);
	const principal = await authenticate(c.env, token);
	if (!principal)
		return jsonError("Invalid bearer token.", "invalid_auth", 401);
	c.set("principal", principal);
	return next();
}

export function requireAdmin(principal: AuthPrincipal): Response | undefined {
	return principal.kind === "admin"
		? undefined
		: jsonError("Administrator access is required.", "admin_required", 403);
}
