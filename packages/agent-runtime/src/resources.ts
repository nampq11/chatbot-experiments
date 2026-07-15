import { createBuiltInAgentToolRegistry } from "./tools/index.ts";

/** Diagnostics for agent runtime resource and tool readiness. */
export interface AgentResourceDiagnostics {
  toolCount: number;
  mcpEnabled: false;
}

/** Returns current agent runtime resource diagnostics without changing behavior. */
export function getAgentResourceDiagnostics(): AgentResourceDiagnostics {
  return {
    toolCount: createBuiltInAgentToolRegistry().listTools().length,
    mcpEnabled: false,
  };
}
