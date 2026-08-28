import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateWorkerConfig } from "./generate-worker-config.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const localSha = () => {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	} catch {
		return "local";
	}
};
const getRepo = () => {
	try {
		const gitURL = new URL(execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim());
		gitURL.username = "";
		gitURL.password = "";
		return gitURL.toString();
	} catch {
		return typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url;
	}
}
const buildInfo = {
	version: packageJson.version,
	sha: process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || localSha(),
	repository: getRepo()
};

for (const [name, value] of Object.entries(buildInfo)) {
	if (!value) throw new Error(`Unable to determine Worker build ${name}.`);
}

await generateWorkerConfig();

const define = (name, value) => `${name}:${JSON.stringify(value)}`;
const wranglerEntrypoint = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const result = spawnSync(process.execPath, [
	wranglerEntrypoint, "deploy", "--cwd", "src/worker",
	...process.argv.slice(2),
	"--define", define("__AITSYS_GO_BUILD_VERSION__", buildInfo.version),
	"--define", define("__AITSYS_GO_BUILD_SHA__", buildInfo.sha),
	"--define", define("__AITSYS_GO_BUILD_REPOSITORY__", buildInfo.repository)
], { stdio: "inherit" });

process.exit(result.status ?? 1);
