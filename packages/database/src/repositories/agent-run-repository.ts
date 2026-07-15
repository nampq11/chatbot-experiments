import type {
  AgentRunRecord,
  AgentRunStore,
  CreateAgentRunInput,
  UpdateAgentRunInput,
} from "@dentaltrip-ai/core/agent";
import { eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.ts";
import { agentRuns } from "../schema/index.ts";

type Db = DatabaseClient["db"];

/** Stores agent run lifecycle records using Drizzle. */
export class DrizzleAgentRunRepository implements AgentRunStore {
  constructor(private readonly db: Db) {}

  async createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord> {
    const now = new Date();
    const record: AgentRunRecord = {
      id: input.id,
      sessionId: input.sessionId,
      messageId: input.messageId,
      status: "queued",
      model: input.model ?? null,
      output: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
    };

    await this.db.insert(agentRuns).values(record);

    return record;
  }

  async updateAgentRun(runId: string, input: UpdateAgentRunInput): Promise<void> {
    const now = new Date();
    const set: Partial<AgentRunRecord> = {
      status: input.status,
      output: input.output ?? null,
      errorMessage: input.errorMessage ?? null,
      updatedAt: now,
    };

    if (input.status === "completed") {
      set.completedAt = now;
      set.cancelledAt = null;
    }

    if (input.status === "cancelled") {
      set.cancelledAt = now;
      set.completedAt = null;
    }

    await this.db.update(agentRuns).set(set).where(eq(agentRuns.id, runId));
  }
}
