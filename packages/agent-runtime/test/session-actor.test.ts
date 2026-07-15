import type { Message as AgentMessage, Model } from "@dentaltrip-ai/ai";
import type {
  AgentRunRecord,
  AgentStreamEvent,
  CreateAgentRunInput,
  UpdateAgentRunInput,
} from "@dentaltrip-ai/core/agent";
import type { DomainEvent } from "@dentaltrip-ai/core/events";
import type {
  AppendMessageRepositoryInput,
  AppendSessionDataRepositoryInput,
  Message,
  SessionDataEntry,
} from "@dentaltrip-ai/core/session";
import { describe, expect, it, vi } from "vitest";
import { ZERO_USAGE } from "../src/core/agent-session-service.ts";
import { SessionActor } from "../src/core/session-actor.ts";

const TEST_MODEL: Model = {
  id: "gpt-5.4-nano",
  name: "Test Model",
  api: "test-api",
  provider: "test-provider",
  baseUrl: "https://example.test",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128000,
  maxTokens: 4096,
};

function formatAgentStreamEvent(event: AgentStreamEvent): string {
  switch (event.type) {
    case "message.started":
      return "start";
    case "message.delta":
      return `delta:${event.delta}`;
    case "thinking.delta":
      return `thinking:${event.delta}`;
    case "assistant.message":
      return `assistant:${event.message}`;
    case "message.completed":
      return "complete";
  }
}

type FakeAgent = ReturnType<typeof createFakeAgent>;

type ContinueContext = {
  emit: (event: unknown) => void;
  state: { messages: AgentMessage[] };
};

function createAssistantMessage(content: string, errorMessage?: string) {
  return {
    role: "assistant",
    content: [{ type: "text", text: content }],
    api: TEST_MODEL.api,
    provider: TEST_MODEL.provider,
    model: TEST_MODEL.id,
    usage: ZERO_USAGE,
    stopReason: errorMessage ? "error" : "stop",
    timestamp: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  } satisfies AgentMessage;
}

function createFakeAgent(
  options: {
    initialMessages?: AgentMessage[];
    continueImpl?: (context: ContinueContext) => Promise<void> | void;
    onAbort?: () => void;
  } = {},
) {
  const listeners = new Set<(event: unknown) => void | Promise<void>>();
  const state = {
    messages: [...(options.initialMessages ?? [])] as AgentMessage[],
  };

  const emit = (event: unknown) => {
    for (const listener of listeners) {
      void listener(event);
    }
  };

  const defaultContinue = () => {
    emit({
      type: "message_update",
      assistantMessageEvent: {
        type: "thinking_delta",
        delta: "thinking",
      },
    });
    emit({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "world",
      },
    });

    const assistantMessage = createAssistantMessage("world");
    emit({ type: "message_end", message: assistantMessage });
    state.messages.push(assistantMessage);
  };

  return {
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }),
    state,
    continue: vi.fn(async () => {
      await (options.continueImpl ?? defaultContinue)({ emit, state });
    }),
    abort: vi.fn(() => {
      options.onAbort?.();
    }),
  };
}

function createMemoryRepository() {
  const messages: Message[] = [];
  const sessionData: SessionDataEntry[] = [];
  const runs: AgentRunRecord[] = [];

  return {
    messages,
    sessionData,
    runs,
    async appendMessage(input: AppendMessageRepositoryInput): Promise<Message> {
      const message: Message = {
        ...input,
        sequence: messages.length + 1,
        createdAt: new Date(),
      };
      messages.push(message);
      const previousEntry = sessionData.at(-1);
      sessionData.push({
        id: message.id,
        sessionId: message.sessionId,
        userId: message.userId,
        parentId: previousEntry?.id ?? null,
        sequence: sessionData.length + 1,
        type: "message",
        payload: input.entryPayload ?? { message },
        schemaVersion: 1,
        createdAt: message.createdAt,
      });
      return message;
    },
    async appendSessionData(input: AppendSessionDataRepositoryInput): Promise<SessionDataEntry> {
      const entry: SessionDataEntry = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        parentId: input.parentId ?? sessionData.at(-1)?.id ?? null,
        sequence: sessionData.length + 1,
        type: input.type,
        payload: input.payload,
        schemaVersion: input.schemaVersion ?? 1,
        createdAt: new Date(),
      };

      sessionData.push(entry);
      return entry;
    },
    async listSessionData(sessionId: string): Promise<SessionDataEntry[]> {
      return sessionData.filter((entry) => entry.sessionId === sessionId);
    },
    async createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord> {
      const now = new Date();
      const run: AgentRunRecord = {
        id: input.id,
        sessionId: input.sessionId,
        messageId: input.messageId,
        status: "queued",
        model: input.model ?? null,
        output: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
      };
      runs.push(run);
      return run;
    },
    async updateAgentRun(runId: string, input: UpdateAgentRunInput): Promise<void> {
      const run = runs.find((candidate) => candidate.id === runId);
      if (!run) {
        return;
      }

      run.status = input.status;
      run.output = input.output ?? null;
      run.errorMessage = input.errorMessage ?? null;
      run.updatedAt = new Date();
    },
  };
}

