"use client";

import { cn } from "@chatbot-experiments/ui";
import { MessageContent } from "@chatbot-experiments/ui/components/ui/message";
import { useEffect, useRef, useState } from "react";

const ASSISTANT_STREAM_DRAIN_FALLBACK_MS = 240;
const STREAM_REVEAL_TICK_MS = 50;
const STREAM_REVEAL_BASE_CHARS_PER_TICK = 3;
const STREAM_REVEAL_CATCH_UP_CHARS_PER_TICK = 5;
const STREAM_REVEAL_LARGE_BACKLOG_CHARS_PER_TICK = 8;
const STREAM_REVEAL_DRAIN_CHARS_PER_TICK = 6;
const STREAM_REVEAL_DRAIN_CATCH_UP_CHARS_PER_TICK = 10;
const STREAM_REVEAL_DRAIN_LARGE_BACKLOG_CHARS_PER_TICK = 16;
const STREAM_REVEAL_CATCH_UP_BACKLOG_CHARS = 480;
const STREAM_REVEAL_LARGE_BACKLOG_CHARS = 960;
const STREAM_REVEAL_COMMA_PAUSE_MS = 60;
const STREAM_REVEAL_SENTENCE_PAUSE_MS = 120;
const STREAM_REVEAL_LINE_BREAK_PAUSE_MS = 160;

const ASSISTANT_MARKDOWN_CLASS = cn(
  "flex w-full max-w-none flex-col gap-3 rounded-lg bg-transparent px-2 py-0 leading-6 text-pretty text-foreground",
  "prose-p:m-0 prose-p:leading-6 prose-strong:font-semibold",
  "prose-headings:m-0 prose-headings:text-balance prose-headings:font-semibold prose-headings:text-foreground prose-h1:text-xl prose-h1:leading-7",
  "prose-h2:text-lg prose-h2:leading-7 prose-h3:text-base prose-h3:leading-6 prose-h4:text-base prose-h4:leading-6",
  "prose-ul:m-0 prose-ul:list-disc prose-ul:pl-5 prose-ol:m-0 prose-ol:pl-6 sm:prose-ul:pl-6 sm:prose-ol:pl-8 prose-li:my-0 prose-li:pl-1.5 sm:prose-li:pl-2 prose-li:leading-6",
  "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_ol]:flex [&_ol]:flex-col [&_ol]:gap-1",
  "[&_li::marker]:text-muted-foreground [&_li>ol]:mb-0 [&_li>ol]:mt-1 [&_li>ol]:pl-5 sm:[&_li>ol]:pl-6 [&_li>ul]:mb-0 [&_li>ul]:mt-1 [&_li>ul]:list-none [&_li>ul]:pl-5 sm:[&_li>ul]:pl-6",
  "[&_li>ul>li]:relative [&_li>ul>li]:pl-5 [&_li>ul>li::before]:absolute [&_li>ul>li::before]:left-0 [&_li>ul>li::before]:top-0 [&_li>ul>li::before]:text-muted-foreground [&_li>ul>li::before]:content-['–']",
  "[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-1 sm:[&_ul.contains-task-list]:pl-2 [&_li.task-list-item]:flex [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2 [&_li.task-list-item]:pl-0 [&_li.task-list-item>input]:mt-1 [&_li.task-list-item>input]:size-4 [&_li.task-list-item>input]:shrink-0 [&_li.task-list-item>input]:accent-primary",
  "prose-blockquote:m-0 prose-blockquote:ml-1 sm:prose-blockquote:ml-2 prose-blockquote:border-l-4 prose-blockquote:border-border/40 prose-blockquote:pl-3 sm:prose-blockquote:pl-4 prose-blockquote:text-muted-foreground prose-blockquote:not-italic",
  "prose-a:text-foreground prose-a:underline prose-a:decoration-current/40 prose-a:decoration-1 prose-a:underline-offset-2 hover:prose-a:decoration-current focus-visible:prose-a:rounded-sm focus-visible:prose-a:outline-none focus-visible:prose-a:ring-2 focus-visible:prose-a:ring-ring/40",
  "[&_.markdown-table-wrapper]:m-0 [&_.markdown-table-wrapper]:w-full [&_.markdown-table-wrapper]:rounded-lg [&_.markdown-table-wrapper]:border [&_.markdown-table-wrapper]:border-border/50 [&_.markdown-table-wrapper]:px-0 prose-table:m-0 prose-table:min-w-full prose-table:border-collapse prose-table:text-sm prose-table:leading-6 prose-hr:m-0 prose-hr:border-border/60 prose-code:font-mono prose-pre:font-mono",
  "prose-th:border-b prose-th:border-border/60 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-foreground sm:prose-th:pr-4",
  "prose-td:border-b prose-td:border-border/40 prose-td:px-3 prose-td:py-2 prose-td:align-top sm:prose-td:pr-4",
  "[&_[data-footnotes]]:m-0 [&_[data-footnotes]]:border-t [&_[data-footnotes]]:border-border/60 [&_[data-footnotes]]:pt-3 [&_[data-footnotes]_h2]:sr-only [&_[data-footnotes]_ol]:m-0 [&_[data-footnotes]_ol]:pl-6 [&_[data-footnotes]_li]:my-0 [&_[data-footnotes]_li]:pl-1 [&_[data-footnotes]_p]:m-0 [&_[data-footnote-backref]]:text-muted-foreground [&_[data-footnote-backref]]:no-underline",
  "[&_td:last-child]:text-right [&_td:last-child]:tabular-nums [&_th:last-child]:text-right",
);

