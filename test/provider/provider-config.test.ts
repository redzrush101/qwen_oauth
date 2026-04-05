import type { Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, QWEN_HEADERS, QWEN_MODEL_ID, QWEN_PROVIDER_ID } from "../../src/constants.js";
import { createQwenProviderConfig } from "../../src/provider-config.js";

describe("createQwenProviderConfig", () => {
	it("registers an openai-completions provider with oauth hooks and captured headers", () => {
		const config = createQwenProviderConfig();
		expect(config.api).toBe("openai-completions");
		expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
		expect(config.authHeader).toBe(true);
		expect(config.headers).toEqual(QWEN_HEADERS);
		expect(typeof config.oauth?.login).toBe("function");
		expect(typeof config.oauth?.refreshToken).toBe("function");
		expect(config.models).toHaveLength(1);
		expect(config.models?.[0]?.id).toBe(QWEN_MODEL_ID);
		expect(config.models?.[0]?.reasoning).toBe(true);
		expect(config.models?.[0]).toMatchObject({ compat: { thinkingFormat: "qwen" } });
	});

	it("updates provider models using resourceUrl", () => {
		const config = createQwenProviderConfig();
		const models = [
			{ provider: QWEN_PROVIDER_ID, id: QWEN_MODEL_ID, baseUrl: DEFAULT_BASE_URL },
			{ provider: "other", id: "x", baseUrl: "https://other.example" },
		] as Array<Model<"openai-completions">>;
		const nextModels = config.oauth?.modifyModels?.(models, {
			access: "a",
			refresh: "r",
			expires: 0,
			resourceUrl: "portal.qwen.ai",
		});
		expect(nextModels?.[0]?.baseUrl).toBe("https://portal.qwen.ai/v1");
		expect(nextModels?.[1]?.baseUrl).toBe("https://other.example");
	});
});
