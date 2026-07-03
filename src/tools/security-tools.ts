import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	checkRedirect,
	errorResult,
	successResult,
	textResult,
	validateApiResponse,
	wrapProcessingError,
} from "../api-utils.js";
import { getApiKey } from "../auth.js";
import {
	filterHuntJobDetails,
	filterUrlAnalysisResult,
	getApiHeaders,
	transformHuntMessageGroups,
	type UrlAnalysisResult,
} from "../helpers.js";
import type { ApiErrorResponse, HuntJobDetails } from "../types.js";

export function registerSecurityTools(server: McpServer): void {
	// Validate Rule tool
	server.registerTool(
		"validateRule",
		{
			description:
				"Validate a detection rule's syntax and logic without deploying it.",
			inputSchema: {
				name: z.string().describe("The name of the rule to validate"),
				source: z.string().describe("The MQL source code of the rule"),
			},
		},
		async ({ name, source }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				const response = await fetch(
					"https://api.platform.sublimesecurity.com/v1/rules/validate",
					{
						method: "POST",
						headers,
						body: JSON.stringify({ name, source }),
						redirect: "manual",
					},
				);

				// Check redirects first
				const redirectError = checkRedirect(response);
				if (redirectError) return redirectError;

				// Special handling for invalid_rule before generic validation
				if (
					!response.ok &&
					response.headers.get("content-type")?.includes("application/json")
				) {
					const result = (await response.json()) as ApiErrorResponse;
					if (result.error?.type === "invalid_rule") {
						return errorResult(`Rule logic invalid: ${result.error?.message}`);
					}
					return errorResult(
						`ApiError (${response.status}): ${result.error?.type || "Unknown"} - ${result.error?.message || "Unknown error occurred during validation"}`,
					);
				}

				const validationError = await validateApiResponse(
					response,
					"during validation",
				);
				if (validationError) return validationError;

				return textResult("Rule successfully validated");
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Analyze URL tool
	server.registerTool(
		"analyzeUrl",
		{
			description:
				"Perform link analysis on a URL, including screenshot, DOM analysis, and threat detection.",
			inputSchema: {
				url: z.string().describe("The URL to analyze"),
			},
		},
		async ({ url }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				const response = await fetch(
					"https://platform.sublime.security/v0/enrichment/link_analysis/evaluate",
					{
						method: "POST",
						headers,
						body: JSON.stringify({ url }),
						redirect: "manual",
					},
				);

				const validationError = await validateApiResponse(
					response,
					"during link analysis",
				);
				if (validationError) return validationError;

				const result = (await response.json()) as UrlAnalysisResult;
				filterUrlAnalysisResult(result);

				return successResult(result);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Start Hunt tool
	server.registerTool(
		"startHunt",
		{
			description:
				"Start a retroactive hunt job to search historical messages using MQL rules within a specified time range.",
			inputSchema: {
				name: z.string().describe("The name of the hunt job"),
				source: z.string().describe("The MQL rule source code to hunt with"),
				rangeStartTime: z
					.string()
					.describe(
						"Start time in ISO 8601 format (e.g., '2024-01-01T00:00:00Z')",
					),
				rangeEndTime: z
					.string()
					.describe(
						"End time in ISO 8601 format (e.g., '2024-01-31T23:59:59Z')",
					),
				private: z
					.boolean()
					.optional()
					.describe(
						"Mark the hunt as private to hide it from the hunts list (default: false)",
					),
			},
		},
		async ({
			name,
			source,
			rangeStartTime,
			rangeEndTime,
			private: isPrivate,
		}) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				const response = await fetch(
					"https://platform.sublime.security/v1/hunt-jobs",
					{
						method: "POST",
						headers,
						body: JSON.stringify({
							private: isPrivate ?? false,
							name,
							source,
							range_start_time: rangeStartTime,
							range_end_time: rangeEndTime,
						}),
						redirect: "manual",
					},
				);

				const validationError = await validateApiResponse(
					response,
					"during hunt job creation",
				);
				if (validationError) return validationError;

				const result = await response.json();
				return successResult(result);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Get Hunt Results tool
	server.registerTool(
		"getHuntResults",
		{
			description:
				"Retrieve the results and status of a previously started hunt job. Supports pagination via offset/limit, or set fetchAll=true to retrieve all results (auto-pages through the full result set).",
			inputSchema: {
				huntId: z
					.string()
					.describe("The ID of the hunt job to retrieve results for"),
				offset: z
					.number()
					.optional()
					.describe(
						"Number of results to skip (default: 0). Ignored if fetchAll is true.",
					),
				limit: z
					.number()
					.optional()
					.describe(
						"Maximum number of results to return per page (default: 50, max: 500). Ignored if fetchAll is true.",
					),
				fetchAll: z
					.boolean()
					.optional()
					.describe(
						"If true, automatically pages through all results and returns them combined. May be slow for large result sets.",
					),
			},
		},
		async ({ huntId, offset, limit, fetchAll }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				// Fetch the hunt job details
				const detailsResponse = await fetch(
					`https://platform.sublime.security/v0/hunt-jobs/${huntId}`,
					{
						method: "GET",
						headers,
						redirect: "manual",
					},
				);

				const detailsError = await validateApiResponse(
					detailsResponse,
					"while fetching hunt details",
				);
				if (detailsError) return detailsError;

				const huntDetails = (await detailsResponse.json()) as HuntJobDetails;
				if (huntDetails.source) {
					huntDetails.source = undefined;
				}

				// Fetch hunt results with pagination
				// API supports: limit (max 500), offset (zero-based)
				// Response includes: message_groups[], total_group_count
				let allMessageGroups: Array<Record<string, unknown>> = [];
				let totalGroupCount = 0;

				if (fetchAll) {
					// Auto-page through all results using max page size
					const pageSize = 500;
					let currentOffset = 0;
					let hasMore = true;

					while (hasMore) {
						const params = new URLSearchParams({
							offset: String(currentOffset),
							limit: String(pageSize),
						});
						const pageResponse = await fetch(
							`https://platform.sublime.security/v0/hunt-jobs/${huntId}/results?${params}`,
							{ method: "GET", headers, redirect: "manual" },
						);

						const pageError = await validateApiResponse(
							pageResponse,
							`while fetching hunt results (offset=${currentOffset})`,
						);
						if (pageError) return pageError;

						const pageData = (await pageResponse.json()) as Record<
							string,
							unknown
						>;
						const groups =
							(pageData.message_groups as Array<Record<string, unknown>>) ?? [];
						totalGroupCount =
							(pageData.total_group_count as number) ?? totalGroupCount;

						allMessageGroups.push(...groups);
						currentOffset += groups.length;

						// Stop if we've fetched everything
						if (groups.length < pageSize || currentOffset >= totalGroupCount) {
							hasMore = false;
						}

						// Safety cap at 5000 results
						if (currentOffset >= 5000) {
							hasMore = false;
						}
					}
				} else {
					// Single page fetch with offset/limit
					const params = new URLSearchParams();
					if (offset !== undefined) params.set("offset", String(offset));
					if (limit !== undefined)
						params.set("limit", String(Math.min(limit, 500)));

					const queryString = params.toString();
					const url = `https://platform.sublime.security/v0/hunt-jobs/${huntId}/results${queryString ? `?${queryString}` : ""}`;

					const resultsResponse = await fetch(url, {
						method: "GET",
						headers,
						redirect: "manual",
					});

					const resultsError = await validateApiResponse(
						resultsResponse,
						"while fetching hunt results",
					);
					if (resultsError) return resultsError;

					const huntResults = (await resultsResponse.json()) as Record<
						string,
						unknown
					>;
					allMessageGroups =
						(huntResults.message_groups as Array<Record<string, unknown>>) ??
						[];
					totalGroupCount =
						(huntResults.total_group_count as number) ??
						allMessageGroups.length;
				}

				const filteredDetails = filterHuntJobDetails(
					huntDetails as Record<string, unknown>,
				);

				const filteredData = {
					...filteredDetails,
					total_group_count: totalGroupCount,
					pagination: {
						offset: fetchAll ? 0 : (offset ?? 0),
						limit: fetchAll ? allMessageGroups.length : (limit ?? 50),
						returned: allMessageGroups.length,
						has_more:
							!fetchAll &&
							(offset ?? 0) + allMessageGroups.length < totalGroupCount,
						fetch_all: fetchAll ?? false,
					},
					results: {
						message_groups: transformHuntMessageGroups(allMessageGroups),
					},
				};

				return successResult(filteredData);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Get WHOIS Info tool
	server.registerTool(
		"getWhoisInfo",
		{
			description: "Retrieve WHOIS registration information for a domain name.",
			inputSchema: {
				domain: z
					.string()
					.describe("The domain name to look up (e.g., 'example.com')"),
			},
		},
		async ({ domain }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				const response = await fetch(
					`https://platform.sublime.security/v1/enrichment/whois?domain=${encodeURIComponent(domain)}`,
					{
						method: "GET",
						headers,
						redirect: "manual",
					},
				);

				const validationError = await validateApiResponse(
					response,
					"while fetching WHOIS information",
				);
				if (validationError) return validationError;

				const result = await response.json();
				return successResult(result);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Fetch ASA Report tool
	server.registerTool(
		"fetchAsaReport",
		{
			description:
				"Fetch the ASA (Automated Security Analysis) report for a message by its canonical ID.",
			inputSchema: {
				canonicalId: z
					.string()
					.describe(
						"The canonical ID of the message to fetch the ASA report for",
					),
			},
		},
		async ({ canonicalId }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				const asaUrl = `https://platform.sublime.security/v1/messages/${canonicalId}/asa_report`;
				const asaResponse = await fetch(asaUrl, {
					method: "GET",
					headers,
					redirect: "manual",
				});

				const validationError = await validateApiResponse(
					asaResponse,
					"while fetching ASA report",
				);
				if (validationError) return validationError;

				const result = await asaResponse.json();
				return successResult(result);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);
}
