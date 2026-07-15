import type { Message as AgentMessage } from "@dentaltrip-ai/ai";
import type {
  AgentRunRecord,
  AgentRunRequest,
  CreateAgentRunInput,
  UpdateAgentRunInput,
} from "@dentaltrip-ai/core/agent";
import type { DomainEvent } from "@dentaltrip-ai/core/events";
import type { AppendSessionDataRepositoryInput, Message, Session, SessionDataEntry } from "@dentaltrip-ai/core/session";
import { describe, expect, it, vi } from "vitest";
import { createAgentRuntime } from "../src/core/agent-session-runtime.ts";
import { type CreateAgentFn, SessionActor } from "../src/core/session-actor.ts";

const DEFAULT_USER_ID = "user-1";

type CreateAgentInput = Parameters<CreateAgentFn>[0];

function createMemoryRepository() {
  const sessions = new Map<string, Session>();
  const messages = new Map<string, Message[]>();
  const sessionData = new Map<string, SessionDataEntry[]>();
  const runs: AgentRunRecord[] = [];

  return {
    sessions,
    messages,
    sessionData,
    runs,
    async getSession(sessionId: string): Promise<Session | null> {
      return sessions.get(sessionId) ?? null;
    },
    async listMessages(sessionId: string): Promise<Message[]> {
      return messages.get(sessionId) ?? [];
    },
    async listSessionData(sessionId: string): Promise<SessionDataEntry[]> {
      return sessionData.get(sessionId) ?? [];
    },
    async appendMessage(input: {
      id: string;
      sessionId: string;
      userId: string;
      role: "user" | "assistant" | "system";
      content: string;
      entryPayload?: Record<string, unknown>;
    }): Promise<Message> {
      const list = messages.get(input.sessionId) ?? [];
      const message: Message = {
        ...input,
        sequence: list.length + 1,
        createdAt: new Date(),
      };
      list.push(message);
      messages.set(input.sessionId, list);
      const dataList = sessionData.get(input.sessionId) ?? [];
      dataList.push({
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        parentId: dataList.at(-1)?.id ?? null,
        sequence: dataList.length + 1,
        type: "message",
        payload: input.entryPayload ?? { message },
        schemaVersion: 1,
        createdAt: message.createdAt,
      });
      sessionData.set(input.sessionId, dataList);
      return message;
    },
    async appendSessionData(input: AppendSessionDataRepositoryInput): Promise<SessionDataEntry> {
      const dataList = sessionData.get(input.sessionId) ?? [];
      const entry: SessionDataEntry = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        parentId: input.parentId ?? dataList.at(-1)?.id ?? null,
        sequence: dataList.length + 1,
        type: input.type,
        payload: input.payload,
        schemaVersion: input.schemaVersion ?? 1,
        createdAt: new Date(),
      };

      dataList.push(entry);
      sessionData.set(input.sessionId, dataList);
      return entry;
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

type MemoryRepository = ReturnType<typeof createMemoryRepository>;

function createActiveSession(sessionId: string, overrides: Partial<Session> = {}): Session {
  return {
    id: sessionId,
    userId: DEFAULT_USER_ID,
    title: "Test",
    status: "active",
    messageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function appendRepositoryMessage(
  repository: MemoryRepository,
  input: {
    id: string;
    sessionId: string;
    content: string;
    role?: Message["role"];
    userId?: string;
  },
): Promise<Message> {
  return repository.appendMessage({
    id: input.id,
    sessionId: input.sessionId,
    userId: input.userId ?? DEFAULT_USER_ID,
    role: input.role ?? "user",
    content: input.content,
  });
}

function createFakeAgent(initialMessages: AgentMessage[], options: { continueImpl?: () => Promise<void> | void } = {}) {
  return {
    subscribe: vi.fn(() => () => {}),
    state: {
      messages: [...initialMessages],
    },
    continue: vi.fn(async () => {
      await options.continueImpl?.();
    }),
    abort: vi.fn(),
  };
}

describe("createAgentRuntime", () => {
  it("reuses the same actor for subsequent runs in the same session", async () => {
    const repository = createMemoryRepository();
    repository.sessions.set("session-1", createActiveSession("session-1"));

    const agents: Array<ReturnType<typeof createFakeAgent>> = [];
    const createAgent = vi.fn((input: CreateAgentInput) => {
      const agent = createFakeAgent(input.messages);
      agents.push(agent);
      return agent as never;
    });
    const runtime = createAgentRuntime({
      transcriptRepository: repository,
      agentRunStore: repository,
      createAgent,
      validateConfiguration: () => {},
    });

    const firstMessage = await appendRepositoryMessage(repository, {
      id: "msg-1",
      sessionId: "session-1",
      content: "first",
    });
    await runtime.startRun({
      sessionId: "session-1",
      messageId: firstMessage.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);

    const secondMessage = await appendRepositoryMessage(repository, {
      id: "msg-2",
      sessionId: "session-1",
      content: "second",
    });
    await runtime.startRun({
      sessionId: "session-1",
      messageId: secondMessage.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);

    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(
      agents[0]?.state.messages.filter((message) => message.role === "user").map((message) => message.content),
    ).toEqual(["first", "second"]);
  });

  it("creates separate actors for different sessions", async () => {
    const repository = createMemoryRepository();
    repository.sessions.set("session-1", createActiveSession("session-1"));
    repository.sessions.set("session-2", createActiveSession("session-2"));

    const agents: Array<ReturnType<typeof createFakeAgent>> = [];
    const createAgent = vi.fn((input: CreateAgentInput) => {
      const agent = createFakeAgent(input.messages);
      agents.push(agent);
      return agent as never;
    });
    const runtime = createAgentRuntime({
      transcriptRepository: repository,
      agentRunStore: repository,
      createAgent,
      validateConfiguration: () => {},
    });

    const sessionOneMessage = await appendRepositoryMessage(repository, {
      id: "msg-1",
      sessionId: "session-1",
      content: "first",
    });
    await runtime.startRun({
      sessionId: "session-1",
      messageId: sessionOneMessage.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);

    const sessionTwoMessage = await appendRepositoryMessage(repository, {
      id: "msg-2",
      sessionId: "session-2",
      content: "second",
    });
    await runtime.startRun({
      sessionId: "session-2",
      messageId: sessionTwoMessage.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);

    expect(createAgent).toHaveBeenCalledTimes(2);
    expect(agents).toHaveLength(2);
    expect(agents[0]).not.toBe(agents[1]);
  });

  it("publishes a failed run event when setup fails before the run starts", async () => {
    const repository = createMemoryRepository();
    const events: DomainEvent[] = [];
    const runtime = createAgentRuntime({
      transcriptRepository: repository,
      agentRunStore: repository,
      validateConfiguration: () => {
        throw new Error("provider unavailable");
      },
      publishEvent: (event) => events.push(event),
    });

    await expect(
      runtime.startRun({
        runId: "run-1",
        sessionId: "session-1",
        messageId: "msg-1",
        userId: DEFAULT_USER_ID,
      } satisfies AgentRunRequest),
    ).rejects.toThrow("provider unavailable");

    expect(events).toEqual([
      {
        type: "agent_end",
        runId: "run-1",
        sessionId: "session-1",
        messages: [],
        status: "failed",
        errorMessage: "provider unavailable",
      },
    ]);
  });

  it("excludes the current user message from the initial actor transcript", async () => {
    const repository = createMemoryRepository();
    repository.sessions.set("session-1", createActiveSession("session-1"));

    const createAgent = vi.fn((input: CreateAgentInput) => {
      return createFakeAgent(input.messages) as never;
    });
    const runtime = createAgentRuntime({
      transcriptRepository: repository,
      agentRunStore: repository,
      createAgent,
      validateConfiguration: () => {},
    });

    await appendRepositoryMessage(repository, {
      id: "msg-1",
      sessionId: "session-1",
      content: "previous user message",
    });
    await appendRepositoryMessage(repository, {
      id: "msg-2",
      sessionId: "session-1",
      role: "assistant",
      content: "previous assistant message",
    });
    const currentMessage = await appendRepositoryMessage(repository, {
      id: "msg-3",
      sessionId: "session-1",
      content: "current user message",
    });

    await runtime.startRun({
      sessionId: "session-1",
      messageId: currentMessage.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);

    expect(createAgent).toHaveBeenCalledTimes(1);
    const initialMessages = createAgent.mock.calls[0]?.[0].messages;
    expect(initialMessages?.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(
      initialMessages?.some((message) => message.role === "user" && message.content === "current user message"),
    ).toBe(false);
  });

  it("passes assistant stream events to the session actor", async () => {
    const repository = createMemoryRepository();
    repository.sessions.set("session-1", createActiveSession("session-1"));
    const createAgent = vi.fn((input: CreateAgentInput) => {
      return createFakeAgent(input.messages) as never;
    });
    const runtime = createAgentRuntime({
      transcriptRepository: repository,
      agentRunStore: repository,
      createAgent,
      validateConfiguration: () => {},
    });
    const message = await appendRepositoryMessage(repository, {
      id: "msg-1",
      sessionId: "session-1",
      content: "hello",
    });
    const onStreamEvent = vi.fn();
    const sendMessage = vi.spyOn(SessionActor.prototype, "sendMessage").mockResolvedValue(undefined);

    try {
      await runtime.startRun({
        sessionId: "session-1",
        messageId: message.id,
        assistantMessageId: "assistant-message-1",
        userId: DEFAULT_USER_ID,
        onStreamEvent,
      } satisfies AgentRunRequest);

      expect(sendMessage).toHaveBeenCalledWith({
        messageId: message.id,
        content: "hello",
        signal: undefined,
        runId: expect.any(String),
        assistantMessageId: "assistant-message-1",
        onStreamEvent,
      });
    } finally {
      sendMessage.mockRestore();
    }
  });

  it("delegates abortRun to the active session actor", async () => {
    let resolveContinue: () => void = () => {};
    let continueStarted: () => void = () => {};
    const continueStartedPromise = new Promise<void>((resolve) => {
      continueStarted = resolve;
    });
    const repository = createMemoryRepository();
    repository.sessions.set("session-1", createActiveSession("session-1"));

    const agents: Array<ReturnType<typeof createFakeAgent>> = [];
    const createAgent = vi.fn((input: CreateAgentInput) => {
      const agent = createFakeAgent(input.messages, {
        continueImpl: () =>
          new Promise<void>((resolve) => {
            resolveContinue = resolve;
            continueStarted();
          }),
      });
      agents.push(agent);
      return agent as never;
    });
    const runtime = createAgentRuntime({
      transcriptRepository: repository,
      agentRunStore: repository,
      createAgent,
      validateConfiguration: () => {},
    });
    const message = await appendRepositoryMessage(repository, {
      id: "msg-1",
      sessionId: "session-1",
      content: "hello",
    });

    const run = runtime.startRun({
      sessionId: "session-1",
      messageId: message.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);
    await continueStartedPromise;

    runtime.abortRun("session-1");
    expect(agents[0]?.abort).toHaveBeenCalledTimes(1);

    resolveContinue();
    await run;
  });

  it("removes the actor when closeSession is called", async () => {
    const repository = createMemoryRepository();
    repository.sessions.set("session-1", createActiveSession("session-1"));

    const createAgent = vi.fn((input: CreateAgentInput) => {
      return createFakeAgent(input.messages) as never;
    });
    const runtime = createAgentRuntime({
      transcriptRepository: repository,
      agentRunStore: repository,
      createAgent,
      validateConfiguration: () => {},
    });

    const firstMessage = await appendRepositoryMessage(repository, {
      id: "msg-1",
      sessionId: "session-1",
      content: "first",
    });
    await runtime.startRun({
      sessionId: "session-1",
      messageId: firstMessage.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);

    runtime.closeSession("session-1");

    const secondMessage = await appendRepositoryMessage(repository, {
      id: "msg-2",
      sessionId: "session-1",
      content: "second",
    });
    await runtime.startRun({
      sessionId: "session-1",
      messageId: secondMessage.id,
      userId: DEFAULT_USER_ID,
    } satisfies AgentRunRequest);

    expect(createAgent).toHaveBeenCalledTimes(2);
  });
});
