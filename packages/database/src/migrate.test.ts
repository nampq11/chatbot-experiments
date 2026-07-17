import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIGRATION_TABLES,
  resetDatabaseSchema,
  runMigrations,
} from "./migrate.ts";

const mocks = vi.hoisted(() => {
  const connectionEnd = vi.fn(async () => {});
  const poolQuery = vi.fn(async () => []);
  const poolEnd = vi.fn(async () => {});
  const createConnection = vi.fn(() => ({ end: connectionEnd }));
  const createPool = vi.fn(() => ({ query: poolQuery, end: poolEnd }));
  const drizzle = vi.fn(() => ({ db: {} }));
  const migrate = vi.fn(async () => {});

  return {
    connectionEnd,
    poolQuery,
    poolEnd,
    createConnection,
    createPool,
    drizzle,
    migrate,
  };
});

vi.mock("mysql2/promise", () => ({
  createConnection: mocks.createConnection,
  createPool: mocks.createPool,
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: mocks.drizzle,
}));

vi.mock("drizzle-orm/mysql2/migrator", () => ({
  migrate: mocks.migrate,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.connectionEnd.mockReset();
  mocks.poolQuery.mockReset();
  mocks.poolEnd.mockReset();
  mocks.createConnection.mockReset();
  mocks.createPool.mockReset();
  mocks.drizzle.mockReset();
  mocks.migrate.mockReset();
});

const databaseUrl =
  "mysql://root:password@127.0.0.1:3307/chatbot_experiments_test";

describe("runMigrations", () => {
  it("applies pending migrations using a dedicated connection", async () => {
    await runMigrations(databaseUrl);

    expect(mocks.createConnection).toHaveBeenCalledTimes(1);
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
    expect(mocks.migrate).toHaveBeenCalledTimes(1);
    expect(mocks.migrate).toHaveBeenCalledWith(expect.any(Object), {
      migrationsFolder: expect.stringContaining("/migrations"),
    });
    expect(mocks.connectionEnd).toHaveBeenCalledTimes(1);
  });

  it("accepts an explicit migrations folder", async () => {
    await runMigrations(databaseUrl, { migrationsFolder: "/tmp/migrations" });

    expect(mocks.migrate).toHaveBeenCalledWith(expect.any(Object), {
      migrationsFolder: "/tmp/migrations",
    });
  });
});

describe("resetDatabaseSchema", () => {
  it("drops the managed tables for a local reset", async () => {
    await resetDatabaseSchema(databaseUrl);

    expect(mocks.createPool).toHaveBeenCalledTimes(1);
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      1,
      "SET FOREIGN_KEY_CHECKS = 0",
    );
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      2,
      "DROP TABLE IF EXISTS `agent_runs`",
    );
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      3,
      "DROP TABLE IF EXISTS `messages`",
    );
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      4,
      "DROP TABLE IF EXISTS `sessions`",
    );
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      5,
      "DROP TABLE IF EXISTS `users`",
    );
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      6,
      "DROP TABLE IF EXISTS `__drizzle_migrations`",
    );
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      7,
      "SET FOREIGN_KEY_CHECKS = 1",
    );
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });
});

describe("MIGRATION_TABLES guard", () => {
  it("matches the managed table names", () => {
    const expectedTables = [
      "users",
      "sessions",
      "messages",
      "agent_runs",
      "__drizzle_migrations",
    ];

    for (const table of expectedTables) {
      expect(MIGRATION_TABLES).toContain(table);
    }
    expect(MIGRATION_TABLES.length).toBe(expectedTables.length);
  });
});
