import type { DomainEvent } from "@dentaltrip-ai/core/events";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryEventBus } from "./in-memory-event-bus.ts";

const messageAppendedEvent: DomainEvent = {
  type: "message.appended",
  sessionId: "session-1",
  messageId: "message-1",
  userId: "user-1",
  role: "user",
};

describe("createInMemoryEventBus", () => {
  it("dispatches events to listeners registered for the event type", () => {
    const events = createInMemoryEventBus();
    const listener = vi.fn();

    events.on("message.appended", listener);
    events.publish(messageAppendedEvent);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(messageAppendedEvent);
  });

  it("does not dispatch events to listeners registered for other event types", () => {
    const events = createInMemoryEventBus();
    const messageListener = vi.fn();
    const sessionListener = vi.fn();

    events.on("message.appended", messageListener);
    events.on("session.created", sessionListener);

    events.publish(messageAppendedEvent);

    expect(messageListener).toHaveBeenCalledTimes(1);
    expect(sessionListener).not.toHaveBeenCalled();
  });

  it("unsubscribes registered listeners", () => {
    const events = createInMemoryEventBus();
    const listener = vi.fn();
    const unsubscribe = events.on("message.appended", listener);

    unsubscribe();
    events.publish(messageAppendedEvent);

    expect(listener).not.toHaveBeenCalled();
  });

  it("reports async listener rejections without stopping later listeners", async () => {
    const reportedFailures: { type: string; message: string }[] = [];
    const events = createInMemoryEventBus({
      onFailure: ({ event, error }) => {
        reportedFailures.push({ type: event.type, message: error.message });
      },
    });
    const laterListener = vi.fn();

    events.on("message.appended", async () => {
      throw new Error("async listener failed");
    });
    events.on("message.appended", laterListener);

    events.publish(messageAppendedEvent);

    expect(laterListener).toHaveBeenCalledWith(messageAppendedEvent);
    await vi.waitFor(() => {
      expect(reportedFailures).toEqual([{ type: "message.appended", message: "async listener failed" }]);
    });
  });

  it("reports listener failures via onFailure without stopping later listeners", () => {
    const reportedFailures: { type: string; message: string }[] = [];
    const events = createInMemoryEventBus({
      onFailure: ({ event, error }) => {
        reportedFailures.push({ type: event.type, message: error.message });
      },
    });
    const expectedError = new Error("listener failed");
    const laterListener = vi.fn();

    events.on("message.appended", () => {
      throw expectedError;
    });
    events.on("message.appended", () => {
      throw "string failure";
    });
    events.on("message.appended", laterListener);

    events.publish(messageAppendedEvent);

    expect(laterListener).toHaveBeenCalledWith(messageAppendedEvent);
    expect(reportedFailures).toEqual([
      { type: "message.appended", message: "listener failed" },
      { type: "message.appended", message: "string failure" },
    ]);
  });
});
