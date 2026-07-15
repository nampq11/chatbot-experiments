import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "./store";

describe("useChatStore", () => {
  beforeEach(() => {
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
    vi.useRealTimers();
  });

  it("tracks assistant wait state by session", () => {
    useChatStore.getState().setAssistantPending("session-1", true);
    useChatStore.getState().setAssistantPending("session-2", true);

    expect(useChatStore.getState().assistantPendingBySession).toEqual({
      "session-1": true,
      "session-2": true,
    });

    useChatStore.getState().setAssistantPending("session-1", false);

    expect(useChatStore.getState().assistantPendingBySession).toEqual({
      "session-2": true,
    });
  });

  it("does not publish a new store state when pending state is unchanged", () => {
    useChatStore.getState().setAssistantPending("session-1", true);
    const pendingState = useChatStore.getState();

    useChatStore.getState().setAssistantPending("session-1", true);

    expect(useChatStore.getState()).toBe(pendingState);

    useChatStore.getState().setAssistantPending("session-1", false);
    const settledState = useChatStore.getState();

    useChatStore.getState().setAssistantPending("session-1", false);

    expect(useChatStore.getState()).toBe(settledState);
  });

  it("stores the elapsed thinking duration for the assistant message", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    useChatStore.getState().setAssistantPending("session-1", true);

    vi.setSystemTime(3_250);
    useChatStore.getState().finishAssistantThinking("session-1", "assistant-message-1");

    expect(useChatStore.getState()).toMatchObject({
      assistantPendingBySession: {},
      assistantPendingStartedAtBySession: {},
      assistantThoughtDurationsByMessage: {
        "assistant-message-1": 2_250,
      },
      latestAssistantThoughtDurationBySession: {
        "session-1": 2_250,
      },
    });
  });

  it("clearing assistant pending does not clear the active streaming message", () => {
    useChatStore.getState().setAssistantPending("session-1", true);
    useChatStore.getState().setAssistantStreamingMessage("session-1", "assistant-message-1");

    useChatStore.getState().setAssistantPending("session-1", false);

    expect(useChatStore.getState()).toMatchObject({
      assistantPendingBySession: {},
      assistantStreamingMessageIdBySession: {
        "session-1": "assistant-message-1",
      },
    });
  });

  it("tracks the actively streaming assistant message by session", () => {
    useChatStore.getState().setAssistantStreamingMessage("session-1", "assistant-message-1");
    useChatStore.getState().setAssistantStreamingMessage("session-2", "assistant-message-2");

    expect(useChatStore.getState().assistantStreamingMessageIdBySession).toEqual({
      "session-1": "assistant-message-1",
      "session-2": "assistant-message-2",
    });

    const streamingState = useChatStore.getState();
    useChatStore.getState().setAssistantStreamingMessage("session-1", "assistant-message-1");

    expect(useChatStore.getState()).toBe(streamingState);

    useChatStore.getState().clearAssistantStreamingMessage("session-1");

    expect(useChatStore.getState().assistantStreamingMessageIdBySession).toEqual({
      "session-2": "assistant-message-2",
    });
  });
});
