import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabaseClient } from "./client.ts";

const mocks = vi.hoisted(() => {
  const poolQuery = vi.fn(async () => []);
  const poolEnd = vi.fn(async () => {});
  const createPool = vi.fn(() => ({ query: poolQuery, end: poolEnd }));
  const drizzle = vi.fn(() => ({ db: {} }));

  return {
    poolQuery,
    poolEnd,
    createPool,
    drizzle,
  };
});

vi.mock("mysql2/promise", () => ({
  createPool: mocks.createPool,
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: mocks.drizzle,
}));

afterEach(() => {
  mocks.poolQuery.mockReset();
  mocks.poolEnd.mockReset();
  mocks.createPool.mockReset();
  mocks.drizzle.mockReset();
});

describe("createDatabaseClient", () => {
  it("creates a connection pool without running migrations", async () => {
    const client = await createDatabaseClient("mysql://root:password@127.0.0.1:3307/dental_chat");

    expect(mocks.createPool).toHaveBeenCalledTimes(1);
    expect(mocks.drizzle).toHaveBeenCalled();

    await client.close();

    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });
});
