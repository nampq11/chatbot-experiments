import type { Message, Session, SessionDataEntry } from "@dentaltrip-ai/core/session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages, sessionData, sessions } from "../schema/index.ts";
import { DrizzleSessionRepository } from "./session-repository.ts";

type SessionCountRow = Pick<Session, "messageCount">;
type QueryRow = Session | Message | SessionDataEntry | SessionCountRow;
type QueryResult<TRow extends QueryRow> = TRow[] & {
  then: (resolve: (value: TRow[]) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  limit: (limit: number) => Promise<TRow[]>;
  orderBy: (..._orderings: unknown[]) => QueryResult<TRow>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isMessageRow(value: unknown): value is Message {
  return (
    isRecord(value) &&
    typeof value.sequence === "number" &&
    typeof value.role === "string" &&
    typeof value.content === "string"
  );
}
function isSessionDataRow(value: unknown): value is SessionDataEntry {
  return (
    isRecord(value) && typeof value.sequence === "number" && typeof value.type === "string" && isRecord(value.payload)
  );
}

function isSessionRows(rows: QueryRow[]): rows is Session[] {
  return rows.every((row) => "updatedAt" in row && "title" in row);
}

function isMessageRows(rows: QueryRow[]): rows is Message[] {
  return rows.every(isMessageRow);
}
function isSessionDataRows(rows: QueryRow[]): rows is SessionDataEntry[] {
  return rows.every(isSessionDataRow);
}

function renderSql(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(renderSql).join("");
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (isRecord(value)) {
    const record = value;

    if (Array.isArray(record.queryChunks)) {
      return record.queryChunks.map(renderSql).join("");
    }

    if (Array.isArray(record.value)) {
      return record.value.map(renderSql).join("");
    }

    if (record.value !== undefined) {
      return renderSql(record.value);
    }

    if (typeof record.name === "string") {
      return record.name;
    }
  }

  return String(value);
}

function sortSessionRows(rows: Session[]): Session[] {
  return [...rows].sort((a, b) => {
    const updatedAtDelta = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    return b.id.localeCompare(a.id);
  });
}

function sortMessageRows(rows: Message[]): Message[] {
  return [...rows].sort((a, b) => a.sequence - b.sequence);
}
function sortSessionDataRows(rows: SessionDataEntry[]): SessionDataEntry[] {
  return [...rows].sort((a, b) => a.sequence - b.sequence);
}

function applySessionFilters(rows: Session[], conditionText: string): Session[] {
  let filtered = [...rows];
  const normalizedConditionText = conditionText.replace(/"/g, "");

  const userMatch = normalizedConditionText.match(/\buser_id = ([^ )]+)/);
  if (userMatch) {
    const userId = userMatch[1];
    filtered = filtered.filter((row) => row.userId === userId);
  }

  if (/\bmessage_count > 0\b/.test(normalizedConditionText)) {
    filtered = filtered.filter((row) => row.messageCount > 0);
  }

  const sessionIdMatch = normalizedConditionText.match(/\bid = ([^ )]+)/);
  if (sessionIdMatch?.[1]) {
    const sessionId = sessionIdMatch[1];
    filtered = filtered.filter((row) => row.id === sessionId);
  }

  if (normalizedConditionText.includes("updated_at =") && normalizedConditionText.includes("id <")) {
    const cursorUpdatedAtMatch = normalizedConditionText.match(/\bupdated_at = ([^ )]+)/);
    const cursorIdMatch = normalizedConditionText.match(/\bid < ([^ )]+)/);
    if (cursorUpdatedAtMatch?.[1] && cursorIdMatch?.[1]) {
      const cursorUpdatedAt = new Date(cursorUpdatedAtMatch[1]);
      const cursorId = cursorIdMatch[1];
      filtered = filtered.filter(
        (row) =>
          row.updatedAt.getTime() < cursorUpdatedAt.getTime() ||
          (row.updatedAt.getTime() === cursorUpdatedAt.getTime() && row.id < cursorId),
      );
    }
  } else {
    const cursorUpdatedAtExclusiveMatch = normalizedConditionText.match(/\bupdated_at < ([^ )]+)/);
    if (cursorUpdatedAtExclusiveMatch?.[1]) {
      const cursorUpdatedAt = new Date(cursorUpdatedAtExclusiveMatch[1]);
      filtered = filtered.filter((row) => row.updatedAt.getTime() < cursorUpdatedAt.getTime());
    }
  }

  return filtered;
}

