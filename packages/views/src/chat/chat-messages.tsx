"use client";

import {
  type Message as ChatMessage,
  useChatStore,
  useMessages,
} from "@dentaltrip-ai/client/chat";
import {
  ChatContainerAutoScroll,
  ChatContainerContent,
  ChatContainerRoot,
  cn,
} from "@dentaltrip-ai/ui";
import {
  Message,
  MessageContent,
} from "@dentaltrip-ai/ui/components/ui/message";
import { ScrollButton } from "@dentaltrip-ai/ui/components/ui/scroll-button";
import { useCallback, useEffect, useState } from "react";
import { AssistantMarkdownContent } from "./assistant-markdown-content";
import {
  CHAT_CONTENT_WIDTH_CLASS,
  CHAT_TRANSCRIPT_INSET_CLASS,
} from "./chat-layout";

function formatThoughtDuration(durationMs: number) {
  return `Thought for ${Math.max(1, Math.round(durationMs / 1000))}s`;
}

function AssistantThoughtLabel({ durationMs }: { durationMs: number }) {
  return (
    <div className="px-2 text-xs font-medium text-muted-foreground">
      {formatThoughtDuration(durationMs)} <span aria-hidden="true">›</span>
    </div>
  );
}

/**
 * Returns a stable React key for a chat message.
 *
 * The two roles need different keying strategies:
 *
 * - User messages are keyed on `sessionId-role-sequence-content`, NOT on
 *   `message.id`. `useAppendMessage.onMutate` first renders an optimistic user
 *   row with a temporary id (`optimistic-<uuid>`) that `onSuccess` later swaps
 *   for the real server id when it invalidates the `/messages` cache. `sequence`
 *   and `content` are preserved across that swap, so keying on them keeps the
 *   row mounted instead of remounting it on the id change.
 *
 * - Assistant messages are keyed on `message.id`. The streaming assistant row is
 *   created by `upsertAssistantMessage` with the real server id taken from the
 *   `message.started` frame or the first content frame, and that id is never
 *   swapped (only `content` is appended/replaced). So `message.id` is a stable,
 *   unique, lifetime key.
 *   Keying on the array index instead would break React identity across an
 *   optimistic rollback (which drops an earlier row) or a reconnect catch-up
 *   merge (which can reorder the tail), remounting `AssistantMarkdownContent`
 *   mid-stream and resetting its paced-reveal buffer.
 */
function getMessageRenderKey(message: ChatMessage) {
  if (message.role === "user") {
    return `${message.sessionId}-${message.role}-${message.sequence}-${message.content}`;
  }

  return message.id;
}

function getLatestAssistantMessageId(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      return messages[index]?.id;
    }
  }

  return undefined;
}

const ASSISTANT_SLOW_WAIT_MS = 6_000;
const ASSISTANT_LONG_WAIT_MS = 15_000;

function AssistantWaitIndicator() {
  return (
    <div className="flex w-full max-w-2xl px-2 py-1 motion-safe:animate-[spinner-fade_160ms_ease-out_both]">
      <span
        className="relative size-5 overflow-hidden rounded-full bg-[hsl(var(--assistant-wait-indicator))] shadow-xs ring-1 ring-[hsl(var(--assistant-wait-indicator-ring))] motion-safe:animate-[assistant-wait-indicator-breathe_1.8s_ease-in-out_infinite] before:absolute before:left-1 before:top-1 before:size-1.5 before:rounded-full before:bg-[hsl(var(--assistant-wait-indicator-highlight)/0.82)] before:opacity-80 after:absolute after:-inset-3 after:bg-gradient-to-tr after:from-transparent after:via-[hsl(var(--assistant-wait-indicator-highlight)/0.88)] after:to-transparent motion-safe:after:animate-[assistant-wait-indicator-shimmer_1.45s_linear_infinite] motion-reduce:animate-none motion-reduce:after:animate-none"
        aria-hidden="true"
      />
    </div>
  );
}

function AssistantMessageContent({
  message,
  sessionId,
  isLatestAssistantMessage,
  onDisplayStateChange,
}: {
  message: ChatMessage;
  sessionId: string;
  isLatestAssistantMessage: boolean;
  onDisplayStateChange?: (isDisplayActive: boolean) => void;
}) {
  const thoughtDuration = useChatStore(
    (s) =>
      s.assistantThoughtDurationsByMessage[message.id] ??
      (isLatestAssistantMessage
        ? s.latestAssistantThoughtDurationBySession[sessionId]
        : undefined),
  );
  const shouldSmoothAssistantContent = useChatStore(
    (s) => s.assistantStreamingMessageIdBySession[sessionId] === message.id,
  );

  return (
    <div className="flex w-full flex-col gap-0">
      {typeof thoughtDuration === "number" && (
        <AssistantThoughtLabel durationMs={thoughtDuration} />
      )}
      <AssistantMarkdownContent
        isStreaming={shouldSmoothAssistantContent}
        onDisplayStateChange={onDisplayStateChange}
      >
        {message.content}
      </AssistantMarkdownContent>
    </div>
  );
}

