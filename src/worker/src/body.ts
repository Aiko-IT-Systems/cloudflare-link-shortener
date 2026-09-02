export class RequestBodyTooLargeError extends Error {
	constructor(readonly limit: number) {
		super(`Request body exceeds the ${limit}-byte limit.`);
	}
}

function declaredBodyLength(request: Request): number | undefined {
	const value = request.headers.get("content-length")?.trim();
	if (!value || !/^\d+$/.test(value)) return undefined;
	const length = Number(value);
	return Number.isSafeInteger(length) ? length : undefined;
}

/** Read a small request body without trusting Content-Length to be present. */
export async function readLimitedBody(
	request: Request,
	limit: number,
): Promise<Uint8Array> {
	const declaredLength = declaredBodyLength(request);
	if (declaredLength !== undefined && declaredLength > limit)
		throw new RequestBodyTooLargeError(limit);
	if (!request.body) return new Uint8Array();

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			length += value.byteLength;
			if (length > limit) throw new RequestBodyTooLargeError(limit);
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	const body = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

export async function readLimitedJson(
	request: Request,
	limit: number,
): Promise<unknown> {
	return JSON.parse(new TextDecoder().decode(await readLimitedBody(request, limit)));
}

export async function readLimitedFormValue(
	request: Request,
	name: string,
	limit: number,
): Promise<string | undefined> {
	const contentType = request.headers.get("content-type")?.split(";", 1)[0]
		?.trim()
		.toLowerCase();
	if (contentType !== "application/x-www-form-urlencoded") return undefined;
	const text = new TextDecoder().decode(await readLimitedBody(request, limit));
	return new URLSearchParams(text).get(name) ?? undefined;
}
