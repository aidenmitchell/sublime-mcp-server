import type { ApiErrorResponse } from "./types.js";

/** Standard MCP tool result content type */
type ToolContent = { type: "text"; text: string };
type ToolResult = { isError?: boolean; content: ToolContent[] };

/** Create an error tool result with the given message */
export function errorResult(text: string): ToolResult {
	return {
		isError: true,
		content: [{ type: "text" as const, text }],
	};
}

/** Create a success tool result with JSON-stringified data */
export function successResult(data: unknown): ToolResult {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data) }],
	};
}

/** Create a success tool result with a plain text message */
export function textResult(text: string): ToolResult {
	return {
		content: [{ type: "text" as const, text }],
	};
}

/** Wrap a tool handler with standard error catching */
export function wrapProcessingError(error: unknown): ToolResult {
	const errorMessage = error instanceof Error ? error.message : String(error);
	return errorResult(
		`ProcessingError: Error occurred while processing the request: ${errorMessage}`,
	);
}

/** Check for redirect responses and return an error result if detected */
export function checkRedirect(response: Response): ToolResult | null {
	if (
		response.status === 301 ||
		response.status === 302 ||
		response.status === 307 ||
		response.status === 308
	) {
		const redirectUrl = response.headers.get("location");
		return errorResult(
			`RedirectError: API redirected to ${redirectUrl} which was not expected`,
		);
	}
	return null;
}

/** Check that the response has JSON content-type, return error result if not */
export async function checkJsonContentType(
	response: Response,
): Promise<ToolResult | null> {
	if (!response.headers.get("content-type")?.includes("application/json")) {
		const text = await response.text();
		return errorResult(
			`InvalidResponseError: API returned non-JSON response: ${text.substring(0, 200)}... (Status: ${response.status})`,
		);
	}
	return null;
}

/** Check response status and return a formatted API error if not ok */
export async function checkApiError(
	response: Response,
	context: string,
): Promise<ToolResult | null> {
	if (!response.ok) {
		const result = (await response.json()) as ApiErrorResponse;
		return errorResult(
			`ApiError (${response.status}): ${result.error?.type || "Unknown"} - ${result.error?.message || `Unknown error occurred ${context}`}`,
		);
	}
	return null;
}

/**
 * Validate a JSON API response: check for redirects, JSON content-type, and HTTP errors.
 * Returns an error ToolResult if any check fails, or null if everything is ok.
 */
export async function validateApiResponse(
	response: Response,
	context: string,
): Promise<ToolResult | null> {
	const redirectError = checkRedirect(response);
	if (redirectError) return redirectError;

	const contentTypeError = await checkJsonContentType(response);
	if (contentTypeError) return contentTypeError;

	const apiError = await checkApiError(response, context);
	if (apiError) return apiError;

	return null;
}
