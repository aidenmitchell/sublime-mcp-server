/**
 * Retrieve the Sublime API key from the environment.
 *
 * The key is read from `SUBLIME_API_KEY` and used only to build the outbound
 * `Authorization: Bearer` header for Sublime API calls. It is never logged,
 * cached, or persisted.
 */
export function getApiKey(): string {
	const key = process.env.SUBLIME_API_KEY;
	if (!key) {
		throw new Error(
			"SUBLIME_API_KEY environment variable is not set. Set it in your MCP client config (e.g. Claude Desktop) or shell before starting the server.",
		);
	}
	return key;
}
