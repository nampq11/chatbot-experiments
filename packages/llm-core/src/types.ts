import type { TSchema } from "@sinclair/typebox";

/** Text content that is visible to the user. */
export interface TextContent {
  type: "text";
  text: string;
}

/** Image content passed to multimodal model providers. */
export interface ImageContent {
  type: "image";
  image: string | URL;
  mimeType?: string;
}

/** Reasoning content emitted by models that expose thinking summaries. */
export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

/** User-provided content parts. */
export type ContentPart = TextContent | ImageContent;

/** Returns true when a content part is visible text. */
export function isTextContent(content: ContentPart): content is TextContent {
  return content.type === "text";
}

/** Returns true when a content part is an image. */
export function isImageContent(content: ContentPart): content is ImageContent {
  return content.type === "image";
}

/** Returns true when a value is a model tool call content block. */
export function isToolCall(content: unknown): content is ToolCall {
  return (
    typeof content === "object" &&
    content !== null &&
    "type" in content &&
    (content as Record<string, unknown>).type === "toolCall" &&
    "id" in content &&
    "name" in content &&
    "arguments" in content
  );
}

/** Diagnostic information attached to an assistant message. */
export interface AssistantMessageDiagnostic {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

/** System message in a model transcript. Prefer Context.systemPrompt for the active server prompt. */
export interface SystemMessage {
  role: "system";
  content: string;
}

/** User message in a model transcript. */
export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

/** Assistant message normalized across providers. */
export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: Provider;
  model: string;
  responseModel?: string;
  responseId?: string;
  diagnostics?: AssistantMessageDiagnostic[];
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}

/** Tool result message sent back to a model after a tool call. */
export interface ToolResultMessage<TDetails = unknown> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}

/** Provider-neutral transcript message. */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

/** Provider-neutral tool definition. */
export interface Tool<TParams extends TSchema = TSchema> {
  name: string;
  description?: string;
  parameters: TParams;
}

/** Deprecated alias kept for migration compatibility. */
export type ToolDefinition = Tool;

/** Function call requested by a model. */
export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Normalized reason a model response stopped. */
export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | "error"
  | "unknown"
  | "stop"
  | "length"
  | "toolUse"
  | "aborted";

/**
 * Provider-neutral stream event protocol for assistant messages.
 *
 * Streams should emit `start` before any partial update event, including
 * `text_start`, `text_delta`, thinking events, and tool call events. Streams
 * must terminate with either `done` for a completed assistant message or
 * `error` for an aborted or failed assistant message.
 *
 * `*_start` events announce that a content block has begun before visible text
 * or structured content is appended. Delta events carry incremental content,
 * and `*_end` events close the content block with the complete normalized
 * value. The terminal `done.message` or `error.error` is the authoritative
 * assistant message that consumers should persist.
 */
export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | {
      type: "text_delta";
      contentIndex: number;
      delta: string;
      partial: AssistantMessage;
    }
  | {
      type: "text_end";
      contentIndex: number;
      content: string;
      partial: AssistantMessage;
    }
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | {
      type: "thinking_delta";
      contentIndex: number;
      delta: string;
      partial: AssistantMessage;
    }
  | {
      type: "thinking_end";
      contentIndex: number;
      content: string;
      partial: AssistantMessage;
    }
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | {
      type: "toolcall_delta";
      contentIndex: number;
      delta: string;
      partial: AssistantMessage;
    }
  | {
      type: "toolcall_end";
      contentIndex: number;
      toolCall: ToolCall;
      partial: AssistantMessage;
    }
  | {
      type: "done";
      reason: Extract<StopReason, "stop" | "length" | "toolUse">;
      message: AssistantMessage;
    }
  | {
      type: "error";
      reason: Extract<StopReason, "aborted" | "error">;
      error: AssistantMessage;
    };

/** Minimal async stream contract returned by provider stream functions. */
export interface AssistantMessageEventStreamContract extends AsyncIterable<AssistantMessageEvent> {
  push(event: AssistantMessageEvent): void;
  end(result?: AssistantMessage): void;
  result(): Promise<AssistantMessage>;
}

