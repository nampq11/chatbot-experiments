import type { AssistantMessageEvent, Model } from "@dentaltrip-ai/llm-core";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import { afterEach, describe, expect, it, vi } from "vitest";

const { streamMock } = vi.hoisted(() => ({
  streamMock: vi.fn(),
}));

vi.mock("openai/azure", () => ({
  AzureOpenAI: vi.fn().mockImplementation(() => ({
    responses: {
      stream: streamMock,
    },
  })),
}));

import {
  buildResponsesParams,
  convertResponsesMessages,
  resetResponsesClient,
  streamAzureOpenAIResponses,
} from "./azure-openai-responses.js";

const MODEL: Model<"azure-openai-responses"> = {
  id: "gpt-5.4-nano",
  name: "GPT-5.4 Nano",
  api: "azure-openai-responses",
  provider: "azure-openai",
  baseUrl: "",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
};

async function* createResponseStream(events: ResponseStreamEvent[]): AsyncIterable<ResponseStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

async function collectEvents(events: ResponseStreamEvent[]): Promise<AssistantMessageEvent[]> {
  streamMock.mockResolvedValueOnce(createResponseStream(events));
  const stream = streamAzureOpenAIResponses(
    MODEL,
    { messages: [], tools: [] },
    {
      azureEndpoint: "https://example.openai.azure.com",
      azureApiKey: "test-key",
    },
  );

  const collected: AssistantMessageEvent[] = [];
  for await (const event of stream) {
    collected.push(event);
  }
  return collected;
}

function createStreamEvent(event: unknown): ResponseStreamEvent {
  return event as ResponseStreamEvent;
}

afterEach(() => {
  resetResponsesClient();
  streamMock.mockReset();
});

describe("Azure OpenAI Responses conversion", () => {
  it("uses the context system prompt as a developer message for reasoning models", () => {
    expect(
      convertResponsesMessages(MODEL, {
        systemPrompt: "Be useful.",
        messages: [{ role: "user", content: "hello", timestamp: 1 }],
      }),
    ).toMatchObject([
      { role: "developer", content: "Be useful." },
      { role: "user", content: [{ type: "input_text", text: "hello" }] },
    ]);
  });

  it("adds reasoning options only when requested", () => {
    const params = buildResponsesParams(
      MODEL,
      { messages: [], tools: [] },
      { reasoningEffort: "medium", reasoningSummary: "auto" },
    );

    expect(params.reasoning).toMatchObject({
      effort: "medium",
      summary: "auto",
    });
    expect(params.include).toEqual(["reasoning.encrypted_content"]);
  });

  it("emits an error when the provider stream ends without a terminal response event", async () => {
    const events = await collectEvents([
      createStreamEvent({
        type: "response.created",
        response: { id: "resp_1" },
      }),
    ]);

    expect(events.at(-1)).toMatchObject({
      type: "error",
      reason: "error",
      error: {
        stopReason: "error",
        errorMessage: "Azure OpenAI Responses stream ended without a terminal response event.",
      },
    });
  });

  it("emits an error for malformed final tool arguments", async () => {
    const events = await collectEvents([
      createStreamEvent({
        type: "response.output_item.added",
        item: {
          type: "function_call",
          id: "item_1",
          call_id: "call_1",
          name: "search",
          arguments: "",
        },
      }),
      createStreamEvent({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "item_1",
          call_id: "call_1",
          name: "search",
          arguments: "{not-json",
        },
      }),
    ]);

    expect(events.at(-1)).toMatchObject({
      type: "error",
      reason: "error",
      error: {
        stopReason: "error",
        errorMessage: expect.stringContaining("Invalid final tool arguments for search"),
      },
    });
  });
});
