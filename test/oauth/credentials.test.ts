import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL } from "../../src/constants.js";
import { buildOAuthCredentials, normalizeBaseUrl } from "../../src/oauth/credentials.js";

describe("credentials", () => {
	it("normalizes resource URLs", () => {
		expect(normalizeBaseUrl()).toBe(DEFAULT_BASE_URL);
		expect(normalizeBaseUrl("portal.qwen.ai")).toBe("https://portal.qwen.ai/v1");
		expect(normalizeBaseUrl("https://portal.qwen.ai")).toBe("https://portal.qwen.ai/v1");
		expect(normalizeBaseUrl("https://portal.qwen.ai/v1")).toBe("https://portal.qwen.ai/v1");
		expect(normalizeBaseUrl("https://example.com/api?x=1#hash")).toBe("https://example.com/api/v1");
		expect(normalizeBaseUrl("nota url\\n")).toBe(DEFAULT_BASE_URL);
	});

	it("builds credentials and preserves prior fields when refresh omits them", () => {
		const credentials = buildOAuthCredentials(
			{ access_token: "new-access", expires_in: 60, refresh_token: "new-refresh", resource_url: "portal.qwen.ai" },
			{ access: "old-access", refresh: "old-refresh", expires: 0, resourceUrl: "https://old.example/v1" },
		);
		expect(credentials.access).toBe("new-access");
		expect(credentials.refresh).toBe("new-refresh");
		expect(credentials.resourceUrl).toBe("portal.qwen.ai");

		const preserved = buildOAuthCredentials(
			{ access_token: "fresh-access", expires_in: 60 },
			credentials,
		);
		expect(preserved.refresh).toBe("new-refresh");
		expect(preserved.resourceUrl).toBe("portal.qwen.ai");
	});
});
