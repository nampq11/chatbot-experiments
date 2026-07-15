import type {
  Api,
  AssistantMessage,
  Context,
  ImageContent,
  Model,
  SimpleStreamOptions,
  StopReason,
  StreamFunction,
  StreamOptions,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@dentaltrip-ai/llm-core";
import { AssistantMessageEventStream, isToolCall } from "@dentaltrip-ai/llm-core";
import { AzureOpenAI } from "openai/azure";
import type {
  Response as OpenAIResponse,
  Tool as OpenAIResponsesTool,
  ResponseCreateParamsStreaming,
  ResponseInput,
  ResponseInputContent,
  ResponseStatus,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { calculateCost } from "../costs.js";
import { AIError } from "../error.js";
import { parseStreamingJson } from "../json-parse.js";

const DEFAULT_AZURE_RESPONSES_API_VERSION = "2025-03-01-preview";

interface ToolCallPart extends ToolCall {
  partialArguments?: string;
}

type CurrentBlock = ThinkingContent | TextContent | ToolCallPart;

type ResponsesStreamState<TApi extends Api = Api> = {
  currentBlock: CurrentBlock | null;
  output: AssistantMessage;
  stream: AssistantMessageEventStream;
  model: Model<TApi>;
};

/** Azure OpenAI Responses stream options. Server code must inject the Azure config. */
export interface AzureOpenAIResponsesOptions extends StreamOptions {
  azureApiVersion?: string;
  azureEndpoint?: string;
  azureApiKey?: string;
  azureDeploymentName?: string;
}

let cachedClient: AzureOpenAI | null = null;
let cachedClientKey = "";

/** Resets the cached Azure client. Intended for tests only. */
export function resetResponsesClient(): void {
  cachedClient = null;
  cachedClientKey = "";
}

function createClient(options?: AzureOpenAIResponsesOptions): AzureOpenAI {
  const endpoint = options?.azureEndpoint;
  const apiKey = options?.azureApiKey ?? options?.apiKey;

  if (!endpoint || !apiKey) {
    throw new AIError("Azure OpenAI requires azureEndpoint and azureApiKey stream options.", {
      provider: "azure-openai",
    });
  }

  const apiVersion = options?.azureApiVersion || DEFAULT_AZURE_RESPONSES_API_VERSION;
  const cacheKey = `${endpoint}|${apiVersion}|${apiKey}`;
  if (cachedClient && cachedClientKey === cacheKey) {
    return cachedClient;
  }

  cachedClient = new AzureOpenAI({ endpoint, apiKey, apiVersion });
  cachedClientKey = cacheKey;
  return cachedClient;
}

function resolveDeploymentName(model: Model<"azure-openai-responses">, options?: AzureOpenAIResponsesOptions): string {
  return options?.azureDeploymentName || model.id;
}

function convertImage(part: ImageContent): ResponseInputContent {
  const image = part.image instanceof URL ? part.image.toString() : part.image;
  const imageUrl = /^[a-z][a-z\d+.-]*:/i.test(image) ? image : `data:${part.mimeType || "image/png"};base64,${image}`;

  return {
    type: "input_image",
    detail: "auto",
    image_url: imageUrl,
  };
}

function convertUserContent(content: UserMessage["content"]): ResponseInputContent[] {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  return content.map((part) => {
    if (part.type === "text") {
      return { type: "input_text", text: part.text };
    }
    return convertImage(part);
  });
}

function convertAssistantMessage(message: AssistantMessage): ResponseInput {
  const output: ResponseInput = [];

  for (const block of message.content) {
    if (block.type === "thinking") {
      continue;
    }

    if (block.type === "text") {
      output.push({ role: "assistant", content: block.text });
      continue;
    }

    const [callId = block.id, itemId = block.id] = block.id.split("|", 2);
    output.push({
      type: "function_call",
      id: itemId,
      call_id: callId,
      name: block.name,
      arguments: JSON.stringify(block.arguments),
    });
  }

  return output;
}

function convertToolResultMessage(message: ToolResultMessage): ResponseInput[number] {
  const [callId = message.toolCallId] = message.toolCallId.split("|", 1);
  const text = message.content
    .filter((content): content is TextContent => content.type === "text")
    .map((content) => content.text)
    .join("\n");

  return {
    type: "function_call_output",
    call_id: callId,
    output: text || "(no text output)",
  };
}

/** Converts normalized DentalTrip messages into OpenAI Responses input. */
export function convertResponsesMessages(model: Model<Api>, context: Context): ResponseInput {
  const messages: ResponseInput = [];

  if (context.systemPrompt) {
    messages.push({
      role: model.reasoning ? "developer" : "system",
      content: context.systemPrompt,
    });
  }

  for (const message of context.messages) {
    if (message.role === "system") {
      messages.push({
        role: model.reasoning ? "developer" : "system",
        content: message.content,
      });
    } else if (message.role === "user") {
      const content = convertUserContent(message.content);
      if (content.length > 0) {
        messages.push({ role: "user", content });
      }
    } else if (message.role === "assistant") {
      messages.push(...convertAssistantMessage(message));
    } else if (message.role === "toolResult") {
      messages.push(convertToolResultMessage(message));
    }
  }

  return messages;
}

/** Converts normalized tools into OpenAI Responses tools. */
export function convertResponsesTools(tools: Tool[]): OpenAIResponsesTool[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as Record<string, unknown>,
    strict: false,
  }));
}

