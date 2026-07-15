import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { parseDatabaseUrl } from "./config.ts";
import * as schema from "./schema/index.ts";

/** Creates a pooled Drizzle database client for application repositories. */
export async function createDatabaseClient(databaseUrl: string) {
  const pool = createPool(parseDatabaseUrl(databaseUrl));
  const db = drizzle(pool, { schema, mode: "default" });

  return {
    pool,
    db,
    async ping(): Promise<void> {
      await pool.query("select 1");
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

/** Pooled Drizzle client and lifecycle helpers used by database repositories. */
export type DatabaseClient = Awaited<ReturnType<typeof createDatabaseClient>>;
