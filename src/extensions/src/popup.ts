import { createLink, extension, getBranding, getSettings } from "./api";
import { applyBranding, applyDefaultBranding } from "./branding";

const form = document.querySelector<HTMLFormElement>("#link-form")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const byId = <T extends HTMLInputElement | HTMLTextAreaElement>(id: string): T => document.querySelector<T>(`#${id}`)!;

async function prefillActiveTab(): Promise<void> {
	const [tab] = await extension.tabs.query({ active: true, lastFocusedWindow: true });
	if (tab?.url?.startsWith("https://")) byId<HTMLInputElement>("destinationUrl").value = tab.url;
}

void prefillActiveTab();
void getSettings().then(async (settings) => {
	try { applyBranding(await getBranding(settings.apiBase)); }
	catch { applyDefaultBranding(); }
});

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	status.textContent = "Creating…";
	try {
		const payload = Object.fromEntries(new FormData(form).entries());
		for (const key of Object.keys(payload)) if (payload[key] === "") delete payload[key];
		payload.suppressSocialPreview = byId<HTMLInputElement>("suppressSocialPreview").checked;
		const { slug } = await createLink(payload);
		const { apiBase } = await getSettings();
		const shortUrl = `${apiBase}/${slug}`;
		await navigator.clipboard.writeText(shortUrl);
		status.innerHTML = `<a href="${shortUrl}" target="_blank" rel="noreferrer">${shortUrl}</a><br>Copied to clipboard.`;
	} catch (error) { status.textContent = error instanceof Error ? error.message : "Could not create the link."; }
});
