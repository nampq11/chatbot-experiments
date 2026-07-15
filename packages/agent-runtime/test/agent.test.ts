import type { Message, Model } from "@dentaltrip-ai/ai";
import { describe, expect, it } from "vitest";
import {
  createAgent,
  filterUnsupportedImages,
  resolveAgentModel,
  resolveThinkingLevel,
  toReasoningStreamOptions,
} from "../src/core/agent.ts";

describe("agent runtime config", () => {
  it("resolves the configured server model", () => {
    const model = resolveAgentModel();

    expect(model.id).toBe("gpt-5.4-nano");
    expect(model.reasoning).toBe(true);
  });

  it("enables thinking on the agent runtime", async () => {
    const agent = createAgent({ sessionId: "session-1" });

    expect(agent.state.model.id).toBe("gpt-5.4-nano");
    expect(agent.state.thinkingLevel).toBe("medium");

    await agent.shutdown();
  });

  it("maps thinking level to reasoning stream options", () => {
    expect(toReasoningStreamOptions({ maxTokens: 1024 }, "medium", true)).toEqual({
      maxTokens: 1024,
      reasoningEffort: "medium",
      reasoningSummary: "auto",
    });
  });

  it("clamps thinking to off when the model does not support reasoning", () => {
    const model: Model = { ...resolveAgentModel(), reasoning: false };

    expect(resolveThinkingLevel(model, "medium")).toBe("off");
  });

  it("does not request reasoning summaries when thinking is disabled", () => {
    expect(toReasoningStreamOptions({ maxTokens: 1024 }, "off", true)).toEqual({
      maxTokens: 1024,
    });
  });

  it("replaces unsupported image content before provider conversion", () => {
    const model: Model = { ...resolveAgentModel(), input: ["text"] };
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Review this image" },
          { type: "image", image: "abc", mimeType: "image/png" },
          { type: "image", image: "def", mimeType: "image/png" },
        ],
        timestamp: 1,
      },
    ];

    expect(filterUnsupportedImages(messages, model)).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Review this image" },
          { type: "text", text: "Image input is not supported by the configured model." },
        ],
        timestamp: 1,
      },
    ]);
  });
});
