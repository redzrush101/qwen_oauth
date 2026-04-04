import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const QWEN_OAUTH_BASE = "https://chat.qwen.ai";
const DEVICE_CODE_URL = `${QWEN_OAUTH_BASE}/api/v1/oauth2/device/code`;
const TOKEN_URL = `${QWEN_OAUTH_BASE}/api/v1/oauth2/token`;
const CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const SCOPE = "openid profile email model.completion";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const DEFAULT_BASE_URL = "https://portal.qwen.ai/v1";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DASHSCOPE_AUTH_TYPE = "qwen-oauth";
const DASHSCOPE_CACHE_CONTROL = "enable";
const USER_AGENT = `QwenCode/0.14.0 (${process.platform}; ${process.arch})`;

type QwenOAuthCredentials = OAuthCredentials & {
	resourceUrl?: string;
};

type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval?: number;
};

type TokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	resource_url?: string;
	error?: string;
	error_description?: string;
};

type CacheControl = { type: "ephemeral" };

type QwenPayload = Record<string, unknown> & {
	model?: string;
	messages?: unknown[];
	tools?: unknown[];
	metadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);

	const verifier = btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	return { verifier, challenge };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Login cancelled"));
			return;
		}

		const timeout = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timeout);
			reject(new Error("Login cancelled"));
		};

		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function normalizeBaseUrl(resourceUrl?: string): string {
	if (!resourceUrl) return DEFAULT_BASE_URL;

	const candidate = resourceUrl.trim();
	if (!candidate) return DEFAULT_BASE_URL;

	try {
		const normalized = candidate.startsWith("http://") || candidate.startsWith("https://") ? candidate : `https://${candidate}`;
		const url = new URL(normalized);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return DEFAULT_BASE_URL;
		}

		url.search = "";
		url.hash = "";
		let pathname = url.pathname.replace(/\/+$/, "");
		if (!pathname || pathname === "/") pathname = "";
		if (!pathname.endsWith("/v1")) pathname = `${pathname}/v1`;
		url.pathname = pathname;
		return url.toString().replace(/\/$/, "");
	} catch {
		return DEFAULT_BASE_URL;
	}
}

function calcExpires(expiresIn: number): number {
	return Date.now() + expiresIn * 1000 - 5 * 60 * 1000;
}

async function readJsonWithRawText<T>(response: Response): Promise<{ data: T | null; rawText: string }> {
	const rawText = await response.text();
	if (!rawText) return { data: null, rawText };

	try {
		return { data: JSON.parse(rawText) as T, rawText };
	} catch {
		return { data: null, rawText };
	}
}

function formatOAuthErrorDetails(
	data: { error?: string; error_description?: string } | null | undefined,
	rawText: string,
): string {
	const details = [data?.error, data?.error_description].filter(Boolean).join(": ");
	if (details) return ` (${details})`;
	const text = rawText.trim();
	return text ? ` (${text})` : "";
}

async function startDeviceFlow(): Promise<{ deviceCode: DeviceCodeResponse; verifier: string }> {
	const { verifier, challenge } = await generatePKCE();
	const body = new URLSearchParams({
		client_id: CLIENT_ID,
		scope: SCOPE,
		code_challenge: challenge,
		code_challenge_method: "S256",
	});
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};
	const requestId = globalThis.crypto?.randomUUID?.();
	if (requestId) headers["x-request-id"] = requestId;

	const response = await fetch(DEVICE_CODE_URL, {
		method: "POST",
		headers,
		body: body.toString(),
	});
	const { data, rawText } = await readJsonWithRawText<DeviceCodeResponse & TokenResponse>(response);

	if (!response.ok) {
		throw new Error(
			`Device code request failed: ${response.status} ${response.statusText}${formatOAuthErrorDetails(data, rawText)}`,
		);
	}
	if (!data?.device_code || !data.user_code || !data.verification_uri || !data.expires_in) {
		throw new Error("Device code response is missing required fields");
	}

	return { deviceCode: data, verifier };
}

async function pollForToken(
	deviceCode: string,
	verifier: string,
	intervalSeconds: number | undefined,
	expiresIn: number,
	signal?: AbortSignal,
): Promise<TokenResponse> {
	const deadline = Date.now() + expiresIn * 1000;
	let pollIntervalMs = Math.max(1000, Math.floor((intervalSeconds ?? DEFAULT_POLL_INTERVAL_MS / 1000) * 1000));

	while (Date.now() < deadline) {
		if (signal?.aborted) {
			throw new Error("Login cancelled");
		}

		const response = await fetch(TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: new URLSearchParams({
				grant_type: DEVICE_GRANT,
				client_id: CLIENT_ID,
				device_code: deviceCode,
				code_verifier: verifier,
			}).toString(),
		});
		const { data, rawText } = await readJsonWithRawText<TokenResponse>(response);

		if (response.ok && data?.access_token) {
			return data;
		}

		const error = data?.error;
		if (error === "authorization_pending") {
			await sleep(pollIntervalMs, signal);
			continue;
		}
		if (error === "slow_down" || response.status === 429) {
			pollIntervalMs = Math.min(pollIntervalMs + 5000, 15000);
			await sleep(pollIntervalMs, signal);
			continue;
		}
		if (error === "expired_token") {
			throw new Error("Device code expired. Please restart /login qwen-oauth.");
		}
		if (error === "access_denied") {
			throw new Error("Authorization denied by user.");
		}

		if (!response.ok) {
			throw new Error(
				`Token request failed: ${response.status} ${response.statusText}${formatOAuthErrorDetails(data, rawText)}`,
			);
		}

		throw new Error("Token response is missing access_token");
	}

	throw new Error("Authentication timed out. Please try again.");
}

