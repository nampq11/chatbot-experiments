import { Agent, type StreamFn } from "@chatbot-experiments/agent-core";
import {
  type Message as AgentMessage,
  type AzureOpenAIResponsesOptions,
  getModel,
  type Model,
  type SimpleStreamOptions,
  streamSimple,
} from "@chatbot-experiments/ai";
import {
  type AzureOpenAIConfig,
  loadAzureOpenAIConfig,
} from "../azure-openai.ts";
import { CHATBOT_EXPERIMENTS_SYSTEM_PROMPT } from "../system-prompt.ts";

const AGENT_MODEL_ID = "gpt-5.4-nano";
const DEFAULT_THINKING_LEVEL = "medium";
const IMAGE_INPUT_UNSUPPORTED_TEXT =
  "Image input is not supported by the configured model.";

/** Reasoning level passed to provider-backed assistant calls. */
export type ThinkingLevel = "off" | "low" | "medium" | "high";

type ReasoningStreamOptions = SimpleStreamOptions & AzureOpenAIResponsesOptions;

/** Supplies Azure OpenAI configuration to the runtime stream function. */
export type AzureOpenAIConfigProvider = () => AzureOpenAIConfig;

/** Options used to create an assistant agent for one session. */
export interface CreateAgentOptions {
  sessionId: string;
  messages?: AgentMessage[];
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
  azureOpenAIConfigProvider?: AzureOpenAIConfigProvider;
}

/** Resolves the model configured for the assistant runtime. */
export function resolveAgentModel(): Model {
  const model = getModel(AGENT_MODEL_ID);

  if (!model) {
    throw new Error(`Agent model not found: ${AGENT_MODEL_ID}`);
  }

  return model;
}

/** Returns a thinking level that is safe for the selected model. */
export function resolveThinkingLevel(
  model: Model,
  requestedThinkingLevel?: ThinkingLevel,
): ThinkingLevel {
  const thinkingLevel = requestedThinkingLevel ?? DEFAULT_THINKING_LEVEL;

  if (!model.reasoning || thinkingLevel === "off") {
    return "off";
  }

  return thinkingLevel;
}

/** Removes image content when the selected model only accepts text input. */
export function filterUnsupportedImages(
  messages: AgentMessage[],
  model: Model,
): AgentMessage[] {
  if (model.input.includes("image")) {
    return messages;
  }

  return messages.map((message) => {
    if (
      (message.role !== "user" && message.role !== "toolResult") ||
      !Array.isArray(message.content)
    ) {
      return message;
    }

    const hasImages = message.content.some(
      (content) => content.type === "image",
    );
    if (!hasImages) {
      return message;
    }

    const content = message.content
      .map((part) =>
        part.type === "image"
          ? { type: "text" as const, text: IMAGE_INPUT_UNSUPPORTED_TEXT }
          : part,
      )
      .filter((part, index, parts) => {
        const previousPart = parts[index - 1];

        return !(
          part.type === "text" &&
          part.text === IMAGE_INPUT_UNSUPPORTED_TEXT &&
          previousPart?.type === "text" &&
          previousPart.text === IMAGE_INPUT_UNSUPPORTED_TEXT
        );
      });

    return { ...message, content };
  });
}

/** Converts agent transcript messages to the provider-facing LLM transcript. */
function convertAgentMessagesToLlm(
  messages: AgentMessage[],
  model: Model,
): AgentMessage[] {
  const llmMessages = messages.filter(
    (message) =>
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "toolResult",
  );

  return filterUnsupportedImages(llmMessages, model);
}

/** Creates the provider-backed assistant agent for a session. */
export function createAgent(options: CreateAgentOptions): Agent {
  const model = resolveAgentModel();
  const thinkingLevel = resolveThinkingLevel(model, options.thinkingLevel);

  return new Agent({
    initialState: {
      model,
      messages: options.messages ?? [],
      systemPrompt: options.systemPrompt ?? CHATBOT_EXPERIMENTS_SYSTEM_PROMPT,
      thinkingLevel,
      tools: [],
    },
    convertToLlm: (messages) => convertAgentMessagesToLlm(messages, model),
    streamFn: createThinkingStreamFn(
      thinkingLevel,
      options.azureOpenAIConfigProvider,
    ),
    sessionId: options.sessionId,
  });
}

/** Creates a stream function that injects provider config and reasoning settings. */
export function createThinkingStreamFn(
  thinkingLevel: ThinkingLevel,
  azureOpenAIConfigProvider: AzureOpenAIConfigProvider = loadAzureOpenAIConfig,
): StreamFn {
  return (model, context, options) => {
    const azureConfig = azureOpenAIConfigProvider();
    const resolvedThinkingLevel = resolveThinkingLevel(model, thinkingLevel);
    const reasoningOptions = toReasoningStreamOptions(
      options,
      resolvedThinkingLevel,
      model.reasoning,
    );

    const streamOptions: ReasoningStreamOptions = {
      ...reasoningOptions,
      azureEndpoint: azureConfig.endpoint,
      azureApiKey: azureConfig.apiKey,
      ...(azureConfig.apiVersion
        ? { azureApiVersion: azureConfig.apiVersion }
        : {}),
    };

    return streamSimple(model, context, streamOptions);
  };
}

/** Adds reasoning options only when both the model and selected level support it. */
export function toReasoningStreamOptions(
  options: SimpleStreamOptions | undefined,
  thinkingLevel: ThinkingLevel,
  modelSupportsReasoning: boolean,
): SimpleStreamOptions | undefined {
  if (!modelSupportsReasoning || thinkingLevel === "off") {
    return options;
  }

  return {
    ...options,
    reasoningEffort: thinkingLevel,
    reasoningSummary: "auto",
  };
}
