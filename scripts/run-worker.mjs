import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateWorkerConfig } from "./generate-worker-config.mjs";

const [commandName, ...args] = process.argv.slice(2);
if (!commandName)
	throw new Error(
		"Usage: node scripts/run-worker.mjs <wrangler-command> [...args]",
	);

await generateWorkerConfig();

const wranglerEntrypoint = fileURLToPath(
	new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const commandArgs = [wranglerEntrypoint, commandName];
if (commandName === "types") commandArgs.push("worker-configuration.d.ts");
commandArgs.push("--cwd", "src/worker", ...args);
if (commandName === "types")
	commandArgs.push("--config", "wrangler.generated.jsonc");

const result = spawnSync(process.execPath, commandArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
