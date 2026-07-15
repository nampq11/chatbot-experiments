import { stdout as output } from "node:process";
import type { Command } from "commander";
import type { CliEnv } from "../../env.ts";
import { createCliRuntime } from "../../services/runtime.ts";

interface SessionListOptions {
  readonly json: boolean;
}

interface SessionShowOptions {
  readonly json: boolean;
  readonly messages: boolean;
}

/** Adds chat session management subcommands to the root CLI program. */
export function addSessionCommands(program: Command, env: CliEnv, userId: string): void {
  const sessionsCmd = program
    .command("sessions")
    .description("Manage chat sessions")
    .addHelpText("beforeAll", `\n\x1b[1mSESSION COMMANDS\x1b[0m\n`);

  sessionsCmd
    .command("list")
    .description("List all sessions for the current user")
    .option("--json", "Output in JSON format", false)
    .action(async (options: SessionListOptions) => {
      const runtime = await createCliRuntime(env, userId);
      try {
        const sessions = await runtime.sessions.listSessions({
          userId,
        });

        if (options.json) {
          output.write(`${JSON.stringify(sessions, null, 2)}\n`);
          return;
        }

        output.write(`\x1b[1m\x1b[36mSessions\x1b[0m\n\n`);
        if (sessions.items.length === 0) {
          output.write("  No sessions found. Start a new session with \x1b[1mdentaltrip-ai\x1b[0m\n");
          return;
        }

        sessions.items.forEach((session, index) => {
          const created = new Date(session.createdAt).toLocaleDateString();
          output.write(`  ${index + 1}. \x1b[1m${session.id}\x1b[0m\n`);
          output.write(`     Title: ${session.title}\n`);
          output.write(`     Created: ${created}\n\n`);
        });
      } finally {
        await runtime.close();
      }
    });

  sessionsCmd
    .command("show <id>")
    .description("Show details of a specific session")
    .option("--json", "Output in JSON format", false)
    .option("--messages", "Include session messages", false)
    .action(async (id: string, options: SessionShowOptions) => {
      const runtime = await createCliRuntime(env, userId);
      try {
        const session = await runtime.sessions.getSession({
          sessionId: id,
          userId,
        });
        const messages = options.messages ? await runtime.sessions.listMessages({ sessionId: id, userId }) : [];

        if (options.json) {
          const sessionWithMessages = { ...session, messages };
          output.write(`${JSON.stringify(sessionWithMessages, null, 2)}\n`);
          return;
        }

        output.write(`\x1b[1m\x1b[36mSession Details\x1b[0m\n\n`);
        output.write(`  \x1b[1mID:\x1b[0m         ${session.id}\n`);
        output.write(`  \x1b[1mTitle:\x1b[0m       ${session.title}\n`);
        output.write(`  \x1b[1mCreated:\x1b[0m     ${new Date(session.createdAt).toISOString()}\n`);
        output.write(`  \x1b[1mUpdated:\x1b[0m     ${new Date(session.updatedAt).toISOString()}\n`);
        output.write(`  \x1b[1mStatus:\x1b[0m       ${session.status}\n`);
        output.write(`  \x1b[1mMessages:\x1b[0m    ${messages.length}\n\n`);
      } catch (_error) {
        output.write(`\x1b[1m\x1b[31mError:\x1b[0m Session not found: ${id}\n`);
        process.exit(1);
      } finally {
        await runtime.close();
      }
    });
}
