import type { AssistantMessage, AssistantMessageEvent } from "./types.js";

/** Generic push-based async iterable event stream with a typed final result. */
export class EventStream<T, R = void> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiting: ((result: IteratorResult<T>) => void)[] = [];
  private done = false;
  private readonly finalResultPromise: Promise<R>;
  private resolveFinalResult: (result: R) => void = () => {
    throw new Error("Event stream final result resolver is not initialized.");
  };

  constructor(
    private readonly isComplete: (event: T) => boolean,
    private readonly extractResult: (event: T) => R,
  ) {
    this.finalResultPromise = new Promise((resolve) => {
      this.resolveFinalResult = resolve;
    });
  }

  /** Pushes an event into the stream. Events after settlement are ignored. */
  push(event: T): void {
    if (this.done) {
      return;
    }

    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }

    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
      return;
    }

    this.queue.push(event);
  }

  /** Closes the stream manually and optionally resolves the final result. */
  end(result?: R): void {
    this.done = true;
    if (result !== undefined) {
      this.resolveFinalResult(result);
    }

    while (this.waiting.length > 0) {
      this.waiting.shift()?.({ value: undefined as T, done: true });
    }
  }

  /** Returns the final result extracted from the completing event. */
  result(): Promise<R> {
    return this.finalResultPromise;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const queued = this.queue.shift();
      if (queued) {
        yield queued;
        continue;
      }

      if (this.done) {
        return;
      }

      const result = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiting.push(resolve);
      });

      if (result.done) {
        return;
      }

      yield result.value;
    }
  }
}

/** Event stream implementation for assistant message events. */
export class AssistantMessageEventStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
  constructor() {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => {
        if (event.type === "done") {
          return event.message;
        }
        if (event.type === "error") {
          return event.error;
        }
        throw new Error(`Assistant stream ended with unsupported event: ${event.type}`);
      },
    );
  }
}

/** Creates an assistant message event stream. */
export function createAssistantMessageEventStream(): AssistantMessageEventStream {
  return new AssistantMessageEventStream();
}
