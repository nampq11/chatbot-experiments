import type { Message as AgentMessage, Model } from "@chatbot-experiments/ai";
import { describe, expect, it } from "vitest";
import { ZERO_USAGE } from "../src/core/agent-session-service.ts";
import { extractAgentMessageText } from "../src/core/transcript-mapper.ts";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  api: "test-api",
  provider: "test-provider",
  baseUrl: "https://example.test",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128000,
  maxTokens: 4096,
};

describe("extractAgentMessageText", () => {
  it("extracts system message text", () => {
    expect(
      extractAgentMessageText({ role: "system", content: "system prompt" }),
    ).toBe("system prompt");
  });

  it("extracts plain user message text", () => {
    expect(
      extractAgentMessageText({
        role: "user",
        content: "plain user text",
        timestamp: 1,
      }),
    ).toBe("plain user text");
  });

  it("concatenates only text parts from multipart user messages", () => {
    const message: AgentMessage = {
      role: "user",
      content: [
        { type: "text", text: "first " },
        { type: "image", image: "https://example.test/image.png" },
        { type: "text", text: "second" },
      ],
      timestamp: 1,
    };

    expect(extractAgentMessageText(message)).toBe("first second");
  });

  it("concatenates only text parts from multipart assistant messages", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hidden reasoning" },
        { type: "text", text: "visible " },
        {
          type: "toolCall",
          id: "tool-call-1",
          name: "lookup",
          arguments: { query: "x" },
        },
        { type: "text", text: "answer" },
      ],
      api: TEST_MODEL.api,
      provider: TEST_MODEL.provider,
      model: TEST_MODEL.id,
      usage: ZERO_USAGE,
      stopReason: "stop",
      timestamp: 1,
    };

    expect(extractAgentMessageText(message)).toBe("visible answer");
  });
});
