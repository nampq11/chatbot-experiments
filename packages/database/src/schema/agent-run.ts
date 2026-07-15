import type { InferSelectModel } from "drizzle-orm";
import { index, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const runStatus = mysqlEnum("status", ["queued", "running", "completed", "cancelled", "failed"]);

export const agentRuns = mysqlTable(
  "agent_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("session_id", { length: 36 }).notNull(),
    messageId: varchar("message_id", { length: 36 }).notNull(),
    status: runStatus.notNull().default("queued"),
    model: varchar("model", { length: 255 }),
    output: json("output").$type<Record<string, unknown> | null>().default(null),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { mode: "date" }),
  },
  (table) => [
    index("agent_runs_session_index").on(table.sessionId),
    uniqueIndex("agent_runs_message_index").on(table.messageId),
  ],
);

/** Row selected from the agent_runs table. */
export type AgentRunRow = InferSelectModel<typeof agentRuns>;
