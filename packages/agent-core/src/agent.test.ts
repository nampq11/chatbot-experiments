import type {
  AssistantMessage,
  AssistantMessageEvent,
  Model,
  Usage,
} from "@chatbot-experiments/llm-core";
import {
  AssistantMessageEventStream,
  Type,
} from "@chatbot-experiments/llm-core";
import { describe, expect, it, vi } from "vitest";
import { Agent } from "./agent.js";
import type { AgentTool, StreamFn } from "./types.js";

const MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  api: "test-api",
  provider: "test-provider",
  baseUrl: "",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
};

const USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function createFinalAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    usage: USAGE,
    stopReason: "stop" as const,
    timestamp: 1,
  };
}

function createToolAssistantMessage(
  args: Record<string, unknown>,
): AssistantMessage {
  return {
    role: "assistant" as const,
    content: [
      {
        type: "toolCall" as const,
        id: "call-1",
        name: "search",
        arguments: args,
      },
    ],
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    usage: USAGE,
    stopReason: "toolUse" as const,
    timestamp: 1,
  };
}

function createToolThenAnswerStreamFn(): {
  streamFn: StreamFn;
  contexts: Array<Parameters<StreamFn>[1]>;
} {
  let callCount = 0;
  const contexts: Parameters<StreamFn>[1][] = [];
  const streamFn: StreamFn = (_model, context) => {
    contexts.push(context);
    const stream = new AssistantMessageEventStream();
    const currentCall = callCount;
    callCount += 1;

    queueMicrotask(() => {
      if (currentCall === 0) {
        const message = createToolAssistantMessage({ query: "original" });
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: "toolUse", message });
        return;
      }

      const message = createFinalAssistantMessage("final answer");
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", reason: "stop", message });
    });

    return stream;
  };

  return { streamFn, contexts };
}

function createSearchTool(
  execute: AgentTool["execute"] = async () => ({ content: "tool result" }),
): AgentTool {
  return {
    name: "search",
    label: "Search",
    description: "Search test data",
    parameters: Type.Object({ query: Type.String() }),
    execute,
  };
}

