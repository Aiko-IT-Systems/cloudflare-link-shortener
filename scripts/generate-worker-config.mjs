import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const canonicalRepository = "aiko-it-systems/cloudflare-link-shortener";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const workerDirectory = resolve(repositoryRoot, "src/worker");
const templatePath = resolve(workerDirectory, "wrangler.jsonc");
const userPath = resolve(workerDirectory, "wrangler.user.jsonc");
const aitsysPath = resolve(workerDirectory, "wrangler.aitsys.jsonc");
const generatedPath = resolve(workerDirectory, "wrangler.generated.jsonc");
const redirectPath = resolve(repositoryRoot, ".wrangler/deploy/config.json");

function stripJsonComments(source) {
	let output = "";
	let inString = false;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;

	for (let index = 0; index < source.length; index += 1) {
		const current = source[index];
		const next = source[index + 1];

		if (lineComment) {
			if (current === "\n") {
				lineComment = false;
				output += current;
			}
			continue;
		}
		if (blockComment) {
			if (current === "*" && next === "/") {
				blockComment = false;
				index += 1;
			}
			continue;
		}
		if (inString) {
			output += current;
			if (escaped) escaped = false;
			else if (current === "\\") escaped = true;
			else if (current === '"') inString = false;
			continue;
		}
		if (current === '"') {
			inString = true;
			output += current;
		} else if (current === "/" && next === "/") {
			lineComment = true;
			index += 1;
		} else if (current === "/" && next === "*") {
			blockComment = true;
			index += 1;
		} else {
			output += current;
		}
	}

	return output.replace(/,\s*([}\]])/g, "$1");
}

export function parseJsonc(source, label = "configuration") {
	const parsed = JSON.parse(stripJsonComments(source));
	if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
		throw new Error(`${label} must be a JSON object.`);
	return parsed;
}

export function mergeConfig(base, override) {
	const output = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			output[key] &&
			typeof output[key] === "object" &&
			!Array.isArray(output[key])
		) {
			output[key] = mergeConfig(output[key], value);
		} else {
			output[key] = value;
		}
	}
	return output;
}

export function normalizeGitHubRepository(remoteUrl) {
	const value = remoteUrl?.trim();
	if (!value) return undefined;
	const sshMatch = value.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
	const httpsMatch = value.match(
		/^(?:https?|ssh):\/\/(?:git@)?github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i,
	);
	return (sshMatch?.[1] ?? httpsMatch?.[1])?.toLowerCase();
}

function originRemote(rootDirectory) {
	try {
		return execFileSync("git", ["config", "--get", "remote.origin.url"], {
			cwd: rootDirectory,
			encoding: "utf8",
		}).trim();
	} catch {
		return undefined;
	}
}

function hasOwnSettings(config) {
	return Object.keys(config).length > 0;
}

export function selectProfile({ userConfig, aitsysConfig, remoteUrl }) {
	if (hasOwnSettings(userConfig)) return { name: "user", config: userConfig };
	if (normalizeGitHubRepository(remoteUrl) === canonicalRepository)
		return { name: "aitsys", config: aitsysConfig };
	return { name: "template", config: {} };
}

export function validateConfig(config) {
	if (config.workers_dev !== false)
		throw new Error(
			"The generated configuration must set workers_dev to false.",
		);
	if (config.preview_urls !== false)
		throw new Error(
			"The generated configuration must set preview_urls to false.",
		);
	if (config.secrets_store_secrets)
		throw new Error(
			"Secret Store bindings are not supported. Use encrypted Worker secrets instead.",
		);
	if (!config.kv_namespaces?.some((binding) => binding?.binding === "LINKS"))
		throw new Error(
			"The generated configuration must include the LINKS KV binding.",
		);
	const requiredSecrets = new Set(config.secrets?.required ?? []);
	for (const secretName of ["LINK_SHORTENER_API_KEY", "DISCORD_PUBLIC_KEY"]) {
		if (!requiredSecrets.has(secretName))
			throw new Error(
				`The generated configuration must require ${secretName}.`,
			);
	}
}

function readConfig(path, label) {
	return parseJsonc(readFileSync(path, "utf8"), label);
}

export async function generateWorkerConfig({
	rootDirectory = repositoryRoot,
	remoteUrl = originRemote(rootDirectory),
} = {}) {
	const template = readConfig(templatePath, "wrangler.jsonc");
	const userConfig = readConfig(userPath, "wrangler.user.jsonc");
	const aitsysConfig = readConfig(aitsysPath, "wrangler.aitsys.jsonc");
	const profile = selectProfile({ userConfig, aitsysConfig, remoteUrl });
	const config = mergeConfig(template, profile.config);
	validateConfig(config);

	writeFileSync(generatedPath, `${JSON.stringify(config, null, "\t")}\n`);
	mkdirSync(dirname(redirectPath), { recursive: true });
	writeFileSync(
		redirectPath,
		`${JSON.stringify({ configPath: relative(dirname(redirectPath), generatedPath).replaceAll("\\", "/") }, null, "\t")}\n`,
	);
	console.log(
		`Generated Worker configuration using the ${profile.name} profile.`,
	);
	return { config, profile: profile.name, generatedPath, redirectPath };
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
	await generateWorkerConfig();
