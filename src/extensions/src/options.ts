import { getBranding, getSettings, saveSettings } from "./api";
import { applyBranding, applyDefaultBranding } from "./branding";

const form = document.querySelector<HTMLFormElement>("#settings-form")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const apiBase = document.querySelector<HTMLInputElement>("#apiBase")!;
const apiToken = document.querySelector<HTMLInputElement>("#apiToken")!;

async function refreshBranding(baseUrl: string): Promise<void> {
	try { applyBranding(baseUrl, await getBranding(baseUrl), "settings"); }
	catch { applyDefaultBranding(baseUrl, "settings"); }
}

void getSettings().then((settings) => {
	apiBase.value = settings.apiBase;
	apiToken.value = settings.apiToken;
	return refreshBranding(settings.apiBase);
});
form.addEventListener("submit", async (event) => {
	event.preventDefault();
	try {
		await saveSettings({ apiBase: apiBase.value, apiToken: apiToken.value });
		await refreshBranding(new URL(apiBase.value).origin);
		status.textContent = "Settings saved.";
	}
	catch (error) { status.textContent = error instanceof Error ? error.message : "Could not save settings."; }
});
