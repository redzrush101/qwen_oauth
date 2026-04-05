import type { Api, Model, OAuthCredentials } from "@mariozechner/pi-ai";
import type { ProviderConfig } from "@mariozechner/pi-coding-agent";
import { DEFAULT_BASE_URL, QWEN_HEADERS, QWEN_MODELS, QWEN_PROVIDER_ID } from "./constants.js";
import { loginQwen, refreshQwenToken } from "./oauth/device-flow.js";
import { normalizeBaseUrl } from "./oauth/credentials.js";
import type { QwenOAuthCredentials } from "./types.js";

export function createQwenProviderConfig(): ProviderConfig {
	return {
		baseUrl: DEFAULT_BASE_URL,
		api: "openai-completions",
		authHeader: true,
		headers: QWEN_HEADERS,
		models: QWEN_MODELS,
		oauth: {
			name: "Qwen OAuth",
			login: loginQwen,
			refreshToken: refreshQwenToken,
			getApiKey(credentials: OAuthCredentials): string {
				return credentials.access;
			},
			modifyModels(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[] {
				const baseUrl = normalizeBaseUrl((credentials as QwenOAuthCredentials).resourceUrl);
				return models.map((model) =>
					model.provider === QWEN_PROVIDER_ID ? { ...model, baseUrl } : model,
				);
			},
		},
	};
}
