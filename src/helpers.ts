import type { SourceDiagnostic, ValidateRuleResponse } from "./types.js";

// Define interface for MDM data structure
export interface MdmData {
	data_model?: {
		headers?: {
			hops?: unknown;
		};
		mailbox?: unknown;
		attachments?: Array<{
			raw?: unknown;
			[key: string]: unknown;
		}>;
		body?: {
			html?: unknown;
			links?: Array<{
				href_url?: {
					url?: string;
					query_params?: string;
					[key: string]: unknown;
				};
				[key: string]: unknown;
			}>;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	previews?: unknown;
	flagged_rules?: Array<Record<string, unknown>>;
	[key: string]: unknown;
}

// URL analysis result structure
export interface UrlAnalysisResult {
	screenshot?: unknown;
	final_dom?: Record<string, unknown>;
	[key: string]: unknown;
}

/** Diagnostics the platform considers fatal. Absent severity defaults to "error". */
function isErrorSeverity(severity: string | undefined): boolean {
	return (severity ?? "error").toLowerCase() === "error";
}

/**
 * Render one diagnostic as a single readable line.
 *
 * Positions arrive zero-based from the API; they are shown one-based here so they line up
 * with what an editor reports.
 */
function formatDiagnostic(diagnostic: SourceDiagnostic): string {
	const severity = (diagnostic.severity ?? "error").toLowerCase();
	const line = diagnostic.range?.start?.line;
	const column = diagnostic.range?.start?.column;
	const where =
		typeof line === "number"
			? ` at line ${line + 1}${typeof column === "number" ? `, column ${column + 1}` : ""}`
			: "";
	const message = diagnostic.message?.trim() || "(no message)";

	const alternatives = (diagnostic.actions ?? [])
		.flatMap((action) => action.alternatives ?? [])
		.filter((alternative) => alternative.length > 0);
	const suggestion =
		alternatives.length > 0 ? ` — did you mean: ${alternatives.join(", ")}?` : "";

	return `[${severity}]${where}: ${message}${suggestion}`;
}

/**
 * Format diagnostics for display, optionally limited to fatal ones.
 *
 * Returns an empty string when there is nothing to show, so callers can append it
 * unconditionally.
 */
export function formatRuleDiagnostics(
	diagnostics: SourceDiagnostic[] | undefined,
	options: { errorsOnly?: boolean } = {},
): string {
	const selected = (diagnostics ?? []).filter((diagnostic) =>
		options.errorsOnly ? isErrorSeverity(diagnostic.severity) : true,
	);
	if (selected.length === 0) return "";
	return selected
		.map((diagnostic) => `  ${formatDiagnostic(diagnostic)}`)
		.join("\n");
}

/**
 * Build the tool output for a rule that validated cleanly.
 *
 * Non-fatal diagnostics are surfaced rather than dropped: a warning or hint is the only
 * signal that a clause is dead, which validation alone will never report as an error.
 */
export function formatValidationSuccess(
	result: ValidateRuleResponse,
): string {
	const parts = ["Rule successfully validated"];

	const advisories = (result.diagnostics ?? []).filter(
		(diagnostic) => !isErrorSeverity(diagnostic.severity),
	);
	if (advisories.length > 0) {
		parts.push(
			`\nDiagnostics (non-fatal):\n${formatRuleDiagnostics(advisories)}`,
		);
	}

	const lists = result.list ?? [];
	const functions = result.functions ?? [];
	const facts: string[] = [];
	if (lists.length > 0) facts.push(`lists: ${lists.join(", ")}`);
	if (functions.length > 0) facts.push(`functions: ${functions.join(", ")}`);
	if (result.is_org_dependent !== undefined) {
		facts.push(`org-dependent: ${result.is_org_dependent}`);
	}
	if (facts.length > 0) parts.push(`\nAnalysis — ${facts.join(" | ")}`);

	return parts.join("\n");
}

/** Build the tool output for a rule the platform rejected. */
export function formatValidationFailure(
	result: ValidateRuleResponse,
): string {
	const parts = [`Rule validation failed: ${result.validation_error}`];
	const errors = formatRuleDiagnostics(result.diagnostics, {
		errorsOnly: true,
	});
	if (errors) parts.push(`\nDiagnostics:\n${errors}`);
	return parts.join("\n");
}

/** Build standard request headers for Sublime API calls. */
export function getApiHeaders(apiKey: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		Accept: "application/json",
		"User-Agent": "SublimeMCPWorker/1.0",
		Authorization: `Bearer ${apiKey}`,
	};
}

/** Merge multiple ML query results into a single object under a named key. */
export function mergeQueryResults(
	queryResults: Array<{ result?: Record<string, unknown> }>,
	name: string,
): { [key: string]: Record<string, unknown> } {
	const mergedResult: { [key: string]: Record<string, unknown> } = {
		[name]: {},
	};

	for (const queryResult of queryResults) {
		if (queryResult.result) {
			for (const [key, value] of Object.entries(queryResult.result)) {
				if (key !== "success") {
					mergedResult[name][key] = value;
				}
			}
		}
	}

	return mergedResult;
}

/** Filter MDM data to reduce token usage: remove hops, mailbox, attachment raw, truncate HTML, simplify links. */
export function filterMdmData(mdmData: MdmData): MdmData {
	// Keep only allowed fields at the root level
	const allowedFields = new Set([
		"attack_score_verdict",
		"data_model",
		"flagged_rules",
	]);
	for (const key of Object.keys(mdmData)) {
		if (!allowedFields.has(key)) {
			mdmData[key] = undefined;
		}
	}

	// Replace HTML body with truncated indicator
	if (
		mdmData?.data_model?.body?.html &&
		typeof mdmData.data_model.body.html === "object"
	) {
		mdmData.data_model.body.html = {
			message: "truncated - use fetchMessageHtml command",
		};
	}

	// Remove headers.hops if it exists
	if (mdmData?.data_model?.headers?.hops) {
		mdmData.data_model.headers.hops = undefined;
	}

	// Remove mailbox if it exists
	if (mdmData?.data_model?.mailbox) {
		mdmData.data_model.mailbox = undefined;
	}

	// Remove raw property from each attachment if attachments exist
	if (
		mdmData?.data_model?.attachments &&
		Array.isArray(mdmData.data_model.attachments)
	) {
		for (const attachment of mdmData.data_model.attachments) {
			if (attachment?.raw) {
				attachment.raw = undefined;
			}
		}
	}

	// Keep only the url field from href_url for all links
	if (
		mdmData?.data_model?.body?.links &&
		Array.isArray(mdmData.data_model.body.links)
	) {
		for (const link of mdmData.data_model.body.links) {
			if (link?.href_url) {
				const url = link.href_url.url;
				link.href_url = { url };
			}
		}
	}

	return mdmData;
}

/** Filter flagged_rules to keep only public detection rules (null created_by_org_name, no created_from_open_prs tag). */
export function filterFlaggedRules(
	rules: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
	const filtered: Array<Record<string, unknown>> = [];

	for (const rule of rules) {
		const meta = rule.rule_meta as Record<string, unknown> | undefined;
		const tags = meta?.tags as string[] | undefined;

		if (
			rule.sqar_type !== "detection_rule" ||
			meta?.created_by_org_name !== null ||
			tags?.includes("created_from_open_prs")
		) {
			continue;
		}

		filtered.push({
			...rule,
			rule_meta: meta
				? { name: meta.name, description: meta.description }
				: rule.rule_meta,
		});
	}

	return filtered;
}

/** Filter URL analysis result to remove large fields (screenshot, display_text, inner_text, links). */
export function filterUrlAnalysisResult(
	result: UrlAnalysisResult,
): UrlAnalysisResult {
	if (result?.screenshot) {
		result.screenshot = undefined;
	}

	if (result?.final_dom?.display_text) {
		result.final_dom.display_text = undefined;
	}

	if (result?.final_dom?.inner_text) {
		result.final_dom.inner_text = undefined;
	}

	if (result?.final_dom?.links) {
		result.final_dom.links = undefined;
	}

	return result;
}

/** Filter hunt job details to keep only essential fields. */
export function filterHuntJobDetails(
	details: Record<string, unknown>,
): Record<string, unknown> {
	return {
		id: details.id,
		status: details.status,
		error: details.error,
		range_start_time: details.range_start_time,
		range_end_time: details.range_end_time,
	};
}

/** Transform hunt result message groups to simplified tuples of {id, subject, sender_email}. */
export function transformHuntMessageGroups(
	messageGroups: Array<Record<string, unknown>>,
): Array<{ id: unknown; subject: string | null; sender_email: string | null }> {
	return messageGroups.map((group) => {
		const messages = group.messages as
			| Array<Record<string, unknown>>
			| undefined;
		const firstMessage = messages?.[0];
		return {
			id: group.id,
			subject: (firstMessage?.subject as string) || null,
			sender_email:
				((firstMessage?.sender as Record<string, unknown>)?.email as string) ||
				null,
		};
	});
}
