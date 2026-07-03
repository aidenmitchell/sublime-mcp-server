#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/**
 * Entry point for the standalone (stdio) Sublime Security MCP server.
 *
 * Runs over stdio so it can be spawned by any MCP client (Claude Desktop,
 * Claude Code, etc.). The Sublime API key is read from the SUBLIME_API_KEY
 * environment variable — see src/auth.ts.
 */
async function main(): Promise<void> {
	const server = createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	// The process stays alive while stdin is open; the transport handles the
	// request/response loop. Nothing further to do here.
}

main().catch((error) => {
	// Log to stderr — stdout is reserved for the MCP protocol stream.
	console.error("Fatal error starting Sublime MCP server:", error);
	process.exit(1);
});
