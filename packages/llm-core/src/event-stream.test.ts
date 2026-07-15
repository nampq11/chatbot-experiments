import { describe, expect, it } from "vitest";
import { AssistantMessageEventStream } from "./event-stream.js";
import type { AssistantMessage } from "./types.js";

const MESSAGE: AssistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "done" }],
  api: "test-api",
  provider: "test-provider",
  model: "test-model",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop",
  timestamp: 1,
};

describe("AssistantMessageEventStream", () => {
  it("yields events in order and resolves the final message", async () => {
    const stream = new AssistantMessageEventStream();
    const events: string[] = [];

    const read = (async () => {
      for await (const event of stream) {
        events.push(event.type);
      }
    })();

    stream.push({ type: "start", partial: MESSAGE });
    stream.push({ type: "done", reason: "stop", message: MESSAGE });

    await read;

    expect(events).toEqual(["start", "done"]);
    await expect(stream.result()).resolves.toBe(MESSAGE);
  });
});
