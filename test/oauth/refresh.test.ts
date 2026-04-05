import { describe, expect, it, vi } from "vitest";
import { refreshQwenToken } from "../../src/oauth/device-flow.js";
import { QwenOAuthReauthRequiredError } from "../../src/oauth/errors.js";

describe("refresh", () => {
	it("preserves refresh token and resource url when refresh response omits them", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ access_token: "fresh", expires_in: 60 }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			),
		);

		await expect(
			refreshQwenToken({ access: "old", refresh: "refresh", expires: 0, resourceUrl: "portal.qwen.ai" }),
		).resolves.toMatchObject({ refresh: "refresh", resourceUrl: "portal.qwen.ai" });
	});

	it("raises a reauth-required error for HTTP 400", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: "invalid_grant" }), {
					status: 400,
					statusText: "Bad Request",
					headers: { "content-type": "application/json" },
				}),
			),
		);

		await expect(refreshQwenToken({ access: "old", refresh: "refresh", expires: 0 })).rejects.toBeInstanceOf(
			QwenOAuthReauthRequiredError,
		);
	});
});
