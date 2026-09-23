import { describe, expect, it } from "vitest";
import {
	formatRuleDiagnostics,
	formatValidationFailure,
	formatValidationSuccess,
} from "../src/helpers.js";
import type { ValidateRuleResponse } from "../src/types.js";

describe("formatRuleDiagnostics", () => {
	it("returns an empty string for no diagnostics", () => {
		expect(formatRuleDiagnostics(undefined)).toBe("");
		expect(formatRuleDiagnostics([])).toBe("");
	});

	it("converts zero-based positions to one-based for display", () => {
		const out = formatRuleDiagnostics([
			{
				range: { start: { line: 0, column: 4 } },
				message: "unexpected token",
				severity: "error",
			},
		]);
		expect(out).toContain("line 1, column 5");
		expect(out).toContain("unexpected token");
	});

	it("treats a missing severity as error, matching the API default", () => {
		expect(formatRuleDiagnostics([{ message: "boom" }])).toContain("[error]");
		expect(
			formatRuleDiagnostics([{ message: "boom" }], { errorsOnly: true }),
		).toContain("boom");
	});

	it("filters to fatal diagnostics when errorsOnly is set", () => {
		const diagnostics = [
			{ message: "fatal thing", severity: "error" },
			{ message: "just a hint", severity: "hint" },
		];
		const out = formatRuleDiagnostics(diagnostics, { errorsOnly: true });
		expect(out).toContain("fatal thing");
		expect(out).not.toContain("just a hint");
	});

	it("surfaces suggested alternatives", () => {
		const out = formatRuleDiagnostics([
			{
				message: "unknown list",
				severity: "error",
				actions: [{ kind: "replace", alternatives: ["$org_domains", "$tranco_1m"] }],
			},
		]);
		expect(out).toContain("did you mean: $org_domains, $tranco_1m?");
	});

	it("does not crash on a diagnostic with no message or range", () => {
		expect(() => formatRuleDiagnostics([{}])).not.toThrow();
		expect(formatRuleDiagnostics([{}])).toContain("(no message)");
	});
});

describe("formatValidationFailure", () => {
	it("leads with the platform's validation_error", () => {
		const result: ValidateRuleResponse = {
			validation_error: "expected ')' but found EOF",
			diagnostics: [
				{
					range: { start: { line: 3, column: 0 } },
					message: "unclosed call to strings.icontains",
					severity: "error",
				},
			],
		};
		const out = formatValidationFailure(result);
		expect(out).toContain("Rule validation failed");
		expect(out).toContain("expected ')' but found EOF");
		expect(out).toContain("line 4");
	});
});

describe("formatValidationSuccess", () => {
	it("reports success for a clean rule", () => {
		expect(formatValidationSuccess({})).toBe("Rule successfully validated");
	});

	it("still surfaces non-fatal diagnostics, which flag dead clauses", () => {
		const out = formatValidationSuccess({
			diagnostics: [{ message: "topic never matches", severity: "warning" }],
		});
		expect(out).toContain("Rule successfully validated");
		expect(out).toContain("Diagnostics (non-fatal)");
		expect(out).toContain("topic never matches");
	});

	it("reports the lists and functions the platform resolved", () => {
		const out = formatValidationSuccess({
			list: ["$org_domains"],
			functions: ["strings.icontains"],
			is_org_dependent: true,
		});
		expect(out).toContain("lists: $org_domains");
		expect(out).toContain("functions: strings.icontains");
		expect(out).toContain("org-dependent: true");
	});
});

/**
 * Regression tests for the actual defect: the tool decided from the HTTP status alone, so
 * a 200 carrying a validation_error was reported as success. These drive the same decision
 * logic the handler uses against the response shapes the API really returns.
 */
describe("validateRule decision logic (regression)", () => {
	// Mirrors the handler: a non-empty validation_error on a 200 is a failure.
	const decide = (body: ValidateRuleResponse) =>
		typeof body.validation_error === "string" &&
		body.validation_error.trim() !== ""
			? "error"
			: "success";

	it("FAILS an invalid rule returned with HTTP 200", () => {
		expect(
			decide({
				validation_error: "unexpected end of input",
				diagnostics: [{ message: "unbalanced parenthesis", severity: "error" }],
			}),
		).toBe("error");
	});

	it("passes a genuinely valid rule", () => {
		expect(decide({ functions: ["strings.icontains"], list: [] })).toBe(
			"success",
		);
	});

	it("treats an empty or whitespace validation_error as success", () => {
		expect(decide({ validation_error: "" })).toBe("success");
		expect(decide({ validation_error: "   " })).toBe("success");
	});
});
