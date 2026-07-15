import type {
  Api,
  AssistantMessageEvent,
  AssistantMessageEventStreamContract,
  Context,
  Model,
  SimpleStreamOptions,
  StopReason,
  StreamOptions,
  StreamResult,
  ToolCall,
  Usage,
} from "@dentaltrip-ai/llm-core";
import { getApiProvider } from "./api-registry.js";
import { calculateCost } from "./costs.js";
import { registerBuiltinProviders } from "./providers/register-builtins.js";

registerBuiltinProviders();

/** Streams a model response through the provider selected by the model API. */
export function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: StreamOptions,
): AssistantMessageEventStreamContract {
  const provider = getApiProvider(model.api);
  if (!provider) {
    throw new Error(`No provider registered for API: "${model.api}"`);
  }
  return provider.stream(model, context, options);
}

/** Streams a simple model response through the provider selected by the model API. */
export function streamSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStreamContract {
  const provider = getApiProvider(model.api);
  if (!provider) {
    throw new Error(`No provider registered for API: "${model.api}"`);
  }
  return provider.streamSimple(model, context, options);
}

const MAX_TOOL_CALLS = 128;

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function copyUsage(target: Usage, source: Usage): void {
  target.input = source.input;
  target.output = source.output;
  target.cacheRead = source.cacheRead;
  target.cacheWrite = source.cacheWrite;
  target.reasoningTokens = source.reasoningTokens;
  target.totalTokens = source.totalTokens;
  target.cost = { ...source.cost };
}

/** Collects an assistant event stream into a single text/tool result. */
export async function collectStream(
  eventStream: AsyncIterable<AssistantMessageEvent>,
  model?: Model<Api>,
): Promise<StreamResult> {
  let text = "";
  const toolCallParts = new Map<number, ToolCall>();
  const usage = emptyUsage();
  let stopReason: StopReason = "unknown";

  for await (const event of eventStream) {
    switch (event.type) {
      case "text_delta":
        text += event.delta;
        break;
      case "toolcall_start":
        if (toolCallParts.size >= MAX_TOOL_CALLS) {
          throw new Error(`Too many tool calls (max ${MAX_TOOL_CALLS})`);
        }
        toolCallParts.set(event.contentIndex, {
          type: "toolCall",
          id: "",
          name: "",
          arguments: {},
        });
        break;
      case "toolcall_end":
        toolCallParts.set(event.contentIndex, event.toolCall);
        break;
      case "done":
        stopReason = event.reason;
        copyUsage(usage, event.message.usage);
        break;
      case "error":
        stopReason = event.reason;
        copyUsage(usage, event.error.usage);
        break;
      default:
        break;
    }
  }

  const toolCalls = Array.from(toolCallParts.entries())
    .sort(([a], [b]) => a - b)
    .map(([, toolCall]) => toolCall);

  if (model) {
    usage.cost = calculateCost(usage, model);
  }

  return { text, toolCalls, usage, stopReason };
}

/** Generates a model response and collects the full result. */
export async function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: StreamOptions,
): Promise<StreamResult> {
  return collectStream(stream(model, context, options), model);
}

/** Generates a simple model response and collects the full result. */
export async function completeSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: SimpleStreamOptions,
): Promise<StreamResult> {
  return collectStream(streamSimple(model, context, options), model);
}