/** Model registry entry. */
export interface Model<TApi extends Api = Api> {
  id: string;
  name: string;
  api: TApi;
  provider: Provider;
  baseUrl: string;
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: OpenAICompletionsCompat | OpenAIResponsesCompat | AnthropicMessagesCompat;
}

/** Known model API identifiers. */
export type KnownApi =
  | "azure-openai-responses"
  | "azure-openai-completions"
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages";

/** Model API identifier. */
export type Api = KnownApi | (string & {});

/** Provider identifier. */
export type Provider = string;

/** Known provider identifier. */
export type KnownProvider = "azure-openai" | "openai" | "anthropic";

/** Maps user-facing thinking levels to provider-specific token budgets. */
export interface ThinkingLevelMap {
  none?: number | null;
  short?: number | null;
  medium?: number | null;
  long?: number | null;
}

/** OpenAI reasoning effort values. */
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** Compatibility overrides for OpenAI chat completions. */
export interface OpenAICompletionsCompat {
  variant?: "openai" | "azure" | "custom";
  headers?: Record<string, string>;
}

/** Compatibility overrides for OpenAI responses. */
export interface OpenAIResponsesCompat {
  variant?: "openai" | "azure" | "custom";
  headers?: Record<string, string>;
}

/** Compatibility overrides for Anthropic messages. */
export interface AnthropicMessagesCompat {
  headers?: Record<string, string>;
}

/** Preferred model transport. */
export type Transport = "sse" | "websocket" | "auto" | (string & {});

/** Prompt cache retention preference. */
export type CacheRetention = "short" | "medium" | "long";

/** HTTP response metadata exposed to instrumentation callbacks. */
export interface ProviderResponse {
  status: number;
  headers: Record<string, string>;
  url: string;
}

/** Conversation context sent to a provider. */
export interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}

/** Provider-neutral stream options. */
export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  signal?: AbortSignal;
  apiKey?: string;
  transport?: Transport;
  cacheRetention?: CacheRetention;
  sessionId?: string;
  onPayload?: (payload: unknown, model: Model<Api>) => unknown | undefined | Promise<unknown | undefined>;
  onResponse?: (response: ProviderResponse, model: Model<Api>) => void | Promise<void>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  reasoningEffort?: ReasoningEffort;
  reasoningSummary?: "auto" | "detailed" | "concise" | null;
  metadata?: Record<string, unknown>;
}

/** Provider-extensible stream options. */
export type ProviderStreamOptions = StreamOptions & Record<string, unknown>;

/** Provider stream function contract. */
export type StreamFunction<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> = (
  model: Model<TApi>,
  context: Context,
  options?: TOptions,
) => AssistantMessageEventStreamContract;

/** Azure OpenAI Responses stream options with explicit server-provided config. */
export interface AzureOpenAIResponsesStreamOptions extends StreamOptions {
  azureEndpoint?: string;
  azureApiKey?: string;
  azureApiVersion?: string;
  azureDeploymentName?: string;
}

/** Azure OpenAI chat completions stream options. */
export interface AzureOpenAIStreamOptions extends StreamOptions {
  azureEndpoint?: string;
  azureApiKey?: string;
  azureApiVersion?: string;
}

/** OpenAI stream options. */
export interface OpenAIStreamOptions extends StreamOptions {
  baseUrl: string;
}

/** Anthropic stream options. */
export interface AnthropicStreamOptions extends StreamOptions {
  baseUrl: string;
}

/** API to stream option mapping. */
export interface ApiOptionsMap {
  "azure-openai-completions": AzureOpenAIStreamOptions;
  "azure-openai-responses": AzureOpenAIResponsesStreamOptions;
  "openai-completions": OpenAIStreamOptions;
  "openai-responses": OpenAIStreamOptions;
  "anthropic-messages": AnthropicStreamOptions;
}

/** Options for simple model streaming. */
export interface SimpleStreamOptions extends StreamOptions {}

/** Token usage and cost accounting for a model response. */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoningTokens?: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

/** Collected stream result. */
export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  stopReason: StopReason;
}
