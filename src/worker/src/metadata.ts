import { LinkRecord } from "./types";

type EmbedMetadata = Pick<
	LinkRecord,
	| "embedTitle"
	| "embedDescription"
	| "embedImageUrl"
	| "embedSiteName"
	| "metadataFetchedAt"
>;

const MAX_HTML_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 2500;

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
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'");
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
		...(embedSiteName ? { embedSiteName } : {}),
	};
}

export async function fetchTargetMetadata(
	destinationUrl: string,
): Promise<Partial<EmbedMetadata>> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(destinationUrl, {
			headers: {
				Accept: "text/html,application/xhtml+xml",
				"User-Agent": "AITSYS-Go/1.0 (+https://go.aitsys.dev/)",
			},
			signal: controller.signal,
		});

		const contentType = response.headers.get("Content-Type") ?? "";
		if (!response.ok || !contentType.toLowerCase().includes("html")) {
			return {};
		}

		const html = await readPrefix(response.body, MAX_HTML_BYTES);
		const metadata = extractEmbedMetadata(html, destinationUrl);

		return Object.keys(metadata).length > 0
			? { ...metadata, metadataFetchedAt: new Date().toISOString() }
			: {};
	} catch {
		return {};
	} finally {
		clearTimeout(timeout);
	}
}
