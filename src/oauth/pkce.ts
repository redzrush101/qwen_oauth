function base64UrlEncode(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

export function generateCodeVerifier(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64UrlEncode(new Uint8Array(hash));
}

export async function generatePKCEPair(): Promise<{ verifier: string; challenge: string }> {
	const verifier = generateCodeVerifier();
	const challenge = await generateCodeChallenge(verifier);
	return { verifier, challenge };
}
