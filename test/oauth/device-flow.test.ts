/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ID, DEVICE_CODE_URL, DEVICE_GRANT_TYPE, TOKEN_URL } from "../../src/constants.js";
import { QwenOAuthExpiredDeviceCodeError } from "../../src/oauth/errors.js";
import { loginQwen, pollForToken, startDeviceFlow } from "../../src/oauth/device-flow.js";

describe("device flow", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("sends the device code request with qwen parameters", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					device_code: "device-code",
					user_code: "ABCD",
					verification_uri: "https://chat.qwen.ai/verify",
					expires_in: 900,
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		await startDeviceFlow();

		expect(fetchSpy).toHaveBeenCalledWith(
			DEVICE_CODE_URL,
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded",
					"x-request-id": expect.any(String),
				}),
				body: expect.stringContaining(`client_id=${CLIENT_ID}`),
			}),
		);
	});

	it("handles authorization_pending then succeeds", async () => {
		vi.useFakeTimers();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "authorization_pending" }), {
					status: 400,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 60 }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);

		const promise = pollForToken({ deviceCode: "device", verifier: "verifier", expiresIn: 10 });
		await vi.advanceTimersByTimeAsync(2_000);
		await expect(promise).resolves.toMatchObject({ access_token: "access" });
		expect(fetchSpy).toHaveBeenNthCalledWith(
			1,
			TOKEN_URL,
			expect.objectContaining({ body: expect.stringContaining(`grant_type=${encodeURIComponent(DEVICE_GRANT_TYPE)}`) }),
		);
	});

	it("backs off after slow_down before polling again", async () => {
		vi.useFakeTimers();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "slow_down" }), {
					status: 400,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 60 }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);

		const promise = pollForToken({ deviceCode: "device", verifier: "verifier", expiresIn: 10, intervalSeconds: 2 });
		await Promise.resolve();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2_999);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await expect(promise).resolves.toMatchObject({ access_token: "access" });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("treats bare 401 polling responses as expired or invalid device codes", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("Unauthorized", {
				status: 401,
				headers: { "content-type": "text/plain" },
			}),
		);

		await expect(pollForToken({ deviceCode: "device", verifier: "verifier", expiresIn: 10 })).rejects.toBeInstanceOf(
			QwenOAuthExpiredDeviceCodeError,
		);
	});

	it("aborts while sleeping between polling attempts", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "authorization_pending" }), {
				status: 400,
				headers: { "content-type": "application/json" },
			}),
		);

		const promise = pollForToken({
			deviceCode: "device",
			verifier: "verifier",
			expiresIn: 10,
			signal: controller.signal,
		});
		await Promise.resolve();
		controller.abort();
		await expect(promise).rejects.toThrow("Login cancelled");
	});

	it("aborts an active login request", async () => {
		const controller = new AbortController();
		vi.spyOn(globalThis, "fetch").mockImplementation((_url, init?: RequestInit) => {
			const signal = init?.signal;
			if (!signal) {
				return Promise.reject(new Error("Expected an AbortSignal"));
			}
			if (signal.aborted) {
				return Promise.reject(new DOMException("Aborted", "AbortError"));
			}

			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
			});
		});

		const loginPromise = loginQwen({
			onAuth() {},
			onPrompt: () => Promise.resolve(""),
			signal: controller.signal,
		});
		await Promise.resolve();
		controller.abort();
		await expect(loginPromise).rejects.toThrow("Login cancelled");
	});
});
