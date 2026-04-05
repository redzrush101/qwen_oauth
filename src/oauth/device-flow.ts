import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
import {
	CLIENT_ID,
	DEFAULT_POLL_INTERVAL_MS,
	DEVICE_CODE_URL,
	DEVICE_GRANT_TYPE,
	MAX_POLL_INTERVAL_MS,
	SCOPE,
	SLOW_DOWN_MULTIPLIER,
	TOKEN_URL,
} from "../constants.js";
import type { DeviceCodeResponse, TokenResponse, QwenOAuthCredentials } from "../types.js";
import { sleepWithAbort, throwIfAborted } from "../util/abort.js";
import { postFormJson } from "./client.js";
import { buildOAuthCredentials, createOAuthHttpError, createRefreshError } from "./credentials.js";
import {
	QwenOAuthAccessDeniedError,
	QwenOAuthCancelledError,
	QwenOAuthExpiredDeviceCodeError,
	QwenOAuthInvalidResponseError,
} from "./errors.js";
import { generatePKCEPair } from "./pkce.js";

export async function startDeviceFlow(signal?: AbortSignal): Promise<{
	deviceCode: DeviceCodeResponse;
	verifier: string;
}> {
	throwIfAborted(signal, "Login cancelled");
	const { verifier, challenge } = await generatePKCEPair();
	const requestId = crypto.randomUUID();
	const { response, data, rawText } = await postFormJson<DeviceCodeResponse & TokenResponse>(
		DEVICE_CODE_URL,
		new URLSearchParams({
			client_id: CLIENT_ID,
			scope: SCOPE,
			code_challenge: challenge,
			code_challenge_method: "S256",
		}),
		{
			headers: { "x-request-id": requestId },
			signal,
		},
	);

	if (!response.ok) {
		throw createOAuthHttpError("Device code request failed", response, data, rawText);
	}
	if (!data?.device_code || !data.user_code || !data.verification_uri || typeof data.expires_in !== "number") {
		throw new QwenOAuthInvalidResponseError("Device code response is missing required fields");
	}

	return { deviceCode: data, verifier };
}

export async function pollForToken(
	params: {
		deviceCode: string;
		verifier: string;
		intervalSeconds?: number;
		expiresIn: number;
		signal?: AbortSignal;
	},
): Promise<TokenResponse> {
	const deadline = Date.now() + params.expiresIn * 1000;
	let pollIntervalMs = Math.max(
		1_000,
		Math.floor((params.intervalSeconds ?? DEFAULT_POLL_INTERVAL_MS / 1000) * 1000),
	);

	while (Date.now() < deadline) {
		throwIfAborted(params.signal, "Login cancelled");
		const { response, data, rawText } = await postFormJson<TokenResponse>(
			TOKEN_URL,
			new URLSearchParams({
				grant_type: DEVICE_GRANT_TYPE,
				client_id: CLIENT_ID,
				device_code: params.deviceCode,
				code_verifier: params.verifier,
			}),
			{ signal: params.signal },
		);

		if (response.ok) {
			if (data?.access_token) return data;
			throw new QwenOAuthInvalidResponseError("Token response is missing access_token");
		}

		const oauthError = data?.error;
		if (oauthError === "authorization_pending") {
			await sleepWithAbort(pollIntervalMs, params.signal, "Login cancelled");
			continue;
		}
		if (oauthError === "slow_down" || response.status === 429) {
			pollIntervalMs = Math.min(Math.floor(pollIntervalMs * SLOW_DOWN_MULTIPLIER), MAX_POLL_INTERVAL_MS);
			await sleepWithAbort(pollIntervalMs, params.signal, "Login cancelled");
			continue;
		}
		if (response.status === 401 || oauthError === "expired_token") {
			throw new QwenOAuthExpiredDeviceCodeError(
				"Device code expired or is no longer valid. Please restart /login qwen-oauth.",
			);
		}
		if (oauthError === "access_denied") {
			throw new QwenOAuthAccessDeniedError("Authorization denied by user.");
		}
		throw createOAuthHttpError("Token request failed", response, data, rawText);
	}

	throw new QwenOAuthExpiredDeviceCodeError("Authentication timed out. Please try again.");
}

export async function loginQwen(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	try {
		callbacks.onProgress?.("Requesting Qwen device code...");
		const { deviceCode, verifier } = await startDeviceFlow(callbacks.signal);
		callbacks.onAuth({
			url: deviceCode.verification_uri_complete || deviceCode.verification_uri,
			instructions: deviceCode.verification_uri_complete ? undefined : `Enter code: ${deviceCode.user_code}`,
		});
		callbacks.onProgress?.("Waiting for Qwen authorization...");

		const token = await pollForToken({
			deviceCode: deviceCode.device_code,
			verifier,
			intervalSeconds: deviceCode.interval,
			expiresIn: deviceCode.expires_in,
			signal: callbacks.signal,
		});

		return buildOAuthCredentials(token);
	} catch (error) {
		if ((error as Error | undefined)?.name === "AbortError") {
			throw new QwenOAuthCancelledError("Login cancelled", { cause: error });
		}
		throw error;
	}
}

export async function refreshQwenToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	const qwenCredentials = credentials as QwenOAuthCredentials;
	if (!qwenCredentials.refresh) {
		throw new QwenOAuthInvalidResponseError("Cannot refresh Qwen OAuth token without a refresh token");
	}

	const { response, data, rawText } = await postFormJson<TokenResponse>(
		TOKEN_URL,
		new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: qwenCredentials.refresh,
			client_id: CLIENT_ID,
		}),
	);

	if (!response.ok) {
		throw createRefreshError(response, data, rawText);
	}

	return buildOAuthCredentials(data ?? {}, qwenCredentials);
}
