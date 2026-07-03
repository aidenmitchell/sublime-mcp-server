import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getApiKey } from "../src/auth.js";
import {
	filterFlaggedRules,
	filterMdmData,
	getApiHeaders,
	type MdmData,
	mergeQueryResults,
} from "../src/helpers.js";

describe("getApiKey", () => {
	const original = process.env.SUBLIME_API_KEY;
	beforeEach(() => {
		process.env.SUBLIME_API_KEY = undefined;
	});
	afterEach(() => {
		if (original === undefined) {
			process.env.SUBLIME_API_KEY = undefined;
		} else {
			process.env.SUBLIME_API_KEY = original;
		}
	});

	it("throws when SUBLIME_API_KEY is unset", () => {
		process.env.SUBLIME_API_KEY = "";
		expect(() => getApiKey()).toThrow(/SUBLIME_API_KEY/);
	});

	it("returns the key when set", () => {
		process.env.SUBLIME_API_KEY = "secret-key";
		expect(getApiKey()).toBe("secret-key");
	});
});

describe("getApiHeaders", () => {
	it("builds bearer auth headers", () => {
		const headers = getApiHeaders("abc123");
		expect(headers.Authorization).toBe("Bearer abc123");
		expect(headers["Content-Type"]).toBe("application/json");
	});
});

describe("mergeQueryResults", () => {
	it("merges results under a named key, dropping success", () => {
		const merged = mergeQueryResults(
			[{ result: { success: true, a: 1 } }, { result: { b: 2 } }],
			"ml_results",
		);
		expect(merged).toEqual({ ml_results: { a: 1, b: 2 } });
	});
});

describe("filterMdmData", () => {
	it("strips disallowed root fields and truncates html", () => {
		const mdm: MdmData = {
			data_model: {
				headers: { hops: [1, 2, 3] },
				mailbox: { foo: "bar" },
				body: {
					html: { display_text: "long html" },
					links: [{ href_url: { url: "https://a.com", query_params: "x=1" } }],
				},
			},
			previews: "should be removed",
			attack_score_verdict: "malicious",
		};
		filterMdmData(mdm);
		expect(mdm.previews).toBeUndefined();
		expect(mdm.attack_score_verdict).toBe("malicious");
		expect(mdm.data_model?.headers?.hops).toBeUndefined();
		expect(mdm.data_model?.mailbox).toBeUndefined();
		expect(mdm.data_model?.body?.html).toEqual({
			message: "truncated - use fetchMessageHtml command",
		});
		expect(mdm.data_model?.body?.links?.[0].href_url).toEqual({
			url: "https://a.com",
		});
	});
});

describe("filterFlaggedRules", () => {
	it("keeps only public detection rules", () => {
		const rules = [
			{
				sqar_type: "detection_rule",
				rule_meta: { created_by_org_name: null, name: "Public", tags: [] },
			},
			{
				sqar_type: "detection_rule",
				rule_meta: { created_by_org_name: "Acme", name: "Private", tags: [] },
			},
			{
				sqar_type: "insight",
				rule_meta: { created_by_org_name: null, name: "Insight", tags: [] },
			},
		];
		const filtered = filterFlaggedRules(rules);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].rule_meta).toEqual({
			name: "Public",
			description: undefined,
		});
	});
});
