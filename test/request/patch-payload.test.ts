import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { patchQwenRequestPayload } from "../../src/request/patch-payload.js";

const fixture = (name: string) =>
	JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures", name), "utf8")) as Record<string, unknown>;

describe("patchQwenRequestPayload", () => {
	it("is a no-op for other models", () => {
		const payload = { model: "other-model", messages: [] };
		expect(patchQwenRequestPayload(payload, { sessionId: "s", promptId: "p" })).toBe(payload);
	});

	it("matches the fixture snapshot for a minimal request", () => {
		const payload = fixture("qwen-chat-request.min.json");
		const expected = fixture("qwen-chat-request.patched.json");
		expect(patchQwenRequestPayload(payload, { sessionId: "session-1", promptId: "d445a7abc90358" })).toEqual(
			expected,
		);
	});

	it("preserves existing metadata keys", () => {
		const payload = {
			model: "coder-model",
			messages: [],
			metadata: { channel: "pi", other: 1 },
		};
		expect(patchQwenRequestPayload(payload, { sessionId: "s", promptId: "p" })).toMatchObject({
			metadata: { channel: "pi", other: 1, sessionId: "s", promptId: "p" },
		});
	});

	it("patches the system message and latest message like upstream Qwen Code", () => {
		const payload = {
			model: "coder-model",
			messages: [
				{ role: "system", content: [{ type: "text", text: "sys" }, { type: "input_audio", input_audio: {} }] },
				{ role: "user", content: [{ type: "text", text: "older user" }] },
				{ role: "assistant", content: [{ type: "tool_result", tool_result: { ok: true } }] },
			],
		};

		expect(patchQwenRequestPayload(payload, { sessionId: "s", promptId: "p" })).toMatchObject({
			messages: [
				{
					content: [
						{ type: "text", text: "sys" },
						{ type: "input_audio", input_audio: {}, cache_control: { type: "ephemeral" } },
					],
				},
				{ content: [{ type: "text", text: "older user" }] },
				{
					content: [{ type: "tool_result", tool_result: { ok: true }, cache_control: { type: "ephemeral" } }],
				},
			],
		});
	});

	it("leaves empty content arrays unchanged instead of appending synthetic text", () => {
		const payload = {
			model: "coder-model",
			messages: [{ role: "user", content: [] }],
		};

		expect(patchQwenRequestPayload(payload, { sessionId: "s", promptId: "p" })).toMatchObject({
			messages: [{ content: [] }],
		});
	});
});
