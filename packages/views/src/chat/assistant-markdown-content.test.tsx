import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The hook under test lives in a module that also renders `MessageContent`,
// which transitively pulls react-markdown/marked and matchMedia-based hooks
// into jsdom. The hook itself only needs React + its pure helpers, so stub the
// UI surface to keep this a focused logic test (no next/* mocked, per convention).
vi.mock("@chatbot-experiments/ui", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));
vi.mock("@chatbot-experiments/ui/components/ui/message", () => ({
  MessageContent: () => null,
}));

import {
  getStreamSafeMarkdownDisplayText,
  useAssistantStreamDisplayText,
} from "./assistant-markdown-content";

describe("useAssistantStreamDisplayText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Regression for paced-reveal starvation (Bug 1): the old effect depended on
  // [displayText, targetText, isStreaming] and cleared its pending timeout in
  // cleanup, so any SSE delta arriving within the ~50ms tick window cancelled
  // the next reveal and pinned displayText near "" for the whole stream.
  it("converges to targetText when target changes faster than the reveal tick", () => {
    const { result, rerender } = renderHook(
      ({ text, streaming }: { text: string; streaming: boolean }) =>
        useAssistantStreamDisplayText(text, streaming),
      { initialProps: { text: "", streaming: true } },
    );

    // Token-by-token growth arriving every 10ms — well under STREAM_REVEAL_TICK_MS (50).
    const tokens = [
      "H",
      "He",
      "Hel",
      "Hell",
      "Hello",
      "Hello,",
      "Hello, ",
      "Hello, w",
      "Hello, wor",
      "Hello, world!",
    ];

    for (const token of tokens) {
      rerender({ text: token, streaming: true });
      act(() => {
        vi.advanceTimersByTime(10);
      });
    }

    // The stream has settled. Let the self-scheduling reveal drain to target.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBe("Hello, world!");
  });

  it("paces a large first streaming snapshot instead of snapping to the full text", () => {
    const targetText = Array.from(
      { length: 700 },
      (_value, index) => `detail${index + 1}`,
    ).join(" ");

    const { result } = renderHook(
      ({ text, streaming }: { text: string; streaming: boolean }) =>
        useAssistantStreamDisplayText(text, streaming),
      { initialProps: { text: targetText, streaming: true } },
    );

    act(() => {
      vi.advanceTimersByTime(55);
    });

    expect(result.current.length).toBeGreaterThan(0);
    expect(result.current.length).toBeLessThan(targetText.length);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(targetText);
  });

  it("continues draining a partial stream after the streaming flag clears", () => {
    const targetText = Array.from(
      { length: 140 },
      (_value, index) => `token${index + 1}`,
    ).join(" ");

    const { result, rerender } = renderHook(
      ({ text, streaming }: { text: string; streaming: boolean }) =>
        useAssistantStreamDisplayText(text, streaming),
      { initialProps: { text: targetText, streaming: true } },
    );

    act(() => {
      vi.advanceTimersByTime(55);
    });
    expect(result.current.length).toBeLessThan(targetText.length);

    rerender({ text: targetText, streaming: false });
    expect(result.current.length).toBeLessThan(targetText.length);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current).toBe(targetText);
  });

  it("resets to the common prefix when target changes non-appendively", () => {
    const { result, rerender } = renderHook(
      ({ text, streaming }: { text: string; streaming: boolean }) =>
        useAssistantStreamDisplayText(text, streaming),
      { initialProps: { text: "Hello world", streaming: true } },
    );

    // Reveal a few characters so displayText is a non-empty prefix.
    act(() => {
      vi.advanceTimersByTime(55);
    });
    expect(result.current).toBe("Hel");

    // Non-appendive rewrite; shared prefix is just "H".
    rerender({ text: "Hi there friend", streaming: true });
    act(() => {
      vi.advanceTimersByTime(55);
    });

    expect(result.current).toBe("H");

    // And it resumes revealing the new target afterwards.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe("Hi there friend");
  });

  // Regression for surrogate-pair split (Bug 2): a raw UTF-16 slice at index 3
  // of "XY😀Z" would end on the lead surrogate of the emoji. The clamp must back
  // the boundary up to 2 so the pair is never exposed as a lone surrogate.
  it("does not split a surrogate pair at the reveal boundary", () => {
    const { result } = renderHook(
      ({ text, streaming }: { text: string; streaming: boolean }) =>
        useAssistantStreamDisplayText(text, streaming),
      { initialProps: { text: "XY😀Z", streaming: true } },
    );

    // First tick reveals 3 code units, whose boundary lands right after the
    // lead surrogate at index 2. The fix backs the slice to index 2 ("XY").
    act(() => {
      vi.advanceTimersByTime(55);
    });

    expect(result.current).toBe("XY");
    expect(result.current.at(-1)).not.toMatch(/[\uD800-\uDBFF]/u);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe("XY😀Z");
  });
});

describe("getStreamSafeMarkdownDisplayText", () => {
  it("hides dangling emphasis markers while streamed markdown is incomplete", () => {
    expect(getStreamSafeMarkdownDisplayText("*Medical disclaimer", true)).toBe(
      "Medical disclaimer",
    );
    expect(getStreamSafeMarkdownDisplayText("**Important note", true)).toBe(
      "Important note",
    );
  });

  it("preserves complete emphasis and inactive display text", () => {
    expect(getStreamSafeMarkdownDisplayText("*Medical disclaimer*", true)).toBe(
      "*Medical disclaimer*",
    );
    expect(
      getStreamSafeMarkdownDisplayText("*Literal final marker", false),
    ).toBe("*Literal final marker");
  });

  it("preserves list markers, escaped asterisks, and intra-word markers", () => {
    expect(getStreamSafeMarkdownDisplayText("* item", true)).toBe("* item");
    expect(getStreamSafeMarkdownDisplayText("\\*literal", true)).toBe(
      "\\*literal",
    );
    expect(getStreamSafeMarkdownDisplayText("code_name", true)).toBe(
      "code_name",
    );
    expect(getStreamSafeMarkdownDisplayText("2*3", true)).toBe("2*3");
  });
});
