import { createAgentToolRegistry } from "./registry.ts";
import type { AgentTool, AgentToolRegistry } from "./types.ts";

const BUILT_IN_AGENT_TOOLS: readonly AgentTool[] = Object.freeze([]);

/** Creates the deterministic built-in agent tool registry. */
export function createBuiltInAgentToolRegistry(): AgentToolRegistry {
  return createAgentToolRegistry(BUILT_IN_AGENT_TOOLS);
}

export { createAgentToolRegistry } from "./registry.ts";
export type {
  AgentTool,
  AgentToolContext,
  AgentToolId,
  AgentToolMetadata,
  AgentToolRegistry,
} from "./types.ts";
