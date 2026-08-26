import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const localSha = () => {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	} catch {
		return "local";
	}
};
const buildInfo = {
	version: packageJson.version,
	sha: process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || localSha(),
	repository: typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url
};

for (const [name, value] of Object.entries(buildInfo)) {
	if (!value) throw new Error(`Unable to determine Worker build ${name}.`);
}

const define = (name, value) => `${name}:${JSON.stringify(value)}`;
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, [
	"wrangler", "deploy", "--cwd", "src/worker",
	"--define", define("__AITSYS_GO_BUILD_VERSION__", buildInfo.version),
	"--define", define("__AITSYS_GO_BUILD_SHA__", buildInfo.sha),
	"--define", define("__AITSYS_GO_BUILD_REPOSITORY__", buildInfo.repository)
], { stdio: "inherit" });

process.exit(result.status ?? 1);
