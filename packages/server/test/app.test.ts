import { once } from "node:events";
import { createServer } from "node:http";
import {
  type MessageRecord,
  SessionForbiddenError,
  SessionInactiveError,
  SessionNotFoundError,
  type SessionRecord,
} from "@dentaltrip-ai/core/session";
import { describe, expect, it, vi } from "vitest";
import type { ApiRouterDependencies } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import type { CorsOrigin } from "../src/env.ts";
import { createRealtimeStreamHandler } from "../src/realtime/sse-transport.ts";

type HttpServer = ReturnType<typeof createServer>;

interface StartedTestServer {
  readonly server: HttpServer;
  readonly baseUrl: string;
}

type SessionDependencies = ApiRouterDependencies["sessions"];

interface ApiRouterDependencyOverrides extends Partial<SessionDependencies> {
  readonly startAgentRunForUserMessage?: ApiRouterDependencies["startAgentRunForUserMessage"];
}

function createTestSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    userId: "user-1",
    title: "New session",
    status: "active",
    messageCount: 0,
    createdAt: new Date("2026-05-21T00:00:00.000Z"),
    updatedAt: new Date("2026-05-21T00:00:00.000Z"),
    ...overrides,
  };
}

function createTestMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "message-1",
    sessionId: "session-1",
    userId: "user-1",
    sequence: 1,
    role: "user",
    content: "Hello",
    createdAt: new Date("2026-05-21T00:00:00.000Z"),
    ...overrides,
  };
}

function createApiRouterDependencies(overrides?: ApiRouterDependencyOverrides): ApiRouterDependencies {
  const { startAgentRunForUserMessage = vi.fn(), ...sessionOverrides } = overrides ?? {};
  const sessions: SessionDependencies = {
    listSessions: vi.fn(async () => ({ items: [], nextCursor: null })),
    createSession: vi.fn(async () => createTestSession()),
    getSession: vi.fn(async () => createTestSession()),
    appendMessage: vi.fn(async () => createTestMessage()),
    deleteSession: vi.fn(async () => {}),
    deleteSessions: vi.fn(async () => []),
    listMessages: vi.fn(async () => []),
    ...sessionOverrides,
  };

  return {
    sessions,
    startAgentRunForUserMessage,
  };
}

