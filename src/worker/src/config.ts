export type SiteConfig = {
	siteName: string;
	brandLogoUrl: string;
	brandLogoAlt: string;
	faviconUrl: string;
	brandColor: string;
	privacyEmail: string;
};

const DEFAULT_CONFIG: SiteConfig = {
	siteName: "AITSYS Go",
	brandLogoUrl: "/logo.png",
	brandLogoAlt: "Aiko IT Systems",
	faviconUrl: "/favicon.png",
	brandColor: "#fc0fc0",
	privacyEmail: "privacy@aitsys.dev",
};

const BRAND_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function configuredValue(value: string | undefined, fallback: string): string {
	const configured = value?.trim();
	return configured || fallback;
}

function configuredBrandColor(value: string | undefined): string {
	const configured = value?.trim();
	return configured && BRAND_COLOR_PATTERN.test(configured)
		? configured
		: DEFAULT_CONFIG.brandColor;
}

export function getSiteConfig(env: Env): SiteConfig {
	return {
		siteName: configuredValue(env.SITE_NAME, DEFAULT_CONFIG.siteName),
		brandLogoUrl: configuredValue(
			env.BRAND_LOGO_URL,
			DEFAULT_CONFIG.brandLogoUrl,
		),
		brandLogoAlt: configuredValue(
			env.BRAND_LOGO_ALT,
			DEFAULT_CONFIG.brandLogoAlt,
		),
		faviconUrl: configuredValue(env.FAVICON_URL, DEFAULT_CONFIG.faviconUrl),
		brandColor: configuredBrandColor(env.BRAND_COLOR),
		privacyEmail: configuredValue(
			env.PRIVACY_EMAIL,
			DEFAULT_CONFIG.privacyEmail,
		),
	};
}

export function getPublicSiteMetadata(
	env: Env,
	requestUrl: string,
): SiteConfig {
	const config = getSiteConfig(env);
	return {
		...config,
		brandLogoUrl: new URL(config.brandLogoUrl, requestUrl).toString(),
		faviconUrl: new URL(config.faviconUrl, requestUrl).toString(),
	};
}
