import type { AgentRunStore } from "@dentaltrip-ai/core/agent";
import type { SessionRepository } from "@dentaltrip-ai/core/session";
import type { DatabaseClient } from "../client.ts";
import { DrizzleAgentRunRepository } from "./agent-run-repository.ts";
import { DrizzleSessionRepository } from "./session-repository.ts";

/** Repository adapters backed by one database client. */
export interface DatabaseRepositories {
  /** Repository used by session use cases and transcript reads. */
  readonly sessionRepository: SessionRepository;
  /** Store used to track agent run lifecycle state. */
  readonly agentRunStore: AgentRunStore;
}

/** Creates all repository adapters backed by a database client. */
export function createDatabaseRepositories(client: DatabaseClient): DatabaseRepositories {
  return {
    sessionRepository: new DrizzleSessionRepository(client.db),
    agentRunStore: new DrizzleAgentRunRepository(client.db),
  };
}