/** Returns how many characters should be revealed on each pacing tick. */
function getStreamRevealCharsPerTick(backlog: number, isStreaming: boolean) {
  if (!isStreaming) {
    if (backlog >= STREAM_REVEAL_LARGE_BACKLOG_CHARS) {
      return STREAM_REVEAL_DRAIN_LARGE_BACKLOG_CHARS_PER_TICK;
    }

    if (backlog >= STREAM_REVEAL_CATCH_UP_BACKLOG_CHARS) {
      return STREAM_REVEAL_DRAIN_CATCH_UP_CHARS_PER_TICK;
    }

    return STREAM_REVEAL_DRAIN_CHARS_PER_TICK;
  }

  if (backlog >= STREAM_REVEAL_LARGE_BACKLOG_CHARS) {
    return STREAM_REVEAL_LARGE_BACKLOG_CHARS_PER_TICK;
  }

  if (backlog >= STREAM_REVEAL_CATCH_UP_BACKLOG_CHARS) {
    return STREAM_REVEAL_CATCH_UP_CHARS_PER_TICK;
  }

  return STREAM_REVEAL_BASE_CHARS_PER_TICK;
}

/** Adds small reading pauses only when the text buffer is not falling behind. */
function getStreamRevealPauseMs(
  revealedText: string,
  remainingBacklog: number,
) {
  if (remainingBacklog >= STREAM_REVEAL_CATCH_UP_BACKLOG_CHARS) {
    return 0;
  }

  const lastCharacter = revealedText.at(-1);

  if (lastCharacter === "\n") {
    return STREAM_REVEAL_LINE_BREAK_PAUSE_MS;
  }

  if (lastCharacter && /[.!?:;]/u.test(lastCharacter)) {
    return STREAM_REVEAL_SENTENCE_PAUSE_MS;
  }

  if (lastCharacter && /[,，、]/u.test(lastCharacter)) {
    return STREAM_REVEAL_COMMA_PAUSE_MS;
  }

  return 0;
}

/** Detects complete markdown structures that should not be revealed as partial syntax. */
function hasCompleteMarkdownBlock(markdown: string) {
  return /(?:^|\n)\|.+\|\n\|[-:| ]+\|/u.test(markdown);
}

/** Returns whether the first streamed snapshot should render as complete markdown. */
function shouldRenderInitialStreamSnapshotImmediately(markdown: string) {
  return hasCompleteMarkdownBlock(markdown);
}

type MarkdownDelimiter = {
  readonly index: number;
  readonly marker: "*" | "_";
  readonly length: number;
};

function isMarkdownWhitespace(character: string | undefined): boolean {
  return character === undefined || /\s/u.test(character);
}

