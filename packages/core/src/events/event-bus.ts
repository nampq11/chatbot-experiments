import type { DomainEvent } from "./domain-events.ts";

/** A listener failure captured while dispatching a domain event. */
export interface EventListenerFailure {
  readonly event: DomainEvent;
  readonly error: Error;
}

/** Domain-level publish/subscribe contract for backend events. */
export interface EventBus {
  on<TEvent extends DomainEvent["type"]>(
    type: TEvent,
    listener: (event: Extract<DomainEvent, { type: TEvent }>) => void | Promise<void>,
  ): () => void;
  /**
   * Dispatches an event to registered listeners.
   * Listener failures, including async rejections, are reported through the
   * bus implementation's failure sink rather than returned, so callers never
   * iterate dispatch results.
   */
  publish(event: DomainEvent): void;
}
