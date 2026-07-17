import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type { CliEnv } from "../env.ts";
import { createCliRuntime } from "../services/runtime.ts";
import { printConfig } from "./handlers/config.ts";
import { runCli } from "./handlers/default.ts";
import { addSessionCommands } from "./handlers/sessions.ts";

const DEFAULT_CLI_USER_ID = "user-1";
const FALLBACK_VERSION = "0.0.0";

const VERSION = getVersion();

interface RootCommandOptions {
  readonly sessionId?: string;
  readonly verbose: boolean;
  readonly input?: boolean;
}

interface ConfigCommandOptions {
  readonly verbose: boolean;
}

function getVersion(): string {
  for (const packagePath of getPackageJsonPaths()) {
    const version = readPackageVersion(packagePath);

    if (version) {
      return version;
    }
  }

  return FALLBACK_VERSION;
}

/** Returns package manifest locations for source execution and compiled dist execution. */
function getPackageJsonPaths(): string[] {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));

  return [
    join(moduleDirectory, "../../package.json"),
    join(moduleDirectory, "../../../package.json"),
  ];
}

function readPackageVersion(packagePath: string): string | undefined {
  try {
    const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf-8"));

    return isPackageJsonWithVersion(packageJson)
      ? packageJson.version
      : undefined;
  } catch {
    return undefined;
  }
}

function isPackageJsonWithVersion(
  value: unknown,
): value is { readonly version: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string"
  );
}

/** Converts Commander's --no-input shape into an override while preserving TTY auto-detection by default. */
function getNoInputOverride(options: RootCommandOptions): boolean | undefined {
  return options.input === false ? true : undefined;
}

/** Builds the Chatbot Experiments command line program with chat, config, and session commands. */
export function createCliProgram(
  env: CliEnv,
  userId = DEFAULT_CLI_USER_ID,
): Command {
  const program = new Command();

  program
    .name("chatbot-experiments")
    .description(
      "Chatbot Experiments - Interactive AI assistant for chatbot experiment planning",
    )
    .version(VERSION, "-V, --version", "Display version number")
    .helpOption("-h, --help", "Display help for command")
    .addHelpText(
      "beforeAll",
      `\x1b[1m\x1b[36mChatbot Experiments\x1b[0m v${VERSION}\n\n`,
    )
    .addHelpText(
      "after",
      `\n\x1b[1mDocumentation:\x1b[0m https://github.com/nampq11/chatbot-experiments\n`,
    )
    .addHelpText(
      "after",
      `\x1b[1mSupport:\x1b[0m https://github.com/nampq11/chatbot-experiments/issues\n`,
    );

  program
    .description(
      `Start an interactive chat session with the Chatbot Experiments assistant.

\x1b[1mEXAMPLES\x1b[0m
  $ chatbot-experiments                    Start a new interactive session
  $ chatbot-experiments -s abc123         Resume existing session
  $ chatbot-experiments --verbose         Run with debug output

\x1b[1mINTERACTIVE COMMANDS\x1b[0m
  /quit    Exit the session
  /help    Show available commands
  /clear   Clear the conversation

\x1b[1mOPTIONS\x1b[0m`,
    )
    .option("-s, --session-id <id>", "Resume an existing session by ID")
    .option("-v, --verbose", "Enable verbose/debug output", false)
    .option("--no-input", "Disable interactive prompts (for scripting)")
    .action(async (options: RootCommandOptions) => {
      const runtime = await createCliRuntime(
        env,
        userId,
        options.verbose,
        getNoInputOverride(options),
      );

      try {
        await runCli(runtime, options.sessionId);
      } finally {
        await runtime.close();
      }
    });

  program
    .command("config")
    .description("Display the current server configuration")
    .option("-v, --verbose", "Show additional details", false)
    .action((options: ConfigCommandOptions) => {
      printConfig(env, VERSION, options.verbose);
    });

  addSessionCommands(program, env, userId);

  return program;
}
