"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiHttpError } from "../api/client";
import { useIdentityStore } from "../identity/store";
import { getChatApiClient } from "./api";
import { messagesQueryKey, sessionQueryKey, sessionsQueryKey } from "./queries";
import { useChatStore } from "./store";
import type { Message, RealtimeFrame } from "./types";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const NON_RETRYABLE_REALTIME_HTTP_STATUSES = new Set([400, 401, 403, 404]);
// Keep the row marked as streaming briefly after completion so the final
// realtime frame and completion refetch do not flip the row to static before
// AssistantMarkdownContent can continue its paced reveal.
const STREAMING_COMPLETION_RELEASE_DELAY_MS = 300;
const TRANSIENT_FETCH_ERROR_MESSAGES = [
  "Failed to fetch",
  "Load failed",
  "Network request failed",
  "NetworkError when attempting to fetch resource.",
];

/** Keeps streamed optimistic messages when a catch-up fetch returns stale data. */
function mergePersistedMessages(persistedMessages: Message[], currentMessages: Message[] | undefined): Message[] {
  if (!currentMessages || currentMessages.length === 0) {
    return persistedMessages;
  }

  const persistedIds = new Set(persistedMessages.map((message) => message.id));
  const mergedMessages = [...persistedMessages];

  for (const currentMessage of currentMessages) {
    if (persistedIds.has(currentMessage.id)) {
      continue;
    }

    const isAlreadyPersisted = persistedMessages.some(
      (persistedMessage) =>
        persistedMessage.sessionId === currentMessage.sessionId &&
        persistedMessage.role === currentMessage.role &&
        persistedMessage.content === currentMessage.content,
    );

    if (!isAlreadyPersisted) {
      mergedMessages.push(currentMessage);
    }
  }

  return mergedMessages;
}

/** Returns whether a realtime stream error is an expected reconnectable interruption. */
export function isTransientRealtimeStreamError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof TypeError) {
    return TRANSIENT_FETCH_ERROR_MESSAGES.includes(error.message);
  }

  return false;
}

/** Returns whether a realtime stream failed with a stable non-retryable HTTP status. */
export function isNonRetryableRealtimeStreamError(error: unknown): boolean {
  return error instanceof ApiHttpError && NON_RETRYABLE_REALTIME_HTTP_STATUSES.has(error.status);
}

type RealtimeFrameApplicationContext = {
  sessionId: string;
  userId: string;
  queryClient: Pick<QueryClient, "invalidateQueries" | "removeQueries" | "setQueryData">;
  onDelta?: (delta: string) => void;
  setAssistantPending: (isPending: boolean) => void;
  finishAssistantThinking: (messageId: string) => void;
  setAssistantStreamingMessage: (messageId: string) => void;
  clearAssistantStreamingMessage: () => void;
  scheduleAssistantStreamingMessageClear: () => void;
};

type AssistantMessageCacheContext = Pick<RealtimeFrameApplicationContext, "queryClient" | "sessionId" | "userId">;

type AssistantMessageContentInput = {
  messageId: string;
  content: string;
};

function createOptimisticAssistantMessage(
  context: AssistantMessageCacheContext,
  input: AssistantMessageContentInput,
): Message {
  return {
    id: input.messageId,
    sessionId: context.sessionId,
    userId: context.userId,
    sequence: -1,
    role: "assistant",
    content: input.content,
    createdAt: new Date(),
  };
}

/** Creates an empty assistant row before the first visible text arrives. */
function ensureAssistantMessage(context: AssistantMessageCacheContext, input: AssistantMessageContentInput) {
  context.queryClient.setQueryData(
    messagesQueryKey(context.userId, context.sessionId),
    (old: Message[] | undefined) => {
      const messages = old ?? [];
      const hasMessage = messages.some((message) => {
        return message.id === input.messageId;
      });

      if (hasMessage) {
        return messages;
      }

      return [...messages, createOptimisticAssistantMessage(context, input)];
    },
  );
}

/** Applies assistant text to the optimistic message cache before persistence catches up. */
function upsertAssistantMessageContent(
  context: AssistantMessageCacheContext,
  input: AssistantMessageContentInput & {
    mergeExistingContent: (existingContent: string, nextContent: string) => string;
  },
) {
  context.queryClient.setQueryData(
    messagesQueryKey(context.userId, context.sessionId),
    (old: Message[] | undefined) => {
      const messages = old ?? [];
      let didUpdateMessage = false;

      const updatedMessages = messages.map((message) => {
        if (message.id !== input.messageId) {
          return message;
        }

        didUpdateMessage = true;
        return {
          ...message,
          content: input.mergeExistingContent(message.content, input.content),
        };
      });

      if (didUpdateMessage) {
        return updatedMessages;
      }

      return [...messages, createOptimisticAssistantMessage(context, input)];
    },
  );
}

function appendAssistantMessageDelta(context: AssistantMessageCacheContext, input: AssistantMessageContentInput) {
  upsertAssistantMessageContent(context, {
    ...input,
    mergeExistingContent: (existingContent, nextContent) => existingContent + nextContent,
  });
}

function replaceAssistantMessageContent(context: AssistantMessageCacheContext, input: AssistantMessageContentInput) {
  upsertAssistantMessageContent(context, {
    ...input,
    mergeExistingContent: (_existingContent, nextContent) => nextContent,
  });
}

