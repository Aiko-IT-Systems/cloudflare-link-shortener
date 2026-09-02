import { buildInfo } from "./build-info";
import { LinkRecord } from "./types";
import { isPublicHttpsUrl } from "./validation";

type EmbedMetadata = Pick<
	LinkRecord,
	| "embedTitle"
	| "embedDescription"
	| "embedImageUrl"
	| "embedVideoUrl"
	| "embedVideoWidth"
	| "embedVideoHeight"
	| "embedSiteName"
	| "metadataFetchedAt"
>;

// Instagram's public embedded video state can arrive hundreds of KiB after the
// document head. Keep this bounded and streamed rather than buffering an
// unbounded upstream response.
const MAX_HTML_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 2500;
const MAX_REDIRECTS = 3;

function trimForMeta(
	value: string | undefined,
	maxLength: number,
): string | undefined {
	const trimmed = value?.replace(/\s+/g, " ").trim();
	if (!trimmed) {
		return undefined;
	}

	return trimmed.length > maxLength
		? `${trimmed.slice(0, maxLength - 1).trim()}...`
		: trimmed;
}

function decodeHtml(value: string): string {
	const entities = new Map([
		["&amp;", "&"],
		["&lt;", "<"],
		["&gt;", ">"],
		["&quot;", '"'],
		["&#39;", "'"],
		["&#x27;", "'"],
	]);
	return value.replace(/&(?:amp|lt|gt|quot|#39|#x27);/gi, (entity) =>
		entities.get(entity.toLowerCase()) ?? entity,
	);
}

function attributesFor(tag: string): Map<string, string> {
	const attributes = new Map<string, string>();
	const attributePattern = /([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
	let match: RegExpExecArray | null;

	while ((match = attributePattern.exec(tag)) !== null) {
		attributes.set(match[1].toLowerCase(), decodeHtml(match[3]));
	}

	return attributes;
}

function metaContent(headHtml: string, names: string[]): string | undefined {
	const wanted = new Set(names.map((name) => name.toLowerCase()));
	const metaPattern = /<meta\b[^>]*>/gi;
	let match: RegExpExecArray | null;

	while ((match = metaPattern.exec(headHtml)) !== null) {
		const attributes = attributesFor(match[0]);
		const name = attributes.get("property") ?? attributes.get("name");
		const content = attributes.get("content");

		if (name && content && wanted.has(name.toLowerCase())) {
			return content;
		}
	}

	return undefined;
}

function titleContent(headHtml: string): string | undefined {
	const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(headHtml);
	return match ? decodeHtml(match[1]) : undefined;
}

function resolveHttpsUrl(
	value: string | undefined,
	destinationUrl: string,
): string | undefined {
	if (!value) {
		return undefined;
	}

	try {
		const url = new URL(value, destinationUrl);
		return url.protocol === "https:" ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

type SocialProvider = "facebook" | "instagram" | "x";

function socialProvider(destinationUrl: string): SocialProvider | undefined {
	try {
		const url = new URL(destinationUrl);
		const host = url.hostname.toLowerCase();
		if (
			(host === "instagram.com" || host === "www.instagram.com") &&
			/^\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
		)
			return "instagram";
		if (
			(host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com") &&
			/^\/[^/]+\/status\/\d+\/?$/.test(url.pathname)
		)
			return "x";
		if (host !== "facebook.com" && host !== "www.facebook.com") return undefined;
		if (/^\/reel\/\d+\/?$/.test(url.pathname)) return "facebook";
		if (url.pathname === "/watch" && /^\d+$/.test(url.searchParams.get("v") ?? "")) return "facebook";
		if (url.pathname === "/permalink.php" && url.searchParams.has("story_fbid") && url.searchParams.has("id")) return "facebook";
	} catch {
		// Destination validation happens before metadata fetching. Treat malformed values as non-social here.
	}
	return undefined;
}

function directHttpsMp4(
	value: string | undefined,
	destinationUrl: string,
	contentType?: string,
): string | undefined {
	const resolved = resolveHttpsUrl(value, destinationUrl);
	if (!resolved) return undefined;
	const url = new URL(resolved);
	const declaresMp4 = contentType?.split(";", 1)[0]?.trim().toLowerCase() === "video/mp4";
	return url.pathname.toLowerCase().endsWith(".mp4") || declaresMp4 ? resolved : undefined;
}

function publicSocialMp4(
	value: string | undefined,
	provider: SocialProvider,
	destinationUrl: string,
): string | undefined {
	const resolved = directHttpsMp4(value, destinationUrl);
	if (!resolved) return undefined;
	const url = new URL(resolved);
	const host = url.hostname.toLowerCase();
	const knownCdn =
		provider === "instagram"
			? host === "cdninstagram.com" || host.endsWith(".cdninstagram.com")
			: provider === "facebook"
				? host === "fbcdn.net" || host.endsWith(".fbcdn.net")
				: host === "video.twimg.com";
	return knownCdn ? resolved : undefined;
}

function positiveInteger(value: string | undefined): number | undefined {
	const number = Number(value);
	return Number.isInteger(number) && number > 0 ? number : undefined;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function embeddedInstagramVideo(
	html: string,
	destinationUrl: string,
): { url: string; width?: number; height?: number } | undefined {
	for (const match of html.matchAll(/"video_versions"\s*:\s*(\[[\s\S]*?\])/g)) {
		try {
			const versions: unknown = JSON.parse(match[1]);
			if (!Array.isArray(versions)) continue;
			const url = versions
				.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
				.map((item) => (typeof item.url === "string" ? item.url : undefined))
				.map((value) => publicSocialMp4(value, "instagram", destinationUrl))
				.find((value): value is string => Boolean(value));
			if (!url) continue;
			const nearby = html.slice(Math.max(0, (match.index ?? 0) - 5_000), (match.index ?? 0) + 5_000);
			return {
				url,
				width: positiveInteger(/"original_width"\s*:\s*(\d+)/.exec(nearby)?.[1]),
				height: positiveInteger(/"original_height"\s*:\s*(\d+)/.exec(nearby)?.[1]),
			};
		} catch {
			// Embedded state is an implementation detail and may not form standalone JSON.
		}
	}
	return undefined;
}

function primaryInstagramCarouselIsImage(html: string): boolean {
	const marker = /"carousel_media"\s*:\s*\[/.exec(html);
	if (!marker || marker.index === undefined) return false;
	const start = marker.index + marker[0].lastIndexOf("[");
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let index = start; index < html.length; index += 1) {
		const character = html[index];
		if (quoted) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') quoted = false;
			continue;
		}
		if (character === '"') quoted = true;
		else if (character === "[") depth += 1;
		else if (character === "]" && --depth === 0) {
			try {
				const carousel: unknown = JSON.parse(html.slice(start, index + 1));
				const first = Array.isArray(carousel) ? carousel[0] : undefined;
				return typeof first === "object" && first !== null && (first as Record<string, unknown>).media_type === 1;
			} catch {
				return false;
			}
		}
	}
	return false;
}

function embeddedXVideo(
	html: string,
	destinationUrl: string,
): { url: string; width?: number; height?: number } | undefined {
	let statusId: string | undefined;
	try {
		statusId = /^\/[^/]+\/status\/(\d+)\/?$/.exec(new URL(destinationUrl).pathname)?.[1];
	} catch {
		return undefined;
	}
	if (!statusId) return undefined;

	// X hydrates replies, quoted posts, and recommendations into the same page. The
	// requested Tweet's media records are keyed by its base64 `Tweet:<status id>`.
	const entityPrefix = `client:${btoa(`Tweet:${statusId}`)}:media_entities2:`;
	const variantPattern = new RegExp(
		`${escapeRegExp(entityPrefix)}\\d+:video_info:variants:\\d+"\\s*:\\$R\\[\\d+\\]\\s*=\\s*\\{[^{}]{0,600}?bitrate:(\\d+),content_type:"video\\/mp4",url:"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`,
		"g",
	);
	const variants: Array<{ url: string; bitrate: number }> = [];
	for (const match of html.matchAll(variantPattern)) {
		try {
			const url: unknown = JSON.parse(`"${match[2]}"`);
			const publicUrl = typeof url === "string" ? publicSocialMp4(url, "x", destinationUrl) : undefined;
			if (!publicUrl) continue;
			variants.push({ url: publicUrl, bitrate: Number(match[1]) });
		} catch {
			// X's hydrated state is an implementation detail and may change shape.
		}
	}
	const best = variants.sort((left, right) => right.bitrate - left.bitrate)[0];
	if (!best) return undefined;
	const dimensions = /\/vid\/[^/]+\/(\d+)x(\d+)\//.exec(new URL(best.url).pathname);
	return {
		url: best.url,
		width: positiveInteger(dimensions?.[1]),
		height: positiveInteger(dimensions?.[2]),
	};
}

function extractVideoMetadata(
	headHtml: string,
	fullHtml: string,
	destinationUrl: string,
): Pick<EmbedMetadata, "embedVideoUrl" | "embedVideoWidth" | "embedVideoHeight"> {
	const provider = socialProvider(destinationUrl);
	if (provider === "instagram" && primaryInstagramCarouselIsImage(fullHtml)) return {};
	const ogVideo = metaContent(headHtml, ["og:video:secure_url", "og:video"]);
	const ogVideoType = metaContent(headHtml, ["og:video:type"]);
	const embedded =
		provider === "instagram"
			? embeddedInstagramVideo(fullHtml, destinationUrl)
			: provider === "x"
				? embeddedXVideo(fullHtml, destinationUrl)
				: undefined;
	const directVideo = directHttpsMp4(ogVideo, destinationUrl, ogVideoType) ?? embedded?.url;
	if (!directVideo) return {};
	const width = positiveInteger(metaContent(headHtml, ["og:video:width"])) ?? embedded?.width;
	const height = positiveInteger(metaContent(headHtml, ["og:video:height"])) ?? embedded?.height;
	return {
		embedVideoUrl: directVideo,
		...(width ? { embedVideoWidth: width } : {}),
		...(height ? { embedVideoHeight: height } : {}),
	};
}

async function readPrefix(
	stream: ReadableStream<Uint8Array> | null,
	maxBytes: number,
): Promise<string> {
	if (!stream) {
		return "";
	}

	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let bytesRead = 0;
	let output = "";

	try {
		while (bytesRead < maxBytes) {
			const { done, value } = await reader.read();
			if (done || !value) {
				break;
			}

			const remaining = maxBytes - bytesRead;
			const chunk =
				value.byteLength > remaining ? value.slice(0, remaining) : value;
			bytesRead += chunk.byteLength;
			output += decoder.decode(chunk, { stream: bytesRead < maxBytes });
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	return output + decoder.decode();
}

export function extractEmbedMetadata(
	html: string,
	destinationUrl: string,
): Omit<EmbedMetadata, "metadataFetchedAt"> {
	const headHtml = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? html;
	const embedTitle = trimForMeta(
		metaContent(headHtml, ["og:title", "twitter:title"]) ??
			titleContent(headHtml),
		120,
	);
	const embedDescription = trimForMeta(
		metaContent(headHtml, [
			"og:description",
			"twitter:description",
			"description",
		]),
		240,
	);
	const embedImageUrl = resolveHttpsUrl(
		metaContent(headHtml, [
			"og:image:secure_url",
			"og:image",
			"twitter:image",
			"twitter:image:src",
		]),
		destinationUrl,
	);
	const embedSiteName = trimForMeta(
		metaContent(headHtml, ["og:site_name"]),
		80,
	);

	return {
		...(embedTitle ? { embedTitle } : {}),
		...(embedDescription ? { embedDescription } : {}),
		...(embedImageUrl ? { embedImageUrl } : {}),
		...extractVideoMetadata(headHtml, html, destinationUrl),
		...(embedSiteName ? { embedSiteName } : {}),
	};
}

export async function fetchTargetMetadata(
	destinationUrl: string,
): Promise<Partial<EmbedMetadata>> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		let fetchUrl = destinationUrl;
		let response: Response | undefined;
		for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
			if (!isPublicHttpsUrl(fetchUrl)) return {};
			response = await fetch(fetchUrl, {
				headers: {
					Accept: "text/html,application/xhtml+xml",
					"User-Agent": `AITSYS-Go/${buildInfo.version} (+${buildInfo.repository}; ${buildInfo.sha})`,
				},
				redirect: "manual",
				signal: controller.signal,
			});
			if (response.status < 300 || response.status >= 400) break;
			const location = response.headers.get("location");
			if (!location || redirects === MAX_REDIRECTS) return {};
			fetchUrl = new URL(location, fetchUrl).toString();
		}
		if (!response) return {};

		const contentType = response.headers.get("Content-Type") ?? "";
		if (!response.ok || !contentType.toLowerCase().includes("html")) {
			return {};
		}

		const html = await readPrefix(response.body, MAX_HTML_BYTES);
		const metadata = extractEmbedMetadata(html, fetchUrl);

		return Object.keys(metadata).length > 0
			? { ...metadata, metadataFetchedAt: new Date().toISOString() }
			: {};
	} catch {
		return {};
	} finally {
		clearTimeout(timeout);
	}
}
