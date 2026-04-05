export class QwenOAuthError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = new.target.name;
	}
}

export class QwenOAuthResponseError extends QwenOAuthError {}
export class QwenOAuthCancelledError extends QwenOAuthError {}
export class QwenOAuthExpiredDeviceCodeError extends QwenOAuthError {}
export class QwenOAuthAccessDeniedError extends QwenOAuthError {}
export class QwenOAuthInvalidResponseError extends QwenOAuthError {}
export class QwenOAuthReauthRequiredError extends QwenOAuthError {}
