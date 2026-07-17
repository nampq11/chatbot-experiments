"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "./lib/utils";

export type ChatContainerRootProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export type ChatContainerContentProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export type ChatContainerScrollAnchorProps = {
  className?: string;
  ref?: React.RefObject<HTMLDivElement>;
} & React.HTMLAttributes<HTMLDivElement>;

export type ChatContainerAutoScrollProps = {
  /** Changes when the transcript should jump to the newest message. */
  forceKey?: number | string | null;
  /** Changes when the transcript should stop following content growth. */
  releaseKey?: number | string | null;
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
const CHAT_CONTAINER_RESUME_FOLLOW_EVENT =
  "chatbot-experiments:chat-container-resume-follow";

function ChatContainerRoot({
  children,
  className,
  ...props
}: ChatContainerRootProps) {
  return (
    <StickToBottom
      className={cn("flex overflow-y-auto", className)}
      resize="instant"
      initial="instant"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      {...props}
    >
      {children}
    </StickToBottom>
  );
}

function ChatContainerContent({
  children,
  className,
  ...props
}: ChatContainerContentProps) {
  return (
    <StickToBottom.Content
      className={cn("flex w-full flex-col", className)}
      {...props}
    >
      {children}
    </StickToBottom.Content>
  );
}

function ChatContainerScrollAnchor({
  className,
  ...props
}: ChatContainerScrollAnchorProps) {
  return (
    <div
      className={cn("h-px w-full shrink-0 scroll-mt-4", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

function ChatContainerAutoScroll({
  forceKey,
  releaseKey,
}: ChatContainerAutoScrollProps) {
  const { contentRef, scrollRef, scrollToBottom, stopScroll } =
    useStickToBottomContext();
  const previousForceKeyRef = useRef(forceKey);
  const previousReleaseKeyRef = useRef(releaseKey);
  const frozenScrollTopRef = useRef<number | null>(null);
  const isRestoringFrozenScrollRef = useRef(false);
  const isResizeRestorePendingRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (forceKey == null) {
      previousForceKeyRef.current = forceKey;
      return;
    }

    if (forceKey === previousForceKeyRef.current) {
      return;
    }

    previousForceKeyRef.current = forceKey;

    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }

    void scrollToBottom("instant");
  }, [forceKey, scrollRef, scrollToBottom]);

  useIsomorphicLayoutEffect(() => {
    if (releaseKey == null) {
      previousReleaseKeyRef.current = releaseKey;
      return;
    }

    if (releaseKey === previousReleaseKeyRef.current) {
      return;
    }

    previousReleaseKeyRef.current = releaseKey;
    stopScroll();

    const scrollElement = scrollRef.current;
    if (scrollElement) {
      frozenScrollTopRef.current = scrollElement.scrollTop;
    }
  }, [releaseKey, scrollRef, stopScroll]);

  useIsomorphicLayoutEffect(() => {
    if (releaseKey != null) {
      return;
    }

    frozenScrollTopRef.current = null;
  }, [releaseKey]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const handleScroll = () => {
      if (frozenScrollTopRef.current == null) {
        return;
      }

      if (
        isRestoringFrozenScrollRef.current ||
        isResizeRestorePendingRef.current
      ) {
        return;
      }

      frozenScrollTopRef.current = scrollElement.scrollTop;
      stopScroll();
    };

    const handleResumeFollow = () => {
      frozenScrollTopRef.current = null;
      isResizeRestorePendingRef.current = false;
      isRestoringFrozenScrollRef.current = false;
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    scrollElement.addEventListener(
      CHAT_CONTAINER_RESUME_FOLLOW_EVENT,
      handleResumeFollow,
    );

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
      scrollElement.removeEventListener(
        CHAT_CONTAINER_RESUME_FOLLOW_EVENT,
        handleResumeFollow,
      );
    };
  }, [scrollRef, stopScroll]);

  useEffect(() => {
    const contentElement = contentRef.current;
    const scrollElement = scrollRef.current;

    if (!contentElement || !scrollElement) {
      return;
    }

    // Pending rAF handles queued by the freeze-restore observer below.
    // Tracked so cleanup can cancel any still-scheduled frame on unmount and
    // avoid calling stopScroll()/writing scrollTop on a detached element.
    const pendingFrames: number[] = [];
    const scheduleFrame = (cb: () => void) => {
      const handle = requestAnimationFrame(() => {
        const index = pendingFrames.indexOf(handle);
        if (index !== -1) {
          pendingFrames.splice(index, 1);
        }
        cb();
      });
      pendingFrames.push(handle);
    };

    // stopScroll() only stops the library's auto-follow; it does not counter
    // browser scroll anchoring drift when content grows, so we re-pin scrollTop
    // to the frozen value on each content resize while a release is active.
    const resizeObserver = new ResizeObserver(() => {
      const frozenScrollTop = frozenScrollTopRef.current;

      if (frozenScrollTop == null) {
        return;
      }

      isResizeRestorePendingRef.current = true;

      scheduleFrame(() => {
        if (frozenScrollTopRef.current == null) {
          isResizeRestorePendingRef.current = false;
          return;
        }

        stopScroll();

        if (scrollElement.scrollTop !== frozenScrollTop) {
          isRestoringFrozenScrollRef.current = true;
          scrollElement.scrollTop = frozenScrollTop;
          scheduleFrame(() => {
            isRestoringFrozenScrollRef.current = false;
          });
        }

        scheduleFrame(() => {
          isResizeRestorePendingRef.current = false;
        });
      });
    });

    resizeObserver.observe(contentElement);

    return () => {
      for (const handle of pendingFrames) {
        cancelAnimationFrame(handle);
      }
      pendingFrames.length = 0;
      resizeObserver.disconnect();
    };
  }, [contentRef, scrollRef, stopScroll]);

  return null;
}

export {
  CHAT_CONTAINER_RESUME_FOLLOW_EVENT,
  ChatContainerAutoScroll,
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
};
