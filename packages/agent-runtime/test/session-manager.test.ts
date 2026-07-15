import type { Message as AgentMessage, Model } from "@dentaltrip-ai/ai";
import type { SessionDataEntry } from "@dentaltrip-ai/core/session";
import { describe, expect, it } from "vitest";
import {
  buildSessionContext,
  resolveCurrentLeafId,
  SessionEntryNotFoundError,
  SessionManager,
  type SessionManagerRepository,
} from "../src/core/session-manager.ts";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  api: "test-api",
  provider: "test-provider",
  baseUrl: "https://example.test",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128000,
  maxTokens: 4096,
};

function createIdGenerator(ids: readonly string[]): () => string {
  const queue = [...ids];

  return () => {
    const nextId = queue.shift();

    if (!nextId) {
      throw new Error("Test id generator exhausted");
    }

    return nextId;
  };
}

function createMemoryRepository(): SessionManagerRepository & {
  readonly entries: SessionDataEntry[];
} {
  const entries: SessionDataEntry[] = [];

  return {
    entries,
    async listSessionData(sessionId: string): Promise<SessionDataEntry[]> {
      return entries.filter((entry) => entry.sessionId === sessionId);
    },
    async appendSessionData(input): Promise<SessionDataEntry> {
      const sessionEntries = entries.filter((entry) => entry.sessionId === input.sessionId);
      const previousEntry = sessionEntries.at(-1);
      const entry: SessionDataEntry = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        parentId: input.parentId ?? previousEntry?.id ?? null,
        sequence: sessionEntries.length + 1,
        type: input.type,
        payload: input.payload,
        schemaVersion: input.schemaVersion ?? 1,
        createdAt: new Date(`2026-01-01T00:00:0${sessionEntries.length}.000Z`),
      };

      entries.push(entry);
      return entry;
    },
  };
}

function createEntry(input: {
  id: string;
  parentId: string | null;
  sequence: number;
  type?: SessionDataEntry["type"];
  payload?: Record<string, unknown>;
}): SessionDataEntry {
  return {
    id: input.id,
    sessionId: "session-1",
    userId: "user-1",
    parentId: input.parentId,
    sequence: input.sequence,
    type: input.type ?? "message",
    payload: input.payload ?? {
      message: {
        role: "user",
        content: input.id,
        timestamp: input.sequence,
      },
    },
    schemaVersion: 1,
    createdAt: new Date(`2026-01-01T00:00:0${input.sequence}.000Z`),
  };
}

describe("SessionManager", () => {
  it("appends entries as children of the current leaf and advances the leaf pointer", async () => {
    const repository = createMemoryRepository();
    const manager = new SessionManager({
      repository,
      generateId: createIdGenerator(["entry-1", "leaf-1", "entry-2", "leaf-2"]),
    });

    const firstMessage: AgentMessage = {
      role: "user",
      content: "hello",
      timestamp: 1,
    };
    const secondMessage: AgentMessage = {
      role: "user",
      content: "follow up",
      timestamp: 2,
    };

    const firstEntry = await manager.appendMessage({
      sessionId: "session-1",
      userId: "user-1",
      message: firstMessage,
    });
    const secondEntry = await manager.appendMessage({
      sessionId: "session-1",
      userId: "user-1",
      message: secondMessage,
    });

    expect(firstEntry).toMatchObject({ id: "entry-1", parentId: null });
    expect(secondEntry).toMatchObject({ id: "entry-2", parentId: "entry-1" });
    expect(repository.entries.map((entry) => entry.type)).toEqual(["message", "leaf", "message", "leaf"]);
    expect(repository.entries.at(1)?.payload).toEqual({ entryId: "entry-1" });
    expect(repository.entries.at(3)?.payload).toEqual({ entryId: "entry-2" });
    await expect(manager.getCurrentLeafId("session-1")).resolves.toBe("entry-2");
  });

  it("branches to an earlier entry without modifying history", async () => {
    const repository = createMemoryRepository();
    const manager = new SessionManager({
      repository,
      generateId: createIdGenerator(["entry-1", "leaf-1", "entry-2", "leaf-2", "branch-leaf", "entry-3", "leaf-3"]),
    });

    await manager.appendMessage({
      sessionId: "session-1",
      userId: "user-1",
      message: { role: "user", content: "root", timestamp: 1 },
    });
    await manager.appendMessage({
      sessionId: "session-1",
      userId: "user-1",
      message: { role: "user", content: "old branch", timestamp: 2 },
    });
    await manager.branchToEntry({
      sessionId: "session-1",
      userId: "user-1",
      targetEntryId: "entry-1",
    });
    await manager.appendMessage({
      sessionId: "session-1",
      userId: "user-1",
      message: { role: "user", content: "new branch", timestamp: 3 },
    });

    await expect(manager.getCurrentLeafId("session-1")).resolves.toBe("entry-3");
    await expect(manager.buildSessionContext({ sessionId: "session-1" })).resolves.toEqual([
      { role: "user", content: "root", timestamp: 1 },
      { role: "user", content: "new branch", timestamp: 3 },
    ]);
    expect(repository.entries.map((entry) => entry.id)).toEqual([
      "entry-1",
      "leaf-1",
      "entry-2",
      "leaf-2",
      "branch-leaf",
      "entry-3",
      "leaf-3",
    ]);
  });

  it("rejects branches to missing history entries", async () => {
    const repository = createMemoryRepository();
    const manager = new SessionManager({ repository });

    await expect(
      manager.branchToEntry({
        sessionId: "session-1",
        userId: "user-1",
        targetEntryId: "missing-entry",
      }),
    ).rejects.toBeInstanceOf(SessionEntryNotFoundError);
  });
});

