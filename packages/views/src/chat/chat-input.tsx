"use client";

import {
  useAppendMessage,
  useChatStore,
  useCreateSessionWithMessage,
} from "@dentaltrip-ai/client/chat";
import { useIdentityStore } from "@dentaltrip-ai/client/identity";
import {
  getChatSessionPath,
  useNavigation,
} from "@dentaltrip-ai/client/navigation";
import { Button, cn } from "@dentaltrip-ai/ui";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@dentaltrip-ai/ui/components/ui/prompt-input";
import { ArrowUp } from "lucide-react";
import { ChatFooterDisclaimer } from "./chat-footer-disclaimer";
import { ChatGreeting } from "./chat-greeting";
import {
  CHAT_COMPOSER_INSET_CLASS,
  CHAT_CONTENT_WIDTH_CLASS,
} from "./chat-layout";
import { ChatStarterPrompts } from "./chat-starter-prompts";

interface ChatInputProps {
  sessionId: string;
  createSessionOnSubmit?: boolean;
  hasMessages?: boolean;
  layoutMode?: "rail" | "embedded";
  showGreeting?: boolean;
  showStarterPrompts?: boolean;
}

/** Renders the shared chat composer for both new and existing sessions. */
export function ChatInput({
  sessionId,
  createSessionOnSubmit,
  hasMessages,
  layoutMode = "rail",
  showGreeting = true,
  showStarterPrompts = false,
}: ChatInputProps) {
  const { promptDraft, setPromptDraft } = useChatStore();
  const createSessionWithMessage = useCreateSessionWithMessage();
  const appendMessage = useAppendMessage(sessionId);
  const userId = useIdentityStore((s) => s.userId);
  const isIdentityResolved = useIdentityStore((s) => s.isResolved);
  const nav = useNavigation();
  const shouldCreateSession = createSessionOnSubmit === true;
  const trimmedPrompt = promptDraft.trim();
  const isSubmitting = shouldCreateSession
    ? createSessionWithMessage.isPending
    : appendMessage.isPending;
  const canSubmitPrompt =
    isIdentityResolved &&
    !!userId &&
    !isSubmitting &&
    (shouldCreateSession || !!sessionId);

  const submitPrompt = (rawPrompt: string) => {
    const promptToSubmit = rawPrompt.trim();

    if (!promptToSubmit || !canSubmitPrompt) {
      return;
    }

    setPromptDraft("");

    const restorePromptIfStillEmpty = () => {
      if (useChatStore.getState().promptDraft.trim().length === 0) {
        setPromptDraft(promptToSubmit);
      }
    };

    if (shouldCreateSession) {
      createSessionWithMessage.mutate(promptToSubmit, {
        onSuccess: ({ session }) => {
          nav.push(getChatSessionPath(session.id));
        },
        onError: restorePromptIfStillEmpty,
      });
    } else {
      appendMessage.mutate(
        { role: "user", content: promptToSubmit },
        { onError: restorePromptIfStillEmpty },
      );
    }
  };

  const handleSubmit = () => {
    submitPrompt(promptDraft);
  };

  const handleStarterPromptSelect = (prompt: string) => {
    if (!canSubmitPrompt) {
      setPromptDraft(prompt);
      return;
    }

    submitPrompt(prompt);
  };

  const isIdentityPending = !isIdentityResolved || !userId;
  const hasPrompt = trimmedPrompt.length > 0;
  const inputPadding =
    layoutMode === "embedded"
      ? "p-0"
      : hasMessages
        ? "px-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:px-5"
        : "px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]";
  const inputWidth =
    layoutMode === "embedded"
      ? "w-full"
      : cn(CHAT_CONTENT_WIDTH_CLASS, CHAT_COMPOSER_INSET_CLASS);
  const showFooterDisclaimer = !shouldCreateSession && hasMessages;
  const shouldShowGreeting = showGreeting && !hasMessages;

  return (
    <div className={cn("bg-background z-10 shrink-0 w-full", inputPadding)}>
      <div className={inputWidth}>
        {shouldShowGreeting && <ChatGreeting hasMessages={false} />}
        {showStarterPrompts && (
          <ChatStarterPrompts
            className="mb-4"
            disabled={isSubmitting}
            onSelectPrompt={handleStarterPromptSelect}
          />
        )}
        <PromptInput
          isLoading={isSubmitting}
          value={promptDraft}
          onValueChange={setPromptDraft}
          onSubmit={handleSubmit}
          className={cn(
            "relative z-10 w-full rounded-3xl border p-0 pt-1 focus-within:ring-0 focus-within:ring-offset-0",
            showStarterPrompts
              ? "border-border/70 bg-background shadow-none"
              : "border-input bg-popover shadow-xs",
          )}
        >
          <div className="flex flex-col">
            <PromptInputTextarea
              aria-label="Message"
              name="message"
              autoComplete="off"
              enterKeyHint="send"
              placeholder="Ask about costs, clinic fit, or travel timing…"
              className="min-h-[44px] pt-3 pl-4 text-base leading-6 sm:text-base md:text-base"
            />

            <PromptInputActions className="mt-3 flex w-full items-center justify-end gap-2 px-3 pb-3">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  aria-label={isSubmitting ? "Sending message" : "Send message"}
                  disabled={!hasPrompt || isSubmitting || isIdentityPending}
                  onClick={handleSubmit}
                  className="size-9 rounded-full transition-[background-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none"
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </Button>
              </div>
            </PromptInputActions>
          </div>
        </PromptInput>

        {showFooterDisclaimer && <ChatFooterDisclaimer />}
      </div>
    </div>
  );
}
