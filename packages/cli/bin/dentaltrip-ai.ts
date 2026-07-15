#!/usr/bin/env node
import { createCliProgram } from "../src/commands/commands.ts";
import { loadEnv } from "../src/env.ts";
import { withCliErrorHandling } from "../src/framework/entry-point.ts";

async function start(): Promise<void> {
  const env = loadEnv();
  const program = createCliProgram(env);

  await program.parseAsync(process.argv);
}

if (!process.env.VITEST) {
  void withCliErrorHandling(start);
}
