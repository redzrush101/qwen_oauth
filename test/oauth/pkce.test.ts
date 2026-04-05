import { describe, expect, it } from "vitest";
import { generateCodeChallenge, generateCodeVerifier, generatePKCEPair } from "../../src/oauth/pkce.js";

describe("pkce", () => {
	it("generates a verifier using base64url characters", () => {
		const verifier = generateCodeVerifier();
		expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("derives a deterministic challenge", async () => {
		await expect(generateCodeChallenge("test-verifier")).resolves.toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it("creates a verifier and challenge pair", async () => {
		const pair = await generatePKCEPair();
		expect(pair.verifier).not.toBe(pair.challenge);
		expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});
