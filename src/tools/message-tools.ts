import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	errorResult,
	successResult,
	validateApiResponse,
	wrapProcessingError,
} from "../api-utils.js";
import { getApiKey } from "../auth.js";
import {
	filterFlaggedRules,
	filterMdmData,
	getApiHeaders,
	type MdmData,
	mergeQueryResults,
} from "../helpers.js";
import type { MessageGroupsResponse } from "../types.js";

export function registerMessageTools(server: McpServer): void {
	// Fetch Message Data Model (MDM) tool
	server.registerTool(
		"fetchMdmAndMlResults",
		{
			description:
				"Fetch the Message Data Model (MDM) and ML analysis results for a message by its canonical ID. Returns filtered MDM data including NLU classifier and topic modeling results.",
			inputSchema: {
				canonicalId: z
					.string()
					.describe("The canonical ID of the message to fetch"),
			},
		},
		async ({ canonicalId }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				// Get the MDM data for the message ID
				const mdmUrl = `https://platform.sublime.security/v1/messages/groups/${canonicalId}`;
				const mdmResponse = await fetch(mdmUrl, {
					method: "GET",
					headers,
					redirect: "manual",
				});

				const mdmError = await validateApiResponse(
					mdmResponse,
					"while fetching MDM data",
				);
				if (mdmError) return mdmError;

				// Process the MDM
				const mdmData = (await mdmResponse.json()) as MdmData;

				// Get NLU and topic modelling data
				const mlUrl = "https://platform.sublime.security/v1/messages/analyze";
				const mlResponse = await fetch(mlUrl, {
					method: "POST",
					headers,
					body: JSON.stringify({
						data_model: mdmData.data_model,
						queries: [
							{
								source:
									"ml.nlu_classifier(strings.replace_confusables(body.current_thread.text))",
								name: "evaluate",
							},
							{
								source:
									"beta.ml_topic(coalesce(body.html.display_text, body.current_thread.text))",
								name: "evaluate",
							},
						],
					}),
					redirect: "manual",
				});
				const mlData = (await mlResponse.json()) as Record<string, unknown>;

				// Transform ML data - extract and merge query results
				const transformedMlData = mlData.query_results
					? mergeQueryResults(
							mlData.query_results as Array<{
								result?: Record<string, unknown>;
							}>,
							"ml_results",
						)
					: {};

				filterMdmData(mdmData);

				if (mdmData?.flagged_rules && Array.isArray(mdmData.flagged_rules)) {
					mdmData.flagged_rules = filterFlaggedRules(mdmData.flagged_rules);
				}

				return successResult({ ...mdmData, ...transformedMlData });
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Fetch just the HTML content from message
	server.registerTool(
		"fetchMessageHtml",
		{
			description:
				"Fetch only the HTML body content from a message by its canonical ID.",
			inputSchema: {
				canonicalId: z
					.string()
					.describe("The canonical ID of the message to fetch HTML from"),
			},
		},
		async ({ canonicalId }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				const mdmUrl = `https://platform.sublime.security/v1/messages/groups/${canonicalId}`;
				const mdmResponse = await fetch(mdmUrl, {
					method: "GET",
					headers,
					redirect: "manual",
				});

				const mdmError = await validateApiResponse(
					mdmResponse,
					"while fetching MDM data",
				);
				if (mdmError) return mdmError;

				const mdmData = (await mdmResponse.json()) as MdmData;
				const htmlContent = mdmData?.data_model?.body?.html || null;

				return successResult(htmlContent);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Execute custom MQL function against a message
	server.registerTool(
		"getResultsOfMqlFunction",
		{
			description:
				"Execute a custom MQL (Message Query Language) function against a message and return the results.",
			inputSchema: {
				canonicalId: z
					.string()
					.describe("The canonical ID of the message to analyze"),
				mqlFunction: z
					.string()
					.describe(
						"The MQL function to execute (e.g., 'strings.icontains(body.plain.raw, \"phish\")')",
					),
			},
		},
		async ({ canonicalId, mqlFunction }) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				const mdmUrl = `https://platform.sublime.security/v1/messages/groups/${canonicalId}`;
				const mdmResponse = await fetch(mdmUrl, {
					method: "GET",
					headers,
					redirect: "manual",
				});

				const mdmError = await validateApiResponse(
					mdmResponse,
					"while fetching MDM data",
				);
				if (mdmError) return mdmError;

				const mdmData = (await mdmResponse.json()) as MdmData;

				const mqlUrl = "https://platform.sublime.security/v1/messages/analyze";
				const mqlResponse = await fetch(mqlUrl, {
					method: "POST",
					headers,
					body: JSON.stringify({
						data_model: mdmData.data_model,
						queries: [{ source: mqlFunction, name: "evaluate" }],
					}),
					redirect: "manual",
				});
				const mqlError = await validateApiResponse(
					mqlResponse,
					"while executing MQL query",
				);
				if (mqlError) return mqlError;

				const mqlData = (await mqlResponse.json()) as Record<string, unknown>;

				const queryResults = mqlData.query_results as
					| Array<{ result: unknown }>
					| undefined;
				const mqlResult =
					queryResults && queryResults.length > 0
						? queryResults[0].result
						: null;

				return successResult(mqlResult);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);

	// Run MQL By Canonical ID tool
	server.registerTool(
		"runMqlByCanonicalId",
		{
			description:
				"Run MQL analysis on a message by its canonical ID. Can execute a custom rule, all detection rules, or all insights.",
			inputSchema: {
				canonicalId: z
					.string()
					.describe("The canonical ID of the message to analyze"),
				ruleSource: z
					.string()
					.optional()
					.describe("Optional MQL rule source code to run against the message"),
				runAllDetectionRules: z
					.boolean()
					.optional()
					.default(false)
					.describe("Whether to run all detection rules (default: false)"),
				runAllInsights: z
					.boolean()
					.optional()
					.default(false)
					.describe("Whether to run all insights (default: false)"),
			},
		},
		async ({
			canonicalId,
			ruleSource,
			runAllDetectionRules,
			runAllInsights,
		}) => {
			try {
				const apiKey = getApiKey();
				const headers = getApiHeaders(apiKey);

				// Step 1: Get message ID from canonical ID
				const messageGroupsUrl = `https://api.platform.sublimesecurity.com/v0/message-groups?canonical_id__is=${canonicalId}`;
				const messageGroupsResponse = await fetch(messageGroupsUrl, {
					method: "GET",
					headers,
					redirect: "manual",
				});

				const groupsError = await validateApiResponse(
					messageGroupsResponse,
					"while fetching message groups",
				);
				if (groupsError) return groupsError;

				const messageGroupsData =
					(await messageGroupsResponse.json()) as MessageGroupsResponse;

				if (
					!messageGroupsData.message_groups ||
					messageGroupsData.message_groups.length === 0 ||
					!messageGroupsData.message_groups[0].messages ||
					messageGroupsData.message_groups[0].messages.length === 0
				) {
					return errorResult(
						`Error: No message found for canonical ID: ${canonicalId}`,
					);
				}

				const messageId = messageGroupsData.message_groups[0].messages[0].id;

				// Step 2: Prepare request body for analysis
				const requestBody: Record<string, unknown> = {
					run_all_detection_rules: runAllDetectionRules,
					run_all_insights: runAllInsights,
				};

				if (ruleSource) {
					requestBody.rules = [{ source: ruleSource }];
				}

				// Step 3: Analyze the message
				const analysisUrl = `https://platform.sublime.security/v0/messages/${messageId}/analyze`;
				const analysisResponse = await fetch(analysisUrl, {
					method: "POST",
					headers,
					body: JSON.stringify(requestBody),
					redirect: "manual",
				});

				const validationError = await validateApiResponse(
					analysisResponse,
					"during message analysis",
				);
				if (validationError) return validationError;

				const result = await analysisResponse.json();
				return successResult(result);
			} catch (error) {
				return wrapProcessingError(error);
			}
		},
	);
}
