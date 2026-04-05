import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { METADATA_ENTRY_TYPE, QWEN_PROVIDER_ID } from "./constants.js";
import { createQwenProviderConfig } from "./provider-config.js";
import { RequestMetadataTracker } from "./request/metadata.js";
import { patchQwenRequestPayload } from "./request/patch-payload.js";

export default function qwenOAuthExtension(pi: ExtensionAPI) {
	const metadataTracker = new RequestMetadataTracker();

	pi.registerProvider(QWEN_PROVIDER_ID, createQwenProviderConfig());

	pi.on("session_start", (_event, ctx) => {
		metadataTracker.restoreFromSession(ctx.sessionManager);
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== QWEN_PROVIDER_ID) return;
		const { metadata, state } = metadataTracker.next();
		pi.appendEntry(METADATA_ENTRY_TYPE, state);
		return patchQwenRequestPayload(event.payload, metadata);
	});
}