/** Builds Azure OpenAI Responses streaming parameters. */
export function buildResponsesParams(
  model: Model<"azure-openai-responses">,
  context: Context,
  options?: AzureOpenAIResponsesOptions,
): ResponseCreateParamsStreaming {
  const params: ResponseCreateParamsStreaming = {
    model: resolveDeploymentName(model, options),
    input: convertResponsesMessages(model, context),
    stream: true,
  };

  if (options?.maxTokens !== undefined) {
    params.max_output_tokens = options.maxTokens;
  }
  if (options?.temperature !== undefined) {
    params.temperature = options.temperature;
  }
  if (options?.topP !== undefined) {
    params.top_p = options.topP;
  }
  if (context.tools?.length) {
    params.tools = convertResponsesTools(context.tools);
  }

  if (model.reasoning && (options?.reasoningEffort !== undefined || options?.reasoningSummary !== undefined)) {
    const reasoning: NonNullable<ResponseCreateParamsStreaming["reasoning"]> = {};
    if (options?.reasoningEffort !== undefined) {
      reasoning.effort = options.reasoningEffort as NonNullable<ResponseCreateParamsStreaming["reasoning"]>["effort"];
    }
    if (options?.reasoningSummary !== undefined) {
      reasoning.summary = options.reasoningSummary;
    }
    params.reasoning = reasoning;
    params.include = ["reasoning.encrypted_content"];
  }

  return params;
}

function mapStopReason(status: ResponseStatus | undefined): StopReason {
  switch (status) {
    case "completed":
    case "in_progress":
    case "queued":
    case undefined:
      return "stop";
    case "incomplete":
      return "length";
    case "failed":
    case "cancelled":
      return "error";
  }
}

function getContentIndex(blocks: AssistantMessage["content"]): number {
  return blocks.length - 1;
}

function pushThinkingDelta(state: ResponsesStreamState, delta: string): void {
  if (state.currentBlock?.type !== "thinking") {
    return;
  }

  state.currentBlock.thinking += delta;
  state.stream.push({
    type: "thinking_delta",
    contentIndex: getContentIndex(state.output.content),
    delta,
    partial: state.output,
  });
}

function pushTextDelta(state: ResponsesStreamState, delta: string): void {
  if (state.currentBlock?.type !== "text") {
    return;
  }

  state.currentBlock.text += delta;
  state.stream.push({
    type: "text_delta",
    contentIndex: getContentIndex(state.output.content),
    delta,
    partial: state.output,
  });
}

