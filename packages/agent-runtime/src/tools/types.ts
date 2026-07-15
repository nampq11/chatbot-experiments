import type { z } from "zod";

/** Stable identifier for an agent runtime tool. */
export type AgentToolId = string;

/** Runtime context passed to agent tools during execution. */
export interface AgentToolContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly signal?: AbortSignal;
}

/** Public metadata for an agent runtime tool. */
export interface AgentToolMetadata {
  readonly id: AgentToolId;
  readonly description: string;
}

/** Contract implemented by deterministic agent runtime tools. */
export interface AgentTool<TInputSchema extends z.ZodType = z.ZodType, TOutput = unknown> extends AgentToolMetadata {
  readonly inputSchema: TInputSchema;
  execute(input: z.infer<TInputSchema>, context: AgentToolContext): Promise<TOutput>;
}

/** Deterministic registry for discovering and executing agent runtime tools. */
export interface AgentToolRegistry {
  listTools(): readonly AgentToolMetadata[];
  getTool(id: AgentToolId): AgentTool | undefined;
  executeTool(id: AgentToolId, input: unknown, context: AgentToolContext): Promise<unknown>;
}
