import { QWEN_MODEL_ID } from "../constants.js";
import type { JsonRecord, RequestMetadata } from "../types.js";
import { patchLastToolWithCacheControl, patchMessageContentWithCacheControl } from "./cache-control.js";

function isRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === "object";
}

export function patchQwenRequestPayload(payload: unknown, metadata: RequestMetadata): unknown {
	if (!isRecord(payload) || payload.model !== QWEN_MODEL_ID) return payload;

	const nextPayload: JsonRecord = {
		...payload,
		vl_high_resolution_images: true,
		metadata: {
			...(isRecord(payload.metadata) ? payload.metadata : {}),
			...metadata,
		},
	};

	if (Array.isArray(payload.messages) && payload.messages.length > 0) {
		const messages: unknown[] = payload.messages.slice();
		const systemIndex = messages.findIndex((message) => isRecord(message) && message.role === "system");
		const lastIndex = messages.length - 1;

		if (systemIndex >= 0) {
			messages[systemIndex] = patchMessageContentWithCacheControl(messages[systemIndex]);
		}
		messages[lastIndex] = patchMessageContentWithCacheControl(messages[lastIndex]);
		nextPayload.messages = messages;
	}

	if (Array.isArray(payload.tools) && payload.tools.length > 0) {
		const tools: unknown[] = payload.tools;
		nextPayload.tools = patchLastToolWithCacheControl(tools);
	}

	return nextPayload;
}
