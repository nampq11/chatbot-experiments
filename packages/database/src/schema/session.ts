import type { InferSelectModel } from "drizzle-orm";
import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const sessionStatus = mysqlEnum("status", ["active", "completed", "cancelled"]);

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    status: sessionStatus.notNull().default("active"),
    messageCount: int("message_count").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (table) => [index("sessions_user_index").on(table.userId)],
);

export const messageRole = mysqlEnum("role", ["user", "assistant", "system"]);

export const sessionDataType = mysqlEnum("type", [
  "message",
  "model_change",
  "thinking_level_change",
  "active_tools_change",
  "compaction",
  "branch_summary",
  "custom",
  "custom_message",
  "leaf",
]);

export const messages = mysqlTable(
  "messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("session_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    sequence: int("sequence").notNull(),
    role: messageRole.notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_session_index").on(table.sessionId),
    uniqueIndex("messages_session_sequence_index").on(table.sessionId, table.sequence),
  ],
);

export const sessionData = mysqlTable(
  "session_data",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("session_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    parentId: varchar("parent_id", { length: 36 }),
    sequence: int("sequence").notNull(),
    type: sessionDataType.notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    schemaVersion: int("schema_version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("session_data_session_index").on(table.sessionId),
    index("session_data_parent_index").on(table.parentId),
    uniqueIndex("session_data_session_sequence_index").on(table.sessionId, table.sequence),
  ],
);

/** Row selected from the sessions table. */
export type SessionRow = InferSelectModel<typeof sessions>;
/** Row selected from the messages table. */
export type MessageRow = InferSelectModel<typeof messages>;
/** Row selected from the session_data table. */
export type SessionDataRow = InferSelectModel<typeof sessionData>;
