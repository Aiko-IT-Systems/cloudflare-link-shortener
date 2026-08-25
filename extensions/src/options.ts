import { getSettings, saveSettings } from "./api";

const form = document.querySelector<HTMLFormElement>("#settings-form")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const apiBase = document.querySelector<HTMLInputElement>("#apiBase")!;
const apiToken = document.querySelector<HTMLInputElement>("#apiToken")!;

void getSettings().then((settings) => { apiBase.value = settings.apiBase; apiToken.value = settings.apiToken; });
form.addEventListener("submit", async (event) => {
	event.preventDefault();
	try { await saveSettings({ apiBase: apiBase.value, apiToken: apiToken.value }); status.textContent = "Settings saved."; }
	catch (error) { status.textContent = error instanceof Error ? error.message : "Could not save settings."; }
});
