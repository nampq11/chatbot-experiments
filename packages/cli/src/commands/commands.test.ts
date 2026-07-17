import { afterEach, describe, expect, it, vi } from "vitest";
import { createCliProgram } from "./commands.ts";
import { runCli } from "./handlers/default.ts";

const DEFAULT_CLI_USER_ID = "user-1";

const rl = {
  question: vi.fn(),
  close: vi.fn(),
};

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => rl),
}));

function captureStdout<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; output: string }> {
  const writes: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    writes.push(chunk);
    return true;
  }) as typeof process.stdout.write;

  return fn()
    .then((result) => ({ result, output: writes.join("") }))
    .finally(() => {
      process.stdout.write = originalWrite;
    });
}

afterEach(() => {
  vi.restoreAllMocks();
  rl.question.mockReset();
  rl.close.mockReset();
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("exit");
});

const env = {
  nodeEnv: "development" as const,
  host: "0.0.0.0",
  port: 8080,
  databaseUrl: "mysql://root:pass@127.0.0.1:3307/chatbot_experiments_test",
  corsOrigins: ["http://localhost:3000"],
  thinkingLevel: "medium" as const,
};

describe("runCli", () => {
  it("prints the resolved config and exits", async () => {
    const { output } = await captureStdout(() =>
      createCliProgram(env).parseAsync([
        "node",
        "chatbot-experiments",
        "config",
      ]),
    );

    expect(output).toContain("Chatbot Experiments Configuration");
    expect(output).toContain("NODE_ENV");
    expect(output).toContain("development");
    expect(output).toContain("DATABASE_URL");
    expect(output).toContain(
      "mysql://root:********@127.0.0.1:3307/chatbot_experiments_test",
    );
    expect(output).not.toContain("root:pass@");
  });

  it("creates a fresh session by default", async () => {
    rl.question.mockResolvedValueOnce("hello").mockResolvedValueOnce("/quit");

    const sessions = {
      createSession: vi.fn(async () => ({
        id: "session-1",
        title: "CLI session",
      })),
      getSession: vi.fn(),
      appendMessage: vi.fn(async () => ({ id: "message-1" })),
    };

    const agent = {
      startRun: vi.fn(async ({ sessionId, onStreamEvent }) => {
        onStreamEvent?.({
          type: "thinking.delta",
          sessionId,
          messageId: "assistant-1",
          delta: "thinking",
        });
        onStreamEvent?.({
          type: "assistant.message",
          sessionId,
          messageId: "assistant-1",
          message: "world",
        });
      }),
      resumeRun: vi.fn(),
      abortRun: vi.fn(),
    };

    const { output } = await captureStdout(() =>
      runCli({
        sessions: sessions as never,
        agent: agent as never,
        userId: DEFAULT_CLI_USER_ID,
        verbose: false,
        noInput: false,
      }),
    );

    expect(sessions.createSession).toHaveBeenCalledWith({
      userId: DEFAULT_CLI_USER_ID,
      title: "CLI session",
    });
    expect(sessions.appendMessage).toHaveBeenCalledWith({
      sessionId: "session-1",
      userId: DEFAULT_CLI_USER_ID,
      role: "user",
      content: "hello",
    });
    expect(agent.startRun).toHaveBeenCalledTimes(1);
    expect(output).toContain("session-1");
    expect(output).toContain("Commands:");
    expect(output).toContain("/quit");
    expect(output).toContain("/help");
    expect(output).toContain("/clear");
    expect(output).toContain("world");
    expect(output).toContain("Thinking");
    expect(output).toContain("Assistant");
  });

  it("renders thinking and assistant sections", async () => {
    rl.question.mockResolvedValueOnce("hello").mockResolvedValueOnce("/quit");

    const sessions = {
      createSession: vi.fn(async () => ({
        id: "session-1",
        title: "CLI session",
      })),
      getSession: vi.fn(),
      appendMessage: vi.fn(async () => ({ id: "message-1" })),
    };

    const agent = {
      startRun: vi.fn(async ({ sessionId, onStreamEvent }) => {
        onStreamEvent?.({
          type: "thinking.delta",
          sessionId,
          messageId: "assistant-1",
          delta: "thinking",
        });
        onStreamEvent?.({
          type: "assistant.message",
          sessionId,
          messageId: "assistant-1",
          message: "answer",
        });
      }),
      resumeRun: vi.fn(),
      abortRun: vi.fn(),
    };

    const { output } = await captureStdout(() =>
      runCli({
        sessions: sessions as never,
        agent: agent as never,
        userId: DEFAULT_CLI_USER_ID,
        verbose: false,
        noInput: false,
      }),
    );

    expect(output).toContain("Thinking");
    expect(output).toContain("Assistant");
    expect(output).toContain("thinking");
    expect(output).toContain("answer");
  });

  it("does not print the final assistant message after streamed text deltas", async () => {
    rl.question.mockResolvedValueOnce("hello").mockResolvedValueOnce("/quit");

    const sessions = {
      createSession: vi.fn(async () => ({
        id: "session-1",
        title: "CLI session",
      })),
      getSession: vi.fn(),
      appendMessage: vi.fn(async () => ({ id: "message-1" })),
    };

    const agent = {
      startRun: vi.fn(async ({ sessionId, onStreamEvent }) => {
        onStreamEvent?.({
          type: "message.delta",
          sessionId,
          messageId: "assistant-1",
          delta: "hel",
        });
        onStreamEvent?.({
          type: "message.delta",
          sessionId,
          messageId: "assistant-1",
          delta: "lo",
        });
        onStreamEvent?.({
          type: "assistant.message",
          sessionId,
          messageId: "assistant-1",
          message: "hello",
        });
      }),
      resumeRun: vi.fn(),
      abortRun: vi.fn(),
    };

    const { output } = await captureStdout(() =>
      runCli({
        sessions: sessions as never,
        agent: agent as never,
        userId: DEFAULT_CLI_USER_ID,
        verbose: false,
        noInput: false,
      }),
    );

    expect(output).toContain("hello");
    expect(output).not.toContain("hellohello");
  });

  it("prints the final assistant message when no text deltas are streamed", async () => {
    rl.question.mockResolvedValueOnce("hello").mockResolvedValueOnce("/quit");

    const sessions = {
      createSession: vi.fn(async () => ({
        id: "session-1",
        title: "CLI session",
      })),
      getSession: vi.fn(),
      appendMessage: vi.fn(async () => ({ id: "message-1" })),
    };

    const agent = {
      startRun: vi.fn(async ({ sessionId, onStreamEvent }) => {
        onStreamEvent?.({
          type: "assistant.message",
          sessionId,
          messageId: "assistant-1",
          message: "hello",
        });
      }),
      resumeRun: vi.fn(),
      abortRun: vi.fn(),
    };

    const { output } = await captureStdout(() =>
      runCli({
        sessions: sessions as never,
        agent: agent as never,
        userId: DEFAULT_CLI_USER_ID,
        verbose: false,
        noInput: false,
      }),
    );

    expect(output).toContain("hello");
  });

  it("exits cleanly when stdin closes", async () => {
    const sessions = {
      createSession: vi.fn(async () => ({
        id: "session-3",
        title: "CLI session",
      })),
      getSession: vi.fn(),
      appendMessage: vi.fn(),
    };

    const agent = {
      startRun: vi.fn(),
      resumeRun: vi.fn(),
      abortRun: vi.fn(),
    };

    rl.question.mockRejectedValueOnce(
      Object.assign(new Error("readline was closed"), {
        code: "ERR_USE_AFTER_CLOSE",
      }),
    );

    await expect(
      runCli({
        sessions: sessions as never,
        agent: agent as never,
        userId: DEFAULT_CLI_USER_ID,
        verbose: false,
        noInput: false,
      }),
    ).resolves.toBeUndefined();
    expect(rl.close).toHaveBeenCalled();
  });

  it("resumes an explicit session id", async () => {
    rl.question.mockResolvedValueOnce("/quit");

    const sessions = {
      createSession: vi.fn(),
      getSession: vi.fn(async () => ({ id: "session-2", title: "Existing" })),
      appendMessage: vi.fn(),
    };

    const agent = {
      startRun: vi.fn(),
      resumeRun: vi.fn(),
      abortRun: vi.fn(),
    };

    const { output } = await captureStdout(() =>
      runCli(
        {
          sessions: sessions as never,
          agent: agent as never,
          userId: DEFAULT_CLI_USER_ID,
          verbose: false,
          noInput: false,
        },
        "session-2",
      ),
    );

    expect(sessions.getSession).toHaveBeenCalledWith({
      sessionId: "session-2",
      userId: DEFAULT_CLI_USER_ID,
    });
    expect(sessions.createSession).not.toHaveBeenCalled();
    expect(output).toContain("session-2");
    expect(output).toContain("Commands:");
  });
});
