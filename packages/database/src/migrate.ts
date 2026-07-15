import { join } from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createConnection, createPool } from "mysql2/promise";
import { parseDatabaseUrl } from "./config.ts";
import * as schema from "./schema/index.ts";

export const MIGRATION_TABLES = ["agent_runs", "messages", "sessions", "users", "__drizzle_migrations"] as const;

/** Options that control Drizzle migration execution. */
export interface RunMigrationsOptions {
  /** Directory containing Drizzle SQL migration files. */
  readonly migrationsFolder?: string;
}

/** Hooks used by local schema reset callers to preserve command output behavior. */
export interface ResetDatabaseSchemaOptions {
  /** Called before a table drop error is re-thrown. */
  readonly onTableDropError?: (table: string, error: unknown) => void;
  /** Called when foreign key checks cannot be re-enabled during cleanup. */
  readonly onForeignKeyReenableError?: (error: unknown) => void;
}

/** Applies pending Drizzle migrations using a dedicated MySQL connection. */
export async function runMigrations(databaseUrl: string, options: RunMigrationsOptions = {}): Promise<void> {
  const databaseConfig = parseDatabaseUrl(databaseUrl);
  const connection = await createConnection(databaseConfig);

  try {
    const db = drizzle(connection, { schema, mode: "default" });
    await migrate(db, {
      migrationsFolder: options.migrationsFolder ?? join(process.cwd(), "migrations"),
    });
  } finally {
    await connection.end();
  }
}

/** Drops all tables managed by the migration command for local schema resets. */
export async function resetDatabaseSchema(
  databaseUrl: string,
  options: ResetDatabaseSchemaOptions = {},
): Promise<void> {
  const pool = createPool(parseDatabaseUrl(databaseUrl));

  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of MIGRATION_TABLES) {
      try {
        await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
      } catch (error) {
        options.onTableDropError?.(table, error);
        throw error;
      }
    }
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1").catch((error: unknown) => {
      options.onForeignKeyReenableError?.(error);
    });
    await pool.end();
  }
}
