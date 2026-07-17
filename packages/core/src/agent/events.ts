import type { AgentEvent } from "@chatbot-experiments/agent-core";

/** Existing agent lifecycle events enriched with the server run context that emitted them. */
export type ContextualAgentEvent = Extract<
  AgentEvent,
  { type: "agent_start" | "agent_end" }
> & {
  readonly runId: string;
  readonly sessionId: string;
};

export type { AgentEvent };
