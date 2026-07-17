import { once } from "node:events";
import { createServer } from "node:http";
import { RealtimeHub } from "@chatbot-experiments/core/realtime";
import type { RequestHandler } from "express";
import express from "express";
import { describe, expect, it } from "vitest";
import "../../src/auth.ts";
import {
  createRealtimeStreamTransport,
  type RealtimeStreamOptions,
  type RealtimeStreamTransport,
} from "../../src/realtime/sse-transport.ts";

type HttpServer = ReturnType<typeof createServer>;

interface RealtimeServerOptions {
  readonly beforeStream?: RequestHandler;
  readonly streamOptions?: RealtimeStreamOptions;
}

interface RealtimeServerFixture {
  readonly server: HttpServer;
  readonly transport: RealtimeStreamTransport;
}

async function createRealtimeServer(
  options: RealtimeServerOptions = {},
): Promise<RealtimeServerFixture> {
  const app = express();
  const transport = createRealtimeStreamTransport(options.streamOptions);

  app.use((req, _res, next) => {
    const userId = req.header("x-user-id");

    if (userId) {
      req.user = { id: userId };
    }

    next();
  });

  if (options.beforeStream) {
    app.use("/api/realtime/stream", options.beforeStream);
  }

  app.get("/api/realtime/stream", transport.handler);

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  return { server, transport };
}

function getServerPort(server: HttpServer): number {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("no port");
  }

  return address.port;
}

async function closeServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function writeChunkToText(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk.toString("utf8");
  }

  return "";
}

describe("createRealtimeStreamTransport", () => {
  it("delivers broadcast frames to connected SSE clients", async () => {
    const hub = new RealtimeHub();
    const { server } = await createRealtimeServer({
      streamOptions: {
        hub,
        validateSessionOwnership: async (sessionId, userId) =>
          sessionId === "session-123" && userId === "user-1",
      },
    });

    try {
      const response = await fetch(
        `http://127.0.0.1:${getServerPort(server)}/api/realtime/stream?session_id=session-123`,
        { headers: { "x-user-id": "user-1" } },
      );

      expect(response.status).toBe(200);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("missing response body");
      }

      hub.broadcast(
        { type: "session", id: "session-123" },
        { type: "session.created", sessionId: "session-123", userId: "user-1" },
      );

      const { value, done } = await reader.read();
      const body = done ? "" : new TextDecoder().decode(value);

      await reader.cancel();

      expect(body).toContain("event: session.created");
      expect(body).toContain('"sessionId":"session-123"');
    } finally {
      await closeServer(server);
    }
  });

  it("rejects session-scoped streams for non-owners", async () => {
    const { server } = await createRealtimeServer({
      streamOptions: {
        validateSessionOwnership: async (sessionId, userId) =>
          sessionId === "session-owned" && userId === "owner-user",
      },
    });

    try {
      const response = await fetch(
        `http://127.0.0.1:${getServerPort(server)}/api/realtime/stream?session_id=session-owned`,
        { headers: { "x-user-id": "other-user" } },
      );

      expect(response.status).toBe(403);
    } finally {
      await closeServer(server);
    }
  });

  it("rejects session-scoped streams without user identity", async () => {
    const { server } = await createRealtimeServer({
      streamOptions: {
        validateSessionOwnership: async () => true,
      },
    });

    try {
      const response = await fetch(
        `http://127.0.0.1:${getServerPort(server)}/api/realtime/stream?session_id=session-owned`,
      );

      expect(response.status).toBe(401);
    } finally {
      await closeServer(server);
    }
  });

  it("returns 500 when session ownership validation fails unexpectedly", async () => {
    const { server } = await createRealtimeServer({
      streamOptions: {
        validateSessionOwnership: async () => {
          throw new Error("database unavailable");
        },
      },
    });

    try {
      const response = await fetch(
        `http://127.0.0.1:${getServerPort(server)}/api/realtime/stream?session_id=session-owned`,
        { headers: { "x-user-id": "user-1" } },
      );

      expect(response.status).toBe(500);
    } finally {
      await closeServer(server);
    }
  });

  it("keeps subscribers connected while writes are backpressured", async () => {
    const hub = new RealtimeHub();
    let firstRealtimeWrite = true;
    const { server } = await createRealtimeServer({
      beforeStream: (_req, res, next) => {
        const originalWrite = res.write.bind(res) as typeof res.write;

        res.write = ((...args: Parameters<typeof res.write>) => {
          const [chunk] = args;
          const text = writeChunkToText(chunk);

          const result = originalWrite(...args);

          if (firstRealtimeWrite && text.startsWith("event:")) {
            firstRealtimeWrite = false;
            queueMicrotask(() => {
              res.emit("drain");
            });
            return false;
          }

          return result;
        }) as typeof res.write;

        next();
      },
      streamOptions: {
        hub,
        validateSessionOwnership: async () => true,
      },
    });

    try {
      const response = await fetch(
        `http://127.0.0.1:${getServerPort(server)}/api/realtime/stream?session_id=session-123`,
        { headers: { "x-user-id": "user-1" } },
      );

      expect(response.status).toBe(200);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("missing response body");
      }

      hub.broadcast(
        { type: "session", id: "session-123" },
        {
          type: "message.delta",
          sessionId: "session-123",
          messageId: "message-1",
          delta: "hello",
        },
      );
      hub.broadcast(
        { type: "session", id: "session-123" },
        {
          type: "message.delta",
          sessionId: "session-123",
          messageId: "message-2",
          delta: "world",
        },
      );

      let body = "";
      while (!body.includes('"messageId":"message-2"')) {
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            setTimeout(
              () => reject(new Error("timed out waiting for SSE payload")),
              1000,
            );
          }),
        ]);

        if (done) {
          break;
        }

        body += new TextDecoder().decode(value);
      }

      await reader.cancel();

      expect(body).toContain('"messageId":"message-1"');
      expect(body).toContain('"messageId":"message-2"');
    } finally {
      await closeServer(server);
    }
  });

  it("closes active SSE streams during shutdown", async () => {
    const { server, transport } = await createRealtimeServer({
      streamOptions: {
        validateSessionOwnership: async () => true,
      },
    });

    try {
      const response = await fetch(
        `http://127.0.0.1:${getServerPort(server)}/api/realtime/stream?session_id=session-123`,
        { headers: { "x-user-id": "user-1" } },
      );

      expect(response.status).toBe(200);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("missing response body");
      }

      const serverClosed = closeServer(server);
      transport.closeAll("server shutdown");
      server.closeIdleConnections();

      const { done } = await reader.read();

      expect(done).toBe(true);
      await serverClosed;
    } finally {
      if (server.listening) {
        await closeServer(server);
      }
    }
  });
});
