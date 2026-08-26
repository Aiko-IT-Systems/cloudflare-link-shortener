import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const checkOnly = process.argv.includes("--check");
const packagePath = resolve("package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const version = packageJson.version;
const semver = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/u.exec(version);

if (!semver?.groups) throw new Error(`package.json must contain a release SemVer version, received ${JSON.stringify(version)}.`);
for (const [name, value] of Object.entries(semver.groups)) {
	if (Number(value) > 999) throw new Error(`${name} must not exceed 999; Android's shared version-code formula reserves three digits per component.`);
}

const manifestPaths = ["chrome", "edge", "firefox"].map((target) => resolve("src", "extensions", "static", target, "manifest.json"));
let mismatch = false;

for (const manifestPath of manifestPaths) {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (manifest.version === version) continue;
	mismatch = true;
	if (checkOnly) {
		console.error(`${manifestPath}: expected version ${version}, found ${manifest.version ?? "<missing>"}.`);
		continue;
	}
	manifest.version = version;
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	console.log(`Synchronized ${manifestPath} to v${version}.`);
}

if (checkOnly && mismatch) process.exitCode = 1;
if (!mismatch) console.log(`All extension manifests already use v${version}.`);
