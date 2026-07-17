"use client";

import {
  useChatStore,
  useMessages,
  useRealtime,
} from "@chatbot-experiments/client/chat";
import { Button, cn, ErrorState } from "@chatbot-experiments/ui";
import {
  SidebarTrigger,
  useSidebar,
} from "@chatbot-experiments/ui/components/ui/sidebar";
import { ChatGreeting } from "./chat-greeting";
import { ChatInput } from "./chat-input";
import {
  CHAT_EMPTY_STATE_CANVAS_CLASS,
  CHAT_EMPTY_STATE_GREETING_ZONE_CLASS,
  CHAT_FLEX_REGION_CLASS,
  CHAT_HERO_GREETING_CLASS,
  CHAT_HERO_RAIL_CLASS,
  CHAT_MAIN_CONTENT_CLASS,
  CHAT_VERTICAL_LAYOUT_CLASS,
} from "./chat-layout";
import { ChatMessages } from "./chat-messages";

const CHAT_TOP_OVERLAY_CLASS =
  "pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center px-3";

type ChatMainProps = {
  children: React.ReactNode;
  hasMessages?: boolean;
};

function ChatMain({ children, hasMessages = false }: ChatMainProps) {
  return (
    <main
      id="main-content"
      className={cn(CHAT_MAIN_CONTENT_CLASS, hasMessages && "overflow-hidden")}
    >
      <div className={CHAT_VERTICAL_LAYOUT_CLASS}>{children}</div>
    </main>
  );
}

function ChatTopOverlay() {
  const { isMobile, openMobile } = useSidebar();

  return (
    <div className={CHAT_TOP_OVERLAY_CLASS} aria-hidden={!isMobile}>
      {isMobile && !openMobile && (
        <SidebarTrigger
          className="pointer-events-auto size-8 rounded-lg bg-background/80 shadow-sm backdrop-blur"
          aria-label="Toggle sidebar"
        />
      )}
    </div>
  );
}

type CenteredChatInputProps = {
  sessionId: string;
  createSessionOnSubmit?: boolean;
};

function CenteredChatInput({
  sessionId,
  createSessionOnSubmit,
}: CenteredChatInputProps) {
  return (
    <div className={CHAT_FLEX_REGION_CLASS}>
      <div className={CHAT_EMPTY_STATE_CANVAS_CLASS}>
        <div className={CHAT_EMPTY_STATE_GREETING_ZONE_CLASS}>
          <div className="space-y-3 text-center">
            <ChatGreeting
              hasMessages={false}
              className={CHAT_HERO_GREETING_CLASS}
            />
            <p className="mx-auto max-w-xl text-balance text-sm leading-6 text-muted-foreground sm:text-base">
              Compare prompts, model behavior, evaluation results, and next
              steps before you ship a chatbot workflow.
            </p>
          </div>
        </div>

        <div className={CHAT_HERO_RAIL_CLASS}>
          <ChatInput
            sessionId={sessionId}
            createSessionOnSubmit={createSessionOnSubmit}
            hasMessages={false}
            layoutMode="embedded"
            showGreeting={false}
            showStarterPrompts
          />
        </div>
      </div>
    </div>
  );
}

export function ChatContent() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isAssistantPending = useChatStore((s) =>
    activeSessionId
      ? s.assistantPendingBySession[activeSessionId] === true
      : false,
  );
  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    error: messagesErrorValue,
    refetch: refetchMessages,
  } = useMessages(activeSessionId);
  const hasNoMessages =
    !isAssistantPending &&
    !messagesLoading &&
    (!messages || messages.length === 0);
  const messagesErrorMessage =
    messagesErrorValue instanceof Error
      ? messagesErrorValue.message
      : "Unknown error";

  useRealtime(messagesError ? null : activeSessionId);

  if (!activeSessionId) {
    return (
      <ChatMain>
        <ChatTopOverlay />
        <CenteredChatInput sessionId="" createSessionOnSubmit />
      </ChatMain>
    );
  }

  if (messagesError) {
    return (
      <ChatMain>
        <ChatTopOverlay />
        <div className={CHAT_FLEX_REGION_CLASS}>
          <div className="flex h-full items-center justify-center px-4">
            <ErrorState
              message={
                <span className="flex flex-col items-center gap-3">
                  <span className="text-pretty">
                    Unable to load this chat: {messagesErrorMessage}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refetchMessages()}
                  >
                    Try again
                  </Button>
                </span>
              }
            />
          </div>
        </div>
      </ChatMain>
    );
  }

  if (hasNoMessages) {
    return (
      <ChatMain>
        <ChatTopOverlay />
        <CenteredChatInput sessionId={activeSessionId} />
      </ChatMain>
    );
  }

  return (
    <ChatMain hasMessages>
      <ChatTopOverlay />
      <div className={CHAT_FLEX_REGION_CLASS}>
        <ChatMessages sessionId={activeSessionId} />
      </div>
      <ChatInput sessionId={activeSessionId} hasMessages={true} />
    </ChatMain>
  );
}
