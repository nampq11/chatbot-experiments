#!/usr/bin/env node
import { createMigrateProgram } from "../src/commands/handlers/migrate.ts";
import { loadEnv } from "../src/env.ts";
import { withCliErrorHandling } from "../src/framework/entry-point.ts";

async function start(): Promise<void> {
  const env = loadEnv();
  const program = createMigrateProgram(env.databaseUrl);

  await program.parseAsync(process.argv);
}

if (!process.env.VITEST) {
  void withCliErrorHandling(start);
}
