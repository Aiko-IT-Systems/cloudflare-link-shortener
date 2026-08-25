import { Branding, defaultBranding } from "./api";

export function applyBranding(branding: Branding, pageSuffix?: string): void {
	document.querySelectorAll<HTMLImageElement>("[data-brand-logo]").forEach((image) => {
		image.src = branding.brandLogoUrl;
		image.alt = branding.brandLogoAlt;
	});
	document.querySelectorAll<HTMLElement>("[data-site-name]").forEach((element) => { element.textContent = branding.siteName; });
	document.documentElement.style.setProperty("--pink", branding.brandColor);
	document.title = pageSuffix ? `${branding.siteName} ${pageSuffix}` : branding.siteName;
	let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
	if (!favicon) {
		favicon = document.createElement("link");
		favicon.rel = "icon";
		document.head.append(favicon);
	}
	favicon.href = branding.faviconUrl;
}

export function applyDefaultBranding(pageSuffix?: string): void { applyBranding(defaultBranding, pageSuffix); }
