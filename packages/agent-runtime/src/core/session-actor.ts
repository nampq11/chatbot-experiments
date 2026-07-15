import { randomUUID } from "node:crypto";
import type { Agent, AgentEvent } from "@dentaltrip-ai/agent-core";
import type { Message as AgentMessage, Model } from "@dentaltrip-ai/ai";
import type { AgentRunStore, AgentStreamEvent } from "@dentaltrip-ai/core/agent";
import type { DomainEvent } from "@dentaltrip-ai/core/events";
import type { SessionRepository } from "@dentaltrip-ai/core/session";
import type { ThinkingLevel } from "./agent.ts";
import { extractAgentMessageText, toSessionDataMessagePayload } from "./transcript-mapper.ts";

type TranscriptWriter = Pick<SessionRepository, "appendMessage">;
type WithoutStreamRouting<T> = T extends unknown ? Omit<T, "sessionId" | "messageId"> : never;

type AgentStreamEventPayload = WithoutStreamRouting<AgentStreamEvent>;

type RuntimeAgent = Pick<Agent, "continue" | "abort" | "subscribe" | "state">;
type AgentLifecycleEvent = Extract<AgentEvent, { type: "agent_start" | "agent_end" }>;

/** Creates an agent instance for a session actor. */
export type CreateAgentFn = (input: {
  readonly sessionId: string;
  readonly messages: AgentMessage[];
  readonly systemPrompt?: string;
  readonly thinkingLevel?: ThinkingLevel;
}) => RuntimeAgent;

/** Input for one user message turn handled by a session actor. */
export interface SessionActorSendMessageInput {
  messageId: string;
  content: string;
  signal?: AbortSignal;
  runId?: string;
  assistantMessageId?: string;
  onStreamEvent?: (event: AgentStreamEvent) => void;
}

type ProcessSessionMessageInput = Omit<SessionActorSendMessageInput, "runId"> & {
  readonly runId: string;
};

interface QueuedSessionMessage {
  readonly input: ProcessSessionMessageInput;
  resolve(): void;
  reject(error: unknown): void;
}

/** Dependencies required to construct a long-lived actor for one session. */
export interface SessionActorOptions {
  sessionId: string;
  userId: string;
  model: Model;
  initialMessages: AgentMessage[];
  systemPrompt: string;
  transcriptWriter: TranscriptWriter;
  agentRunStore: AgentRunStore;
  publishEvent: (event: DomainEvent) => void;
  createAgent: CreateAgentFn;
  thinkingLevel?: ThinkingLevel;
}

/** Maintains agent state and run lifecycle for one session. */
export class SessionActor {
  private readonly sessionId: string;
  private readonly userId: string;
  private readonly model: Model;
  private readonly transcriptWriter: TranscriptWriter;
  private readonly agentRunStore: AgentRunStore;
  private readonly publishEvent: (event: DomainEvent) => void;
  private readonly agent: RuntimeAgent;
  private readonly messageQueue: QueuedSessionMessage[] = [];
  private activeMessage: QueuedSessionMessage | null = null;
  private isConsumingQueue = false;
  private isClosed = false;

  constructor(options: SessionActorOptions) {
    this.sessionId = options.sessionId;
    this.userId = options.userId;
    this.model = options.model;
    this.transcriptWriter = options.transcriptWriter;
    this.agentRunStore = options.agentRunStore;
    this.publishEvent = options.publishEvent;
    this.agent = options.createAgent({
      sessionId: options.sessionId,
      messages: options.initialMessages,
      systemPrompt: options.systemPrompt,
      thinkingLevel: options.thinkingLevel ?? "medium",
    });
  }

  /**
   * Sends a user message to the agent and persists any resulting assistant messages.
   * The actor maintains state, so multiple calls share one conversation history.
   */
  async sendMessage(input: SessionActorSendMessageInput): Promise<void> {
    const { assistantMessageId, onStreamEvent } = input;
    const runId = input.runId ?? randomUUID();
    if (onStreamEvent && !assistantMessageId) {
      throw new Error("assistantMessageId is required to emit stream events.");
    }

    if (this.isClosed) {
      throw new Error(`Session ${this.sessionId} is closed`);
    }

    const queuedInput: ProcessSessionMessageInput = { ...input, runId };

    return new Promise<void>((resolve, reject) => {
      this.messageQueue.push({
        input: queuedInput,
        resolve,
        reject,
      });
      this.startQueueConsumer();
    });
  }

