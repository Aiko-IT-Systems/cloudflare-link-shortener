declare const browser: any;
declare const chrome: any;
const extension = globalThis.browser ?? globalThis.chrome;

export type Settings = { apiBase: string; apiToken: string };
export type Branding = {
	siteName: string;
	brandLogoUrl: string;
	brandLogoAlt: string;
	faviconUrl: string;
	brandColor: string;
	privacyEmail?: string;
};
export const defaultSettings: Settings = { apiBase: "https://go.aitsys.dev", apiToken: "" };
export const defaultBranding: Branding = {
	siteName: "AITSYS Go",
	brandLogoUrl: "/icons/icon.svg",
	brandLogoAlt: "AITSYS Go",
	faviconUrl: "/icons/icon.svg",
	brandColor: "#fc0fc0"
};

export async function getSettings(): Promise<Settings> {
	return { ...defaultSettings, ...(await extension.storage.local.get(defaultSettings)) };
}

export async function saveSettings(settings: Settings): Promise<void> {
	const url = new URL(settings.apiBase);
	if (url.protocol !== "https:") throw new Error("The API base URL must use HTTPS.");
	await extension.storage.local.set({ apiBase: url.origin, apiToken: settings.apiToken.trim() });
}

export async function getBranding(apiBase: string): Promise<Branding> {
	const response = await fetch(`${apiBase}/api/v1/metadata`);
	const body = await response.json().catch(() => undefined) as { result?: { apiVersion?: number; branding?: Partial<Branding> } } | undefined;
	if (!response.ok || body?.result?.apiVersion !== 1 || !body.result.branding) throw new Error("This shortener does not provide compatible branding metadata.");
	const branding = body.result.branding;
	if (![branding.siteName, branding.brandLogoUrl, branding.brandLogoAlt, branding.faviconUrl, branding.brandColor].every((value) => typeof value === "string" && value.trim())) {
		throw new Error("This shortener returned incomplete branding metadata.");
	}
	return branding as Branding;
}

export async function createLink(payload: Record<string, unknown>): Promise<{ slug: string }> {
	const settings = await getSettings();
	if (!settings.apiToken) throw new Error("Open settings and add an issued user token first.");
	const response = await fetch(`${settings.apiBase}/api/v1/links`, { method: "POST", headers: { Authorization: `Bearer ${settings.apiToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
	const body = await response.json().catch(() => undefined) as { result?: { slug: string }; errors?: Array<{ message?: string }> } | undefined;
	if (!response.ok || !body?.result) throw new Error(body?.errors?.[0]?.message ?? `Request failed (${response.status}).`);
	return body.result;
}

export { extension };
