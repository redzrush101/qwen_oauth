import type { SessionEntry, SessionManager } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { METADATA_ENTRY_TYPE } from "../../src/constants.js";
import { RequestMetadataTracker } from "../../src/request/metadata.js";

type ReadonlySessionManager = Pick<SessionManager, "getBranch">;

function createSessionManager(entries: SessionEntry[]): ReadonlySessionManager {
	return {
		getBranch: () => entries,
	} as ReadonlySessionManager;
}

describe("RequestMetadataTracker", () => {
	it("restores the persisted session id and emits Qwen-style prompt ids", () => {
		const tracker = new RequestMetadataTracker();
		tracker.restoreFromSession(
			createSessionManager([
				{
					id: "1",
					parentId: null,
					timestamp: "2026-04-05T11:40:09.000Z",
					type: "custom",
					customType: METADATA_ENTRY_TYPE,
					data: { sessionId: "saved-session" },
				},
			]),
		);

		const next = tracker.next();
		expect(next.metadata.sessionId).toBe("saved-session");
		expect(next.metadata.promptId).toMatch(/^[0-9a-f]{14}$/);
		expect(next.state).toEqual({ sessionId: "saved-session" });
	});

	it("can reproduce the prompt id shape captured from Qwen CLI", () => {
		const tracker = new RequestMetadataTracker(() => "d445a7abc90358");

		expect(tracker.next().metadata.promptId).toBe("d445a7abc90358");
	});
});
