import type { Model } from "@mariozechner/pi-ai";

export const QWEN_PROVIDER_ID = "qwen-oauth";
export const QWEN_MODEL_ID = "coder-model";
export const QWEN_MODEL_NAME = "Qwen 3.6 Plus (OAuth)";

export const QWEN_OAUTH_BASE = "https://chat.qwen.ai";
export const DEVICE_CODE_URL = `${QWEN_OAUTH_BASE}/api/v1/oauth2/device/code`;
export const TOKEN_URL = `${QWEN_OAUTH_BASE}/api/v1/oauth2/token`;
export const CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
export const SCOPE = "openid profile email model.completion";
export const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export const DEFAULT_BASE_URL = "https://portal.qwen.ai/v1";
export const DEFAULT_POLL_INTERVAL_MS = 2000;
export const USER_AGENT = `QwenCode/0.14.0 (${process.platform}; ${process.arch})`;
export const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" } as const;

export const QWEN_HEADERS = {
	"X-DashScope-AuthType": QWEN_PROVIDER_ID,
	"X-DashScope-CacheControl": "enable",
	"X-DashScope-UserAgent": USER_AGENT,
	"User-Agent": USER_AGENT,
};

export const QWEN_MODELS = [
	{
		id: QWEN_MODEL_ID,
		name: QWEN_MODEL_NAME,
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 65536,
		compat: {
			supportsDeveloperRole: false,
			maxTokensField: "max_tokens",
		},
	},
] satisfies Array<Omit<Model<"openai-completions">, "provider" | "api" | "baseUrl">>;
