import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMigrateProgram,
  MIGRATION_TABLES,
  runMigrateDown,
  runMigrateUp,
} from "./migrate.ts";

const mocks = vi.hoisted(() => {
  const runMigrations = vi.fn(async () => {});
  const resetDatabaseSchema = vi.fn(async () => {});
  const migrationTables = [
    "agent_runs",
    "messages",
    "sessions",
    "users",
    "__drizzle_migrations",
  ] as const;

  return { runMigrations, resetDatabaseSchema, migrationTables };
});

vi.mock("@chatbot-experiments/database", () => ({
  MIGRATION_TABLES: mocks.migrationTables,
  resetDatabaseSchema: mocks.resetDatabaseSchema,
  runMigrations: mocks.runMigrations,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.runMigrations.mockReset();
  mocks.resetDatabaseSchema.mockReset();
});

const databaseUrl =
  "mysql://root:password@127.0.0.1:3307/chatbot_experiments_test";

describe("runMigrateUp", () => {
  it("applies pending migrations", async () => {
    await runMigrateUp(databaseUrl);

    expect(mocks.runMigrations).toHaveBeenCalledWith(databaseUrl);
  });
});

describe("runMigrateDown", () => {
  it("drops the managed tables for a local reset", async () => {
    await runMigrateDown(databaseUrl);

    expect(mocks.resetDatabaseSchema).toHaveBeenCalledWith(databaseUrl, {
      onTableDropError: expect.any(Function),
      onForeignKeyReenableError: expect.any(Function),
    });
  });
});

describe("createMigrateProgram", () => {
  it("exposes up and down commands", async () => {
    const program = createMigrateProgram(databaseUrl);

    await program.parseAsync(["node", "chatbot-experiments", "up"]);
    await program.parseAsync(["node", "chatbot-experiments", "down"]);

    expect(mocks.runMigrations).toHaveBeenCalledTimes(1);
    expect(mocks.resetDatabaseSchema).toHaveBeenCalledTimes(1);
  });
});

describe("MIGRATION_TABLES", () => {
  it("is re-exported for migrate command tests and callers", () => {
    expect(MIGRATION_TABLES).toEqual(mocks.migrationTables);
  });
});
