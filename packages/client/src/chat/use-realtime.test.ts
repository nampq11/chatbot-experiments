import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError } from "../api/client";
import { messagesQueryKey } from "./queries";
import { useChatStore } from "./store";
import type { Message } from "./types";
import { applyRealtimeFrame, isNonRetryableRealtimeStreamError, isTransientRealtimeStreamError } from "./use-realtime";

const USER_ID = "user-1";
const SESSION_ID = "session-1";

function resetChatStore() {
  useChatStore.setState({
    activeSessionId: null,
    promptDraft: "",
    assistantPendingBySession: {},
    assistantPendingStartedAtBySession: {},
    assistantThoughtDurationsByMessage: {},
    latestAssistantThoughtDurationBySession: {},
    assistantStreamingMessageIdBySession: {},
    deleteDialogTarget: null,
    deleteSessionDialogTarget: null,
  });
}

function createRealtimeFrameContext(input: {
  queryClient: QueryClient;
  events?: string[];
  scheduleAssistantStreamingMessageClear?: () => void;
}) {
  return {
    sessionId: SESSION_ID,
    userId: USER_ID,
    queryClient: input.queryClient,
    setAssistantPending: (isPending: boolean) => {
      input.events?.push(`pending:${isPending}`);
      useChatStore.getState().setAssistantPending(SESSION_ID, isPending);
    },
    finishAssistantThinking: (messageId: string) => {
      input.events?.push(`finish:${messageId}`);
      useChatStore.getState().finishAssistantThinking(SESSION_ID, messageId);
    },
    setAssistantStreamingMessage: (messageId: string) => {
      input.events?.push(`streaming:${messageId}`);
      useChatStore.getState().setAssistantStreamingMessage(SESSION_ID, messageId);
    },
    clearAssistantStreamingMessage: () => {
      input.events?.push("clear-streaming");
      useChatStore.getState().clearAssistantStreamingMessage(SESSION_ID);
    },
    scheduleAssistantStreamingMessageClear:
      input.scheduleAssistantStreamingMessageClear ??
      (() => {
        input.events?.push("schedule-clear-streaming");
      }),
  };
}

describe("applyRealtimeFrame", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    resetChatStore();
  });

  it("preserves existing assistant content when a duplicate message.started frame arrives", () => {
    queryClient.setQueryData<Message[]>(messagesQueryKey(USER_ID, SESSION_ID), [
      {
        id: "assistant-message-1",
        sessionId: SESSION_ID,
        userId: "user-1",
        sequence: -1,
        role: "assistant",
        content: "already streaming",
        createdAt: new Date(),
      },
    ]);

    applyRealtimeFrame(
      {
        type: "message.started",
        sessionId: SESSION_ID,
        messageId: "assistant-message-1",
      },
      createRealtimeFrameContext({ queryClient }),
    );

    expect(queryClient.getQueryData<Message[]>(messagesQueryKey(USER_ID, SESSION_ID))).toMatchObject([
      {
        id: "assistant-message-1",
        content: "already streaming",
      },
    ]);
  });

  it("creates an empty streaming assistant row when message.started arrives", () => {
    queryClient.setQueryData(messagesQueryKey(USER_ID, SESSION_ID), []);

    applyRealtimeFrame(
      {
        type: "message.started",
        sessionId: SESSION_ID,
        messageId: "assistant-message-1",
      },
      createRealtimeFrameContext({ queryClient }),
    );

    expect(useChatStore.getState().assistantStreamingMessageIdBySession).toEqual({
      [SESSION_ID]: "assistant-message-1",
    });
    expect(queryClient.getQueryData<Message[]>(messagesQueryKey(USER_ID, SESSION_ID))).toMatchObject([
      {
        id: "assistant-message-1",
        sessionId: SESSION_ID,
        role: "assistant",
        content: "",
      },
    ]);
  });

  it("sets streaming before finishing thinking for final assistant messages", () => {
    const events: string[] = [];
    queryClient.setQueryData<Message[]>(messagesQueryKey(USER_ID, SESSION_ID), [
      {
        id: "assistant-message-1",
        sessionId: SESSION_ID,
        userId: "user-1",
        sequence: -1,
        role: "assistant",
        content: "draft",
        createdAt: new Date(),
      },
    ]);

    applyRealtimeFrame(
      {
        type: "assistant.message",
        sessionId: SESSION_ID,
        messageId: "assistant-message-1",
        message: "final",
      },
      createRealtimeFrameContext({ queryClient, events }),
    );

    expect(events).toEqual(["streaming:assistant-message-1", "finish:assistant-message-1"]);
    expect(queryClient.getQueryData<Message[]>(messagesQueryKey(USER_ID, SESSION_ID))).toMatchObject([
      {
        id: "assistant-message-1",
        content: "final",
      },
    ]);
  });

  it("sets streaming before finishing thinking for message deltas", () => {
    const events: string[] = [];

    applyRealtimeFrame(
      {
        type: "message.delta",
        sessionId: SESSION_ID,
        messageId: "assistant-message-1",
        delta: "hello",
      },
      createRealtimeFrameContext({ queryClient, events }),
    );

    expect(events).toEqual(["streaming:assistant-message-1", "finish:assistant-message-1"]);
    expect(queryClient.getQueryData<Message[]>(messagesQueryKey(USER_ID, SESSION_ID))).toMatchObject([
      {
        id: "assistant-message-1",
        content: "hello",
      },
    ]);
  });

  it("schedules the streaming clear after message completion", () => {
    const scheduleAssistantStreamingMessageClear = vi.fn();
    useChatStore.getState().setAssistantStreamingMessage(SESSION_ID, "assistant-message-1");

    applyRealtimeFrame(
      {
        type: "message.completed",
        sessionId: SESSION_ID,
        messageId: "assistant-message-1",
      },
      createRealtimeFrameContext({
        queryClient,
        scheduleAssistantStreamingMessageClear,
      }),
    );

    expect(scheduleAssistantStreamingMessageClear).toHaveBeenCalledOnce();
    expect(useChatStore.getState().assistantStreamingMessageIdBySession[SESSION_ID]).toBe("assistant-message-1");
  });
});

describe("isTransientRealtimeStreamError", () => {
  it("treats explicit stream aborts as transient realtime stream errors", () => {
    expect(isTransientRealtimeStreamError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("treats browser fetch network failures as transient", () => {
    expect(isTransientRealtimeStreamError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isTransientRealtimeStreamError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientRealtimeStreamError(new TypeError("Load failed"))).toBe(true);
  });

  it("does not hide unrelated runtime errors", () => {
    expect(isTransientRealtimeStreamError(new Error("API error 500"))).toBe(false);
    expect(isTransientRealtimeStreamError(new TypeError("Cannot read properties"))).toBe(false);
  });
});

describe("isNonRetryableRealtimeStreamError", () => {
  it("treats stable client and authorization HTTP statuses as non-retryable", () => {
    expect(isNonRetryableRealtimeStreamError(new ApiHttpError(403, '{"error":"session_forbidden"}'))).toBe(true);
    expect(isNonRetryableRealtimeStreamError(new ApiHttpError(401, '{"error":"unauthorized"}'))).toBe(true);
    expect(isNonRetryableRealtimeStreamError(new ApiHttpError(500, '{"error":"internal_error"}'))).toBe(false);
  });
});
