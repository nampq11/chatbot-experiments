import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createAgentRuntime } from "@chatbot-experiments/agent-runtime";
import { AgentService } from "@chatbot-experiments/core/agent";
import {
  createInMemoryEventBus,
  type EventListenerFailure,
} from "@chatbot-experiments/core/events";
import {
  SessionForbiddenError,
  SessionNotFoundError,
  SessionUseCases,
} from "@chatbot-experiments/core/session";
import {
  createDatabaseClient,
  createDatabaseRepositories,
  runMigrations,
} from "@chatbot-experiments/database";
import { createApp } from "./app.ts";
import { loadEnv } from "./env.ts";
import { RealtimeNotifier } from "./realtime/realtime-notifier.ts";
import { createRealtimeStreamTransport } from "./realtime/sse-transport.ts";

async function start(): Promise<void> {
  const env = loadEnv();
  await runMigrations(env.databaseUrl);
  const database = await createDatabaseClient(env.databaseUrl);
  const { sessionRepository, agentRunStore } =
    createDatabaseRepositories(database);
  function reportListenerFailure({ event, error }: EventListenerFailure): void {
    console.error(`${event.type} listener failed:`, error);
  }
  const events = createInMemoryEventBus({ onFailure: reportListenerFailure });
  const realtimeNotifier = new RealtimeNotifier(events);
  realtimeNotifier.start();
  const runtime = createAgentRuntime({
    transcriptRepository: sessionRepository,
    agentRunStore,
    publishEvent: (event) => {
      events.publish(event);
    },
    thinkingLevel: env.thinkingLevel,
  });
  const sessionUseCases = new SessionUseCases(sessionRepository, events, {
    generate: randomUUID,
  });
  const agent = new AgentService(runtime);
  function startAgentRunForUserMessage({
    sessionId,
    messageId,
    userId,
  }: {
    readonly sessionId: string;
    readonly messageId: string;
    readonly userId: string;
  }): void {
    const assistantMessageId = randomUUID();
    const runId = randomUUID();

    void agent
      .startRun({
        runId,
        sessionId,
        messageId,
        assistantMessageId,
        userId,
        onStreamEvent: (event) => {
          realtimeNotifier.broadcastSessionFrame(event);
        },
      })
      .catch((error: unknown) => {
        console.error(
          `[agent] startRun failed for session ${sessionId}:`,
          error,
        );
      });
  }

  const realtimeTransport = createRealtimeStreamTransport({
    hub: realtimeNotifier,
    validateSessionOwnership: async (sessionId, userId) => {
      try {
        await sessionUseCases.getSession({ sessionId, userId });
        return true;
      } catch (error) {
        if (
          error instanceof SessionForbiddenError ||
          error instanceof SessionNotFoundError
        ) {
          return false;
        }

        throw error;
      }
    },
  });

  const app = createApp({
    readinessCheck: () => database.ping(),
    corsOrigins: env.corsOrigins,
    apiRouterDependencies: {
      sessions: sessionUseCases,
      startAgentRunForUserMessage,
    },
    realtimeStreamHandler: realtimeTransport.handler,
  });
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(env.port, env.host, resolve);
  });

  console.info(`server listening on http://${env.host}:${env.port}`);

  async function shutdown(): Promise<void> {
    try {
      realtimeNotifier.stop();
      const serverClosed = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      realtimeTransport.closeAll("server shutdown");
      server.closeIdleConnections();
      await serverClosed;
      await database.close();
    } catch (error: unknown) {
      console.error("shutdown error:", error);
      throw error;
    }
  }

  async function handleSignal(): Promise<void> {
    try {
      await shutdown();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  }

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

if (!process.env.VITEST) {
  void start().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
