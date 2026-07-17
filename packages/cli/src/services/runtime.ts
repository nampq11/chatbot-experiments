import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { createAgentRuntime } from "@chatbot-experiments/agent-runtime";
import { AgentService } from "@chatbot-experiments/core/agent";
import { createInMemoryEventBus } from "@chatbot-experiments/core/events";
import { SessionUseCases } from "@chatbot-experiments/core/session";
import {
  createDatabaseClient,
  createDatabaseRepositories,
  runMigrations,
} from "@chatbot-experiments/database";
import type { CliEnv } from "../env.ts";

/** Runtime services required to run the interactive CLI loop. */
export interface CliDependencies {
  sessions: SessionUseCases;
  agent: AgentService;
  userId: string;
  verbose: boolean;
  noInput: boolean;
}

/** Runtime services plus cleanup for command handlers that open infrastructure resources. */
export interface CliRuntime extends CliDependencies {
  close(): Promise<void>;
}

/** Creates database-backed services used by CLI command handlers. */
export async function createCliRuntime(
  env: CliEnv,
  userId: string,
  verbose = false,
  noInput?: boolean,
): Promise<CliRuntime> {
  const inputDisabled = noInput ?? !input.isTTY;

  if (verbose) {
    output.write("[DEBUG] Creating CLI runtime...\n");
  }

  await runMigrations(env.databaseUrl);
  const database = await createDatabaseClient(env.databaseUrl);
  const { sessionRepository, agentRunStore } =
    createDatabaseRepositories(database);
  const events = createInMemoryEventBus({
    onFailure: ({ event, error }) => {
      output.write(`${event.type} listener failed: ${error.message}\n`);
    },
  });
  const sessions = new SessionUseCases(sessionRepository, events, {
    generate: randomUUID,
  });
  const agent = new AgentService(
    createAgentRuntime({
      transcriptRepository: sessionRepository,
      agentRunStore,
      thinkingLevel: env.thinkingLevel,
    }),
  );

  return {
    sessions,
    agent,
    userId,
    verbose,
    noInput: inputDisabled,
    close: async () => {
      if (verbose) {
        output.write("[DEBUG] Closing CLI runtime...\n");
      }
      await database.close();
    },
  };
}
