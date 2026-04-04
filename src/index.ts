import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { QWEN_PROVIDER_ID } from "./constants.js";
import { createQwenProviderConfig } from "./provider.js";
import { withQwenRequestPatches } from "./request-patches.js";

const QWEN_ALIAS_PATTERN = /^qwen-oauth(?:-\d+)?$/;

export default function (pi: ExtensionAPI) {
	const sessionId = crypto.randomUUID();
	let promptCounter = 0;

	pi.registerProvider(QWEN_PROVIDER_ID, createQwenProviderConfig());

	pi.on("before_provider_request", (event, ctx) => {
		const provider = ctx.model?.provider;
		if (!provider || !QWEN_ALIAS_PATTERN.test(provider)) return;
		promptCounter += 1;
		return withQwenRequestPatches(event.payload, sessionId, `${sessionId}########${promptCounter}`);
	});
}