describe("Agent", () => {
  it("streams message events and appends the final assistant message", async () => {
    const streamFn: StreamFn = () => {
      const stream = new AssistantMessageEventStream();
      queueMicrotask(() => {
        const partial = {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "" }],
          api: MODEL.api,
          provider: MODEL.provider,
          model: MODEL.id,
          usage: USAGE,
          stopReason: "unknown" as const,
          timestamp: 1,
        };
        stream.push({ type: "start", partial });
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: "hi",
          partial,
        });
        stream.push({
          type: "done",
          reason: "stop",
          message: {
            ...partial,
            content: [{ type: "text", text: "hi" }],
            stopReason: "stop",
          },
        });
      });
      return stream;
    };
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [{ role: "user", content: "hello", timestamp: 1 }],
        tools: [],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn,
    });
    const deltas: string[] = [];
    agent.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent?.type === "text_delta"
      ) {
        deltas.push(event.assistantMessageEvent.delta);
      }
    });

    await agent.continue();

    expect(deltas).toEqual(["hi"]);
    expect(agent.state.messages.at(-1)).toMatchObject({ role: "assistant" });
  });

  it("forwards text_start without appending content", async () => {
    let textStartEvent: AssistantMessageEvent | undefined;
    const streamFn: StreamFn = () => {
      const stream = new AssistantMessageEventStream();
      queueMicrotask(() => {
        const partial = {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "" }],
          api: MODEL.api,
          provider: MODEL.provider,
          model: MODEL.id,
          usage: USAGE,
          stopReason: "unknown" as const,
          timestamp: 1,
        };
        const accumulatedPartial = {
          ...partial,
          content: [{ type: "text" as const, text: "hi" }],
        };
        textStartEvent = { type: "text_start", contentIndex: 0, partial };

        stream.push({ type: "start", partial });
        stream.push(textStartEvent);
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: "hi",
          partial: accumulatedPartial,
        });
        stream.push({
          type: "done",
          reason: "stop",
          message: {
            ...partial,
            content: [{ type: "text", text: "hi" }],
            stopReason: "stop",
          },
        });
      });
      return stream;
    };
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [{ role: "user", content: "hello", timestamp: 1 }],
        tools: [],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn,
    });
    const updates: Array<{
      text: string;
      assistantMessageEvent?: AssistantMessageEvent;
    }> = [];
    agent.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.message.role === "assistant"
      ) {
        const textPart = event.message.content.find(
          (part): part is { type: "text"; text: string } =>
            part.type === "text",
        );
        updates.push({
          text: textPart?.text ?? "",
          assistantMessageEvent: event.assistantMessageEvent,
        });
      }
    });

    await agent.continue();

    expect(updates.map((update) => update.text)).toEqual(["", "hi"]);
    expect(updates[0]?.assistantMessageEvent).toBe(textStartEvent);
    expect(updates[1]?.assistantMessageEvent?.type).toBe("text_delta");
    expect(agent.state.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
    });
  });

  it("rejects continuing from an assistant message", async () => {
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
            api: MODEL.api,
            provider: MODEL.provider,
            model: MODEL.id,
            usage: USAGE,
            stopReason: "stop",
            timestamp: 1,
          },
        ],
        tools: [],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn: () => new AssistantMessageEventStream(),
    });

    await expect(agent.continue()).rejects.toThrow(
      "Cannot continue from message role: assistant",
    );
  });
  it("does not run follow-up messages after an aborted provider stream", async () => {
    let resolveStreamReady: () => void = () => {};
    const streamReady = new Promise<void>((resolve) => {
      resolveStreamReady = resolve;
    });
    const streamFn: StreamFn = (_model, _context, options) => {
      const stream = new AssistantMessageEventStream();
      const errorMessage = {
        ...createFinalAssistantMessage("partial response"),
        stopReason: "aborted" as const,
        errorMessage: "Request was aborted",
      };

      options?.signal?.addEventListener("abort", () => {
        stream.push({ type: "error", reason: "aborted", error: errorMessage });
      });

      queueMicrotask(() => {
        stream.push({ type: "start", partial: errorMessage });
        resolveStreamReady();
      });

      return stream;
    };
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [{ role: "user", content: "hello", timestamp: 1 }],
        tools: [],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn,
    });
    agent.followUp({ role: "user", content: "follow up", timestamp: 2 });

    const run = agent.continue();
    await streamReady;
    agent.abort();
    await run;

    expect(agent.state.messages).toHaveLength(2);
    expect(agent.state.messages[1]).toMatchObject({
      role: "assistant",
      stopReason: "aborted",
      errorMessage: "Assistant stream was aborted.",
    });
    expect(agent.hasQueuedMessages()).toBe(true);
  });

  it("preserves existing transcript when stream setup fails", async () => {
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [{ role: "user", content: "hello", timestamp: 1 }],
        tools: [],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn: () => {
        throw new Error("missing Azure config");
      },
    });

    await agent.continue();

    expect(agent.state.messages).toHaveLength(2);
    expect(agent.state.messages[0]).toMatchObject({ role: "user" });
    expect(agent.state.messages[1]).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorMessage: "missing Azure config",
    });
  });

  it("continues the model turn after tool results", async () => {
    const { streamFn, contexts } = createToolThenAnswerStreamFn();
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [{ role: "user", content: "search", timestamp: 1 }],
        tools: [createSearchTool()],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn,
    });

    await agent.continue();

    expect(contexts).toHaveLength(2);
    expect(
      contexts[1]?.messages.some((message) => message.role === "toolResult"),
    ).toBe(true);
    expect(agent.state.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "final answer" }],
    });
  });

  it("uses replacement arguments from beforeToolCall", async () => {
    const { streamFn } = createToolThenAnswerStreamFn();
    const execute = vi.fn<AgentTool["execute"]>(async () => ({
      content: "tool result",
    }));
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [{ role: "user", content: "search", timestamp: 1 }],
        tools: [createSearchTool(execute)],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn,
      beforeToolCall: async () => ({
        action: "replace",
        args: { query: "replacement" },
      }),
    });

    await agent.continue();

    expect(execute).toHaveBeenCalledWith(
      "call-1",
      { query: "replacement" },
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });

  it("honors skipped tool calls from beforeToolCall", async () => {
    const { streamFn } = createToolThenAnswerStreamFn();
    const execute = vi.fn<AgentTool["execute"]>(async () => ({
      content: "tool result",
    }));
    const agent = new Agent({
      initialState: {
        model: MODEL,
        messages: [{ role: "user", content: "search", timestamp: 1 }],
        tools: [createSearchTool(execute)],
        systemPrompt: "",
        thinkingLevel: "off",
      },
      streamFn,
      beforeToolCall: async () => ({
        action: "skip",
        result: "blocked by policy",
      }),
    });

    await agent.continue();

    expect(execute).not.toHaveBeenCalled();
    expect(
      agent.state.messages.find((message) => message.role === "toolResult"),
    ).toMatchObject({
      role: "toolResult",
      content: [{ type: "text", text: "blocked by policy" }],
      isError: false,
    });
  });
});
