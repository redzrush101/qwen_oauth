import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
import {
	CLIENT_ID,
	DEFAULT_BASE_URL,
	DEFAULT_POLL_INTERVAL_MS,
	DEVICE_CODE_URL,
	DEVICE_GRANT,
	SCOPE,
	TOKEN_URL,
} from "./constants.js";

export type QwenOAuthCredentials = OAuthCredentials & {
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

function base64UrlEncode(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const verifier = base64UrlEncode(bytes);
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	const challenge = base64UrlEncode(new Uint8Array(hash));
	return { verifier, challenge };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Login cancelled"));
			return;
		}

		const onAbort = () => {
			clearTimeout(timeout);
			reject(new Error("Login cancelled"));
		};
		const timeout = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

export function normalizeBaseUrl(resourceUrl?: string): string {
	if (!resourceUrl) return DEFAULT_BASE_URL;

	const candidate = resourceUrl.trim();
	if (!candidate) return DEFAULT_BASE_URL;

	try {
		const normalized = candidate.startsWith("http://") || candidate.startsWith("https://")
			? candidate
			: `https://${candidate}`;
		const url = new URL(normalized);
		if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_BASE_URL;

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

function createHttpError(
	prefix: string,
	response: Response,
	data: { error?: string; error_description?: string } | null | undefined,
	rawText: string,
): Error {
	return new Error(
		`${prefix}: ${response.status} ${response.statusText}${formatOAuthErrorDetails(data, rawText)}`,
	);
}

async function postForm<T>(
	url: string,
	body: URLSearchParams,
	extraHeaders?: Record<string, string>,
): Promise<{ response: Response; data: T | null; rawText: string }> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
			...extraHeaders,
		},
		body: body.toString(),
	});
	const { data, rawText } = await readJsonWithRawText<T>(response);
	return { response, data, rawText };
}

async function startDeviceFlow(): Promise<{ deviceCode: DeviceCodeResponse; verifier: string }> {
	const { verifier, challenge } = await generatePKCE();
	const requestId = globalThis.crypto?.randomUUID?.();
	const { response, data, rawText } = await postForm<DeviceCodeResponse & TokenResponse>(
		DEVICE_CODE_URL,
		new URLSearchParams({
			client_id: CLIENT_ID,
			scope: SCOPE,
			code_challenge: challenge,
			code_challenge_method: "S256",
		}),
		requestId ? { "x-request-id": requestId } : undefined,
	);

	if (!response.ok) {
		throw createHttpError("Device code request failed", response, data, rawText);
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
		if (signal?.aborted) throw new Error("Login cancelled");

		const { response, data, rawText } = await postForm<TokenResponse>(
			TOKEN_URL,
			new URLSearchParams({
				grant_type: DEVICE_GRANT,
				client_id: CLIENT_ID,
				device_code: deviceCode,
				code_verifier: verifier,
			}),
		);

		if (response.ok && data?.access_token) return data;

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
		if (error === "expired_token") throw new Error("Device code expired. Please restart /login qwen-oauth.");
		if (error === "access_denied") throw new Error("Authorization denied by user.");
		if (!response.ok) throw createHttpError("Token request failed", response, data, rawText);
		throw new Error("Token response is missing access_token");
	}

	throw new Error("Authentication timed out. Please try again.");
}

function buildCredentials(token: TokenResponse, previous?: QwenOAuthCredentials): QwenOAuthCredentials {
	if (!token.access_token) throw new Error("Token response is missing access_token");
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

export async function loginQwen(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
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

export async function refreshQwenToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	if (!credentials.refresh) {
		throw new Error("Cannot refresh Qwen OAuth token without a refresh token");
	}

	const { response, data, rawText } = await postForm<TokenResponse>(
		TOKEN_URL,
		new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: credentials.refresh,
			client_id: CLIENT_ID,
		}),
	);
	if (!response.ok) {
		throw createHttpError("Token refresh failed", response, data, rawText);
	}
	return buildCredentials(data ?? {}, credentials as QwenOAuthCredentials);
}
