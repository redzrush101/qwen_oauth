import { EPHEMERAL_CACHE_CONTROL } from "../constants.js";
import type { JsonRecord } from "../types.js";

function isRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === "object";
}

function cloneArray<T>(items: T[]): T[] {
	return items.slice();
}

function addCacheControl(part: unknown): unknown {
	if (!isRecord(part)) return part;
	return { ...part, cache_control: EPHEMERAL_CACHE_CONTROL };
}

function patchContentArray(parts: unknown[]): unknown[] {
	if (parts.length === 0) return parts;
	const nextParts = cloneArray(parts);
	const lastIndex = nextParts.length - 1;
	const lastPart = nextParts[lastIndex];
	if (!isRecord(lastPart)) return nextParts;
	nextParts[lastIndex] = addCacheControl(lastPart);
	return nextParts;
}

export function patchMessageContentWithCacheControl(message: unknown): unknown {
	if (!isRecord(message) || !("content" in message)) return message;
	const content = message.content;

	if (typeof content === "string") {
		return {
			...message,
			content: [{ type: "text", text: content, cache_control: EPHEMERAL_CACHE_CONTROL }],
		};
	}

	if (!Array.isArray(content)) return message;
	return { ...message, content: patchContentArray(content) };
}

export function patchLastToolWithCacheControl(tools: unknown): unknown {
	if (!Array.isArray(tools) || tools.length === 0) return tools;
	const nextTools = cloneArray(tools);
	nextTools[nextTools.length - 1] = addCacheControl(nextTools[nextTools.length - 1]);
	return nextTools;
}
