import { describe, expect, it, vi } from "vitest";
import { type RealtimeFrame, RealtimeHub, type RealtimeSubscriber } from "./hub.ts";

function createSubscriber(sendResult = true): RealtimeSubscriber & {
  triggerClose: () => void;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  let closeHandler: (() => void) | undefined;

  return {
    send: vi.fn(() => sendResult),
    close: vi.fn(() => {
      closeHandler?.();
    }),
    onClose: vi.fn((handler: () => void) => {
      closeHandler = handler;
    }),
    triggerClose: () => {
      closeHandler?.();
    },
  };
}

describe("RealtimeHub", () => {
  it("evicts subscribers whose sends fail during broadcast", () => {
    const hub = new RealtimeHub();
    const failingSubscriber = createSubscriber(false);
    const healthySubscriber = createSubscriber(true);
    const scope = { type: "session", id: "session-1" } as const;
    const frame: RealtimeFrame = {
      type: "typing",
      sessionId: "session-1",
      userId: "user-1",
    };

    hub.register(scope, failingSubscriber);
    hub.register(scope, healthySubscriber);
    hub.broadcast(scope, frame);
    hub.broadcast(scope, frame);

    expect(failingSubscriber.close).toHaveBeenCalledWith("send failed");
    expect(failingSubscriber.send).toHaveBeenCalledTimes(1);
    expect(healthySubscriber.send).toHaveBeenCalledTimes(2);
    expect(healthySubscriber.send).toHaveBeenCalledWith(frame);
  });

  it("broadcasts lifecycle frames to the session scope", () => {
    const hub = new RealtimeHub();
    const subscriber = createSubscriber(true);
    const scope = { type: "session", id: "session-1" } as const;

    hub.register(scope, subscriber);
    hub.broadcast(scope, {
      type: "agent.run.completed",
      sessionId: "session-1",
      runId: "run-1",
    });

    expect(subscriber.send).toHaveBeenCalledWith({
      type: "agent.run.completed",
      sessionId: "session-1",
      runId: "run-1",
    });
  });
});