function isMarkdownAlphanumeric(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

/** Returns text without dangling inline emphasis markers during paced streaming. */
export function getStreamSafeMarkdownDisplayText(
  markdown: string,
  isDisplayActive: boolean,
): string {
  if (!isDisplayActive) {
    return markdown;
  }

  const danglingDelimiters = findDanglingInlineEmphasisDelimiters(markdown);

  if (danglingDelimiters.length === 0) {
    return markdown;
  }

  const removeByIndex = new Map(
    danglingDelimiters.map((delimiter) => [delimiter.index, delimiter.length]),
  );
  let safeMarkdown = "";

  for (let index = 0; index < markdown.length; index += 1) {
    const removeLength = removeByIndex.get(index);

    if (removeLength) {
      index += removeLength - 1;
      continue;
    }

    safeMarkdown += markdown[index] ?? "";
  }

  return safeMarkdown;
}

function findDanglingInlineEmphasisDelimiters(
  markdown: string,
): MarkdownDelimiter[] {
  const stack: MarkdownDelimiter[] = [];

  for (let index = 0; index < markdown.length; index += 1) {
    const character = markdown[index];

    if (character === "\\") {
      index += 1;
      continue;
    }

    if (character !== "*" && character !== "_") {
      continue;
    }

    let length = 1;
    while (markdown[index + length] === character && length < 2) {
      length += 1;
    }

    const previousCharacter = markdown[index - 1];
    const nextCharacter = markdown[index + length];

    if (
      isMarkdownAlphanumeric(previousCharacter) &&
      isMarkdownAlphanumeric(nextCharacter)
    ) {
      index += length - 1;
      continue;
    }

    const canOpen = !isMarkdownWhitespace(nextCharacter);
    const canClose = !isMarkdownWhitespace(previousCharacter);

    if (!canOpen && !canClose) {
      index += length - 1;
      continue;
    }

    const matchingDelimiterIndex = stack.findLastIndex(
      (delimiter) =>
        delimiter.marker === character && delimiter.length === length,
    );

    if (canClose && matchingDelimiterIndex >= 0) {
      stack.splice(matchingDelimiterIndex, 1);
    } else if (canOpen) {
      stack.push({ index, marker: character, length });
    }

    index += length - 1;
  }

  return stack;
}

/** Returns the number of leading characters shared by both strings. */
function getCommonPrefixLength(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }

  return maxLength;
}

/**
 * Ensures a slice end index does not split a UTF-16 surrogate pair.
 *
 * `String.prototype.slice` counts UTF-16 code units, so an emoji or other
 * non-BMP code point occupies two units (a lead surrogate followed by a trail
 * surrogate). If the exclusive `endIndex` lands immediately after the lead
 * surrogate of such a pair, the slice would end with a lone lead surrogate and
 * render as a replacement glyph for one tick. This backs the index up by one so
 * the pair stays whole on the revealed side. Counts (chars per tick) are
 * untouched; only the boundary is normalized.
 */
function clampSliceEndToCodePointBoundary(text: string, endIndex: number) {
  if (endIndex <= 0 || endIndex >= text.length) {
    return endIndex;
  }

  const lastIncludedUnit = text.charCodeAt(endIndex - 1);

  // Lead surrogate range 0xD800–0xDBFF: its trail surrogate sits at `endIndex`
  // and would be cut off by `slice(0, endIndex)`.
  if (lastIncludedUnit >= 0xd800 && lastIncludedUnit <= 0xdbff) {
    return endIndex - 1;
  }

  return endIndex;
}

/**
 * Reveals streamed assistant text at a readable pace while catching up under load.
 *
 * Exported so the timer lifecycle can be regression-tested directly; not part of
 * the package's public barrel.
 */
