import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

const textEncoder = new TextEncoder();

function createResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

function createStreamResponse(chunks: string[]): Response {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(textEncoder.encode(chunk));
        }

        controller.close();
      },
    }),
  } as Response;
}

function createStreamRequest(chunks: string[]) {
  return vi.fn(async () => createStreamResponse(chunks));
}

describe("ApiClient", () => {
  it("parses snake_case paginated session payloads", async () => {
    const request = vi.fn(async () =>
      createResponse({
        items: [
          {
            id: "session-1",
            user_id: "user-1",
            title: "A session",
            status: "active",
            message_count: 2,
            created_at: "2026-05-21T00:00:00.000Z",
            updated_at: "2026-05-21T01:00:00.000Z",
          },
        ],
        next_cursor: "2026-05-21T01:00:00.000Z|session-1",
      }),
    );

    const client = new ApiClient("http://localhost", () => ({}), request);
    const result = await client.listSessions();

    expect(request).toHaveBeenCalledWith("http://localhost/api/sessions", expect.any(Object));
    expect(result).toEqual({
      items: [
        {
          id: "session-1",
          userId: "user-1",
          title: "A session",
          status: "active",
          messageCount: 2,
          createdAt: new Date("2026-05-21T00:00:00.000Z"),
          updatedAt: new Date("2026-05-21T01:00:00.000Z"),
        },
      ],
      nextCursor: "2026-05-21T01:00:00.000Z|session-1",
    });
  });

  it("uses an explicit fallback when a sessions response drifts", async () => {
    const request = vi.fn(async () =>
      createResponse({
        items: [],
        next_cursor: 123,
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const client = new ApiClient("http://localhost", () => ({}), request);

    await expect(client.listSessions()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("sends a delete-all-sessions request", async () => {
    const request = vi.fn(async () => createResponse(null));
    const client = new ApiClient("http://localhost", () => ({ "x-user-id": "user-1" }), request);

    await expect(client.deleteSessions()).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith("http://localhost/api/sessions", {
      method: "DELETE",
      headers: { "x-user-id": "user-1" },
    });
  });

  it("parses split SSE chunks into realtime frames", async () => {
    const request = createStreamRequest([
      "event: message.delta\n",
      'data: {"type":"message.delta","sessionId":"session-1",',
      '"messageId":"message-1","delta":"Hel',
      'lo"}\n\n',
    ]);
    const client = new ApiClient("http://localhost", () => ({ "x-user-id": "user-1" }), request);
    const onFrame = vi.fn();

    await client.streamRealtime({ sessionId: "session-1", onFrame });

    expect(request).toHaveBeenCalledWith(
      "http://localhost/api/realtime/stream?session_id=session-1",
      expect.objectContaining({
        headers: { "x-user-id": "user-1" },
      }),
    );
    expect(onFrame).toHaveBeenCalledWith({
      type: "message.delta",
      sessionId: "session-1",
      messageId: "message-1",
      delta: "Hello",
    });
  });

  it("ignores SSE keepalive comments and parses multiple events in one chunk", async () => {
    const request = createStreamRequest([
      ': keepalive\n\nevent: session.created\ndata: {"type":"session.created","sessionId":"session-1","userId":"user-1"}\n\nevent: agent.run.completed\ndata: {"type":"agent.run.completed","sessionId":"session-1","runId":"run-1"}\n\n',
    ]);
    const client = new ApiClient("http://localhost", () => ({}), request);
    const onFrame = vi.fn();

    await client.streamRealtime({ sessionId: "session-1", onFrame });

    expect(onFrame).toHaveBeenNthCalledWith(1, {
      type: "session.created",
      sessionId: "session-1",
      userId: "user-1",
    });
    expect(onFrame).toHaveBeenNthCalledWith(2, {
      type: "agent.run.completed",
      sessionId: "session-1",
      runId: "run-1",
    });
  });

  it("parses CRLF-delimited SSE frames", async () => {
    const request = createStreamRequest([
      'event: session.created\r\ndata: {"type":"session.created","sessionId":"session-1","userId":"user-1"}\r\n\r\n',
    ]);
    const client = new ApiClient("http://localhost", () => ({}), request);
    const onFrame = vi.fn();

    await client.streamRealtime({ sessionId: "session-1", onFrame });

    expect(onFrame).toHaveBeenCalledWith({
      type: "session.created",
      sessionId: "session-1",
      userId: "user-1",
    });
  });

  it("ignores malformed SSE payloads without aborting the stream", async () => {
    const request = createStreamRequest([
      'event: message.delta\ndata: {"type":"message.delta","sessionId":"session-1","messageId":"message-1","delta":\n\n',
      'event: agent.run.completed\ndata: {"type":"agent.run.completed","sessionId":"session-1","runId":"run-1"}\n\n',
    ]);
    const client = new ApiClient("http://localhost", () => ({}), request);
    const onFrame = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(client.streamRealtime({ sessionId: "session-1", onFrame })).resolves.toBeUndefined();

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith({
      type: "agent.run.completed",
      sessionId: "session-1",
      runId: "run-1",
    });
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("ignores SSE frames whose event name does not match the payload type", async () => {
    const request = createStreamRequest([
      'event: session.created\ndata: {"type":"session.deleted","sessionId":"session-1","userId":"user-1"}\n\n',
    ]);
    const client = new ApiClient("http://localhost", () => ({}), request);
    const onFrame = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await client.streamRealtime({ sessionId: "session-1", onFrame });

    expect(onFrame).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[Realtime] Ignoring SSE frame with mismatched event name "session.created" and payload type "session.deleted".',
    );

    warn.mockRestore();
  });

  it("discards an incomplete trailing SSE frame at EOF", async () => {
    const request = createStreamRequest([
      'event: session.created\ndata: {"type":"session.created","sessionId":"session-1","userId":"user-1"}\n\n',
      'event: message.delta\ndata: {"type":"message.delta","sessionId":"session-1","messageId":"message-1","delta":"Hel',
    ]);
    const client = new ApiClient("http://localhost", () => ({}), request);
    const onFrame = vi.fn();

    await expect(client.streamRealtime({ sessionId: "session-1", onFrame })).resolves.toBeUndefined();

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith({
      type: "session.created",
      sessionId: "session-1",
      userId: "user-1",
    });
  });
});
