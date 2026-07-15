import type { ContextualAgentEvent } from "../agent/events.ts";
import type { SessionMutationEvent } from "../session/events.ts";

export type { ContextualAgentEvent, SessionMutationEvent };

/**
 * Union of in-process domain notifications published inside backend domain and app logic.
 * Transient assistant stream deltas are delivered through a dedicated realtime
 * sink rather than this bus.
 */
export type DomainEvent = SessionMutationEvent | ContextualAgentEvent;
