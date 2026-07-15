import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgentToolRegistry } from "../../src/tools/registry.ts";
import type { AgentTool } from "../../src/tools/types.ts";

describe("createAgentToolRegistry", () => {
  it("creates an empty deterministic registry", () => {
    const registry = createAgentToolRegistry([]);

    expect(registry.listTools()).toEqual([]);
    expect(registry.getTool("missing")).toBeUndefined();
  });

  it("rejects duplicate tool ids with a clear error", () => {
    const firstTool = createEchoTool("echo");
    const duplicateTool = createEchoTool("echo");

    expect(() => createAgentToolRegistry([firstTool, duplicateTool])).toThrow("Duplicate agent tool id: echo");
  });

  it("returns tool metadata in registration order", () => {
    const registry = createAgentToolRegistry([createEchoTool("first"), createEchoTool("second")]);

    expect(registry.listTools()).toEqual([
      { id: "first", description: "Echoes validated text." },
      { id: "second", description: "Echoes validated text." },
    ]);
  });

  it("validates input with the tool schema before execution", async () => {
    const execute = vi.fn(async ({ text }: { text: string }) => text);
    const registry = createAgentToolRegistry([
      {
        id: "echo",
        description: "Echoes validated text.",
        inputSchema: z.object({ text: z.string().min(1) }),
        execute,
      },
    ]);

    await expect(
      registry.executeTool("echo", { text: "" }, { sessionId: "session-1", userId: "user-1" }),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();

    await expect(
      registry.executeTool("echo", { text: "hello" }, { sessionId: "session-1", userId: "user-1" }),
    ).resolves.toBe("hello");
    expect(execute).toHaveBeenCalledWith({ text: "hello" }, { sessionId: "session-1", userId: "user-1" });
  });
});

function createEchoTool(id: string): AgentTool<typeof echoInputSchema, string> {
  return {
    id,
    description: "Echoes validated text.",
    inputSchema: echoInputSchema,
    execute: async ({ text }) => text,
  };
}

const echoInputSchema = z.object({ text: z.string() });