function applyMessageFilters(rows: Message[], conditionText: string): Message[] {
  let filtered = [...rows];

  const sessionIdMatch = conditionText.match(/\bsession_id = (".*?")/);
  if (sessionIdMatch) {
    const sessionId = JSON.parse(sessionIdMatch[1] as string);
    filtered = filtered.filter((row) => row.sessionId === sessionId);
  }

  return filtered;
}
function applySessionDataFilters(rows: SessionDataEntry[], conditionText: string): SessionDataEntry[] {
  let filtered = [...rows];

  const sessionIdMatch = conditionText.match(/\bsession_id = (".*?")/);
  if (sessionIdMatch) {
    const sessionId = JSON.parse(sessionIdMatch[1] as string);
    filtered = filtered.filter((row) => row.sessionId === sessionId);
  }

  return filtered;
}

function createQueryResult<TRow extends QueryRow>(
  rows: TRow[],
  tableName: "sessions" | "messages" | "session_data",
): QueryResult<TRow> {
  const snapshot = [...rows];
  const result = [...snapshot] as QueryResult<TRow>;

  // biome-ignore lint/suspicious/noThenProperty: this test helper intentionally mimics Drizzle's thenable query result.
  result.then = (resolve: (value: TRow[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve([...snapshot]).then(resolve, reject);

  result.limit = vi.fn(async (limit: number) => snapshot.slice(0, limit));
  result.orderBy = vi.fn((..._orderings: unknown[]) => {
    let sortedRows = snapshot;

    if (tableName === "messages" && isMessageRows(snapshot)) {
      sortedRows = sortMessageRows(snapshot) as TRow[];
    } else if (tableName === "session_data" && isSessionDataRows(snapshot)) {
      sortedRows = sortSessionDataRows(snapshot) as TRow[];
    } else if (isSessionRows(snapshot)) {
      sortedRows = sortSessionRows(snapshot) as TRow[];
    }

    return createQueryResult(sortedRows, tableName);
  });

  return result;
}

function createDb() {
  const state: {
    sessions: Session[];
    messages: Message[];
    sessionData: SessionDataEntry[];
    inserts: unknown[];
    updates: unknown[];
    queries: string[];
    selects: number;
    transactions: number;
  } = {
    sessions: [
      {
        id: "session-1",
        userId: "user-1",
        title: "A session",
        status: "active" as const,
        messageCount: 1,
        createdAt: new Date("2026-05-21T00:00:00.000Z"),
        updatedAt: new Date("2026-05-21T00:00:00.000Z"),
      },
    ],
    messages: [
      {
        id: "message-1",
        sessionId: "session-1",
        userId: "user-1",
        sequence: 1,
        role: "user" as const,
        content: "hello",
        createdAt: new Date("2026-05-21T00:00:00.000Z"),
      },
    ],
    sessionData: [
      {
        id: "message-1",
        sessionId: "session-1",
        userId: "user-1",
        parentId: null,
        sequence: 1,
        type: "message" as const,
        payload: {
          message: { role: "user", content: "hello", timestamp: 0 },
        },
        schemaVersion: 1,
        createdAt: new Date("2026-05-21T00:00:00.000Z"),
      },
    ],
    inserts: [] as unknown[],
    updates: [] as unknown[],
    queries: [] as string[],
    selects: 0,
    transactions: 0,
  };

  const db = {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      state.transactions += 1;
      return callback(db);
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        state.inserts.push(values);
        if (isMessageRow(values)) {
          state.messages.push(values);
        }
        if (isSessionDataRow(values)) {
          state.sessionData.push(values);
        }
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async () => {
          state.updates.push(values);
          if (isRecord(values) && values.messageCount !== undefined) {
            const session = state.sessions[0];
            if (!session) {
              throw new Error("Expected a session row before updating it.");
            }

            state.sessions[0] = {
              ...session,
              messageCount: session.messageCount + 1,
              updatedAt: values.updatedAt instanceof Date ? values.updatedAt : session.updatedAt,
            };
          }
        }),
      })),
    })),
    select: vi.fn((projection?: Record<string, unknown>) => ({
      from: vi.fn((table: unknown) => {
        state.selects += 1;

        return {
          where: vi.fn((condition: unknown) => {
            const conditionText = renderSql(condition);
            state.queries.push(conditionText);

            if (projection?.messageCount !== undefined) {
              const filtered = applySessionFilters(state.sessions, conditionText).map((row) => ({
                messageCount: row.messageCount,
              }));
              return createQueryResult(filtered, "sessions");
            }

            if (table === messages) {
              return createQueryResult(applyMessageFilters(state.messages, conditionText), "messages");
            }
            if (table === sessionData) {
              return createQueryResult(applySessionDataFilters(state.sessionData, conditionText), "session_data");
            }

            if (table === sessions) {
              return createQueryResult(applySessionFilters(state.sessions, conditionText), "sessions");
            }

            return createQueryResult([], "sessions");
          }),
        };
      }),
    })),
  };

  return {
    db: db as unknown as ConstructorParameters<typeof DrizzleSessionRepository>[0],
    state,
  };
}

