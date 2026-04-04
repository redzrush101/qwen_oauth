import { EPHEMERAL_CACHE_CONTROL, QWEN_MODEL_ID } from "./constants.js";

type QwenPayload = Record<string, unknown> & {
	model?: string;
	messages?: unknown[];
	tools?: unknown[];
	metadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

function withCacheControl(value: unknown): unknown {
	if (!isRecord(value)) return value;
	return { ...value, cache_control: EPHEMERAL_CACHE_CONTROL };
}

function withMessageCacheControl(message: unknown): unknown {
	if (!isRecord(message) || !("content" in message)) return message;
	const content = message.content;

	if (typeof content === "string") {
		return {
			...message,
			content: [{ type: "text", text: content, cache_control: EPHEMERAL_CACHE_CONTROL }],
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

	return {
		...message,
		content: [...parts, { type: "text", text: "", cache_control: EPHEMERAL_CACHE_CONTROL }],
	};
}

export function withQwenRequestPatches(payload: unknown, sessionId: string, promptId: string): unknown {
	if (!isRecord(payload) || payload.model !== QWEN_MODEL_ID) return payload;

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