function AssistantWaitingMessage() {
  const [waitStage, setWaitStage] = useState<"initial" | "slow" | "long">(
    "initial",
  );

  useEffect(() => {
    const slowWaitTimeout = setTimeout(
      () => setWaitStage("slow"),
      ASSISTANT_SLOW_WAIT_MS,
    );
    const longWaitTimeout = setTimeout(
      () => setWaitStage("long"),
      ASSISTANT_LONG_WAIT_MS,
    );

    return () => {
      clearTimeout(slowWaitTimeout);
      clearTimeout(longWaitTimeout);
    };
  }, []);

  const waitMessage =
    waitStage === "long"
      ? "This is taking longer than usual."
      : waitStage === "slow"
        ? "Still working through this."
        : null;

  return (
    <Message
      className="flex w-full flex-col items-start gap-2"
      role="status"
      aria-live="polite"
      aria-label="Assistant is preparing a response"
    >
      <div className="flex w-full flex-col gap-2">
        <AssistantWaitIndicator />
        {waitMessage && (
          <span className="px-2 text-xs leading-5 text-muted-foreground">
            {waitMessage}
          </span>
        )}
      </div>
    </Message>
  );
}
/** Renders loaded chat messages without exposing unimplemented message controls. */
export function ChatMessages({ sessionId }: { sessionId: string }) {
  const { data: messages = [], isLoading } = useMessages(sessionId);
  const isAssistantPending = useChatStore(
    (s) => s.assistantPendingBySession[sessionId] === true,
  );
  const assistantStreamingMessageId = useChatStore(
    (s) => s.assistantStreamingMessageIdBySession[sessionId],
  );
  const [visuallyStreamingAssistantMessageId, setVisuallyStreamingMessageId] =
    useState<string | undefined>();

  const latestAssistantMessageId = getLatestAssistantMessageId(messages);
  const handleLatestAssistantDisplayStateChange = useCallback(
    (isDisplayActive: boolean) => {
      setVisuallyStreamingMessageId((currentMessageId) => {
        if (isDisplayActive) {
          return latestAssistantMessageId;
        }

        return currentMessageId === latestAssistantMessageId
          ? undefined
          : currentMessageId;
      });
    },
    [latestAssistantMessageId],
  );
  const isLatestAssistantDisplayActive =
    latestAssistantMessageId !== undefined &&
    visuallyStreamingAssistantMessageId === latestAssistantMessageId;

  if (isLoading) {
    return (
      <div
        className="flex h-full items-start px-4 py-12"
        role="status"
        aria-live="polite"
        aria-label="Loading messages"
      >
        <div className={cn(CHAT_CONTENT_WIDTH_CLASS, "mx-auto w-full")}>
          <AssistantWaitIndicator />
        </div>
      </div>
    );
  }
  const hasStreamingAssistantMessage = messages.some(
    (message) =>
      message.role === "assistant" &&
      message.id === assistantStreamingMessageId,
  );
  const shouldShowAssistantWait =
    isAssistantPending && !hasStreamingAssistantMessage;
  const shouldReserveActiveTurnSpace =
    isAssistantPending ||
    Boolean(assistantStreamingMessageId) ||
    isLatestAssistantDisplayActive;
  const latestMessage = messages[messages.length - 1];
  const assistantAutoScrollReleaseKey = assistantStreamingMessageId
    ? `assistant-streaming:${assistantStreamingMessageId}`
    : isAssistantPending
      ? `assistant-pending:${sessionId}`
      : null;
  return (
    <div className="relative flex-1 overflow-y-auto">
      <ChatContainerRoot className="h-full">
        <ChatContainerAutoScroll
          forceKey={
            latestMessage?.role === "user"
              ? getMessageRenderKey(latestMessage)
              : null
          }
          releaseKey={assistantAutoScrollReleaseKey}
        />
        <ChatContainerContent className="px-0 py-12 md:px-5">
          <div
            className={cn(
              CHAT_CONTENT_WIDTH_CLASS,
              CHAT_TRANSCRIPT_INSET_CLASS,
              "flex flex-col gap-7",
            )}
          >
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              return (
                <Message
                  key={getMessageRenderKey(message)}
                  className={cn(
                    "flex w-full flex-col gap-2",
                    isAssistant ? "items-start" : "items-end",
                  )}
                >
                  {isAssistant ? (
                    <AssistantMessageContent
                      message={message}
                      sessionId={sessionId}
                      isLatestAssistantMessage={
                        message.id === latestAssistantMessageId
                      }
                      onDisplayStateChange={
                        message.id === latestAssistantMessageId
                          ? handleLatestAssistantDisplayStateChange
                          : undefined
                      }
                    />
                  ) : (
                    <div className="flex w-full flex-col items-end gap-1">
                      <MessageContent
                        data-chat-user-message="true"
                        className="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5 sm:max-w-[75%] text-pretty"
                      >
                        {message.content}
                      </MessageContent>
                    </div>
                  )}
                </Message>
              );
            })}
            {shouldShowAssistantWait && <AssistantWaitingMessage />}
            {/* Keep the active turn in a reading zone instead of pinning the new question against the composer. */}
            {shouldReserveActiveTurnSpace && (
              <div
                className="min-h-80 shrink-0 md:min-h-72"
                aria-hidden="true"
              />
            )}
          </div>
        </ChatContainerContent>
        <div
          className={cn(
            CHAT_CONTENT_WIDTH_CLASS,
            "absolute bottom-4 left-1/2 flex -translate-x-1/2 justify-center",
          )}
        >
          <ScrollButton className="shadow-sm" />
        </div>
      </ChatContainerRoot>
    </div>
  );
}
