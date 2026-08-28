declare const __AITSYS_GO_BUILD_VERSION__: string | undefined;
declare const __AITSYS_GO_BUILD_SHA__: string | undefined;
declare const __AITSYS_GO_BUILD_REPOSITORY__: string | undefined;

function compiledValue(value: string | undefined, fallback: string): string {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

export const buildInfo = {
	version: compiledValue(
		typeof __AITSYS_GO_BUILD_VERSION__ === "undefined"
			? undefined
			: __AITSYS_GO_BUILD_VERSION__,
		"development",
	),
	sha: compiledValue(
		typeof __AITSYS_GO_BUILD_SHA__ === "undefined"
			? undefined
			: __AITSYS_GO_BUILD_SHA__,
		"local",
	),
	repository: compiledValue(
		typeof __AITSYS_GO_BUILD_REPOSITORY__ === "undefined"
			? undefined
			: __AITSYS_GO_BUILD_REPOSITORY__,
		"https://github.com/Aiko-IT-Systems/cloudflare-link-shortener",
	),
} as const;
