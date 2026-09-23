/**
 * Integration tests that drive the REAL validateRule handler with a mocked fetch.
 *
 * These are the regression tests that matter: the defect was that the handler decided
 * from the HTTP status alone and never read the 200 body, so every one of the "invalid"
 * cases below used to return success. No network and no API key are involved — fetch is
 * stubbed and SUBLIME_API_KEY is set to a dummy value.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSecurityTools } from "../src/tools/security-tools.js";

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };
type ToolHandler = (args: {
	name: string;
	source: string;
}) => Promise<ToolResult>;

/** Minimal McpServer stand-in that just captures registered handlers by name. */
function captureTools(): Map<string, ToolHandler> {
	const handlers = new Map<string, ToolHandler>();
	const fake = {
		registerTool(name: string, _config: unknown, handler: ToolHandler) {
			handlers.set(name, handler);
		},
	};
	registerSecurityTools(fake as unknown as McpServer);
	return handlers;
}

/** Build a JSON Response the way the platform returns one. */
function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

let validateRule: ToolHandler;
const originalKey = process.env.SUBLIME_API_KEY;

beforeEach(() => {
	process.env.SUBLIME_API_KEY = "test-key-not-real";
	const handler = captureTools().get("validateRule");
	if (!handler) throw new Error("validateRule was not registered");
	validateRule = handler;
});

afterEach(() => {
	vi.unstubAllGlobals();
	if (originalKey === undefined) {
		process.env.SUBLIME_API_KEY = undefined;
	} else {
		process.env.SUBLIME_API_KEY = originalKey;
	}
});

describe("validateRule with HTTP 200 + validation_error (the bug)", () => {
	it("reports an error for a rule with a syntax error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(200, {
					validation_error: "expected ')' but found EOF",
					diagnostics: [
						{
							range: { start: { line: 3, column: 10 } },
							message: "unclosed call to strings.icontains",
							severity: "error",
						},
					],
					functions: ["strings.icontains"],
					list: [],
				}),
			),
		);

		const result = await validateRule({
			name: "broken",
			source: 'type.inbound\nand strings.icontains(body.text, "urgent"',
		});

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Rule validation failed");
		expect(result.content[0].text).toContain("expected ')' but found EOF");
		// zero-based line 3 displayed one-based
		expect(result.content[0].text).toContain("line 4");
	});

	it("reports an error for non-MQL text", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(200, {
					validation_error: "parse error: unexpected input",
				}),
			),
		);

		const result = await validateRule({
			name: "garbage",
			source: "this is definitely not MQL at all {{{ ]]] &&& ???",
		});

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("parse error");
	});
});

describe("validateRule with a genuinely valid rule", () => {
	it("reports success and includes the resolved analysis", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(200, {
					functions: ["strings.icontains"],
					list: ["$org_domains"],
					is_org_dependent: true,
				}),
			),
		);

		const result = await validateRule({
			name: "good",
			source: "type.inbound",
		});

		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain("Rule successfully validated");
		expect(result.content[0].text).toContain("$org_domains");
	});

	it("surfaces non-fatal diagnostics without failing the rule", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(200, {
					diagnostics: [
						{ message: "this clause can never match", severity: "warning" },
					],
				}),
			),
		);

		const result = await validateRule({ name: "warn", source: "type.inbound" });

		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain("Rule successfully validated");
		expect(result.content[0].text).toContain("can never match");
	});
});

describe("validateRule defensive paths", () => {
	it("does not report success when the 200 body is unparseable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response("<html>gateway</html>", {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
			),
		);

		const result = await validateRule({ name: "x", source: "type.inbound" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("validity is unknown");
	});

	it("still surfaces a genuine API error status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(400, {
					error: {
						type: "invalid_request",
						message: "Invalid Input(s): Got '' for source (required field).",
					},
				}),
			),
		);

		const result = await validateRule({ name: "", source: "" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("invalid_request");
	});

	it("still handles the invalid_rule error type", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(422, {
					error: { type: "invalid_rule", message: "rule logic is unsound" },
				}),
			),
		);

		const result = await validateRule({ name: "x", source: "type.inbound" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Rule logic invalid");
	});
});
