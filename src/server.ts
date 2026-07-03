import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessageTools } from "./tools/message-tools.js";
import { registerSecurityTools } from "./tools/security-tools.js";

/**
 * Create the Sublime Security MCP server with all tools registered.
 *
 * A single instance is created for the lifetime of the (stdio) process and
 * connected to the transport exactly once.
 */
export function createServer(): McpServer {
	const server = new McpServer({
		name: "Sublime Security MCP Server",
		version: "1.0.0",
	});

	registerMessageTools(server);
	registerSecurityTools(server);

	return server;
}
