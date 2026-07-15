import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { AgentStreamEvent } from "@dentaltrip-ai/core/agent";
import type { CliDependencies } from "../../services/runtime.ts";

type CliReadline = ReturnType<typeof createInterface>;
type DisplayPhase = "none" | "thinking" | "assistant";
type InteractiveCommandResult = "quit" | "handled" | "message";

function writeInteractiveCommands(helpDescription: string): void {
  output.write(`  \x1b[33m/quit\x1b[0m    Exit the session\n`);
  output.write(`  \x1b[33m/help\x1b[0m   ${helpDescription}\n`);
  output.write(`  \x1b[33m/clear\x1b[0m  Clear the conversation\n`);
}

function writeSessionIntro(sessionId: string): void {
  output.write(`\x1b[1m\x1b[32m✓\x1b[0m Session \x1b[1m${sessionId}\x1b[0m\n\n`);
  output.write(`\x1b[1mCommands:\x1b[0m\n`);
  writeInteractiveCommands("Show available commands");
  output.write("\n");
}

function writeInteractiveHelp(): void {
  output.write(`\n\x1b[1mAvailable commands:\x1b[0m\n`);
  writeInteractiveCommands("Show this help message");
  output.write("\n");
}

function clearConversation(sessionId: string): void {
  try {
    output.write("\x1b[2J\x1b[H");
  } catch {
    output.write("\n".repeat(50));
  }

  output.write(`\x1b[1m\x1b[32m✓\x1b[0m Conversation cleared. Session: \x1b[1m${sessionId}\x1b[0m\n\n`);
}

function handleInteractiveCommand(command: string, sessionId: string): InteractiveCommandResult {
  switch (command) {
    case "/quit":
      return "quit";
    case "/help":
      writeInteractiveHelp();
      return "handled";
    case "/clear":
      clearConversation(sessionId);
      return "handled";
    default:
      return "message";
  }
}

function isReadlineClosedError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ERR_USE_AFTER_CLOSE";
}

async function readPrompt(rl: CliReadline): Promise<string | undefined> {
  try {
    return await rl.question("> ");
  } catch (error: unknown) {
    if (isReadlineClosedError(error)) {
      return undefined;
    }

    throw error;
  }
}

/** Creates a per-run stream renderer that avoids printing final assistant text twice after deltas. */
function createCliStreamRenderer(): (event: AgentStreamEvent) => void {
  let displayPhase: DisplayPhase = "none";
  let streamedAssistantText = false;

  function writeAssistantHeaderIfNeeded(): void {
    if (displayPhase === "assistant") {
      return;
    }

    output.write(displayPhase === "thinking" ? `\n\n` : `\n`);
    output.write(`\x1b[1mAssistant\x1b[0m\n`);
    displayPhase = "assistant";
  }

  return (event) => {
    switch (event.type) {
      case "thinking.delta":
        if (displayPhase === "none") {
          output.write(`\n\x1b[1mThinking\x1b[0m\n`);
          displayPhase = "thinking";
        }

        output.write(event.delta);
        break;
      case "message.delta":
        streamedAssistantText = true;
        writeAssistantHeaderIfNeeded();
        output.write(event.delta);
        break;
      case "assistant.message":
        if (streamedAssistantText) {
          return;
        }

        writeAssistantHeaderIfNeeded();
        output.write(event.message);
        break;
      default:
        break;
    }
  };
}

/** Starts the interactive chat loop for a new or existing session. */
export async function runCli(dependencies: CliDependencies, sessionId?: string): Promise<void> {
  const { sessions, agent, userId, verbose, noInput } = dependencies;

  if (noInput) {
    output.write("\x1b[1m\x1b[31mError:\x1b[0m Cannot run interactive mode in non-interactive context.\n");
    output.write("\x1b[1mHint:\x1b[0m Run in an interactive terminal and omit --no-input.\n");
    output.write("\nRun \x1b[1mdentaltrip-ai --help\x1b[0m for more information.\n");
    process.exit(1);
  }

  const state = sessionId
    ? await sessions.getSession({ sessionId, userId })
    : await sessions.createSession({ userId, title: "CLI session" });

  const rl = createInterface({
    input,
    output,
    terminal: input.isTTY && output.isTTY,
  });
  let activeRun: AbortController | null = null;

  async function shutdown(): Promise<void> {
    activeRun?.abort();
    rl.close();
    if (verbose) {
      output.write("\x1b[90m[DEBUG] Session ended\x1b[0m\n");
    }
  }

  function handleSigint(): void {
    if (activeRun) {
      activeRun.abort();
      output.write("\n\x1b[90mAgent run cancelled\x1b[0m\n");
      return;
    }

    output.write("\n\x1b[90mUse /quit to exit gracefully\x1b[0m\n");
  }

  function abortActiveRun(): void {
    activeRun?.abort();
  }

  process.once("SIGINT", handleSigint);
  process.once("exit", abortActiveRun);

  try {
    writeSessionIntro(state.id);

    while (true) {
      const content = await readPrompt(rl);

      if (content === undefined) {
        break;
      }

      const trimmedContent = content.trim();

      if (!trimmedContent) {
        continue;
      }

      const commandResult = handleInteractiveCommand(trimmedContent, state.id);

      if (commandResult === "quit") {
        break;
      }

      if (commandResult === "handled") {
        continue;
      }

      const message = await sessions.appendMessage({
        sessionId: state.id,
        userId,
        role: "user",
        content,
      });

      activeRun?.abort();
      const runController = new AbortController();
      activeRun = runController;

      if (verbose) {
        output.write(`\x1b[90m[DEBUG] Starting agent run for message ${message.id}\x1b[0m\n`);
      }

      const renderStreamEvent = createCliStreamRenderer();

      try {
        await agent.startRun({
          sessionId: state.id,
          messageId: message.id,
          assistantMessageId: randomUUID(),
          userId,
          signal: runController.signal,
          onStreamEvent: renderStreamEvent,
        });
      } finally {
        if (activeRun === runController) {
          activeRun = null;
        }
      }

      output.write("\n");
    }
  } finally {
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("exit", abortActiveRun);
    await shutdown();
  }
}
