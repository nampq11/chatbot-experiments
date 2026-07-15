import { describe, expect, it, vi } from "vitest";
import { AgentService } from "./service.ts";

describe("AgentService", () => {
  it("suppresses stream events after cancellation", async () => {
    const onStreamEvent = vi.fn();
    const runtime = {
      startRun: vi.fn(async (request) => {
        request.onStreamEvent?.({
          type: "message.delta",
          sessionId: request.sessionId,
          messageId: "assistant-1",
          delta: "first",
        });
      }),
      resumeRun: vi.fn(async () => {}),
      abortRun: vi.fn(),
    };

    const service = new AgentService(runtime);
    await service.startRun({
      sessionId: "session-1",
      messageId: "message-1",
      userId: "user-1",
      onStreamEvent,
    });
    service.abortRun("session-1");
    await service.startRun({
      sessionId: "session-1",
      messageId: "message-2",
      userId: "user-1",
      onStreamEvent,
    });

    expect(onStreamEvent).toHaveBeenCalledTimes(2);
    expect(runtime.abortRun).toHaveBeenCalledWith("session-1");
  });

  it("keeps cancelling the active run after abort", async () => {
    const onStreamEvent = vi.fn();
    let streamLater: (() => void) | undefined;
    const runtime = {
      startRun: vi.fn(async (request) => {
        streamLater = () =>
          request.onStreamEvent?.({
            type: "message.delta",
            sessionId: request.sessionId,
            messageId: "assistant-1",
            delta: "first",
          });
      }),
      resumeRun: vi.fn(async () => {}),
      abortRun: vi.fn(),
    };

    const service = new AgentService(runtime);
    const run = service.startRun({
      sessionId: "session-1",
      messageId: "message-1",
      userId: "user-1",
      onStreamEvent,
    });
    service.abortRun("session-1");
    streamLater?.();
    await run;

    expect(onStreamEvent).not.toHaveBeenCalled();
  });

  it("allows new runs to stream normally after abort", async () => {
    const onStreamEvent = vi.fn();
    const runtime = {
      startRun: vi.fn(async (request) => {
        request.onStreamEvent?.({
          type: "message.delta",
          sessionId: request.sessionId,
          messageId: "assistant-1",
          delta: "streaming-content",
        });
      }),
      resumeRun: vi.fn(async () => {}),
      abortRun: vi.fn(),
    };

    const service = new AgentService(runtime);

    const firstRun = service.startRun({
      sessionId: "session-1",
      messageId: "message-1",
      userId: "user-1",
      onStreamEvent,
    });
    service.abortRun("session-1");
    await firstRun;

    onStreamEvent.mockClear();

    await service.startRun({
      sessionId: "session-1",
      messageId: "message-2",
      userId: "user-1",
      onStreamEvent,
    });

    expect(onStreamEvent).toHaveBeenCalledTimes(1);
    expect(onStreamEvent).toHaveBeenCalledWith({
      type: "message.delta",
      sessionId: "session-1",
      messageId: "assistant-1",
      delta: "streaming-content",
    });
  });
});
