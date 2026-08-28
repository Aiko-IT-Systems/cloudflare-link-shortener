import { ApiError, ApiSuccess } from "./types";
import { patchApiTimestamps } from "./timestamps";

export function jsonSuccess<T>(result: T, status = 200): Response {
	return Response.json(
		{
			success: true,
			result: patchApiTimestamps(result),
		} satisfies ApiSuccess<T>,
		{ status },
	);
}

export function jsonError(
	message: string,
	code: string,
	status: number,
): Response {
	return Response.json(
		{
			success: false,
			errors: [{ message, code }],
		} satisfies ApiError,
		{ status },
	);
}
