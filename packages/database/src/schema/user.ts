import type { InferSelectModel } from "drizzle-orm";
import { mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_index").on(table.email)],
);

/** Row selected from the users table. */
export type UserRow = InferSelectModel<typeof users>;
