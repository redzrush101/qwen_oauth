import type {
	BeforeProviderRequestEvent,
	ExtensionAPI,
	ProviderConfig,
	SessionEntry,
	SessionManager,
	SessionStartEvent,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import qwenOAuthExtension from "../../src/index.js";
import { METADATA_ENTRY_TYPE, QWEN_PROVIDER_ID } from "../../src/constants.js";

type ReadonlySessionManager = Pick<SessionManager, "getBranch">;

function createSessionManager(entries: SessionEntry[]): ReadonlySessionManager {
	return { getBranch: () => entries } as ReadonlySessionManager;
}

type SessionStartHandler = (event: SessionStartEvent, ctx: { sessionManager: ReadonlySessionManager }) => void;
type BeforeProviderRequestHandler = (
	event: BeforeProviderRequestEvent,
	ctx: { model?: { provider?: string } },
) => unknown;

type HandlerMap = {
	session_start?: SessionStartHandler;
	before_provider_request?: BeforeProviderRequestHandler;
};

describe("qwenOAuthExtension wiring", () => {
	it("registers the provider and restores persisted metadata on session_start", () => {
		const handlers: HandlerMap = {};
		const registerProvider = vi.fn();
		const appendEntry = vi.fn();
		const pi = {
			registerProvider(name: string, config: ProviderConfig) {
				registerProvider(name, config);
			},
			appendEntry,
			on(event: "session_start" | "before_provider_request", handler: SessionStartHandler | BeforeProviderRequestHandler) {
				if (event === "session_start") {
					handlers.session_start = handler as SessionStartHandler;
					return;
				}
				handlers.before_provider_request = handler as BeforeProviderRequestHandler;
			},
		} as unknown as ExtensionAPI;

		qwenOAuthExtension(pi);
		expect(registerProvider).toHaveBeenCalledWith(QWEN_PROVIDER_ID, expect.objectContaining({ authHeader: true }));

		const sessionStart = handlers.session_start;
		const beforeProviderRequest = handlers.before_provider_request;
		if (!sessionStart || !beforeProviderRequest) {
			throw new Error("Expected extension handlers to be registered");
		}

		sessionStart({ type: "session_start", reason: "resume" }, {
			sessionManager: createSessionManager([
				{
					id: "1",
					parentId: null,
					timestamp: "2026-04-05T11:40:09.000Z",
					type: "custom",
					customType: METADATA_ENTRY_TYPE,
					data: { sessionId: "saved-session" },
				},
			]),
		});

		const payload = beforeProviderRequest(
			{
				type: "before_provider_request",
				payload: { model: "coder-model", messages: [] },
			},
			{ model: { provider: QWEN_PROVIDER_ID } },
		) as { metadata?: { sessionId?: string; promptId?: string } };

		expect(appendEntry).toHaveBeenCalledWith(METADATA_ENTRY_TYPE, { sessionId: "saved-session" });
		expect(payload.metadata?.sessionId).toBe("saved-session");
		expect(payload.metadata?.promptId).toMatch(/^[0-9a-f]{14}$/);
	});

	it("ignores non-qwen providers in before_provider_request", () => {
		const handlers: HandlerMap = {};
		const appendEntry = vi.fn();
		const pi = {
			registerProvider() {},
			appendEntry,
			on(event: "session_start" | "before_provider_request", handler: SessionStartHandler | BeforeProviderRequestHandler) {
				if (event === "session_start") {
					handlers.session_start = handler as SessionStartHandler;
					return;
				}
				handlers.before_provider_request = handler as BeforeProviderRequestHandler;
			},
		} as unknown as ExtensionAPI;

		qwenOAuthExtension(pi);

		const beforeProviderRequest = handlers.before_provider_request;
		if (!beforeProviderRequest) {
			throw new Error("Expected before_provider_request handler to be registered");
		}

		expect(
			beforeProviderRequest(
				{
					type: "before_provider_request",
					payload: { model: "coder-model", messages: [] },
				},
				{ model: { provider: "other" } },
			),
		).toBeUndefined();
		expect(appendEntry).not.toHaveBeenCalled();
	});
});