function createActor(input: {
  agent: FakeAgent;
  repository?: ReturnType<typeof createMemoryRepository>;
  publishEvent?: (event: DomainEvent) => void;
}) {
  const repository = input.repository ?? createMemoryRepository();

  return new SessionActor({
    sessionId: "session-1",
    userId: "user-1",
    model: TEST_MODEL,
    initialMessages: [],
    systemPrompt: "You are useful.",
    transcriptWriter: repository,
    agentRunStore: repository,
    publishEvent: input.publishEvent ?? (() => {}),
    createAgent: () => input.agent as never,
  });
}

describe("SessionActor", () => {
  it("queues concurrent message processing", async () => {
    let resolveFirstContinue: () => void = () => {};
    let firstContinueStarted: () => void = () => {};
    const firstContinueStartedPromise = new Promise<void>((resolve) => {
      firstContinueStarted = resolve;
    });
    let continueCallCount = 0;
    const agent = createFakeAgent({
      continueImpl: async ({ emit, state }) => {
        continueCallCount += 1;
        const callNumber = continueCallCount;

        if (callNumber === 1) {
          firstContinueStarted();
          await new Promise<void>((resolve) => {
            resolveFirstContinue = resolve;
          });
        }

        const assistantMessage = createAssistantMessage(`response-${callNumber}`);
        emit({ type: "message_end", message: assistantMessage });
        state.messages.push(assistantMessage);
      },
    });
    const repository = createMemoryRepository();
    const events: DomainEvent[] = [];
    const actor = createActor({
      agent,
      repository,
      publishEvent: (event) => events.push(event),
    });

    const firstRun = actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      runId: "run-1",
    });
    await firstContinueStartedPromise;

    const secondRun = actor.sendMessage({
      messageId: "msg-2",
      content: "again",
      runId: "run-2",
    });
    await Promise.resolve();

    expect(agent.continue).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual(["agent_start"]);

    resolveFirstContinue();
    await Promise.all([firstRun, secondRun]);

    expect(agent.continue).toHaveBeenCalledTimes(2);
    expect(repository.messages.map((message) => message.content)).toEqual(["response-1", "response-2"]);
    expect(repository.runs).toMatchObject([
      { id: "run-1", messageId: "msg-1", status: "completed" },
      { id: "run-2", messageId: "msg-2", status: "completed" },
    ]);
    expect(events.map((event) => event.type)).toEqual(["agent_start", "agent_end", "agent_start", "agent_end"]);
  });

  it("emits assistant lifecycle around a text_start response without duplicate starts", async () => {
    const agent = createFakeAgent({
      continueImpl: ({ emit, state }) => {
        const assistantMessage = createAssistantMessage("world");
        emit({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_start",
            contentIndex: 0,
            partial: assistantMessage,
          },
        });
        emit({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            contentIndex: 0,
            delta: "world",
            partial: assistantMessage,
          },
        });
        emit({ type: "message_end", message: assistantMessage });
        state.messages.push(assistantMessage);
      },
    });
    const actor = createActor({ agent });
    const events: string[] = [];

    await actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      runId: "run-1",
      assistantMessageId: "assistant-message-1",
      onStreamEvent: (event) => events.push(formatAgentStreamEvent(event)),
    });

    expect(events).toEqual(["start", "delta:world", "assistant:world", "complete"]);
  });

  it("emits assistant start before the first text_delta when text_start is skipped", async () => {
    const agent = createFakeAgent();
    const actor = createActor({ agent });
    const events: string[] = [];

    await actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      runId: "run-1",
      assistantMessageId: "assistant-message-1",
      onStreamEvent: (event) => events.push(formatAgentStreamEvent(event)),
    });

    expect(events).toEqual(["thinking:thinking", "start", "delta:world", "assistant:world", "complete"]);
  });

  it("emits assistant start and completion around a final-only assistant message", async () => {
    const agent = createFakeAgent({
      continueImpl: ({ emit, state }) => {
        const assistantMessage = createAssistantMessage("final response");
        emit({ type: "message_end", message: assistantMessage });
        state.messages.push(assistantMessage);
      },
    });
    const actor = createActor({ agent });
    const events: string[] = [];

    await actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      runId: "run-1",
      assistantMessageId: "assistant-message-1",
      onStreamEvent: (event) => events.push(formatAgentStreamEvent(event)),
    });

    expect(events).toEqual(["start", "assistant:final response", "complete"]);
  });

  it("does not emit assistant completion when persistence fails after the final assistant message", async () => {
    const repository = createMemoryRepository();
    repository.appendMessage = async () => {
      throw new Error("database unavailable");
    };
    const agent = createFakeAgent();
    const actor = createActor({ agent, repository });
    const events: string[] = [];

    await expect(
      actor.sendMessage({
        messageId: "msg-1",
        content: "hello",
        runId: "run-1",
        assistantMessageId: "assistant-message-1",
        onStreamEvent: (event) => events.push(formatAgentStreamEvent(event)),
      }),
    ).rejects.toThrow("database unavailable");

    expect(events).toEqual(["thinking:thinking", "start", "delta:world", "assistant:world"]);
  });

  it("does not emit assistant completion for a failed assistant response", async () => {
    const repository = createMemoryRepository();
    const agent = createFakeAgent({
      continueImpl: ({ emit, state }) => {
        const assistantMessage = createAssistantMessage("", "provider deployment missing");
        emit({ type: "message_end", message: assistantMessage });
        state.messages.push(assistantMessage);
      },
    });
    const actor = createActor({ agent, repository });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const streamEvents: AgentStreamEvent[] = [];

    try {
      await expect(
        actor.sendMessage({
          messageId: "msg-1",
          content: "hello",
          runId: "run-1",
          assistantMessageId: "assistant-message-1",
          onStreamEvent: (event) => streamEvents.push(event),
        }),
      ).rejects.toThrow("provider deployment missing");

      expect(streamEvents.some((event) => event.type === "message.completed")).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses matching lifecycle ids for multiple assistant messages in one run", async () => {
    const repository = createMemoryRepository();
    const agent = createFakeAgent({
      continueImpl: ({ emit, state }) => {
        const firstAssistantMessage = createAssistantMessage("I will check.");
        emit({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "I will check.",
          },
        });
        emit({ type: "message_end", message: firstAssistantMessage });
        state.messages.push(firstAssistantMessage);

        state.messages.push({
          role: "toolResult",
          toolCallId: "tool-call-1",
          toolName: "lookup",
          content: [{ type: "text", text: "tool result" }],
          isError: false,
          timestamp: Date.now(),
        });

        const secondAssistantMessage = createAssistantMessage("final answer");
        emit({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "final answer",
          },
        });
        emit({ type: "message_end", message: secondAssistantMessage });
        state.messages.push(secondAssistantMessage);
      },
    });
    const actor = createActor({ agent, repository });
    const streamEvents: AgentStreamEvent[] = [];

    await actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      runId: "run-1",
      assistantMessageId: "assistant-message-1",
      onStreamEvent: (event) => streamEvents.push(event),
    });

    expect(repository.messages).toHaveLength(2);
    expect(repository.messages[0]).toMatchObject({
      id: "assistant-message-1",
      content: "I will check.",
    });
    expect(repository.messages[1]).toMatchObject({
      content: "final answer",
    });
    expect(repository.messages[1]?.id).not.toBe("assistant-message-1");

    const firstMessageId = repository.messages[0]?.id;
    const secondMessageId = repository.messages[1]?.id;

    expect(streamEvents).toEqual([
      {
        type: "message.started",
        sessionId: "session-1",
        messageId: firstMessageId,
      },
      {
        type: "message.delta",
        sessionId: "session-1",
        messageId: firstMessageId,
        delta: "I will check.",
      },
      {
        type: "assistant.message",
        sessionId: "session-1",
        messageId: firstMessageId,
        message: "I will check.",
      },
      {
        type: "message.started",
        sessionId: "session-1",
        messageId: secondMessageId,
      },
      {
        type: "message.delta",
        sessionId: "session-1",
        messageId: secondMessageId,
        delta: "final answer",
      },
      {
        type: "assistant.message",
        sessionId: "session-1",
        messageId: secondMessageId,
        message: "final answer",
      },
      {
        type: "message.completed",
        sessionId: "session-1",
        messageId: firstMessageId,
      },
      {
        type: "message.completed",
        sessionId: "session-1",
        messageId: secondMessageId,
      },
    ]);
  });

  it("persists assistant messages and completes the run after a successful response", async () => {
    const repository = createMemoryRepository();
    const events: DomainEvent[] = [];
    const agent = createFakeAgent();
    const actor = createActor({
      agent,
      repository,
      publishEvent: (event) => events.push(event),
    });
    const streamEvents: string[] = [];

    await actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      runId: "run-1",
      assistantMessageId: "assistant-message-1",
      onStreamEvent: (event) => streamEvents.push(formatAgentStreamEvent(event)),
    });

    expect(streamEvents).toEqual(["thinking:thinking", "start", "delta:world", "assistant:world", "complete"]);
    expect(repository.messages).toHaveLength(1);
    expect(repository.messages[0]).toMatchObject({
      id: "assistant-message-1",
      sessionId: "session-1",
      userId: "user-1",
      role: "assistant",
      content: "world",
    });
    expect(repository.runs[0]).toMatchObject({
      status: "completed",
      output: { messageCount: 2 },
      errorMessage: null,
    });
    expect(events.map((event) => event.type)).toEqual(["agent_start", "agent_end"]);
  });

  it("updates the run as failed when the assistant stream reports an error", async () => {
    const repository = createMemoryRepository();
    const events: DomainEvent[] = [];
    const agent = createFakeAgent({
      continueImpl: ({ emit, state }) => {
        const assistantMessage = createAssistantMessage("", "provider deployment missing");
        emit({ type: "message_end", message: assistantMessage });
        state.messages.push(assistantMessage);
      },
    });
    const actor = createActor({
      agent,
      repository,
      publishEvent: (event) => events.push(event),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const streamEvents: string[] = [];

    try {
      await expect(
        actor.sendMessage({
          messageId: "msg-1",
          content: "hello",
          assistantMessageId: "assistant-message-1",
          onStreamEvent: (event) => streamEvents.push(formatAgentStreamEvent(event)),
        }),
      ).rejects.toThrow("provider deployment missing");

      expect(consoleError).toHaveBeenCalledWith(
        "[agent] assistant stream error for session session-1: provider deployment missing",
      );
      expect(streamEvents).toEqual(["assistant:Agent error: provider deployment missing"]);
      expect(repository.messages).toHaveLength(0);
      expect(repository.runs[0]).toMatchObject({
        status: "failed",
        errorMessage: "provider deployment missing",
      });
      const runEvents = events.filter((event) => event.type === "agent_start" || event.type === "agent_end");
      expect(runEvents).toMatchObject([
        { type: "agent_start", sessionId: "session-1" },
        {
          type: "agent_end",
          sessionId: "session-1",
          status: "failed",
          errorMessage: "provider deployment missing",
        },
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not persist or complete an assistant response produced after abort", async () => {
    const repository = createMemoryRepository();
    const events: DomainEvent[] = [];
    const controller = new AbortController();
    const agent = createFakeAgent({
      continueImpl: ({ emit, state }) => {
        controller.abort();
        const assistantMessage = createAssistantMessage("partial response");
        emit({ type: "message_end", message: assistantMessage });
        state.messages.push(assistantMessage);
      },
    });
    const actor = createActor({
      agent,
      repository,
      publishEvent: (event) => events.push(event),
    });

    await actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      signal: controller.signal,
    });

    expect(repository.messages).toHaveLength(0);
    expect(repository.runs[0]).toMatchObject({
      status: "cancelled",
      errorMessage: "Agent run was cancelled.",
    });
    expect(actor.getMessages()).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual(["agent_start", "agent_end"]);
  });

  it("updates the run as cancelled when an aborted signal stops the agent", async () => {
    let rejectContinue: ((error: Error) => void) | null = null;
    let continueStarted: (() => void) | null = null;
    const continueStartedPromise = new Promise<void>((resolve) => {
      continueStarted = resolve;
    });
    const repository = createMemoryRepository();
    const events: DomainEvent[] = [];
    const agent = createFakeAgent({
      continueImpl: () =>
        new Promise<void>((_resolve, reject) => {
          rejectContinue = reject;
          continueStarted?.();
        }),
      onAbort: () => {
        rejectContinue?.(new Error("aborted"));
      },
    });
    const actor = createActor({
      agent,
      repository,
      publishEvent: (event) => events.push(event),
    });
    const controller = new AbortController();

    const run = actor.sendMessage({
      messageId: "msg-1",
      content: "hello",
      signal: controller.signal,
    });
    await continueStartedPromise;
    controller.abort();
    await run;

    expect(agent.abort).toHaveBeenCalledTimes(1);
    expect(repository.runs[0]).toMatchObject({
      status: "cancelled",
      errorMessage: "aborted",
    });
    expect(events.map((event) => event.type)).toEqual(["agent_start", "agent_end"]);
  });
});
