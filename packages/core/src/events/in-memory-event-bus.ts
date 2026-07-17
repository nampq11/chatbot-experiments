import type {
  DomainEvent,
  EventBus,
  EventListenerFailure,
} from "@chatbot-experiments/core/events";

type DomainEventListener = (event: DomainEvent) => void | Promise<void>;

/** Options for constructing an in-process domain event bus. */
export interface InMemoryEventBusOptions {
  /**
   * Called for each listener that throws or rejects while dispatching an event.
   * Dispatch continues to later listeners regardless of failures.
   */
  readonly onFailure?: (failure: EventListenerFailure) => void;
}

/** Creates an in-process event bus for domain events. */
export function createInMemoryEventBus(
  options: InMemoryEventBusOptions = {},
): EventBus {
  const { onFailure } = options;
  const listeners = new Map<DomainEvent["type"], Set<DomainEventListener>>();

  const reportFailure = (event: DomainEvent, error: unknown): void => {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    onFailure?.({ event, error: normalized });
  };

  const on: EventBus["on"] = (type, listener) => {
    const bucket = listeners.get(type) ?? new Set<DomainEventListener>();
    const domainListener = listener as DomainEventListener;

    bucket.add(domainListener);
    listeners.set(type, bucket);

    return () => {
      bucket.delete(domainListener);
      if (bucket.size === 0) {
        listeners.delete(type);
      }
    };
  };

  return {
    on,
    publish(event) {
      const bucket = listeners.get(event.type);

      if (!bucket) {
        return;
      }

      for (const listener of bucket) {
        try {
          void Promise.resolve(listener(event)).catch((error: unknown) => {
            reportFailure(event, error);
          });
        } catch (error) {
          reportFailure(event, error);
        }
      }
    },
  };
}
