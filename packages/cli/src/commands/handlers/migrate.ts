import { stderr } from "node:process";
import {
  MIGRATION_TABLES,
  resetDatabaseSchema,
  runMigrations,
} from "@chatbot-experiments/database";
import { Command } from "commander";

export { MIGRATION_TABLES };

/** Applies all pending database migrations. */
export async function runMigrateUp(databaseUrl: string): Promise<void> {
  await runMigrations(databaseUrl);
}

/** Drops the managed database tables for a clean local reset. */
export async function runMigrateDown(databaseUrl: string): Promise<void> {
  await resetDatabaseSchema(databaseUrl, {
    onTableDropError: (table, error) => {
      stderr.write(`Failed to drop table ${table}: ${error}\n`);
    },
    onForeignKeyReenableError: (error) => {
      stderr.write(
        `Warning: Failed to re-enable foreign key checks: ${error}\n`,
      );
    },
  });
}

/** Builds the migration subcommand program used by local maintenance scripts. */
export function createMigrateProgram(databaseUrl: string): Command {
  const program = new Command();

  program
    .name("chatbot-experiments migrate")
    .description("Apply or reset the local MySQL schema used by the server")
    .helpOption("-h, --help", "Display help for command")
    .addHelpText(
      "beforeAll",
      `\x1b[1m\x1b[36mChatbot Experiments Migrations\x1b[0m\n\n`,
    )
    .addHelpText(
      "after",
      `\n\x1b[1mUsage:\x1b[0m\n  chatbot-experiments migrate up\n  chatbot-experiments migrate down\n`,
    );

  program
    .command("up")
    .description("Apply pending database migrations")
    .action(async () => {
      await runMigrateUp(databaseUrl);
    });

  program
    .command("down")
    .description("Drop the current schema for a clean local reset")
    .action(async () => {
      await runMigrateDown(databaseUrl);
    });

  return program;
}
