import { Context, Next } from "hono";
import { jsonError } from "./responses";

function encodeSecret(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

function timingSafeEqual(left: string, right: string): boolean {
	const leftBytes = encodeSecret(left);
	const rightBytes = encodeSecret(right);
	const maxLength = Math.max(leftBytes.byteLength, rightBytes.byteLength);
	let diff = leftBytes.byteLength ^ rightBytes.byteLength;

	for (let index = 0; index < maxLength; index += 1) {
		diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}

	return diff === 0;
}

export async function requireApiKey(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
	const header = c.req.header("Authorization");

	if (!header?.startsWith("Bearer ")) {
		return jsonError("Missing bearer token.", "missing_auth", 401);
	}

	const token = header.slice("Bearer ".length).trim();
	if (token.length === 0) {
		return jsonError("Missing bearer token.", "missing_auth", 401);
	}

	const configuredToken = await c.env.LINK_SHORTENER_API_KEY.get();

	if (!timingSafeEqual(token, configuredToken)) {
		return jsonError("Invalid bearer token.", "invalid_auth", 401);
	}

	return next();
}
