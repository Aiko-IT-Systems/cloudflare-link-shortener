import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const target of ["chrome", "firefox"]) {
	const root = resolve("extensions", "dist", target);
	const manifestPath = resolve(root, "manifest.json");
	if (!existsSync(manifestPath)) throw new Error(`${target}: manifest.json is missing. Run the extension build first.`);
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (manifest.manifest_version !== 3) throw new Error(`${target}: Manifest V3 is required.`);
	if (!manifest.action?.default_popup || !existsSync(resolve(root, manifest.action.default_popup))) throw new Error(`${target}: popup is missing.`);
	if (manifest.host_permissions?.length) throw new Error(`${target}: host permissions must stay optional and user-granted.`);
	if (!manifest.optional_host_permissions?.includes("https://*/*")) throw new Error(`${target}: dynamic HTTPS origin permission is missing.`);
	if (!manifest.permissions?.includes("storage") || !manifest.permissions?.includes("activeTab")) throw new Error(`${target}: required minimum permissions are missing.`);
}

console.log("Chrome and Firefox extension manifests are valid.");
