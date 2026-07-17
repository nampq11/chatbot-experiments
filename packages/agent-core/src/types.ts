import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStreamContract,
  Context,
  ImageContent,
  Message,
  Model,
  SimpleStreamOptions,
  Static,
  Tool,
  Transport,
  TSchema,
} from "@chatbot-experiments/llm-core";

/** Function used by the agent loop to stream a provider response. */
export type StreamFn = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStreamContract;

/** Tool execution strategy for multiple tool calls. */
export type ToolExecutionMode = "parallel" | "sequential";

/** Hook input before a tool call executes. */
export interface BeforeToolCallContext {
  toolName: string;
  args: Record<string, unknown>;
  toolCallId: string;
}

/** Hook result before a tool call executes. */
export type BeforeToolCallResult =
  | { action: "continue" }
  | { action: "skip"; result?: string }
  | { action: "replace"; args: Record<string, unknown> };

/** Hook input after a tool call executes. */
export interface AfterToolCallContext {
  toolName: string;
  args: Record<string, unknown>;
  toolCallId: string;
  result: string;
}

/** Hook result after a tool call executes. */
export type AfterToolCallResult =
  | { action: "continue" }
  | { action: "replace"; result: string };

/** Model, tool, or prompt update applied before the next turn. */
export interface AgentLoopTurnUpdate {
  model?: Model<Api>;
  tools?: AgentTool[];
  systemPrompt?: string;
}

/** Stages exposed to optional loop instrumentation. */
export type BreakpointStage =
  | "pre_stream"
  | "streaming"
  | "post_stream"
  | "pre_tool"
  | "tool_exec"
  | "post_tool"
  | "pre_followup"
  | "complete";

/** Context snapshot passed to loop instrumentation. */
export interface AgentContext {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AgentTool[];
}

/** Agent loop configuration independent from provider SDKs. */
export interface AgentLoopConfig {
  model: Model<Api>;
  maxTokens?: number;
  sessionId?: string;
  onPayload?: SimpleStreamOptions["onPayload"];
  onResponse?: SimpleStreamOptions["onResponse"];
  transport?: Transport;
  maxRetryDelayMs?: number;
  toolExecution: ToolExecutionMode;
  beforeStage?: (
    stage: BreakpointStage,
    context: AgentContext,
  ) => Promise<void> | void;
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
  ) => Promise<AgentLoopTurnUpdate | undefined>;
  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;
  getApiKey?: (
    provider: string,
  ) => Promise<string | undefined> | string | undefined;
  getSteeringMessages: () => Promise<AgentMessage[]>;
  getFollowUpMessages: () => Promise<AgentMessage[]>;
}

/** Result returned by an agent tool execute function. */
export interface AgentToolResult {
  content: string;
  isError?: boolean;
}

/** Callback for tool progress updates. */
export type AgentToolUpdateCallback = (update: string) => void;

/** Tool definition used by the agent runtime. */
export interface AgentTool<
  TParameters extends TSchema = TSchema,
> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback,
  ) => Promise<AgentToolResult>;
  executionMode?: ToolExecutionMode;
}

/** Agent transcript message. */
export type AgentMessage = Message;

/** Public state held by a stateful Agent instance. */
export interface AgentState {
  systemPrompt: string;
  model: Model<Api>;
  thinkingLevel: string;
  tools: AgentTool[];
  messages: AgentMessage[];
  isStreaming: boolean;
  streamingMessage?: AssistantMessage;
  pendingToolCalls: ReadonlySet<string>;
  errorMessage?: string;
}

/** Terminal status emitted when an agent run ends. */
export type AgentEndStatus = "completed" | "failed" | "cancelled";

/** Agent lifecycle event emitted to subscribers. */
export type AgentEvent =
  // Agent lifecycle
  | { type: "agent_start" }
  | {
      type: "agent_end";
      messages: AgentMessage[];
      status: AgentEndStatus;
      errorMessage?: string;
    }
  // Turn lifecycle - a turn is one assistant response + any tool calls/results
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: AgentMessage[] }
  // Message lifecycle for transcript messages observed by the agent loop.
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AgentMessage;
      assistantMessageEvent?: AssistantMessageEvent;
    }
  | { type: "message_end"; message: AgentMessage }
  // Tool execution lifecycle
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      update: string;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      isError: boolean;
    };

/** Queue behavior for steering and follow-up messages. */
export type QueueMode = "all" | "one-at-a-time";

/** Text prompt input accepted by Agent.prompt. */
export type PromptInput = string | AgentMessage | AgentMessage[];

/** Re-exported image content accepted by Agent.prompt. */
export type PromptImage = ImageContent;
