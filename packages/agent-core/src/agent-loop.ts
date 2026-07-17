import type {
  AssistantMessage,
  AssistantMessageEvent,
  Message,
  SimpleStreamOptions,
  ToolCall,
} from "@chatbot-experiments/llm-core";
import type {
  AgentContext,
  AgentEndStatus,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  BreakpointStage,
  StreamFn,
} from "./types.js";

const MAX_TOOL_CALLS = 128;
const MAX_TOOL_TURNS = 128;

type AgentEndResult = { status: AgentEndStatus; errorMessage?: string };

function extractToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter(
    (part): part is ToolCall => part.type === "toolCall",
  );
}

function createAgentEndResult(
  status: AgentEndStatus,
  errorMessage?: string,
): AgentEndResult {
  if (errorMessage) {
    return { status, errorMessage };
  }

  return { status };
}

function resolveAgentEnd(message: AssistantMessage): AgentEndResult {
  if (message.stopReason === "aborted") {
    return createAgentEndResult("cancelled", message.errorMessage);
  }

  if (message.stopReason === "error" || message.errorMessage) {
    return createAgentEndResult("failed", message.errorMessage);
  }

  return { status: "completed" };
}

function createToolResultMessage(
  toolCall: ToolCall,
  content: string,
  isError: boolean,
): Message {
  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: [{ type: "text", text: content }],
    isError,
    timestamp: Date.now(),
  };
}

/** Starts an agent loop from initial messages appended to the existing context. */
export async function runAgentLoop(
  initialMessages: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  emit: (event: AgentEvent) => Promise<void>,
  signal: AbortSignal,
  streamFn: StreamFn,
): Promise<void> {
  const messages = [...context.messages, ...initialMessages];
  await loop(messages, context, config, emit, signal, streamFn);
}

/** Continues an agent loop from the existing transcript. */
export async function runAgentLoopContinue(
  context: AgentContext,
  config: AgentLoopConfig,
  emit: (event: AgentEvent) => Promise<void>,
  signal: AbortSignal,
  streamFn: StreamFn,
): Promise<void> {
  await loop(context.messages, context, config, emit, signal, streamFn);
}

async function loop(
  messages: AgentMessage[],
  context: { systemPrompt: string; tools: AgentTool[] },
  config: AgentLoopConfig,
  emit: (event: AgentEvent) => Promise<void>,
  signal: AbortSignal,
  streamFn: StreamFn,
  toolTurnCount = 0,
): Promise<void> {
  const buildStageContext = (): AgentContext => ({
    systemPrompt: context.systemPrompt,
    messages: structuredClone(messages),
    tools: context.tools.map((tool) => ({ ...tool })),
  });

  const checkStage = async (stage: BreakpointStage): Promise<void> => {
    await config.beforeStage?.(stage, buildStageContext());
  };

  const finishRun = async (result: AgentEndResult): Promise<void> => {
    await checkStage("complete");
    await emit({
      type: "agent_end",
      messages: messages.slice(),
      status: result.status,
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
    });
  };

  // `agent_start` fires once for the whole run; `turn_start` fires for every
  // assistant turn (the loop recurses once per tool round-trip).
  if (toolTurnCount === 0) {
    await emit({ type: "agent_start" });
  }

  await config.prepareNextTurn?.(signal);
  await emit({ type: "turn_start" });

  let contextMessages = messages.slice();
  if (config.transformContext) {
    contextMessages = await config.transformContext(contextMessages, signal);
  }

  const llmMessages = await config.convertToLlm(contextMessages);
  const apiKey = await config.getApiKey?.(config.model.provider);
  const options: SimpleStreamOptions = {
    signal,
    ...(apiKey && { apiKey }),
    ...(config.sessionId && { sessionId: config.sessionId }),
    ...(config.onPayload && { onPayload: config.onPayload }),
    ...(config.onResponse && { onResponse: config.onResponse }),
    ...(config.transport && { transport: config.transport }),
    ...(config.maxRetryDelayMs !== undefined && {
      maxRetryDelayMs: config.maxRetryDelayMs,
    }),
    ...(config.maxTokens !== undefined && { maxTokens: config.maxTokens }),
  };

  await checkStage("pre_stream");
  const eventStream = streamFn(
    config.model,
    {
      systemPrompt: context.systemPrompt,
      messages: llmMessages,
      tools: context.tools,
    },
    options,
  );
  let streamingStageChecked = false;
  const emitWithStreamingStage = async (event: AgentEvent): Promise<void> => {
    if (event.type === "message_start" && !streamingStageChecked) {
      streamingStageChecked = true;
      await checkStage("streaming");
    }
    await emit(event);
  };

  const assistantMessage = await collectStreamIntoMessage(
    eventStream,
    emitWithStreamingStage,
    signal,
  );
  await emit({ type: "message_end", message: assistantMessage });
  messages.push(assistantMessage);
  await checkStage("post_stream");

  const toolCalls = extractToolCalls(assistantMessage);
  const hasToolCalls = toolCalls.length > 0;
  const shouldStop =
    assistantMessage.stopReason !== "tool_use" &&
    assistantMessage.stopReason !== "toolUse" &&
    assistantMessage.stopReason !== "error" &&
    assistantMessage.stopReason !== "aborted";

  if (shouldStop || !hasToolCalls) {
    await checkStage("pre_followup");
    const followUps = await config.getFollowUpMessages();
    if (followUps.length > 0) {
      messages.push(...followUps);
    }
    await emit({
      type: "turn_end",
      message: assistantMessage,
      toolResults: [],
    });
    await finishRun(resolveAgentEnd(assistantMessage));
    return;
  }

  if (toolTurnCount >= MAX_TOOL_TURNS) {
    throw new Error(`Too many tool turns (max ${MAX_TOOL_TURNS})`);
  }

  await checkStage("pre_tool");
  const toolResults = await executeToolCalls(
    toolCalls,
    context.tools,
    config,
    emit,
    signal,
    async () => {
      await checkStage("tool_exec");
    },
  );
  messages.push(...toolResults);
  await emit({ type: "turn_end", message: assistantMessage, toolResults });
  await checkStage("post_tool");
  await loop(
    messages,
    context,
    config,
    emit,
    signal,
    streamFn,
    toolTurnCount + 1,
  );
}