function parseFinalToolArguments(toolName: string, rawArguments: string | undefined): Record<string, unknown> {
  const json = rawArguments?.trim() ?? "";
  if (!json) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid final tool arguments for ${toolName}: ${reason}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid final tool arguments for ${toolName}: expected a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function applyTerminalResponse<TApi extends Api>({
  response,
  output,
  model,
  fallbackStatus,
}: {
  response: OpenAIResponse;
  output: AssistantMessage;
  model: Model<TApi>;
  fallbackStatus: ResponseStatus;
}): void {
  output.responseId = response.id;
  const cachedTokens = response.usage?.input_tokens_details?.cached_tokens || 0;
  const usage: Usage = {
    input: (response.usage?.input_tokens || 0) - cachedTokens,
    output: response.usage?.output_tokens || 0,
    cacheRead: cachedTokens,
    cacheWrite: 0,
    reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens,
    totalTokens: response.usage?.total_tokens || 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  usage.cost = calculateCost(usage, model);
  output.usage = usage;
  output.stopReason = mapStopReason(response.status ?? fallbackStatus);
  if (output.content.some((block) => isToolCall(block)) && output.stopReason === "stop") {
    output.stopReason = "toolUse";
  }
}

type ResponsesEvent<TType extends ResponseStreamEvent["type"]> = Extract<ResponseStreamEvent, { type: TType }>;

function getResponseToolCallId(item: { call_id: string; id?: string | null }) {
  return `${item.call_id}|${item.id || item.call_id}`;
}

function handleOutputItemAdded<TApi extends Api>(
  event: ResponsesEvent<"response.output_item.added">,
  state: ResponsesStreamState<TApi>,
): void {
  const item = event.item;

  switch (item.type) {
    case "reasoning": {
      const nextBlock: ThinkingContent = { type: "thinking", thinking: "" };
      state.output.content.push(nextBlock);
      state.currentBlock = nextBlock;
      state.stream.push({
        type: "thinking_start",
        contentIndex: getContentIndex(state.output.content),
        partial: state.output,
      });
      return;
    }
    case "message": {
      const nextBlock: TextContent = { type: "text", text: "" };
      state.output.content.push(nextBlock);
      state.currentBlock = nextBlock;
      state.stream.push({
        type: "text_start",
        contentIndex: getContentIndex(state.output.content),
        partial: state.output,
      });
      return;
    }
    case "function_call": {
      const nextBlock: ToolCallPart = {
        type: "toolCall",
        id: getResponseToolCallId(item),
        name: item.name,
        arguments: {},
        partialArguments: item.arguments || "",
      };
      state.output.content.push(nextBlock);
      state.currentBlock = nextBlock;
      state.stream.push({
        type: "toolcall_start",
        contentIndex: getContentIndex(state.output.content),
        partial: state.output,
      });
      return;
    }
    default:
      return;
  }
}

function handleFunctionCallArgumentsDelta<TApi extends Api>(
  event: ResponsesEvent<"response.function_call_arguments.delta">,
  state: ResponsesStreamState<TApi>,
): void {
  if (state.currentBlock?.type !== "toolCall") {
    return;
  }

  state.currentBlock.partialArguments = `${state.currentBlock.partialArguments || ""}${event.delta}`;
  state.currentBlock.arguments = parseStreamingJson(state.currentBlock.partialArguments);
  state.stream.push({
    type: "toolcall_delta",
    contentIndex: getContentIndex(state.output.content),
    delta: event.delta,
    partial: state.output,
  });
}

function handleFunctionCallArgumentsDone<TApi extends Api>(
  event: ResponsesEvent<"response.function_call_arguments.done">,
  state: ResponsesStreamState<TApi>,
): void {
  if (state.currentBlock?.type !== "toolCall") {
    return;
  }

  state.currentBlock.partialArguments = event.arguments;
  state.currentBlock.arguments = parseFinalToolArguments(state.currentBlock.name, event.arguments);
}

function handleOutputItemDone<TApi extends Api>(
  event: ResponsesEvent<"response.output_item.done">,
  state: ResponsesStreamState<TApi>,
): void {
  const item = event.item;

  switch (item.type) {
    case "reasoning": {
      if (state.currentBlock?.type !== "thinking") {
        return;
      }

      const summary = item.summary?.map((part) => part.text).join("\n\n") || state.currentBlock.thinking;
      state.currentBlock.thinking = summary;
      state.stream.push({
        type: "thinking_end",
        contentIndex: getContentIndex(state.output.content),
        content: state.currentBlock.thinking,
        partial: state.output,
      });
      state.currentBlock = null;
      return;
    }
    case "message": {
      if (state.currentBlock?.type !== "text") {
        return;
      }

      state.currentBlock.text = item.content
        .map((part) => (part.type === "output_text" ? part.text : part.refusal))
        .join("");
      state.stream.push({
        type: "text_end",
        contentIndex: getContentIndex(state.output.content),
        content: state.currentBlock.text,
        partial: state.output,
      });
      state.currentBlock = null;
      return;
    }
    case "function_call": {
      if (state.currentBlock?.type === "toolCall") {
        state.currentBlock.id = getResponseToolCallId(item);
        state.currentBlock.name = item.name;
        state.currentBlock.arguments = parseFinalToolArguments(
          item.name,
          item.arguments || state.currentBlock.partialArguments,
        );
        delete state.currentBlock.partialArguments;
        state.stream.push({
          type: "toolcall_end",
          contentIndex: getContentIndex(state.output.content),
          toolCall: state.currentBlock,
          partial: state.output,
        });
      }
      state.currentBlock = null;
      return;
    }
    default:
      return;
  }
}

function createResponseFailedError(event: ResponsesEvent<"response.failed">): Error {
  const error = event.response.error;
  return new Error(error ? `${error.code}: ${error.message}` : "Azure OpenAI Responses failed");
}

async function processResponsesStream<TApi extends Api>(
  responseStream: AsyncIterable<ResponseStreamEvent>,
  state: ResponsesStreamState<TApi>,
): Promise<void> {
  for await (const event of responseStream) {
    switch (event.type) {
      case "response.created":
        state.output.responseId = event.response.id;
        break;
      case "response.output_item.added":
        handleOutputItemAdded(event, state);
        break;
      case "response.reasoning_summary_text.delta":
      case "response.reasoning_text.delta":
        pushThinkingDelta(state, event.delta);
        break;
      case "response.reasoning_summary_part.done":
        pushThinkingDelta(state, "\n\n");
        break;
      case "response.output_text.delta":
      case "response.refusal.delta":
        pushTextDelta(state, event.delta);
        break;
      case "response.function_call_arguments.delta":
        handleFunctionCallArgumentsDelta(event, state);
        break;
      case "response.function_call_arguments.done":
        handleFunctionCallArgumentsDone(event, state);
        break;
      case "response.output_item.done":
        handleOutputItemDone(event, state);
        break;
      case "response.completed":
        applyTerminalResponse({
          response: event.response,
          output: state.output,
          model: state.model,
          fallbackStatus: "completed",
        });
        break;
      case "response.incomplete":
        applyTerminalResponse({
          response: event.response,
          output: state.output,
          model: state.model,
          fallbackStatus: "incomplete",
        });
        break;
      case "response.failed":
        throw createResponseFailedError(event);
      case "error":
        throw new Error(`Error Code ${event.code}: ${event.message}`);
      default:
        break;
    }
  }
}

function createEmptyAssistantMessage<TApi extends Api>(model: Model<TApi>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "unknown",
    timestamp: Date.now(),
  };
}

/** Streams an Azure OpenAI Responses API request. */
export const streamAzureOpenAIResponses: StreamFunction<"azure-openai-responses", AzureOpenAIResponsesOptions> = (
  model: Model<"azure-openai-responses">,
  context: Context,
  options?: AzureOpenAIResponsesOptions,
): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream();

  void (async () => {
    const output = createEmptyAssistantMessage(model);

    try {
      const client = createClient(options);
      const params = buildResponsesParams(model, context, options);
      const payload = (await options?.onPayload?.(params, model)) ?? params;
      const responseStream = await client.responses.stream(payload as ResponseCreateParamsStreaming, {
        signal: options?.signal,
      });

      stream.push({ type: "start", partial: output });
      await processResponsesStream(responseStream, {
        currentBlock: null,
        output,
        stream,
        model,
      });

      if (options?.signal?.aborted) {
        output.stopReason = "aborted";
        output.errorMessage = "Request was aborted";
        stream.push({ type: "error", reason: "aborted", error: output });
        return;
      }

      if (output.stopReason === "unknown") {
        throw new Error("Azure OpenAI Responses stream ended without a terminal response event.");
      }

      if (output.stopReason === "error") {
        output.errorMessage = "Azure OpenAI Responses failed";
        stream.push({ type: "error", reason: "error", error: output });
        return;
      }

      stream.push({
        type: "done",
        reason: output.stopReason as Extract<StopReason, "stop" | "length" | "toolUse">,
        message: output,
      });
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
    }
  })();

  return stream;
};

/** Streams a simple Azure OpenAI Responses request. */
export const streamSimpleAzureOpenAIResponses: StreamFunction<"azure-openai-responses", SimpleStreamOptions> = (
  model: Model<"azure-openai-responses">,
  context: Context,
  options?: SimpleStreamOptions,
): ReturnType<StreamFunction<"azure-openai-responses", SimpleStreamOptions>> => {
  return streamAzureOpenAIResponses(model, context, options as AzureOpenAIResponsesOptions);
};

/** Azure OpenAI Responses provider registration object. */
export const azureOpenAIResponsesProvider = {
  api: "azure-openai-responses" as const,
  stream: streamAzureOpenAIResponses,
  streamSimple: streamSimpleAzureOpenAIResponses,
};
