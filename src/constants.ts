import type { Model } from "@mariozechner/pi-ai";

// Captured from Qwen Code v0.14.0 and mirrored from git-repo/qwen-code/packages/core/src/qwen/qwenOAuth2.ts.
export const QWEN_PROVIDER_ID = "qwen-oauth";
export const QWEN_MODEL_ID = "coder-model";
export const QWEN_MODEL_NAME = "Qwen 3.6 Plus (OAuth)";

// Qwen device-flow OAuth endpoints captured from Qwen Code.
export const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
export const DEVICE_CODE_URL = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
export const TOKEN_URL = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
export const CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
export const SCOPE = "openid profile email model.completion";
export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

// Qwen Code falls back to DashScope compatible-mode when the token response omits resource_url.
export const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

// Polling behaviour mirrored from Qwen Code.
export const DEFAULT_POLL_INTERVAL_MS = 2_000;
export const MAX_POLL_INTERVAL_MS = 10_000;
export const SLOW_DOWN_MULTIPLIER = 1.5;
export const EXPIRY_SAFETY_WINDOW_MS = 30_000;

export const USER_AGENT = `QwenCode/0.14.0 (${process.platform}; ${process.arch})`;
export const QWEN_HEADERS = {
	Accept: "application/json",
	"X-DashScope-AuthType": QWEN_PROVIDER_ID,
	"X-DashScope-CacheControl": "enable",
	"X-DashScope-UserAgent": USER_AGENT,
	"User-Agent": USER_AGENT,
} as const;

export const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" } as const;
export const METADATA_ENTRY_TYPE = "qwen-oauth-request-metadata";

export const QWEN_MODELS = [
	{
		id: QWEN_MODEL_ID,
		name: QWEN_MODEL_NAME,
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 65_536,
		compat: {
			supportsDeveloperRole: false,
			maxTokensField: "max_tokens",
			thinkingFormat: "qwen",
		},
	},
] satisfies Array<Omit<Model<"openai-completions">, "provider" | "api" | "baseUrl">>;
