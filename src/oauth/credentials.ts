import { DEFAULT_BASE_URL, EXPIRY_SAFETY_WINDOW_MS } from "../constants.js";
import {
	QwenOAuthInvalidResponseError,
	QwenOAuthResponseError,
	QwenOAuthReauthRequiredError,
} from "./errors.js";
import type { QwenOAuthCredentials, TokenResponse } from "../types.js";

export function normalizeBaseUrl(resourceUrl?: string): string {
	if (!resourceUrl?.trim()) return DEFAULT_BASE_URL;

	try {
		const withScheme = /^[a-z]+:\/\//i.test(resourceUrl) ? resourceUrl : `https://${resourceUrl}`;
		const url = new URL(withScheme);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return DEFAULT_BASE_URL;
		}

		url.search = "";
		url.hash = "";

		let pathname = url.pathname.replace(/\/+$/g, "");
		if (pathname === "/") pathname = "";
		if (!pathname.endsWith("/v1")) {
			pathname = pathname ? `${pathname}/v1` : "/v1";
		}
		url.pathname = pathname;
		return url.toString().replace(/\/+$/g, "");
	} catch {
		return DEFAULT_BASE_URL;
	}
}

export function calcExpiresAt(expiresInSeconds: number): number {
	return Date.now() + expiresInSeconds * 1000 - EXPIRY_SAFETY_WINDOW_MS;
}

export function buildOAuthCredentials(
	token: TokenResponse,
	previous?: QwenOAuthCredentials,
): QwenOAuthCredentials {
	if (!token.access_token) {
		throw new QwenOAuthInvalidResponseError("Token response is missing access_token");
	}
	if (typeof token.expires_in !== "number" || token.expires_in <= 0) {
		throw new QwenOAuthInvalidResponseError("Token response is missing a valid expires_in value");
	}

	const refreshToken = token.refresh_token ?? previous?.refresh;
	if (!refreshToken) {
		throw new QwenOAuthInvalidResponseError("Token response is missing refresh_token");
	}

	return {
		access: token.access_token,
		refresh: refreshToken,
		expires: calcExpiresAt(token.expires_in),
		resourceUrl: token.resource_url ?? previous?.resourceUrl,
	};
}

export function formatOAuthErrorDetails(
	data: { error?: string; error_description?: string } | null | undefined,
	rawText: string,
): string {
	const parts = [data?.error, data?.error_description].filter(Boolean);
	if (parts.length > 0) return parts.join(": ");
	return rawText.trim();
}

export function createOAuthHttpError(
	prefix: string,
	response: Response,
	data: { error?: string; error_description?: string } | null | undefined,
	rawText: string,
): QwenOAuthResponseError {
	const details = formatOAuthErrorDetails(data, rawText);
	const suffix = details ? ` (${details})` : "";
	return new QwenOAuthResponseError(`${prefix}: ${response.status} ${response.statusText}${suffix}`);
}

export function createRefreshError(
	response: Response,
	data: { error?: string; error_description?: string } | null | undefined,
	rawText: string,
): Error {
	if (response.status === 400) {
		const details = formatOAuthErrorDetails(data, rawText);
		const suffix = details ? ` (${details})` : "";
		return new QwenOAuthReauthRequiredError(
			`Qwen refresh token is no longer valid; re-authentication is required${suffix}`,
		);
	}

	return createOAuthHttpError("Token refresh failed", response, data, rawText);
}
