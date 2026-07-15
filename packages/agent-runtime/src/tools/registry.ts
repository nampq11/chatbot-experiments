import type { AgentTool, AgentToolContext, AgentToolId, AgentToolMetadata, AgentToolRegistry } from "./types.ts";

/** Creates a deterministic registry for the provided agent runtime tools. */
export function createAgentToolRegistry(tools: readonly AgentTool[] = []): AgentToolRegistry {
  const toolsById = new Map<AgentToolId, AgentTool>();
  const metadata: AgentToolMetadata[] = [];

  for (const tool of tools) {
    if (toolsById.has(tool.id)) {
      throw new Error(`Duplicate agent tool id: ${tool.id}`);
    }

    toolsById.set(tool.id, tool);
    metadata.push(Object.freeze({ id: tool.id, description: tool.description }));
  }

  const toolList = Object.freeze(metadata.slice());

  return {
    listTools: () => toolList,
    getTool: (id: AgentToolId) => toolsById.get(id),
    executeTool: async (id: AgentToolId, input: unknown, context: AgentToolContext) => {
      const tool = toolsById.get(id);

      if (!tool) {
        throw new Error(`Agent tool not found: ${id}`);
      }

      const parsedInput = tool.inputSchema.parse(input);

      return tool.execute(parsedInput, context);
    },
  };
}
