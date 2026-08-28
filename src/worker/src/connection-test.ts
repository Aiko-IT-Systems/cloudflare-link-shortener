import { buildInfo } from "./build-info";

type CloudflareRequestProperties = {
	colo?: unknown;
	country?: unknown;
	asn?: unknown;
	asOrganization?: unknown;
	httpProtocol?: unknown;
	tlsVersion?: unknown;
};

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}

function cloudflareDetails(cf: unknown) {
	if (!cf || typeof cf !== "object") return null;
	const properties = cf as CloudflareRequestProperties;
	return {
		colo: stringOrNull(properties.colo),
		country: stringOrNull(properties.country),
		asn: numberOrNull(properties.asn),
		asOrganization: stringOrNull(properties.asOrganization),
		httpProtocol: stringOrNull(properties.httpProtocol),
		tlsVersion: stringOrNull(properties.tlsVersion),
	};
}

export async function runConnectionTest(env: Env, cf?: unknown) {
	const startedAt = performance.now();

	const requiredVars = [
		"SITE_NAME",
		"BRAND_LOGO_URL",
		"BRAND_LOGO_ALT",
		"FAVICON_URL",
		"BRAND_COLOR",
		"PRIVACY_EMAIL",
		"DISCORD_APPLICATION_ID",
		"DISCORD_ADMIN_USER_ID",
	] as const;

	const requiredSecrets = [
		"LINK_SHORTENER_API_KEY",
		"DISCORD_PUBLIC_KEY",
	] as const;

	const varsOk = requiredVars.every((key) => {
		const value = env[key];
		return typeof value === "string" && value.trim().length > 0;
	});

	const secretsOk = requiredSecrets.every((key) => {
		const value = env[key];
		return typeof value === "string" && value.length > 0;
	});

	let kvOk = false;
	let kvLatencyMs: number | null = null;

	try {
		const kvStartedAt = performance.now();
		const adminAccount = await env.LINKS.get("admin-account");
		kvLatencyMs = Number((performance.now() - kvStartedAt).toFixed(2));
		kvOk = adminAccount !== null;
	} catch {
		kvOk = false;
	}

	const configurationOk = varsOk && secretsOk;
	const ok = configurationOk && kvOk;

	return {
		status: ok ? "ok" : "degraded",
		apiVersion: 1,
		checks: {
			configuration: { ok: configurationOk },
			kv: { ok: kvOk, latencyMs: kvLatencyMs },
		},
		cloudflare: cloudflareDetails(cf),
		durationMs: Number((performance.now() - startedAt).toFixed(2)),
		build: buildInfo,
	};
}
