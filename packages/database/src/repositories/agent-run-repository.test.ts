import type { AgentRunRecord } from "@chatbot-experiments/core/agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleAgentRunRepository } from "./agent-run-repository.ts";

function createDb() {
  const state: {
    inserts: unknown[];
    updates: unknown[];
  } = {
    inserts: [],
    updates: [],
  };

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        state.inserts.push(values);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async () => {
          state.updates.push(values);
        }),
      })),
    })),
  };

  return {
    db: db as unknown as ConstructorParameters<
      typeof DrizzleAgentRunRepository
    >[0],
    state,
  };
}

describe("DrizzleAgentRunRepository", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
  });

  it("creates queued agent runs", async () => {
    const { db, state } = createDb();
    const repository = new DrizzleAgentRunRepository(db);

    await expect(
      repository.createAgentRun({
        id: "run-1",
        sessionId: "session-1",
        messageId: "message-1",
        model: "gpt-4.1",
      }),
    ).resolves.toMatchObject({
      id: "run-1",
      sessionId: "session-1",
      messageId: "message-1",
      status: "queued",
      model: "gpt-4.1",
    });

    expect(state.inserts[0]).toMatchObject({
      id: "run-1",
      sessionId: "session-1",
      messageId: "message-1",
      status: "queued",
      model: "gpt-4.1",
      output: null,
      errorMessage: null,
      completedAt: null,
      cancelledAt: null,
    });
  });

  it("updates agent run lifecycle state", async () => {
    const { db, state } = createDb();
    const repository = new DrizzleAgentRunRepository(db);

    await repository.updateAgentRun("run-1", { status: "running" });
    await repository.updateAgentRun("run-1", {
      status: "completed",
      output: { text: "done" },
    });
    await repository.updateAgentRun("run-1", {
      status: "cancelled",
      errorMessage: "aborted",
    });

    expect(state.updates[0]).toMatchObject({
      status: "running",
      output: null,
      errorMessage: null,
    } satisfies Partial<AgentRunRecord>);
    expect(state.updates[1]).toMatchObject({
      status: "completed",
      output: { text: "done" },
      errorMessage: null,
      completedAt: new Date("2026-05-21T12:00:00.000Z"),
      cancelledAt: null,
    } satisfies Partial<AgentRunRecord>);
    expect(state.updates[2]).toMatchObject({
      status: "cancelled",
      output: null,
      errorMessage: "aborted",
      completedAt: null,
      cancelledAt: new Date("2026-05-21T12:00:00.000Z"),
    } satisfies Partial<AgentRunRecord>);
  });
});
