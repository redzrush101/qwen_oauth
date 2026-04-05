import type { OAuthCredentials } from "@mariozechner/pi-ai";

export type QwenOAuthCredentials = OAuthCredentials & {
	resourceUrl?: string;
};

export type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval?: number;
};

export type OAuthErrorResponse = {
	error?: string;
	error_description?: string;
};

export type TokenResponse = OAuthErrorResponse & {
	access_token?: string;
	refresh_token?: string;
	token_type?: string;
	expires_in?: number;
	resource_url?: string;
};

export type RequestMetadata = {
	sessionId: string;
	promptId: string;
	channel?: string;
};

export type QwenMetadataState = {
	sessionId: string;
};

export type JsonRecord = Record<string, unknown>;