export function useAssistantStreamDisplayText(
  targetText: string,
  isStreaming: boolean,
) {
  const [displayText, setDisplayText] = useState(() => {
    if (!isStreaming) {
      return targetText;
    }

    return shouldRenderInitialStreamSnapshotImmediately(targetText)
      ? targetText
      : "";
  });

  // The latest inputs are mirrored into refs each render so the self-scheduling
  // reveal timer can read fresh values WITHOUT re-subscribing on every token
  // delta. If this effect depended on `targetText`, each SSE chunk would tear
  // down the pending setTimeout before it fired and the reveal would starve for
  // the whole stream (the original Bug 1).
  const targetTextRef = useRef(targetText);
  const isStreamingRef = useRef(isStreaming);
  const displayTextRef = useRef(displayText);
  targetTextRef.current = targetText;
  isStreamingRef.current = isStreaming;
  displayTextRef.current = displayText;

  // Single in-flight recursive timeout id; cleared on unmount / streaming flip.
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the recursive reveal timer reads targetText/displayText/isStreaming from refs so it survives fast SSE target churn. The lifecycle is intentionally keyed on isStreaming only (tear down + restart when streaming ends) — depending on targetText would re-introduce the starvation bug this hook fixes.
  useEffect(() => {
    const scheduleTick = (delayMs: number) => {
      timeoutIdRef.current = setTimeout(tick, delayMs);
    };

    const tick = () => {
      const target = targetTextRef.current;
      const streaming = isStreamingRef.current;
      const prev = displayTextRef.current;

      // Large/table first chunk: snap to the full snapshot immediately.
      if (
        prev.length === 0 &&
        streaming &&
        shouldRenderInitialStreamSnapshotImmediately(target)
      ) {
        displayTextRef.current = target;
        setDisplayText(target);
        scheduleTick(STREAM_REVEAL_TICK_MS);
        return;
      }

      // Non-appendive change (server rewrite / re-stream): reset to the common
      // prefix and resume revealing from there.
      if (!target.startsWith(prev)) {
        const commonPrefixLength = getCommonPrefixLength(prev, target);
        const resetText = target.slice(0, commonPrefixLength);

        displayTextRef.current = resetText;
        setDisplayText(resetText);
        scheduleTick(STREAM_REVEAL_TICK_MS);
        return;
      }

      // Caught up. Stop once streaming is done (children won't grow again); keep
      // a lightweight idle poll while streaming so a new delta resumes the
      // reveal without re-running this effect.
      if (prev === target) {
        if (streaming) {
          scheduleTick(STREAM_REVEAL_TICK_MS);
        }

        return;
      }

      const backlog = target.length - prev.length;
      const revealCharacterCount = Math.min(
        getStreamRevealCharsPerTick(backlog, streaming),
        backlog,
      );
      const endIndex = clampSliceEndToCodePointBoundary(
        target,
        prev.length + revealCharacterCount,
      );
      const nextText = target.slice(0, endIndex);
      const remainingBacklog = target.length - nextText.length;
      const pauseMs = getStreamRevealPauseMs(nextText, remainingBacklog);

      displayTextRef.current = nextText;
      setDisplayText(nextText);
      scheduleTick(STREAM_REVEAL_TICK_MS + pauseMs);
    };

    scheduleTick(STREAM_REVEAL_TICK_MS);

    return () => {
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
    // Intentionally scoped to [isStreaming] only: the reveal reads target /
    // streaming / current-display from refs so it survives targetText churn.
  }, [isStreaming]);

  return displayText;
}

/** Leaves token animation enabled briefly after streaming stops so the last tokens can finish. */
function useAssistantStreamAnimation(isStreaming: boolean) {
  const [shouldSmoothStream, setShouldSmoothStream] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setShouldSmoothStream(true);
      return;
    }

    const drainFallbackTimeout = setTimeout(() => {
      setShouldSmoothStream(false);
    }, ASSISTANT_STREAM_DRAIN_FALLBACK_MS);

    return () => {
      clearTimeout(drainFallbackTimeout);
    };
  }, [isStreaming]);

  return shouldSmoothStream;
}

type AssistantMarkdownContentProps = {
  children: string;
  isStreaming: boolean;
  onDisplayStateChange?: (isDisplayActive: boolean) => void;
};

/** Renders assistant markdown with compact chat typography and streaming token animation. */
export function AssistantMarkdownContent({
  children,
  isStreaming,
  onDisplayStateChange,
}: AssistantMarkdownContentProps) {
  const displayText = useAssistantStreamDisplayText(children, isStreaming);
  const isDisplayActive = isStreaming || displayText !== children;
  const safeDisplayText = getStreamSafeMarkdownDisplayText(
    displayText,
    isDisplayActive,
  );
  const shouldSmoothStream = useAssistantStreamAnimation(isDisplayActive);

  useEffect(() => {
    onDisplayStateChange?.(isDisplayActive);

    return () => {
      if (isDisplayActive) {
        onDisplayStateChange?.(false);
      }
    };
  }, [isDisplayActive, onDisplayStateChange]);

  return (
    <MessageContent
      className={ASSISTANT_MARKDOWN_CLASS}
      markdown
      smoothStream={shouldSmoothStream}
    >
      {safeDisplayText}
    </MessageContent>
  );
}
