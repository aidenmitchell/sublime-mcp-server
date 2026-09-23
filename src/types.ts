// Define common error response structure
export interface ApiErrorResponse {
	error?: {
		type?: string;
		message?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

/**
 * Rule validation response from POST /v1/rules/validate.
 *
 * That route answers **HTTP 200 even when the rule is invalid** — the verdict lives in
 * `validation_error`, not in the status code. Reading only the status is therefore
 * indistinguishable from performing no validation at all. Every field is optional and
 * handled defensively: this is an external API shape, not ours.
 */
export interface SourcePosition {
	/** Zero-based line number in the MQL source. */
	line?: number;
	/** Zero-based column number in the MQL source. */
	column?: number;
}

export interface SourceRange {
	start?: SourcePosition;
	end?: SourcePosition;
}

export interface SourceAction {
	kind?: string;
	replacement_text?: string;
	alternatives?: string[];
}

/** Severity as emitted by the platform. Absent means "error" — that is the API default. */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface SourceDiagnostic {
	range?: SourceRange;
	message?: string;
	severity?: DiagnosticSeverity | string;
	tags?: string[];
	source?: string;
	actions?: SourceAction[];
}

export interface ValidateRuleResponse {
	/** Non-empty when the rule failed validation. Empty or absent means it passed. */
	validation_error?: string;
	diagnostics?: SourceDiagnostic[];
	/** Function names found in the rule. */
	functions?: string[];
	/** Named lists found in the rule. Note the singular JSON key. */
	list?: string[];
	/** Whether the rule uses org-specific fields, lists, or functions. */
	is_org_dependent?: boolean;
	[key: string]: unknown;
}

// Message groups response structure
export interface MessageGroupsResponse {
	message_groups?: Array<{
		messages?: Array<{
			id: string;
			[key: string]: unknown;
		}>;
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
}

// Hunt job details and results
export interface HuntJobDetails {
	source?: unknown;
	[key: string]: unknown;
}

export interface HuntJobResults {
	[key: string]: unknown;
}