describe("DrizzleSessionRepository", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
  });

  it("increments the session counter before inserting the message", async () => {
    const { db, state } = createDb();
    const repository = new DrizzleSessionRepository(db);

    const message = await repository.appendMessage({
      id: "message-2",
      sessionId: "session-1",
      userId: "user-1",
      role: "assistant",
      content: "world",
    });

    expect(message).toMatchObject({
      id: "message-2",
      sessionId: "session-1",
      sequence: 2,
      role: "assistant",
      content: "world",
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(state.selects).toBe(2);
    expect(state.updates[0]).toMatchObject({
      messageCount: expect.anything(),
      updatedAt: new Date("2026-05-21T12:00:00.000Z"),
    });
    expect(state.inserts[0]).toMatchObject({
      id: "message-2",
      sessionId: "session-1",
      sequence: 2,
    });
    expect(state.inserts[1]).toMatchObject({
      id: "message-2",
      sessionId: "session-1",
      parentId: "message-1",
      sequence: 2,
      type: "message",
      payload: {
        message: {
          role: "assistant",
          content: "world",
        },
      },
    });
  });

  it("maps sessions and lists messages", async () => {
    const { db } = createDb();
    const repository = new DrizzleSessionRepository(db);

    await expect(repository.getSession("session-1")).resolves.toMatchObject({
      id: "session-1",
      userId: "user-1",
    });

    const listSessionsResult = await repository.listSessions({
      userId: "user-1",
    });
    expect(listSessionsResult.items).toHaveLength(1);
    await expect(repository.listMessages("session-1")).resolves.toEqual([
      expect.objectContaining({ id: "message-1", sequence: 1 }),
    ]);
    await expect(repository.listSessionData("session-1")).resolves.toEqual([
      expect.objectContaining({ id: "message-1", type: "message" }),
    ]);
  });

  it("includes zero-message sessions and uses a stable cursor for same-timestamp rows", async () => {
    const sameTime = new Date("2026-05-21T00:00:00.000Z");
    const { db, state } = createDb();
    state.sessions = [
      {
        id: "session-c",
        userId: "user-1",
        title: "Older session",
        status: "active" as const,
        messageCount: 2,
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        updatedAt: new Date("2026-05-20T00:00:00.000Z"),
      },
      {
        id: "session-a",
        userId: "user-1",
        title: "Zero-message session",
        status: "active" as const,
        messageCount: 0,
        createdAt: sameTime,
        updatedAt: sameTime,
      },
      {
        id: "session-b",
        userId: "user-1",
        title: "Newest session",
        status: "active" as const,
        messageCount: 1,
        createdAt: sameTime,
        updatedAt: sameTime,
      },
    ];
    const repository = new DrizzleSessionRepository(db);

    const allSessionsResult = await repository.listSessions({
      userId: "user-1",
    });
    expect(allSessionsResult.items).toMatchObject([
      expect.objectContaining({ id: "session-b" }),
      expect.objectContaining({ id: "session-a" }),
      expect.objectContaining({ id: "session-c" }),
    ]);
    expect(state.queries[0]).not.toContain("message_count > 0");

    const firstPage = await repository.listSessions({
      userId: "user-1",
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]).toMatchObject({ id: "session-b" });
    expect(firstPage.nextCursor).toBe(`${sameTime.toISOString()}|session-b`);

    const secondPage = await repository.listSessions({
      userId: "user-1",
      cursor: firstPage.nextCursor ?? undefined,
      limit: 1,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]).toMatchObject({ id: "session-a" });
    expect(secondPage.nextCursor).toBe(`${sameTime.toISOString()}|session-a`);

    const thirdPage = await repository.listSessions({
      userId: "user-1",
      cursor: secondPage.nextCursor ?? undefined,
      limit: 1,
    });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.items[0]).toMatchObject({ id: "session-c" });
    expect(thirdPage.nextCursor).toBeNull();
  });
});
