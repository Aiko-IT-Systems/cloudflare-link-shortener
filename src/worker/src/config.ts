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
	privacyEmail: "privacy@aitsys.dev"
};

function configuredValue(value: string | undefined, fallback: string): string {
	const configured = value?.trim();
	return configured || fallback;
}

export function getSiteConfig(env: Env): SiteConfig {
	return {
		siteName: configuredValue(env.SITE_NAME, DEFAULT_CONFIG.siteName),
		brandLogoUrl: configuredValue(env.BRAND_LOGO_URL, DEFAULT_CONFIG.brandLogoUrl),
		brandLogoAlt: configuredValue(env.BRAND_LOGO_ALT, DEFAULT_CONFIG.brandLogoAlt),
		faviconUrl: configuredValue(env.FAVICON_URL, DEFAULT_CONFIG.faviconUrl),
		brandColor: configuredValue(env.BRAND_COLOR, DEFAULT_CONFIG.brandColor),
		privacyEmail: configuredValue(env.PRIVACY_EMAIL, DEFAULT_CONFIG.privacyEmail)
	};
}

export function getPublicSiteMetadata(env: Env, requestUrl: string): SiteConfig {
	const config = getSiteConfig(env);
	return {
		...config,
		brandLogoUrl: new URL(config.brandLogoUrl, requestUrl).toString(),
		faviconUrl: new URL(config.faviconUrl, requestUrl).toString()
	};
}
