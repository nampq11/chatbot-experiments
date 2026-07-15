import type { PoolOptions } from "mysql2/promise";

/** Parses a MySQL connection URL into mysql2 pool options. */
export function parseDatabaseUrl(databaseUrl: string): PoolOptions {
  const url = new URL(databaseUrl);

  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// protocol");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!database) {
    throw new Error("DATABASE_URL must include a database name");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
  };
}