/** Applies one realtime frame to React Query cache state and ephemeral chat state. */
export function applyRealtimeFrame(frame: RealtimeFrame, context: RealtimeFrameApplicationContext) {
  const { queryClient, sessionId, userId } = context;

  switch (frame.type) {
    case "message.appended":
      queryClient.invalidateQueries({
        queryKey: messagesQueryKey(userId, sessionId),
      });
      break;
    case "agent.run.started":
      if (frame.sessionId === sessionId) {
        context.clearAssistantStreamingMessage();
        context.setAssistantPending(true);
      }
      break;
    case "agent.run.completed":
      if (frame.sessionId === sessionId) {
        context.setAssistantPending(false);
        context.scheduleAssistantStreamingMessageClear();
      }

      queryClient.invalidateQueries({
        queryKey: messagesQueryKey(userId, sessionId),
      });
      break;
    case "agent.run.cancelled":
    case "agent.run.failed":
      if (frame.sessionId === sessionId) {
        context.setAssistantPending(false);
        context.clearAssistantStreamingMessage();
      }

      queryClient.invalidateQueries({
        queryKey: messagesQueryKey(userId, sessionId),
      });
      break;
    case "session.created":
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
      break;
    case "session.deleted":
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
      queryClient.removeQueries({
        queryKey: sessionQueryKey(userId, frame.sessionId),
      });
      queryClient.removeQueries({
        queryKey: messagesQueryKey(userId, frame.sessionId),
      });
      break;
    case "thinking.delta":
      if (frame.sessionId === sessionId) {
        context.setAssistantPending(true);
      }
      break;
    case "message.started":
      if (frame.sessionId !== sessionId) {
        return;
      }

      context.setAssistantStreamingMessage(frame.messageId);
      ensureAssistantMessage(context, {
        messageId: frame.messageId,
        content: "",
      });
      break;
    case "message.delta":
      if (frame.sessionId !== sessionId) {
        return;
      }

      context.setAssistantStreamingMessage(frame.messageId);
      appendAssistantMessageDelta(context, {
        messageId: frame.messageId,
        content: frame.delta,
      });
      context.finishAssistantThinking(frame.messageId);
      context.onDelta?.(frame.delta);
      break;
    case "assistant.message":
      if (frame.sessionId !== sessionId) {
        return;
      }

      context.setAssistantStreamingMessage(frame.messageId);
      replaceAssistantMessageContent(context, {
        messageId: frame.messageId,
        content: frame.message,
      });
      context.finishAssistantThinking(frame.messageId);
      break;
    case "message.completed":
      if (frame.sessionId === sessionId) {
        context.finishAssistantThinking(frame.messageId);
        context.scheduleAssistantStreamingMessageClear();
      }
      break;
    default:
      break;
  }
}

/** Subscribes the active session to server-pushed realtime updates over SSE. */
export function useRealtime(sessionId: string | null, onDelta?: (delta: string) => void) {
  const queryClient = useQueryClient();
  const userId = useIdentityStore((s) => s.userId);

  useEffect(() => {
    if (!sessionId || !userId) {
      return;
    }

    let disposed = false;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;
    let clearStreamingTimeout: ReturnType<typeof setTimeout> | null = null;

    const setAssistantPending = (isPending: boolean) => {
      useChatStore.getState().setAssistantPending(sessionId, isPending);
    };

    const finishAssistantThinking = (messageId: string) => {
      useChatStore.getState().finishAssistantThinking(sessionId, messageId);
    };

    const clearScheduledAssistantStreamingMessage = () => {
      if (clearStreamingTimeout === null) {
        return;
      }

      clearTimeout(clearStreamingTimeout);
      clearStreamingTimeout = null;
    };

    const setAssistantStreamingMessage = (messageId: string) => {
      clearScheduledAssistantStreamingMessage();
      useChatStore.getState().setAssistantStreamingMessage(sessionId, messageId);
    };

    const clearAssistantStreamingMessage = () => {
      clearScheduledAssistantStreamingMessage();
      useChatStore.getState().clearAssistantStreamingMessage(sessionId);
    };

    const scheduleAssistantStreamingMessageClear = () => {
      clearScheduledAssistantStreamingMessage();
      clearStreamingTimeout = setTimeout(() => {
        clearStreamingTimeout = null;
        clearAssistantStreamingMessage();
      }, STREAMING_COMPLETION_RELEASE_DELAY_MS);
    };
    const catchUpPersistedMessages = async () => {
      try {
        const persistedMessages = await getChatApiClient().listMessages(sessionId);

        if (disposed) {
          return;
        }

        queryClient.setQueryData(messagesQueryKey(userId, sessionId), (currentMessages: Message[] | undefined) =>
          mergePersistedMessages(persistedMessages, currentMessages),
        );
      } catch (error) {
        if (!disposed) {
          console.warn("[Realtime] Failed to catch up messages:", error);
        }
      }
    };

    const handleFrame = (frame: RealtimeFrame) => {
      applyRealtimeFrame(frame, {
        sessionId,
        userId,
        queryClient,
        onDelta,
        setAssistantPending,
        finishAssistantThinking,
        setAssistantStreamingMessage,
        clearAssistantStreamingMessage,
        scheduleAssistantStreamingMessageClear,
      });
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimeout !== null) {
        return;
      }

      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        void connect();
      }, reconnectDelay);
    };

    const connect = async () => {
      if (disposed) {
        return;
      }

      abortController = new AbortController();

      try {
        await getChatApiClient().streamRealtime({
          sessionId,
          signal: abortController.signal,
          onFrame: handleFrame,
          onOpen: () => {
            reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            void catchUpPersistedMessages();
          },
        });

        if (!disposed) {
          scheduleReconnect();
        }
      } catch (error) {
        if (disposed || abortController.signal.aborted) {
          return;
        }
        if (isNonRetryableRealtimeStreamError(error)) {
          return;
        }

        if (!isTransientRealtimeStreamError(error)) {
          console.warn("[Realtime] Stream connection error:", error);
        }

        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      disposed = true;
      abortController?.abort();

      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
      }
      clearScheduledAssistantStreamingMessage();
    };
  }, [sessionId, userId, queryClient, onDelta]);
}