async function collectStreamIntoMessage(
  eventStream: AsyncIterable<AssistantMessageEvent>,
  emit: (event: AgentEvent) => Promise<void>,
  signal: AbortSignal,
): Promise<AssistantMessage> {
  let finalMessage: AssistantMessage | undefined;
  const toolCallContentIndexes = new Set<number>();

  for await (const event of eventStream) {
    if (signal.aborted && event.type !== "error") {
      throw new Error("Assistant stream was aborted.");
    }

    switch (event.type) {
      case "start":
        await emit({ type: "message_start", message: event.partial });
        break;
      case "text_start":
      case "thinking_delta":
      case "text_delta":
        // The provider keeps `event.partial` in sync with accumulated content,
        // so we forward it directly instead of rebuilding a local string.
        await emit({
          type: "message_update",
          message: event.partial,
          assistantMessageEvent: event,
        });
        break;
      case "toolcall_start":
        if (toolCallContentIndexes.size >= MAX_TOOL_CALLS) {
          throw new Error(`Too many tool calls (max ${MAX_TOOL_CALLS})`);
        }
        toolCallContentIndexes.add(event.contentIndex);
        break;
      case "toolcall_end":
        toolCallContentIndexes.add(event.contentIndex);
        break;
      case "done":
        finalMessage = event.message;
        break;
      case "error": {
        const errorMessage =
          event.error.errorMessage ||
          (event.reason === "aborted"
            ? "Assistant stream was aborted."
            : "Assistant stream failed.");
        throw new Error(errorMessage);
      }
      default:
        break;
    }
  }

  if (finalMessage) {
    return finalMessage;
  }

  throw new Error(
    "Assistant stream ended without a terminal done or error event.",
  );
}

async function executeToolCalls(
  toolCalls: ToolCall[],
  tools: AgentTool[],
  config: AgentLoopConfig,
  emit: (event: AgentEvent) => Promise<void>,
  signal: AbortSignal,
  beforeToolExecute?: () => Promise<void>,
): Promise<Message[]> {
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const results: Message[] = [];

  for (const toolCall of toolCalls) {
    if (signal.aborted) {
      break;
    }

    await beforeToolExecute?.();
    await emit({
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    });
    const tool = toolMap.get(toolCall.name);
    let args = toolCall.arguments;
    let output = `Unknown tool: ${toolCall.name}`;
    let isError = true;
    const updateEvents: Promise<void>[] = [];

    const before = await config.beforeToolCall?.(
      {
        toolName: toolCall.name,
        args,
        toolCallId: toolCall.id,
      },
      signal,
    );

    if (before?.action === "skip") {
      await emit({
        type: "tool_execution_end",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        isError: false,
      });
      results.push(
        createToolResultMessage(
          toolCall,
          before.result ?? "Tool call skipped.",
          false,
        ),
      );
      continue;
    }

    if (before?.action === "replace") {
      args = before.args;
    }

    if (tool) {
      try {
        const prepared = tool.prepareArguments
          ? tool.prepareArguments(args)
          : args;
        const result = await tool.execute(
          toolCall.id,
          prepared as never,
          signal,
          (update) => {
            updateEvents.push(
              emit({
                type: "tool_execution_update",
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                args,
                update,
              }),
            );
          },
        );
        output = result.content;
        isError = result.isError ?? false;
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`;
        isError = true;
      }

      await Promise.all(updateEvents);
    }

    if (config.afterToolCall) {
      const after = await config.afterToolCall(
        {
          toolName: toolCall.name,
          args,
          toolCallId: toolCall.id,
          result: output,
        },
        signal,
      );
      if (after?.action === "replace") {
        output = after.result;
      }
    }

    await emit({
      type: "tool_execution_end",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      isError,
    });
    results.push(createToolResultMessage(toolCall, output, isError));
  }

  return results;
}

export type { AgentLoopConfig } from "./types.js";
