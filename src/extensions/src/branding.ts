import { Branding, defaultBranding } from "./api";

export function applyBranding(
	baseUrl: string,
	branding: Branding,
	pageSuffix?: string,
): void {
	document
		.querySelectorAll<HTMLImageElement>("[data-brand-logo]")
		.forEach((image) => {
			image.src = branding.brandLogoUrl;
			image.alt = branding.brandLogoAlt;
		});
	document
		.querySelectorAll<HTMLElement>("[data-site-name]")
		.forEach((element) => {
			element.textContent = branding.siteName;
		});
	document.documentElement.style.setProperty("--pink", branding.brandColor);
	document.title = pageSuffix
		? `${branding.siteName} ${pageSuffix}`
		: branding.siteName;
	let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
	if (!favicon) {
		favicon = document.createElement("link");
		favicon.rel = "icon";
		document.head.append(favicon);
	}
	favicon.href = branding.faviconUrl;
	const privacyContact =
		document.querySelector<HTMLElement>("#privacy-contact");
	const privacyEmail =
		document.querySelector<HTMLAnchorElement>("#privacy-email");
	const privacyLink =
		document.querySelector<HTMLAnchorElement>("#privacy-link");
	if (privacyContact && privacyEmail && privacyLink) {
		privacyEmail.textContent = branding.privacyEmail;
		privacyEmail.href = `mailto:${branding.privacyEmail}`;
		privacyLink.href = `${baseUrl}/privacy`;
	}
}

export function applyDefaultBranding(
	baseUrl: string,
	pageSuffix?: string,
): void {
	applyBranding(baseUrl, defaultBranding, pageSuffix);
}
