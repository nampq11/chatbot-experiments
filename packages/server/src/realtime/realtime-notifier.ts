import type { DomainEvent, EventBus } from "@dentaltrip-ai/core/events";
import {
  type RealtimeFrame,
  RealtimeHub,
  type RealtimeScope,
  type RealtimeSubscriber,
} from "@dentaltrip-ai/core/realtime";

const REALTIME_DOMAIN_EVENT_TYPES = [
  "session.created",
  "session.deleted",
  "message.appended",
  "agent_start",
  "agent_end",
] as const satisfies ReadonlyArray<DomainEvent["type"]>;

type RealtimeDomainEventType = (typeof REALTIME_DOMAIN_EVENT_TYPES)[number];

/** Domain events that the realtime layer projects to connected clients. */
export type RealtimeDomainEvent = Extract<DomainEvent, { type: RealtimeDomainEventType }>;
type SessionRealtimeFrame = Extract<RealtimeFrame, { sessionId: string }>;

/** Options for wiring realtime notifications to an existing subscriber hub. */
export interface RealtimeNotifierOptions {
  readonly hub?: RealtimeHub;
}

/**
 * Facade over realtime domain-event projection and hub fanout.
 *
 * Callers publish domain events to this notifier without knowing frame shapes,
 * scope routing, SSE transport, or subscriber storage details.
 */
export class RealtimeNotifier {
  private readonly events: EventBus;
  private readonly hub: RealtimeHub;
  private unsubscribers: Array<() => void> = [];

  constructor(events: EventBus, options: RealtimeNotifierOptions = {}) {
    this.events = events;
    this.hub = options.hub ?? new RealtimeHub();
  }

  start(): void {
    if (this.unsubscribers.length > 0) {
      return;
    }

    this.unsubscribers = REALTIME_DOMAIN_EVENT_TYPES.map((eventType) =>
      this.events.on(eventType, (event) => {
        this.notify(event);
      }),
    );
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }

    this.unsubscribers = [];
  }

  register(scope: RealtimeScope, subscriber: RealtimeSubscriber): void {
    this.hub.register(scope, subscriber);
  }

  unregister(scope: RealtimeScope, subscriber: RealtimeSubscriber): void {
    this.hub.unregister(scope, subscriber);
  }

  notify(event: RealtimeDomainEvent): void {
    const frame = mapEventToFrame(event);

    for (const scope of resolveScopes(event)) {
      this.hub.broadcast(scope, frame);
    }
  }

  broadcastSessionFrame(frame: SessionRealtimeFrame): void {
    this.hub.broadcast({ type: "session", id: frame.sessionId }, frame);
  }
}

/** Maps a domain event observed by the realtime layer to its wire frame. */
export function mapEventToFrame(event: RealtimeDomainEvent): RealtimeFrame {
  switch (event.type) {
    case "session.created":
    case "session.deleted":
      return {
        type: event.type,
        sessionId: event.sessionId,
        userId: event.userId,
      };
    case "message.appended":
      return {
        type: event.type,
        sessionId: event.sessionId,
        messageId: event.messageId,
        userId: event.userId,
      };
    case "agent_start":
      return {
        type: "agent.run.started",
        sessionId: event.sessionId,
        runId: event.runId,
      };
    case "agent_end": {
      if (event.status === "failed") {
        return {
          type: "agent.run.failed",
          sessionId: event.sessionId,
          runId: event.runId,
          error: event.errorMessage ?? "Agent run failed.",
        };
      }

      const type = event.status === "cancelled" ? "agent.run.cancelled" : "agent.run.completed";

      return {
        type,
        sessionId: event.sessionId,
        runId: event.runId,
      };
    }
  }
}

/** Resolves the subscriber scopes that should receive a realtime domain event. */
export function resolveScopes(event: RealtimeDomainEvent): ReadonlyArray<RealtimeScope> {
  switch (event.type) {
    case "session.created":
      return [{ type: "user", id: event.userId }];
    case "session.deleted":
      return [
        { type: "user", id: event.userId },
        { type: "session", id: event.sessionId },
      ];
    case "message.appended":
    case "agent_start":
    case "agent_end":
      return [{ type: "session", id: event.sessionId }];
  }
}