describe("resolveCurrentLeafId", () => {
  it("replays leaf pointers and ignores inactive branch appends", () => {
    const entries = [
      createEntry({ id: "root", parentId: null, sequence: 1 }),
      createEntry({
        id: "old-child",
        parentId: "root",
        sequence: 2,
      }),
      createEntry({
        id: "branch-pointer",
        parentId: "root",
        sequence: 3,
        type: "leaf",
        payload: { entryId: "root" },
      }),
      createEntry({
        id: "ignored-inactive-child",
        parentId: "old-child",
        sequence: 4,
      }),
      createEntry({
        id: "new-child",
        parentId: "root",
        sequence: 5,
      }),
    ];

    expect(resolveCurrentLeafId(entries)).toBe("new-child");
  });
});

describe("buildSessionContext", () => {
  it("follows the active root-to-leaf path", () => {
    const entries = [
      createEntry({
        id: "root",
        parentId: null,
        sequence: 1,
        payload: {
          message: { role: "user", content: "root", timestamp: 1 },
        },
      }),
      createEntry({
        id: "old-child",
        parentId: "root",
        sequence: 2,
        payload: {
          message: { role: "user", content: "old", timestamp: 2 },
        },
      }),
      createEntry({
        id: "branch-pointer",
        parentId: "root",
        sequence: 3,
        type: "leaf",
        payload: { entryId: "root" },
      }),
      createEntry({
        id: "new-child",
        parentId: "root",
        sequence: 4,
        payload: {
          message: { role: "user", content: "new", timestamp: 4 },
        },
      }),
    ];

    expect(buildSessionContext(entries)).toEqual([
      { role: "user", content: "root", timestamp: 1 },
      { role: "user", content: "new", timestamp: 4 },
    ]);
  });

  it("replaces earlier messages with compaction summaries", () => {
    const entries = [
      createEntry({
        id: "root",
        parentId: null,
        sequence: 1,
        payload: {
          message: { role: "user", content: "older question", timestamp: 1 },
        },
      }),
      createEntry({
        id: "assistant",
        parentId: "root",
        sequence: 2,
        payload: {
          message: { role: "assistant", content: "older answer", timestamp: 2 },
        },
      }),
      createEntry({
        id: "compaction",
        parentId: "assistant",
        sequence: 3,
        type: "compaction",
        payload: { summary: "The user asked about appointments." },
      }),
      createEntry({
        id: "latest",
        parentId: "compaction",
        sequence: 4,
        payload: {
          message: { role: "user", content: "continue", timestamp: 4 },
        },
      }),
    ];

    expect(buildSessionContext(entries, { model: TEST_MODEL })).toEqual([
      {
        role: "system",
        content: "Conversation summary so far:\nThe user asked about appointments.",
      },
      { role: "user", content: "continue", timestamp: 4 },
    ]);
  });
});