function buildCredentials(token: TokenResponse, previous?: QwenOAuthCredentials): QwenOAuthCredentials {
	if (!token.access_token) {
		throw new Error("Token response is missing access_token");
	}
	if (typeof token.expires_in !== "number" || token.expires_in <= 0) {
		throw new Error("Token response is missing a valid expires_in value");
	}

	return {
		refresh: token.refresh_token ?? previous?.refresh ?? "",
		access: token.access_token,
		expires: calcExpires(token.expires_in),
		resourceUrl: token.resource_url ?? previous?.resourceUrl,
	};
}

async function loginQwen(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	callbacks.onProgress?.("Requesting Qwen device code...");
	const { deviceCode, verifier } = await startDeviceFlow();

	const authUrl = deviceCode.verification_uri_complete || deviceCode.verification_uri;
	const instructions = deviceCode.verification_uri_complete ? undefined : `Enter code: ${deviceCode.user_code}`;
	callbacks.onAuth({ url: authUrl, instructions });
	callbacks.onProgress?.("Waiting for Qwen authorization...");

	const token = await pollForToken(
		deviceCode.device_code,
		verifier,
		deviceCode.interval,
		deviceCode.expires_in,
		callbacks.signal,
	);

	return buildCredentials(token);
}

async function refreshQwenToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	if (!credentials.refresh) {
		throw new Error("Cannot refresh Qwen OAuth token without a refresh token");
	}

	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: credentials.refresh,
			client_id: CLIENT_ID,
		}).toString(),
	});
	const { data, rawText } = await readJsonWithRawText<TokenResponse>(response);

	if (!response.ok) {
		throw new Error(
			`Token refresh failed: ${response.status} ${response.statusText}${formatOAuthErrorDetails(data, rawText)}`,
		);
	}
	return buildCredentials(data ?? {}, credentials as QwenOAuthCredentials);
}

function withCacheControl(value: unknown): unknown {
	if (!isRecord(value)) return value;
	return { ...value, cache_control: { type: "ephemeral" } satisfies CacheControl };
}

function withMessageCacheControl(message: unknown): unknown {
	if (!isRecord(message) || !("content" in message)) return message;
	const content = message.content;

	if (typeof content === "string") {
		return {
			...message,
			content: [{ type: "text", text: content, cache_control: { type: "ephemeral" } satisfies CacheControl }],
		};
	}
	if (!Array.isArray(content) || content.length === 0) return message;

	const parts = [...content];
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];
		if (isRecord(part) && part.type === "text") {
			parts[i] = withCacheControl(part);
			return { ...message, content: parts };
		}
	}

	return { ...message, content: [...parts, { type: "text", text: "", cache_control: { type: "ephemeral" } satisfies CacheControl }] };
}

function withQwenRequestPatches(payload: unknown, sessionId: string, promptId: string): unknown {
	if (!isRecord(payload) || payload.model !== "coder-model") return payload;

	const next: QwenPayload = {
		...payload,
		vl_high_resolution_images: true,
		metadata: {
			...(isRecord(payload.metadata) ? payload.metadata : {}),
			sessionId,
			promptId,
		},
	};

	if (Array.isArray(payload.messages) && payload.messages.length > 0) {
		const messages = [...payload.messages];
		const systemIndex = messages.findIndex((message) => isRecord(message) && message.role === "system");
		if (systemIndex >= 0) messages[systemIndex] = withMessageCacheControl(messages[systemIndex]);

		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (isRecord(message) && message.role === "user") {
				messages[i] = withMessageCacheControl(message);
				break;
			}
		}
		next.messages = messages;
	}

	if (Array.isArray(payload.tools) && payload.tools.length > 0) {
		const tools = [...payload.tools];
		tools[tools.length - 1] = withCacheControl(tools[tools.length - 1]);
		next.tools = tools;
	}

	return next;
}

export default function (pi: ExtensionAPI) {
	const sessionId = crypto.randomUUID();
	let promptCounter = 0;
	pi.registerProvider("qwen-oauth", {
		baseUrl: DEFAULT_BASE_URL,
		api: "openai-completions",
		authHeader: true,
		headers: {
			"X-DashScope-AuthType": DASHSCOPE_AUTH_TYPE,
			"X-DashScope-CacheControl": DASHSCOPE_CACHE_CONTROL,
			"X-DashScope-UserAgent": USER_AGENT,
			"User-Agent": USER_AGENT,
		},
		models: [
			{
				id: "coder-model",
				name: "Qwen 3.6 Plus (OAuth)",
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
		],
		oauth: {
			name: "Qwen OAuth",
			login: loginQwen,
			refreshToken: refreshQwenToken,
			getApiKey: (credentials) => credentials.access,
			modifyModels: (models, credentials) => {
				const baseUrl = normalizeBaseUrl((credentials as QwenOAuthCredentials).resourceUrl);
				return models.map((model) => (model.provider === "qwen-oauth" ? { ...model, baseUrl } : model));
			},
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		const provider = ctx.model?.provider;
		if (!provider || !/^qwen-oauth(?:-\d+)?$/.test(provider)) return;
		promptCounter += 1;
		return withQwenRequestPatches(event.payload, sessionId, `${sessionId}########${promptCounter}`);
	});
}
