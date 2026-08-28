import { LinkRecord, PasswordVerifier } from "./types";

const encoder = new TextEncoder();
const SALT_BYTES = 16;
const MINIMUM_PEPPER_BYTES = 32;

function constantTimeEqual(left: string, right: string): boolean {
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	const maxLength = Math.max(leftBytes.length, rightBytes.length);
	let difference = leftBytes.length ^ rightBytes.length;
	for (let index = 0; index < maxLength; index += 1)
		difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	return difference === 0;
}

function base64(bytes: ArrayBuffer | Uint8Array): string {
	const values = new Uint8Array(bytes);
	let value = "";
	for (const byte of values) value += String.fromCharCode(byte);
	return btoa(value);
}

function decodeBase64(value: string): Uint8Array | undefined {
	try {
		const decoded = atob(value);
		return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
	} catch {
		return undefined;
	}
}

function passwordMaterial(salt: Uint8Array, password: string): Uint8Array {
	const encodedPassword = encoder.encode(password);
	const material = new Uint8Array(salt.length + encodedPassword.length);
	material.set(salt);
	material.set(encodedPassword, salt.length);
	return material;
}

async function keyedDigest(
	password: string,
	salt: Uint8Array,
	pepper: string,
): Promise<ArrayBuffer> {
	const pepperBytes = encoder.encode(pepper);
	if (pepperBytes.length < MINIMUM_PEPPER_BYTES)
		throw new Error(
			"LINK_PASSWORD_PEPPER must contain at least 32 UTF-8 bytes.",
		);
	const key = await crypto.subtle.importKey(
		"raw",
		pepperBytes,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return crypto.subtle.sign("HMAC", key, passwordMaterial(salt, password));
}

export async function passwordThrottleIdentifier(
	clientAddress: string,
	pepper: string,
): Promise<string> {
	const digest = await keyedDigest(
		`password-throttle:${clientAddress}`,
		new Uint8Array(),
		pepper,
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export function hasLinkPassword(record: LinkRecord): boolean {
	return Boolean(record.passwordVerifier || record.password);
}

export async function hashLinkPassword(
	password: string,
	pepper: string,
): Promise<PasswordVerifier> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	return {
		algorithm: "HMAC-SHA-256",
		salt: base64(salt),
		digest: base64(await keyedDigest(password, salt, pepper)),
	};
}

export async function verifyLinkPassword(
	record: LinkRecord,
	password: string,
	pepper: string,
): Promise<{ valid: boolean; upgraded?: PasswordVerifier }> {
	if (record.passwordVerifier) {
		const { algorithm, salt, digest } = record.passwordVerifier;
		const saltBytes = decodeBase64(salt);
		if (!saltBytes) return { valid: false };
		if (algorithm !== "HMAC-SHA-256") return { valid: false };
		return {
			valid: constantTimeEqual(
				digest,
				base64(await keyedDigest(password, saltBytes, pepper)),
			),
		};
	}

	// Records written before v2.1.2 retained a plaintext value in KV. A successful
	// unlock upgrades that record in place; unsuccessful attempts reveal nothing.
	if (!record.password || !constantTimeEqual(password, record.password))
		return { valid: false };
	return { valid: true, upgraded: await hashLinkPassword(password, pepper) };
}
