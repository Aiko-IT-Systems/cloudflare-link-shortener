import { buildInfo } from "./build-info";
import { EmbedMedia, LinkRecord } from "./types";
import { isPublicHttpsUrl } from "./validation";

type EmbedMetadata = Pick<
	LinkRecord,
	| "embedTitle"
	| "embedDescription"
	| "embedImageUrl"
	| "embedVideoUrl"
	| "embedVideoWidth"
	| "embedVideoHeight"
	| "embedMedia"
	| "embedSiteName"
	| "metadataFetchedAt"
	| "metadataVersion"
>;

// Instagram's public embedded video state can arrive hundreds of KiB after the
// document head. Keep this bounded and streamed rather than buffering an
// unbounded upstream response.
const MAX_HTML_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 2500;
const MAX_REDIRECTS = 3;
const MAX_EMBED_MEDIA = 10;
const MAX_MEDIA_URL_LENGTH = 2048;
const MAX_MEDIA_DESCRIPTION_LENGTH = 1024;
export const METADATA_EXTRACTOR_VERSION = 2;

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
	return value.replace(
		/&(?:amp|lt|gt|quot|#39|#x27|#\d+|#x[\da-f]+);/gi,
		(entity) => {
			const named = entities.get(entity.toLowerCase());
			if (named) return named;
			const raw = entity.slice(2, -1);
			const codePoint = raw[0]?.toLowerCase() === "x"
				? Number.parseInt(raw.slice(1), 16)
				: Number.parseInt(raw, 10);
			return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
				? String.fromCodePoint(codePoint)
				: entity;
		},
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
	return metaContents(headHtml, names)[0];
}

function metaContents(headHtml: string, names: string[]): string[] {
	const wanted = new Set(names.map((name) => name.toLowerCase()));
	const values: string[] = [];
	const metaPattern = /<meta\b[^>]*>/gi;
	let match: RegExpExecArray | null;

	while ((match = metaPattern.exec(headHtml)) !== null) {
		const attributes = attributesFor(match[0]);
		const name = attributes.get("property") ?? attributes.get("name");
		const content = attributes.get("content");

		if (name && content && wanted.has(name.toLowerCase())) values.push(content);
	}
	return values;
}

function titleContent(headHtml: string): string | undefined {
	const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(headHtml);
	return match ? decodeHtml(match[1]) : undefined;
}

function instagramTitle(value: string | undefined): string | undefined {
	if (!value) return undefined;
	// Instagram commonly appends a quoted caption to the title. Keep the account
	// identity as the compact heading and put that caption in the description.
	return /^(.+?\s+on Instagram):\s*["“]/i.exec(value)?.[1] ?? value;
}

function instagramCaption(value: string | undefined): string | undefined {
	if (!value) return undefined;
	// Public Instagram OG descriptions are typically "likes, comments - account
	// on date: \"caption\".". The caption is the visitor-useful part; the
	// engagement counters and date are neither a description nor stable metadata.
	return /:\s*["“]([\s\S]*?)["”]\.?(?:\s*)$/i.exec(value)?.[1] ?? value;
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

export function isInstagramUrl(destinationUrl: string): boolean {
	return socialProvider(destinationUrl) === "instagram";
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

function publicMediaUrl(value: string | undefined, destinationUrl: string): string | undefined {
	const resolved = resolveHttpsUrl(value, destinationUrl);
	return resolved && resolved.length <= MAX_MEDIA_URL_LENGTH && isPublicHttpsUrl(resolved)
		? resolved
		: undefined;
}

function mediaDescription(value: string | undefined): string | undefined {
	return trimForMeta(value, MAX_MEDIA_DESCRIPTION_LENGTH);
}

function mediaItem(
	kind: EmbedMedia["kind"],
	value: string | undefined,
	destinationUrl: string,
	options: Omit<EmbedMedia, "kind" | "url"> = {},
): EmbedMedia | undefined {
	const url =
		kind === "video"
			? directHttpsMp4(value, destinationUrl)
			: publicMediaUrl(value, destinationUrl);
	if (!url || url.length > MAX_MEDIA_URL_LENGTH || !isPublicHttpsUrl(url)) return undefined;
	return { kind, url, ...options };
}

function uniqueMedia(items: Iterable<EmbedMedia>): EmbedMedia[] {
	const seen = new Set<string>();
	const result: EmbedMedia[] = [];
	for (const item of items) {
		if (seen.has(item.url)) continue;
		seen.add(item.url);
		result.push(item);
		if (result.length === MAX_EMBED_MEDIA) break;
	}
	return result;
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
	const carousel = instagramCarousel(html);
	const first = carousel?.[0];
	return Boolean(first && first.media_type === 1);
}

function instagramCarousel(html: string): Array<Record<string, unknown>> | undefined {
	const marker = /"carousel_media"\s*:\s*\[/.exec(html);
	if (!marker || marker.index === undefined) return undefined;
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
				return Array.isArray(carousel)
					? carousel.filter(
						(item): item is Record<string, unknown> =>
							typeof item === "object" && item !== null,
					)
					: undefined;
			} catch {
				return undefined;
			}
		}
	}
	return undefined;
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

function instagramImage(item: Record<string, unknown>): string | undefined {
	if (typeof item.display_url === "string") return item.display_url;
	if (typeof item.image_url === "string") return item.image_url;
	const imageVersions = item.image_versions2;
	if (!imageVersions || typeof imageVersions !== "object") return undefined;
	const candidates = (imageVersions as { candidates?: unknown }).candidates;
	if (!Array.isArray(candidates)) return undefined;
	return candidates
		.filter((candidate): candidate is Record<string, unknown> => typeof candidate === "object" && candidate !== null)
		.map((candidate) => candidate.url)
		.find((url): url is string => typeof url === "string");
}

function instagramMedia(html: string, destinationUrl: string): EmbedMedia[] {
	const carousel = instagramCarousel(html);
	if (carousel) {
		return uniqueMedia(
			carousel.flatMap((item) => {
				const width = typeof item.original_width === "number" ? item.original_width : undefined;
				const height = typeof item.original_height === "number" ? item.original_height : undefined;
				if (item.media_type === 1)
					return [mediaItem("image", instagramImage(item), destinationUrl, { width, height })].filter(
						(value): value is EmbedMedia => Boolean(value),
					);
				const versions = item.video_versions;
				const video = Array.isArray(versions)
					? versions
							.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
							.map((value) => (typeof value.url === "string" ? publicSocialMp4(value.url, "instagram", destinationUrl) : undefined))
							.find((value): value is string => Boolean(value))
					: undefined;
				return [mediaItem("video", video, destinationUrl, { width, height })].filter(
					(value): value is EmbedMedia => Boolean(value),
				);
			}),
		);
	}

	const video = embeddedInstagramVideo(html, destinationUrl);
	return video
		? [
				{
					kind: "video",
					url: video.url,
					...(video.width ? { width: video.width } : {}),
					...(video.height ? { height: video.height } : {}),
				},
			]
		: [];
}

function xMedia(html: string, destinationUrl: string): EmbedMedia[] {
	let statusId: string | undefined;
	try {
		statusId = /^\/[^/]+\/status\/(\d+)\/?$/.exec(new URL(destinationUrl).pathname)?.[1];
	} catch {
		return [];
	}
	if (!statusId) return [];
	const entityPrefix = `client:${btoa(`Tweet:${statusId}`)}:media_entities2:`;
	const escapedPrefix = escapeRegExp(entityPrefix);
	const videos = new Map<number, Array<{ url: string; bitrate: number }>>();
	const variants = new RegExp(
		`${escapedPrefix}(\\d+):video_info:variants:\\d+"\\s*:\\$R\\[\\d+\\]\\s*=\\s*\\{[^{}]{0,600}?bitrate:(\\d+),content_type:"video\\/mp4",url:"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`,
		"g",
	);
	for (const match of html.matchAll(variants)) {
		try {
			const url: unknown = JSON.parse(`"${match[3]}"`);
			const publicUrl = typeof url === "string" ? publicSocialMp4(url, "x", destinationUrl) : undefined;
			if (!publicUrl) continue;
			const index = Number(match[1]);
			const values = videos.get(index) ?? [];
			values.push({ url: publicUrl, bitrate: Number(match[2]) });
			videos.set(index, values);
		} catch {
			// X's hydrated state is an implementation detail and may change shape.
		}
	}
	const images = new Map<number, string>();
	const imagePattern = new RegExp(
		`${escapedPrefix}(\\d+)"\\s*:\\$R\\[\\d+\\]\\s*=\\s*\\{[^{}]{0,1200}?type:"photo"[^{}]{0,1200}?(?:media_url_https|media_url):"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`,
		"g",
	);
	for (const match of html.matchAll(imagePattern)) {
		try {
			const url: unknown = JSON.parse(`"${match[2]}"`);
			const publicUrl = typeof url === "string" ? publicMediaUrl(url, destinationUrl) : undefined;
			if (publicUrl) images.set(Number(match[1]), publicUrl);
		} catch {
			// Ignore malformed hydrated image records.
		}
	}
	return uniqueMedia(
		[...new Set([...videos.keys(), ...images.keys()])]
			.sort((left, right) => left - right)
			.flatMap<EmbedMedia>((index) => {
				const image = images.get(index);
				if (image) return [{ kind: "image" as const, url: image }];
				const best = videos.get(index)?.sort((left, right) => right.bitrate - left.bitrate)[0];
				if (!best) return [];
				const dimensions = /\/vid\/[^/]+\/(\d+)x(\d+)\//.exec(new URL(best.url).pathname);
				return [{
					kind: "video" as const,
					url: best.url,
					...(positiveInteger(dimensions?.[1]) ? { width: positiveInteger(dimensions?.[1]) } : {}),
					...(positiveInteger(dimensions?.[2]) ? { height: positiveInteger(dimensions?.[2]) } : {}),
				}];
			}),
	);
}

function openGraphMedia(headHtml: string, destinationUrl: string): EmbedMedia[] {
	const description = mediaDescription(metaContent(headHtml, ["og:image:alt", "twitter:image:alt"]));
	const imageWidth = positiveInteger(metaContent(headHtml, ["og:image:width"]));
	const imageHeight = positiveInteger(metaContent(headHtml, ["og:image:height"]));
	const images = metaContents(headHtml, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"])
		.map((url) => mediaItem("image", url, destinationUrl, { width: imageWidth, height: imageHeight, description }))
		.filter((value): value is EmbedMedia => Boolean(value));
	const videos = metaContents(headHtml, ["og:video:secure_url", "og:video"])
		.map((url) => mediaItem("video", url, destinationUrl, {
			width: positiveInteger(metaContent(headHtml, ["og:video:width"])),
			height: positiveInteger(metaContent(headHtml, ["og:video:height"])),
		}))
		.filter((value): value is EmbedMedia => Boolean(value));
	return uniqueMedia([...images, ...videos]);
}

function extractEmbedMedia(headHtml: string, fullHtml: string, destinationUrl: string): EmbedMedia[] {
	const provider = socialProvider(destinationUrl);
	const providerMedia = provider === "instagram"
		? instagramMedia(fullHtml, destinationUrl)
		: provider === "x"
			? xMedia(fullHtml, destinationUrl)
			: [];
	return uniqueMedia([...providerMedia, ...openGraphMedia(headHtml, destinationUrl)]);
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
	const embedMedia = extractEmbedMedia(headHtml, html, destinationUrl);
	const provider = socialProvider(destinationUrl);
	const rawTitle =
		metaContent(headHtml, ["og:title", "twitter:title"]) ?? titleContent(headHtml);
	const rawDescription = metaContent(headHtml, [
		"og:description",
		"twitter:description",
		"description",
	]);
	const embedTitle = trimForMeta(
		provider === "instagram" ? instagramTitle(rawTitle) : rawTitle,
		120,
	);
	const embedDescription = trimForMeta(
		provider === "instagram" ? instagramCaption(rawDescription) : rawDescription,
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

	const videoMetadata = extractVideoMetadata(headHtml, html, destinationUrl);
	const primaryImage = embedImageUrl ?? embedMedia.find((item) => item.kind === "image")?.url;
	const primaryVideo =
		socialProvider(destinationUrl) === "instagram" && primaryInstagramCarouselIsImage(html)
			? undefined
			: embedMedia.find((item) => item.kind === "video");
	return {
		...(embedTitle ? { embedTitle } : {}),
		...(embedDescription ? { embedDescription } : {}),
		...(primaryImage ? { embedImageUrl: primaryImage } : {}),
		...(videoMetadata.embedVideoUrl
			? videoMetadata
			: primaryVideo
				? {
					embedVideoUrl: primaryVideo.url,
					...(primaryVideo.width ? { embedVideoWidth: primaryVideo.width } : {}),
					...(primaryVideo.height ? { embedVideoHeight: primaryVideo.height } : {}),
				  }
				: videoMetadata),
		...(embedMedia.length ? { embedMedia } : {}),
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
			? {
					...metadata,
					metadataFetchedAt: new Date().toISOString(),
					metadataVersion: METADATA_EXTRACTOR_VERSION,
				}
			: {};
	} catch {
		return {};
	} finally {
		clearTimeout(timeout);
	}
}
