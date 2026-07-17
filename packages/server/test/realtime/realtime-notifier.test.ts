import {
  createInMemoryEventBus,
  type DomainEvent,
  type EventBus,
} from "@chatbot-experiments/core/events";
import type {
  RealtimeFrame,
  RealtimeSubscriber,
} from "@chatbot-experiments/core/realtime";
import { describe, expect, it, vi } from "vitest";
import {
  mapEventToFrame,
  RealtimeNotifier,
  resolveScopes,
} from "../../src/realtime/realtime-notifier.ts";

type TestSubscriber = RealtimeSubscriber & {
  readonly send: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
};

interface NotifierFixture {
  readonly events: EventBus;
  readonly notifier: RealtimeNotifier;
  readonly userSubscriber: TestSubscriber;
  readonly sessionSubscriber: TestSubscriber;
}

function createSubscriber(): TestSubscriber {
  return {
    send: vi.fn(() => true),
    close: vi.fn(),
    onClose: vi.fn(),
  };
}

function setupNotifier(): NotifierFixture {
  const events = createInMemoryEventBus();
  const notifier = new RealtimeNotifier(events);
  const userSubscriber = createSubscriber();
  const sessionSubscriber = createSubscriber();

  notifier.register({ type: "user", id: "user-1" }, userSubscriber);
  notifier.register({ type: "session", id: "session-1" }, sessionSubscriber);

  return {
    events,
    notifier,
    userSubscriber,
    sessionSubscriber,
  };
}

describe("RealtimeNotifier", () => {
  it("maps domain events to realtime frames", () => {
    const messageEvent: DomainEvent = {
      type: "message.appended",
      sessionId: "session-1",
      messageId: "message-1",
      userId: "user-1",
      role: "user",
    };

    expect(mapEventToFrame(messageEvent)).toEqual({
      type: "message.appended",
      sessionId: "session-1",
      messageId: "message-1",
      userId: "user-1",
    });
  });

  it("resolves session deletion to both list and open-chat scopes", () => {
    expect(
      resolveScopes({
        type: "session.deleted",
        sessionId: "session-1",
        userId: "user-1",
      }),
    ).toEqual([
      { type: "user", id: "user-1" },
      { type: "session", id: "session-1" },
    ]);
  });

  it("subscribes to domain events and fans out projected frames", () => {
    const { events, notifier, userSubscriber, sessionSubscriber } =
      setupNotifier();

    notifier.start();

    events.publish({
      type: "session.created",
      sessionId: "session-1",
      userId: "user-1",
    });
    events.publish({
      type: "message.appended",
      sessionId: "session-1",
      messageId: "message-1",
      userId: "user-1",
      role: "user",
    });
    events.publish({
      type: "agent_start",
      sessionId: "session-1",
      runId: "run-1",
    });
    events.publish({
      type: "agent_end",
      sessionId: "session-1",
      runId: "run-1",
      messages: [],
      status: "failed",
      errorMessage: "provider unavailable",
    });

    expect(userSubscriber.send.mock.calls.map(([frame]) => frame)).toEqual([
      {
        type: "session.created",
        sessionId: "session-1",
        userId: "user-1",
      },
    ]);
    expect(sessionSubscriber.send.mock.calls.map(([frame]) => frame)).toEqual([
      {
        type: "message.appended",
        sessionId: "session-1",
        messageId: "message-1",
        userId: "user-1",
      },
      {
        type: "agent.run.started",
        sessionId: "session-1",
        runId: "run-1",
      },
      {
        type: "agent.run.failed",
        sessionId: "session-1",
        runId: "run-1",
        error: "provider unavailable",
      },
    ]);
  });

  it("notifies both user and session scopes when a session is deleted", () => {
    const { notifier, userSubscriber, sessionSubscriber } = setupNotifier();

    notifier.notify({
      type: "session.deleted",
      sessionId: "session-1",
      userId: "user-1",
    });

    const expectedFrame: RealtimeFrame = {
      type: "session.deleted",
      sessionId: "session-1",
      userId: "user-1",
    };
    expect(userSubscriber.send).toHaveBeenCalledWith(expectedFrame);
    expect(sessionSubscriber.send).toHaveBeenCalledWith(expectedFrame);
  });

  it("does not duplicate listeners when started more than once", () => {
    const { events, notifier, sessionSubscriber } = setupNotifier();

    notifier.start();
    notifier.start();
    events.publish({
      type: "agent_start",
      sessionId: "session-1",
      runId: "run-1",
    });

    expect(sessionSubscriber.send).toHaveBeenCalledTimes(1);
  });

  it("stop unsubscribes listeners and is safe before start", () => {
    const { events, notifier, sessionSubscriber } = setupNotifier();

    notifier.stop();
    notifier.start();
    events.publish({
      type: "agent_start",
      sessionId: "session-1",
      runId: "run-1",
    });
    notifier.stop();
    events.publish({
      type: "agent_end",
      sessionId: "session-1",
      runId: "run-1",
      messages: [],
      status: "completed",
    });

    expect(sessionSubscriber.send).toHaveBeenCalledTimes(1);
    expect(sessionSubscriber.send).toHaveBeenCalledWith({
      type: "agent.run.started",
      sessionId: "session-1",
      runId: "run-1",
    });
  });

  it("broadcasts session stream frames without exposing the hub", () => {
    const { notifier, sessionSubscriber } = setupNotifier();

    notifier.broadcastSessionFrame({
      type: "message.delta",
      sessionId: "session-1",
      messageId: "message-1",
      delta: "hello",
    });

    expect(sessionSubscriber.send).toHaveBeenCalledWith({
      type: "message.delta",
      sessionId: "session-1",
      messageId: "message-1",
      delta: "hello",
    });
  });
});