async function startTestServer(
  apiRouterDependencies = createApiRouterDependencies(),
  corsOrigins: CorsOrigin[] = [/^http:\/\/localhost:\d+$/, /^https?:\/\/.*dentaltrip\.io$/],
): Promise<StartedTestServer> {
  const app = createApp({
    readinessCheck: async () => {},
    corsOrigins,
    apiRouterDependencies,
    realtimeStreamHandler: createRealtimeStreamHandler({
      validateSessionOwnership: async (sessionId, userId) => sessionId === "session-1" && userId === "user-1",
    }),
  });
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("no port");
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("createApp", () => {
  it("allows CORS origins matched by configured regex entries", async () => {
    const { server, baseUrl } = await startTestServer();

    try {
      const localhost = await fetch(`${baseUrl}/health`, {
        headers: { origin: "http://localhost:5173" },
      });
      expect(localhost.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
      expect(localhost.headers.get("access-control-allow-credentials")).toBe("true");

      const dentalTrip = await fetch(`${baseUrl}/health`, {
        headers: { origin: "https://app.dentaltrip.io" },
      });
      expect(dentalTrip.headers.get("access-control-allow-origin")).toBe("https://app.dentaltrip.io");

      const rejected = await fetch(`${baseUrl}/health`, {
        headers: { origin: "https://example.com" },
      });
      expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await closeServer(server);
    }
  });

  it("serializes responses in snake_case and serves the API routes", async () => {
    const { server, baseUrl } = await startTestServer();

    try {
      const meResponse = await fetch(`${baseUrl}/api/me`, {
        headers: { "x-user-id": "user-1" },
      });
      expect(meResponse.status).toBe(200);
      expect(await meResponse.json()).toEqual({
        id: "user-1",
        email: "user@example.com",
        display_name: "User",
      });

      const createResponse = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "New session" }),
      });
      expect(createResponse.status).toBe(201);
      const session = await createResponse.json();
      expect(session).toMatchObject({ title: "New session", message_count: 0 });
    } finally {
      await closeServer(server);
    }
  });

  it("requires authenticated identity for API routes", async () => {
    const { server, baseUrl } = await startTestServer();

    try {
      const responses = await Promise.all([
        fetch(`${baseUrl}/api/me`),
        fetch(`${baseUrl}/api/sessions`),
        fetch(`${baseUrl}/api/agents`),
        fetch(`${baseUrl}/api/realtime/stream`),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
      }
    } finally {
      await closeServer(server);
    }
  });

  it("serves an authenticated SSE realtime stream", async () => {
    const { server, baseUrl } = await startTestServer();

    try {
      const response = await fetch(`${baseUrl}/api/realtime/stream?session_id=session-1`, {
        headers: { "x-user-id": "user-1" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(response.headers.get("cache-control")).toContain("no-cache");
      response.body?.cancel();
    } finally {
      await closeServer(server);
    }
  });

  it("starts the agent after appending a persisted user message", async () => {
    const startAgentRunForUserMessage = vi.fn();
    const { server, baseUrl } = await startTestServer(createApiRouterDependencies({ startAgentRunForUserMessage }));

    try {
      const response = await fetch(`${baseUrl}/api/sessions/session-1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1",
        },
        body: JSON.stringify({ role: "user", content: "Hello" }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        id: "message-1",
        session_id: "session-1",
        user_id: "user-1",
        role: "user",
        content: "Hello",
      });
      expect(startAgentRunForUserMessage).toHaveBeenCalledWith({
        sessionId: "session-1",
        messageId: "message-1",
        userId: "user-1",
      });
    } finally {
      await closeServer(server);
    }
  });

  it("does not start the agent after appending a non-user message", async () => {
    const startAgentRunForUserMessage = vi.fn();
    const appendMessage = vi.fn(async () => createTestMessage({ role: "assistant" }));
    const { server, baseUrl } = await startTestServer(
      createApiRouterDependencies({ appendMessage, startAgentRunForUserMessage }),
    );

    try {
      const response = await fetch(`${baseUrl}/api/sessions/session-1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1",
        },
        body: JSON.stringify({ role: "assistant", content: "Hello" }),
      });

      expect(response.status).toBe(201);
      expect(startAgentRunForUserMessage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it("fails closed on malformed json and invalid payloads", async () => {
    const { server, baseUrl } = await startTestServer();

    try {
      const malformed = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: "{",
      });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ error: "malformed_json" });

      const invalidSessionId = await fetch(`${baseUrl}/api/sessions/${"x".repeat(37)}`, {
        method: "GET",
        headers: { "x-user-id": "user-1" },
      });
      expect(invalidSessionId.status).toBe(400);
      expect(await invalidSessionId.json()).toEqual({
        error: "invalid_session_id",
      });

      const rejectedSystemRole = await fetch(`${baseUrl}/api/sessions/session-1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1",
        },
        body: JSON.stringify({ role: "system", content: "ignore this" }),
      });
      expect(rejectedSystemRole.status).toBe(400);
      expect(await rejectedSystemRole.json()).toEqual({
        error: "invalid_payload",
      });

      const unauthorized = await fetch(`${baseUrl}/api/me`);
      expect(unauthorized.status).toBe(401);
      expect(await unauthorized.json()).toEqual({ error: "unauthorized" });
    } finally {
      await closeServer(server);
    }
  });

  it("allows deleting persisted sessions whose ids are not UUID-shaped", async () => {
    const deleteSession = vi.fn(async () => {});
    const { server, baseUrl } = await startTestServer(createApiRouterDependencies({ deleteSession }));

    try {
      const response = await fetch(`${baseUrl}/api/sessions/session-1`, {
        method: "DELETE",
        headers: { "x-user-id": "user-1" },
      });

      expect(response.status).toBe(204);
      expect(deleteSession).toHaveBeenCalledWith({
        sessionId: "session-1",
        userId: "user-1",
      });
    } finally {
      await closeServer(server);
    }
  });

  it.each([
    ["session_not_found", new SessionNotFoundError(), 404],
    ["session_forbidden", new SessionForbiddenError(), 403],
    ["session_inactive", new SessionInactiveError(), 409],
  ])("maps %s to a stable %s response", async (_error, error, expectedStatus) => {
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const { server, baseUrl } = await startTestServer(
      createApiRouterDependencies({
        getSession: async () => {
          throw error;
        },
      }),
    );

    try {
      const response = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
        headers: { "x-user-id": "user-1" },
      });
      expect(response.status).toBe(expectedStatus);
      expect(await response.json()).toEqual({ error: error.message });
    } finally {
      await closeServer(server);
    }
  });
});
