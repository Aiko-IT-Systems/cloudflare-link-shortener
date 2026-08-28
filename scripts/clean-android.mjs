#!/usr/bin/env node
// Stops Gradle daemons and wipes local build/cache state under src/android.
// Use this when switching between VS Code and Android Studio produces stale
// configuration errors (e.g. "Cannot change the allowed usage of configuration ...").
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";

const androidDir = join(import.meta.dirname, "..", "src", "android");
const gradlew = join(androidDir, platform() === "win32" ? "gradlew.bat" : "gradlew");

if (existsSync(gradlew)) {
	console.log("Stopping Gradle daemons...");
	execFileSync(gradlew, ["--stop"], { cwd: androidDir, stdio: "inherit" });
}

for (const dir of [".gradle", "build", join("app", "build"), ".kotlin"]) {
	const target = join(androidDir, dir);
	if (existsSync(target)) {
		console.log(`Removing ${target}`);
		rmSync(target, { recursive: true, force: true });
	}
}

console.log("Android Gradle state cleaned.");
