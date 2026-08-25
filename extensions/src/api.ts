declare const browser: any;
declare const chrome: any;
const extension = globalThis.browser ?? globalThis.chrome;

export type Settings = { apiBase: string; apiToken: string };
export const defaultSettings: Settings = { apiBase: "https://go.aitsys.dev", apiToken: "" };

export async function getSettings(): Promise<Settings> {
	return { ...defaultSettings, ...(await extension.storage.local.get(defaultSettings)) };
}

export async function saveSettings(settings: Settings): Promise<void> {
	const url = new URL(settings.apiBase);
	if (url.protocol !== "https:") throw new Error("The API base URL must use HTTPS.");
	const originPattern = `${url.origin}/*`;
	if (extension.permissions?.request && !(await extension.permissions.contains({ origins: [originPattern] }))) {
		const granted = await extension.permissions.request({ origins: [originPattern] });
		if (!granted) throw new Error("Permission for that API origin was not granted.");
	}
	await extension.storage.local.set({ apiBase: url.origin, apiToken: settings.apiToken.trim() });
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