  private async processMessage(input: ProcessSessionMessageInput): Promise<void> {
    const { messageId, content, signal, assistantMessageId, onStreamEvent, runId } = input;

    this.agent.state.messages.push({
      role: "user",
      content,
      timestamp: Date.now(),
    });

    const initialMessageCount = this.agent.state.messages.length;
    await this.agentRunStore.createAgentRun({
      id: runId,
      sessionId: this.sessionId,
      messageId,
      model: this.model.id,
    });

    let assistantErrorMessage: string | null = null;
    let assistantErrorMessageId: string | null = null;
    const contentfulAssistantMessageIds: string[] = [];
    let activeAssistantMessage: { id: string; started: boolean } | null = null;
    let finalAgentEvent: Extract<AgentEvent, { type: "agent_end" }> | null = null;
    let publishedAgentStart = false;

    const publishAgentEvent = (event: AgentLifecycleEvent) => {
      this.publishEvent({
        ...event,
        runId,
        sessionId: this.sessionId,
      });
    };

    const publishAgentStart = () => {
      if (publishedAgentStart) {
        return;
      }

      publishedAgentStart = true;
      publishAgentEvent({ type: "agent_start" });
    };

    const publishAgentEnd = (status: "completed" | "failed" | "cancelled", errorMessage?: string) => {
      if (finalAgentEvent?.status === status && (finalAgentEvent.errorMessage || !errorMessage)) {
        publishAgentEvent(finalAgentEvent);
        return;
      }

      publishAgentEvent({
        type: "agent_end",
        messages: this.agent.state.messages.slice(),
        status,
        ...(errorMessage ? { errorMessage } : {}),
      });
    };

    const createAssistantMessageId = () => {
      if (contentfulAssistantMessageIds.length === 0 && assistantMessageId) {
        return assistantMessageId;
      }

      return randomUUID();
    };

    const getActiveAssistantMessage = () => {
      if (!activeAssistantMessage) {
        activeAssistantMessage = {
          id: createAssistantMessageId(),
          started: false,
        };
      }

      return activeAssistantMessage;
    };

    const emitStreamEvent = (messageId: string, event: AgentStreamEventPayload) => {
      if (!onStreamEvent) {
        return;
      }

      onStreamEvent({
        ...event,
        sessionId: this.sessionId,
        messageId,
      } as AgentStreamEvent);
    };

    const emitActiveStreamEvent = (event: AgentStreamEventPayload) => {
      emitStreamEvent(getActiveAssistantMessage().id, event);
    };

    const startAssistantMessage = () => {
      const message = getActiveAssistantMessage();

      if (message.started) {
        return message;
      }

      message.started = true;
      emitStreamEvent(message.id, { type: "message.started" });
      return message;
    };

    const finishAssistantMessage = (hasVisibleContent: boolean) => {
      if (!hasVisibleContent) {
        return;
      }

      if (activeAssistantMessage) {
        contentfulAssistantMessageIds.push(activeAssistantMessage.id);
      }

      activeAssistantMessage = null;
    };

    const unsubscribe = this.agent.subscribe(async (event) => {
      if (event.type === "agent_start") {
        publishAgentStart();
      }

      if (event.type === "agent_end") {
        finalAgentEvent = event;
      }

      if (signal?.aborted === true) {
        return;
      }

      if (event.type === "message_start") {
        getActiveAssistantMessage();
      }

      if (event.type === "message_update") {
        if (event.assistantMessageEvent?.type === "text_start") {
          startAssistantMessage();
        }

        if (event.assistantMessageEvent?.type === "text_delta") {
          const message = startAssistantMessage();
          emitStreamEvent(message.id, {
            type: "message.delta",
            delta: event.assistantMessageEvent.delta,
          });
        }

        if (event.assistantMessageEvent?.type === "thinking_delta") {
          emitActiveStreamEvent({
            type: "thinking.delta",
            delta: event.assistantMessageEvent.delta,
          });
        }
      }

      if (event.type === "message_end" && event.message.role === "assistant") {
        let hasVisibleContent = false;
        let endedAssistantMessage = activeAssistantMessage;

        if (typeof event.message.errorMessage === "string" && event.message.errorMessage.length > 0) {
          assistantErrorMessage = event.message.errorMessage;
          console.error(`[agent] assistant stream error for session ${this.sessionId}: ${event.message.errorMessage}`);
        }

        const assistantMessage = extractAgentMessageText(event.message);
        if (assistantMessage.length > 0) {
          endedAssistantMessage = startAssistantMessage();
          emitStreamEvent(endedAssistantMessage.id, {
            type: "assistant.message",
            message: assistantMessage,
          });

          hasVisibleContent = true;
        }

        if (assistantErrorMessage && endedAssistantMessage) {
          assistantErrorMessageId = endedAssistantMessage.id;
        }

        finishAssistantMessage(hasVisibleContent);
      }
    });

    const abortHandler = () => {
      this.agent.abort();
    };

    signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      publishAgentStart();
      await this.agent.continue();
      this.throwIfAborted(signal);

      if (assistantErrorMessage) {
        const errorMessageId = assistantErrorMessageId ?? getActiveAssistantMessage().id;
        emitStreamEvent(errorMessageId, {
          type: "assistant.message",
          message: `Agent error: ${assistantErrorMessage}`,
        });
        throw new Error(assistantErrorMessage);
      }

      this.throwIfAborted(signal);
      const persistedAssistantMessageIds = await this.persistNewAssistantMessages(
        initialMessageCount,
        contentfulAssistantMessageIds,
      );
      this.throwIfAborted(signal);

      await this.agentRunStore.updateAgentRun(runId, {
        status: "completed",
        output: { messageCount: this.agent.state.messages.length },
      });

      for (const messageId of persistedAssistantMessageIds) {
        emitStreamEvent(messageId, { type: "message.completed" });
      }

      publishAgentEnd("completed");
    } catch (error: unknown) {
      const aborted = signal?.aborted === true;

      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.agentRunStore.updateAgentRun(runId, {
        status: aborted ? "cancelled" : "failed",
        errorMessage,
      });

      if (aborted) {
        this.truncateGeneratedMessages(initialMessageCount);
        publishAgentEnd("cancelled", errorMessage);
        return;
      }

      publishAgentEnd("failed", errorMessage);

      throw error;
    } finally {
      signal?.removeEventListener("abort", abortHandler);
      unsubscribe();
    }
  }

  /** Aborts the current agent run, if any. */
  abort(): void {
    if (this.activeMessage) {
      this.agent.abort();
    }
  }

  /** Returns the current message history from the agent state. */
  getMessages(): AgentMessage[] {
    return this.agent.state.messages;
  }

  /** Closes the actor and releases run-time resources. */
  close(): void {
    this.isClosed = true;
    this.abort();
    this.rejectQueuedMessages(new Error(`Session ${this.sessionId} is closed`));
  }

  private startQueueConsumer(): void {
    if (this.isConsumingQueue) {
      return;
    }

    this.isConsumingQueue = true;
    void this.consumeQueue();
  }

  private async consumeQueue(): Promise<void> {
    try {
      while (!this.isClosed) {
        const message = this.messageQueue.shift();
        if (!message) {
          return;
        }

        this.activeMessage = message;
        try {
          await this.processMessage(message.input);
          message.resolve();
        } catch (error: unknown) {
          message.reject(error);
        } finally {
          this.activeMessage = null;
        }
      }
    } finally {
      this.isConsumingQueue = false;

      if (this.isClosed) {
        this.rejectQueuedMessages(new Error(`Session ${this.sessionId} is closed`));
      } else if (this.messageQueue.length > 0) {
        this.startQueueConsumer();
      }
    }
  }

  private rejectQueuedMessages(error: Error): void {
    const messages = this.messageQueue.splice(0);

    for (const message of messages) {
      message.reject(error);
    }
  }

  /** Persists assistant messages generated after the current user message. */
  private async persistNewAssistantMessages(
    initialMessageCount: number,
    assistantMessageIds: readonly string[] = [],
  ): Promise<string[]> {
    const newMessages = this.agent.state.messages.slice(initialMessageCount);
    let persistedAssistantCount = 0;
    const persistedAssistantMessageIds: string[] = [];

    for (const message of newMessages) {
      if (message.role !== "assistant") {
        continue;
      }

      const content = extractAgentMessageText(message);

      if (content.length === 0) {
        continue;
      }

      const messageId = assistantMessageIds[persistedAssistantCount] ?? randomUUID();

      await this.transcriptWriter.appendMessage({
        id: messageId,
        sessionId: this.sessionId,
        userId: this.userId,
        role: "assistant",
        content,
        entryPayload: toSessionDataMessagePayload(message),
      });
      persistedAssistantMessageIds.push(messageId);
      persistedAssistantCount += 1;
    }

    return persistedAssistantMessageIds;
  }

  /** Fails the run before completion side effects when the request was cancelled. */
  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted !== true) {
      return;
    }

    throw new Error("Agent run was cancelled.");
  }

  /** Removes non-persisted assistant/tool messages produced by a cancelled run. */
  private truncateGeneratedMessages(initialMessageCount: number): void {
    this.agent.state.messages = this.agent.state.messages.slice(0, initialMessageCount);
  }
}
