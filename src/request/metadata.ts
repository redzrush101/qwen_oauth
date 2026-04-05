import { randomBytes, randomUUID } from "node:crypto";
import type { SessionEntry, SessionManager } from "@mariozechner/pi-coding-agent";
import { METADATA_ENTRY_TYPE } from "../constants.js";
import type { QwenMetadataState, RequestMetadata } from "../types.js";

export type ReadonlySessionManagerLike = Pick<SessionManager, "getBranch">;

function isMetadataState(value: unknown): value is QwenMetadataState {
	return (
		!!value &&
		typeof value === "object" &&
		typeof (value as { sessionId?: unknown }).sessionId === "string"
	);
}

function generatePromptId(): string {
	return randomBytes(7).toString("hex");
}

export class RequestMetadataTracker {
	private sessionId: string = randomUUID();

	constructor(private readonly promptIdFactory: () => string = generatePromptId) {}

	restoreFromSession(sessionManager: ReadonlySessionManagerLike): void {
		const state = findLatestMetadataState(sessionManager.getBranch());
		if (!state) return;
		this.sessionId = state.sessionId;
	}

	next(): { metadata: RequestMetadata; state: QwenMetadataState } {
		return {
			metadata: {
				sessionId: this.sessionId,
				promptId: this.promptIdFactory(),
			},
			state: this.snapshot(),
		};
	}

	snapshot(): QwenMetadataState {
		return {
			sessionId: this.sessionId,
		};
	}
}

function findLatestMetadataState(entries: SessionEntry[]): QwenMetadataState | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "custom" || !("customType" in entry) || entry.customType !== METADATA_ENTRY_TYPE) continue;
		if ("data" in entry && isMetadataState(entry.data)) return entry.data;
	}
	return undefined;
}
