import type { Api, Model, OAuthCredentials } from "@mariozechner/pi-ai";
import {
	DEFAULT_BASE_URL,
	QWEN_HEADERS,
	QWEN_MODELS,
	QWEN_PROVIDER_ID,
} from "./constants.js";
import { loginQwen, normalizeBaseUrl, refreshQwenToken, type QwenOAuthCredentials } from "./oauth.js";

export function createQwenProviderConfig() {
	return {
		baseUrl: DEFAULT_BASE_URL,
		api: "openai-completions" as const,
		authHeader: true,
		headers: QWEN_HEADERS,
		models: QWEN_MODELS,
		oauth: {
			name: "Qwen OAuth",
			login: loginQwen,
			refreshToken: refreshQwenToken,
			getApiKey: (credentials: OAuthCredentials) => credentials.access,
			modifyModels: (models: Model<Api>[], credentials: OAuthCredentials) => {
				const baseUrl = normalizeBaseUrl((credentials as QwenOAuthCredentials).resourceUrl);
				return models.map((model) =>
					model.provider === QWEN_PROVIDER_ID ? { ...model, baseUrl } : model,
				);
			},
		},
	};
}
