import type {
  Api,
  AssistantMessage,
  ImageContent,
  Message,
  Model,
  SimpleStreamOptions,
  TextContent,
  Transport,
  Usage,
} from "@chatbot-experiments/llm-core";
import { runAgentLoop, runAgentLoopContinue } from "./agent-loop.js";
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentLoopTurnUpdate,
  AgentMessage,
  AgentState,
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
  PromptInput,
  QueueMode,
  StreamFn,
  ToolExecutionMode,
} from "./types.js";

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const DEFAULT_MODEL = {
  id: "unknown",
  name: "unknown",
  api: "unknown",
  provider: "unknown",
  baseUrl: "",
  reasoning: false,
  input: [],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 0,
  maxTokens: 0,
} satisfies Model<Api>;

type AgentInitialState = Partial<
  Omit<
    AgentState,
    "isStreaming" | "streamingMessage" | "pendingToolCalls" | "errorMessage"
  >
>;

type MutableAgentState = Omit<
  AgentState,
  "isStreaming" | "streamingMessage" | "pendingToolCalls" | "errorMessage"
> & {
  isStreaming: boolean;
  streamingMessage?: AssistantMessage;
  pendingToolCalls: Set<string>;
  errorMessage?: string;
};

function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
  return messages.filter(
    (message) =>
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "toolResult",
  );
}

function createMutableAgentState(
  initialState?: AgentInitialState,
): MutableAgentState {
  let tools = initialState?.tools?.slice() ?? [];
  let messages = initialState?.messages?.slice() ?? [];

  return {
    systemPrompt: initialState?.systemPrompt ?? "",
    model: initialState?.model ?? DEFAULT_MODEL,
    thinkingLevel: initialState?.thinkingLevel ?? "off",
    get tools() {
      return tools;
    },
    set tools(nextTools: AgentTool[]) {
      tools = nextTools.slice();
    },
    get messages() {
      return messages;
    },
    set messages(nextMessages: AgentMessage[]) {
      messages = nextMessages.slice();
    },
    isStreaming: false,
    streamingMessage: undefined,
    pendingToolCalls: new Set<string>(),
    errorMessage: undefined,
  };
}

class PendingMessageQueue {
  public mode: QueueMode;
  private messages: AgentMessage[] = [];

  constructor(mode: QueueMode) {
    this.mode = mode;
  }

  enqueue(message: AgentMessage): void {
    this.messages.push(message);
  }

  hasItems(): boolean {
    return this.messages.length > 0;
  }

  drain(): AgentMessage[] {
    if (this.mode === "all") {
      const drained = this.messages.slice();
      this.messages = [];
      return drained;
    }

    const first = this.messages[0];
    if (!first) {
      return [];
    }
    this.messages = this.messages.slice(1);
    return [first];
  }

  clear(): void {
    this.messages = [];
  }
}

type ActiveRun = {
  promise: Promise<void>;
  resolve: () => void;
  abortController: AbortController;
};

/** Options for constructing a stateful Agent. */
export interface AgentOptions {
  initialState?: AgentInitialState;
  convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;
  streamFn: StreamFn;
  getApiKey?: (
    provider: string,
  ) => Promise<string | undefined> | string | undefined;
  onPayload?: SimpleStreamOptions["onPayload"];
  onResponse?: SimpleStreamOptions["onResponse"];
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>;
  prepareNextTurn?: (
    signal?: AbortSignal,
  ) =>
    | Promise<AgentLoopTurnUpdate | undefined>
    | AgentLoopTurnUpdate
    | undefined;
  steeringMode?: QueueMode;
  followUpMode?: QueueMode;
  sessionId?: string;
  transport?: Transport;
  maxRetryDelayMs?: number;
  toolExecution?: ToolExecutionMode;
}

/** Stateful provider-independent agent runtime. */
export class Agent {
  private readonly listeners = new Set<
    (event: AgentEvent, signal: AbortSignal) => Promise<void> | void
  >();
  private readonly steeringQueue: PendingMessageQueue;
  private readonly followUpQueue: PendingMessageQueue;
  private readonly _state: MutableAgentState;
  private activeRun?: ActiveRun;

  public readonly convertToLlm: (
    messages: AgentMessage[],
  ) => Message[] | Promise<Message[]>;
  public readonly transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;
  public readonly streamFn: StreamFn;
  public readonly getApiKey?: (
    provider: string,
  ) => Promise<string | undefined> | string | undefined;
  public readonly onPayload?: SimpleStreamOptions["onPayload"];
  public readonly onResponse?: SimpleStreamOptions["onResponse"];
  public readonly beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  public readonly afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>;
  public readonly prepareNextTurn?: (
    signal?: AbortSignal,
  ) =>
    | Promise<AgentLoopTurnUpdate | undefined>
    | AgentLoopTurnUpdate
    | undefined;
  public readonly sessionId?: string;
  public readonly transport: Transport;
  public readonly maxRetryDelayMs?: number;
  public readonly toolExecution: ToolExecutionMode;

