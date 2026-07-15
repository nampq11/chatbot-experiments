import type {
  AppendMessageRepositoryInput,
  AppendSessionDataRepositoryInput,
  CreateSessionRepositoryInput,
  ListSessionsRepositoryInput,
  Message,
  PaginatedResult,
  Session,
  SessionDataEntry,
  SessionRepository,
} from "@dentaltrip-ai/core/session";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { DatabaseClient } from "../client.ts";
import { agentRuns, messages, sessionData, sessions } from "../schema/index.ts";

type Db = DatabaseClient["db"];
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

const SESSION_DATA_SCHEMA_VERSION = 1;

function createMessageEntryPayload(message: Message): Record<string, unknown> {
  if (message.role === "system") {
    return { message: { role: "system", content: message.content } };
  }

  return {
    message: {
      role: message.role,
      content: message.content,
      timestamp: message.createdAt.getTime(),
    },
  };
}

/** Persists sessions and messages through Drizzle/MySQL. */
export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Db) {}

  private encodeCursor(updatedAt: Date, id: string): string {
    return `${updatedAt.toISOString()}|${id}`;
  }

  private decodeCursor(cursor: string): { updatedAt: Date; id: string } {
    const separatorIndex = cursor.indexOf("|");

    if (separatorIndex <= 0 || separatorIndex === cursor.length - 1) {
      throw new Error("Invalid session cursor");
    }

    const updatedAt = new Date(cursor.slice(0, separatorIndex));
    const id = cursor.slice(separatorIndex + 1);

    if (Number.isNaN(updatedAt.getTime()) || !id) {
      throw new Error("Invalid session cursor");
    }

    return { updatedAt, id };
  }

  async createSession(input: CreateSessionRepositoryInput): Promise<Session> {
    const createdAt = new Date();

    await this.db.insert(sessions).values({
      id: input.id,
      userId: input.userId,
      title: input.title,
      status: "active",
      messageCount: 0,
      createdAt,
      updatedAt: createdAt,
    });

    return {
      id: input.id,
      userId: input.userId,
      title: input.title,
      status: "active",
      messageCount: 0,
      createdAt,
      updatedAt: createdAt,
    };
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const row = rows[0];

    if (row === undefined) {
      return null;
    }

    return this.mapSession(row);
  }

  async listSessions(input: ListSessionsRepositoryInput): Promise<PaginatedResult<Session>> {
    const pageSize = input.limit ?? 20;
    const conditions: SQL[] = [eq(sessions.userId, input.userId)];

    if (input.cursor) {
      const parsedCursor = this.decodeCursor(input.cursor);
      const cursorCondition = or(
        lt(sessions.updatedAt, parsedCursor.updatedAt),
        and(eq(sessions.updatedAt, parsedCursor.updatedAt), lt(sessions.id, parsedCursor.id)),
      );

      if (!cursorCondition) {
        throw new Error("Session list cursor failed to build");
      }

      conditions.push(cursorCondition);
    }

    const where = and(...conditions);
    if (!where) {
      throw new Error("Session list query requires at least one condition");
    }

    const rows = await this.db
      .select()
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.updatedAt), desc(sessions.id))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const lastItem = items.at(-1);
    const nextCursor = hasMore && lastItem ? this.encodeCursor(lastItem.updatedAt, lastItem.id) : null;

    return { items: items.map((r) => this.mapSession(r)), nextCursor };
  }

  async appendMessage(input: AppendMessageRepositoryInput): Promise<Message> {
    return this.db.transaction(async (tx: Transaction) => {
      const createdAt = new Date();
      await tx
        .update(sessions)
        .set({
          messageCount: sql`${sessions.messageCount} + 1`,
          updatedAt: createdAt,
        })
        .where(eq(sessions.id, input.sessionId));

      const sequenceRows = await tx
        .select({ messageCount: sessions.messageCount })
        .from(sessions)
        .where(eq(sessions.id, input.sessionId))
        .limit(1);
      const sequence = sequenceRows[0]?.messageCount ?? 0;

      const message = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        sequence,
        role: input.role,
        content: input.content,
        createdAt,
      };

      await tx.insert(messages).values(message);
      await this.appendSessionDataWithTransaction(tx, {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        type: "message",
        payload: input.entryPayload ?? createMessageEntryPayload(message),
      });

      return message;
    });
  }

  async appendSessionData(input: AppendSessionDataRepositoryInput): Promise<SessionDataEntry> {
    return this.db.transaction(async (tx: Transaction) => this.appendSessionDataWithTransaction(tx, input));
  }

  async updateSessionStatus(sessionId: string, status: Session["status"]): Promise<void> {
    await this.db.update(sessions).set({ status }).where(eq(sessions.id, sessionId));
  }

  async listMessages(sessionId: string): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.sequence));

    return rows.map((row) => this.mapMessage(row));
  }

  async listSessionData(sessionId: string): Promise<SessionDataEntry[]> {
    const rows = await this.db
      .select()
      .from(sessionData)
      .where(eq(sessionData.sessionId, sessionId))
      .orderBy(asc(sessionData.sequence));

    return rows.map((row) => this.mapSessionData(row));
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.db.transaction(async (tx: Transaction) => {
      await tx.delete(agentRuns).where(eq(agentRuns.sessionId, sessionId));
      await tx.delete(sessionData).where(eq(sessionData.sessionId, sessionId));
      await tx.delete(messages).where(eq(messages.sessionId, sessionId));
      await tx.delete(sessions).where(eq(sessions.id, sessionId));
    });
  }

  async deleteSessionsByUser(userId: string): Promise<string[]> {
    return this.db.transaction(async (tx: Transaction) => {
      const sessionRows = await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
      const sessionIds = sessionRows.map((session) => session.id);

      if (sessionIds.length === 0) {
        return [];
      }

      await tx.delete(agentRuns).where(inArray(agentRuns.sessionId, sessionIds));
      await tx.delete(sessionData).where(inArray(sessionData.sessionId, sessionIds));
      await tx.delete(messages).where(inArray(messages.sessionId, sessionIds));
      await tx.delete(sessions).where(inArray(sessions.id, sessionIds));

      return sessionIds;
    });
  }

  private async appendSessionDataWithTransaction(
    tx: Transaction,
    input: AppendSessionDataRepositoryInput,
  ): Promise<SessionDataEntry> {
    const createdAt = new Date();
    const previousRows = await tx
      .select({ id: sessionData.id, sequence: sessionData.sequence })
      .from(sessionData)
      .where(eq(sessionData.sessionId, input.sessionId))
      .orderBy(desc(sessionData.sequence))
      .limit(1);
    const previousEntry = previousRows[0];
    const sequence = (previousEntry?.sequence ?? 0) + 1;
    const parentId = input.parentId ?? previousEntry?.id ?? null;

    const entry: SessionDataEntry = {
      id: input.id,
      sessionId: input.sessionId,
      userId: input.userId,
      parentId,
      sequence,
      type: input.type,
      payload: input.payload,
      schemaVersion: input.schemaVersion ?? SESSION_DATA_SCHEMA_VERSION,
      createdAt,
    };

    await tx.insert(sessionData).values(entry);
    return entry;
  }

  private mapSession(row: {
    id: string;
    userId: string;
    title: string;
    status: Session["status"];
    messageCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): Session {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      status: row.status,
      messageCount: row.messageCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapMessage(row: Message): Message {
    return {
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      sequence: row.sequence,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt,
    };
  }

  private mapSessionData(row: SessionDataEntry): SessionDataEntry {
    return {
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      parentId: row.parentId,
      sequence: row.sequence,
      type: row.type,
      payload: row.payload,
      schemaVersion: row.schemaVersion,
      createdAt: row.createdAt,
    };
  }
}
