import type {
  AgentRun,
  AgentRunStatus,
} from "@chatbot-experiments/protocol/agent-run";

/** Lifecycle status persisted for an agent run. */
export type { AgentRunStatus };

/** Persisted representation of a server agent run. */
export type AgentRunRecord = AgentRun;

/** Input used to create a queued agent run record. */
export interface CreateAgentRunInput {
  readonly id: string;
  readonly sessionId: string;
  readonly messageId: string;
  readonly model?: string | null;
}

/** Input used to update an existing agent run record. */
export interface UpdateAgentRunInput {
  readonly status: AgentRunStatus;
  readonly output?: Readonly<Record<string, unknown>> | null;
  readonly errorMessage?: string | null;
}

/** Persistence contract required to track agent run lifecycle. */
export interface AgentRunStore {
  createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord>;
  updateAgentRun(runId: string, input: UpdateAgentRunInput): Promise<void>;
}