  constructor(options: AgentOptions) {
    this._state = createMutableAgentState(options.initialState);
    this.convertToLlm = options.convertToLlm ?? defaultConvertToLlm;
    this.transformContext = options.transformContext;
    this.streamFn = options.streamFn;
    this.getApiKey = options.getApiKey;
    this.onPayload = options.onPayload;
    this.onResponse = options.onResponse;
    this.beforeToolCall = options.beforeToolCall;
    this.afterToolCall = options.afterToolCall;
    this.prepareNextTurn = options.prepareNextTurn;
    this.steeringQueue = new PendingMessageQueue(
      options.steeringMode ?? "one-at-a-time",
    );
    this.followUpQueue = new PendingMessageQueue(
      options.followUpMode ?? "one-at-a-time",
    );
    this.sessionId = options.sessionId;
    this.transport = options.transport ?? "auto";
    this.maxRetryDelayMs = options.maxRetryDelayMs;
    this.toolExecution = options.toolExecution ?? "parallel";
  }

  /** Current mutable agent state. */
  get state(): AgentState {
    return this._state;
  }

  /** Subscribes to all agent lifecycle events. */
  subscribe(
    listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Active abort signal for the current run, if any. */
  get signal(): AbortSignal | undefined {
    return this.activeRun?.abortController.signal;
  }

  /** Abort the current run, if one is active. */
  abort(): void {
    this.activeRun?.abortController.abort();
  }

  /** Resolves when the active run is idle. */
  waitForIdle(): Promise<void> {
    return this.activeRun?.promise ?? Promise.resolve();
  }

  /** Queues a message to be injected after the current assistant turn finishes. */
  steer(message: AgentMessage): void {
    this.steeringQueue.enqueue(message);
  }

  /** Queues a message to run only after the agent would otherwise stop. */
  followUp(message: AgentMessage): void {
    this.followUpQueue.enqueue(message);
  }

  /** Returns true when steering or follow-up messages are queued. */
  hasQueuedMessages(): boolean {
    return this.steeringQueue.hasItems() || this.followUpQueue.hasItems();
  }

  /** Clears transcript state, runtime state, and queued messages. */
  reset(): void {
    this._state.messages = [];
    this._state.isStreaming = false;
    this._state.streamingMessage = undefined;
    this._state.pendingToolCalls = new Set<string>();
    this._state.errorMessage = undefined;
    this.steeringQueue.clear();
    this.followUpQueue.clear();
  }

  /** Starts a new prompt from text, a single message, or a batch of messages. */
  async prompt(input: PromptInput, images?: ImageContent[]): Promise<void> {
    if (this.activeRun) {
      throw new Error(
        "Agent is already processing a prompt. Wait for completion before prompting.",
      );
    }

    const messages = this.normalizePromptInput(input, images);
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoop(
        messages,
        this.createContextSnapshot(),
        this.createLoopConfig(),
        (event) => this.processEvent(event),
        signal,
        this.streamFn,
      );
    });
  }

  /** Continues from the current transcript. The last message must not be an assistant message. */
  async continue(): Promise<void> {
    if (this.activeRun) {
      throw new Error(
        "Agent is already processing. Wait for completion before continuing.",
      );
    }

    const lastMessage = this._state.messages[this._state.messages.length - 1];
    if (!lastMessage) {
      throw new Error("No messages to continue from");
    }

    if (lastMessage.role === "assistant") {
      const queuedSteering = this.steeringQueue.drain();
      if (queuedSteering.length > 0) {
        await this.runPromptMessages(queuedSteering);
        return;
      }

      const queuedFollowUps = this.followUpQueue.drain();
      if (queuedFollowUps.length > 0) {
        await this.runPromptMessages(queuedFollowUps);
        return;
      }

      throw new Error("Cannot continue from message role: assistant");
    }

    await this.runWithLifecycle(async (signal) => {
      await runAgentLoopContinue(
        this.createContextSnapshot(),
        this.createLoopConfig(),
        (event) => this.processEvent(event),
        signal,
        this.streamFn,
      );
    });
  }

  /** Releases runtime resources. Present for API stability. */
  async shutdown(): Promise<void> {
    this.abort();
    await this.waitForIdle();
  }

  private normalizePromptInput(
    input: PromptInput,
    images?: ImageContent[],
  ): AgentMessage[] {
    if (Array.isArray(input)) {
      return input;
    }

    if (typeof input !== "string") {
      return [input];
    }

    const content: Array<TextContent | ImageContent> = [
      { type: "text", text: input },
    ];
    if (images && images.length > 0) {
      content.push(...images);
    }
    return [{ role: "user", content, timestamp: Date.now() }];
  }

  private async runPromptMessages(messages: AgentMessage[]): Promise<void> {
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoop(
        messages,
        this.createContextSnapshot(),
        this.createLoopConfig(),
        (event) => this.processEvent(event),
        signal,
        this.streamFn,
      );
    });
  }

  private createContextSnapshot(): AgentContext {
    return {
      systemPrompt: this._state.systemPrompt,
      messages: this._state.messages.slice(),
      tools: this._state.tools.slice(),
    };
  }

  private createLoopConfig(): AgentLoopConfig {
    return {
      model: this._state.model,
      sessionId: this.sessionId,
      onPayload: this.onPayload,
      onResponse: this.onResponse,
      transport: this.transport,
      maxRetryDelayMs: this.maxRetryDelayMs,
      toolExecution: this.toolExecution,
      beforeToolCall: this.beforeToolCall,
      afterToolCall: this.afterToolCall,
      prepareNextTurn: this.prepareNextTurn
        ? async (signal) => this.prepareNextTurn?.(signal)
        : undefined,
      convertToLlm: this.convertToLlm,
      transformContext: this.transformContext,
      getApiKey: this.getApiKey,
      getSteeringMessages: async () => this.steeringQueue.drain(),
      getFollowUpMessages: async () => this.followUpQueue.drain(),
    };
  }

  private async runWithLifecycle(
    executor: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (this.activeRun) {
      throw new Error("Agent is already processing.");
    }

    const abortController = new AbortController();
    let resolveActiveRun: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolveActiveRun = resolve;
    });
    this.activeRun = { promise, resolve: resolveActiveRun, abortController };
    this._state.isStreaming = true;
    this._state.streamingMessage = undefined;
    this._state.errorMessage = undefined;

    try {
      await executor(abortController.signal);
    } catch (error) {
      await this.handleRunFailure(error, abortController.signal.aborted);
    } finally {
      this.finishRun();
    }
  }

  private async handleRunFailure(
    error: unknown,
    aborted: boolean,
  ): Promise<void> {
    const errorText = error instanceof Error ? error.message : String(error);
    const stopReason = aborted ? "aborted" : "error";
    const status = aborted ? "cancelled" : "failed";
    const failureMessage: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text: errorText }],
      api: this._state.model.api,
      provider: this._state.model.provider,
      model: this._state.model.id,
      usage: EMPTY_USAGE,
      stopReason,
      errorMessage: errorText,
      timestamp: Date.now(),
    };
    const streamingPartial: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: errorText }],
      api: this._state.model.api,
      provider: this._state.model.provider,
      model: this._state.model.id,
      usage: EMPTY_USAGE,
      stopReason,
      errorMessage: errorText,
      timestamp: Date.now(),
    };
    await this.processEvent({
      type: "message_start",
      message: streamingPartial,
    });
    await this.processEvent({ type: "message_end", message: failureMessage });
    await this.processEvent({
      type: "turn_end",
      message: failureMessage,
      toolResults: [],
    });
    await this.processEvent({
      type: "agent_end",
      messages: this._state.messages.slice(),
      status,
      errorMessage: errorText,
    });
  }

  private finishRun(): void {
    this._state.isStreaming = false;
    this._state.streamingMessage = undefined;
    this._state.pendingToolCalls = new Set<string>();
    this.activeRun?.resolve();
    this.activeRun = undefined;
  }

  private async processEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "agent_start":
      case "turn_start":
      case "tool_execution_update":
        break;
      case "message_start":
        // `streamingMessage` tracks the in-flight assistant message; only
        // assistant messages are streamed, so non-assistant starts are ignored.
        if (event.message.role === "assistant") {
          this._state.streamingMessage = event.message;
        }
        break;
      case "message_update":
        if (event.message.role === "assistant") {
          this._state.streamingMessage = event.message;
        }
        break;
      case "message_end":
        this._state.streamingMessage = undefined;
        this._state.messages.push(event.message);
        if (event.message.role === "assistant" && event.message.errorMessage) {
          this._state.errorMessage = event.message.errorMessage;
        }
        break;
      case "tool_execution_start": {
        const pendingToolCalls = new Set(this._state.pendingToolCalls);
        pendingToolCalls.add(event.toolCallId);
        this._state.pendingToolCalls = pendingToolCalls;
        break;
      }
      case "tool_execution_end": {
        const pendingToolCalls = new Set(this._state.pendingToolCalls);
        pendingToolCalls.delete(event.toolCallId);
        this._state.pendingToolCalls = pendingToolCalls;
        break;
      }
      case "turn_end":
        for (const toolResult of event.toolResults) {
          this._state.messages.push(toolResult);
        }
        if (event.message.role === "assistant" && event.message.errorMessage) {
          this._state.errorMessage = event.message.errorMessage;
        }
        break;
      case "agent_end":
        this._state.messages = event.messages.slice();
        this._state.streamingMessage = undefined;
        break;
    }

    const signal = this.activeRun?.abortController.signal;
    if (!signal) {
      throw new Error("Agent listener invoked outside active run");
    }

    await Promise.all(
      Array.from(this.listeners, (listener) => listener(event, signal)),
    );
  }
}
