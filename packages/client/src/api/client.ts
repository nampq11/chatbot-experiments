import {
  type RealtimeFrame,
  realtimeFrameSchema,
} from "@chatbot-experiments/protocol/realtime";
import type {
  Message,
  MessageRole,
  PaginatedSessionsResponse,
  Session,
} from "@chatbot-experiments/protocol/session";
import {
  messageArraySchema,
  messageSchema,
  paginatedSessionsSchema,
  parseWithFallback,
  sessionSchema,
} from "./schema";

type RequestFn = (url: string, options?: RequestInit) => Promise<Response>;
type RealtimeFrameHandler = (frame: RealtimeFrame) => void;
/** Error thrown when an HTTP API response returns a non-2xx status. */
export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`API error ${status}: ${responseBody}`);
    this.name = "ApiHttpError";
  }
}

type StreamRealtimeInput = {
  sessionId: string;
  signal?: AbortSignal;
  onFrame: RealtimeFrameHandler;
  onOpen?: () => void;
};

function defaultRequest(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, options);
}

async function assertResponseOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const text = await response.text();
  throw new ApiHttpError(response.status, text);
}

/**
 * Splits an SSE buffer into complete event chunks and the remaining unterminated tail.
 */
function splitCompleteEventChunks(buffer: string): {
  completeChunks: string[];
  tail: string;
} {
  const completeChunks: string[] = [];
  let remainingBuffer = buffer;

  while (true) {
    const boundaryIndex = remainingBuffer.indexOf("\n\n");

    if (boundaryIndex === -1) {
      return { completeChunks, tail: remainingBuffer };
    }

    completeChunks.push(remainingBuffer.slice(0, boundaryIndex));
    remainingBuffer = remainingBuffer.slice(boundaryIndex + 2);
  }
}

function normalizeSseLineEndings(buffer: string): string {
  return buffer.replace(/\r\n?/g, "\n");
}

function parseEventChunk(chunk: string): RealtimeFrame | null {
  const lines = chunk.split("\n");
  const dataLines: string[] = [];
  let eventName: string | null = null;

  for (const line of lines) {
    if (line.length === 0 || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trimStart();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return parseRealtimeFrame(dataLines.join("\n"), eventName);
}

function parseRealtimeFrame(
  payload: string,
  eventName: string | null,
): RealtimeFrame | null {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(payload);
  } catch (error) {
    console.warn("[Realtime] Ignoring invalid SSE JSON payload:", error);
    return null;
  }

  const parsedFrame = realtimeFrameSchema.safeParse(parsedPayload);

  if (!parsedFrame.success) {
    console.warn(
      "[Realtime] Ignoring invalid SSE frame:",
      parsedFrame.error.flatten(),
    );
    return null;
  }

  if (eventName && eventName !== parsedFrame.data.type) {
    console.warn(
      `[Realtime] Ignoring SSE frame with mismatched event name "${eventName}" and payload type "${parsedFrame.data.type}".`,
    );
    return null;
  }

  return parsedFrame.data;
}

async function consumeEventStream(
  body: ReadableStream<Uint8Array>,
  onFrame: RealtimeFrameHandler,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer = normalizeSseLineEndings(
        buffer + decoder.decode(value, { stream: true }),
      );

      const { completeChunks, tail } = splitCompleteEventChunks(buffer);
      buffer = tail;

      for (const chunk of completeChunks) {
        const frame = parseEventChunk(chunk);

        if (frame) {
          onFrame(frame);
        }
      }

      if (signal?.aborted) {
        return;
      }
    }

    const tailChunk = decoder.decode();

    if (tailChunk.length > 0) {
      buffer = normalizeSseLineEndings(buffer + tailChunk);
    }

    const { completeChunks } = splitCompleteEventChunks(buffer);

    for (const chunk of completeChunks) {
      const frame = parseEventChunk(chunk);

      if (frame) {
        onFrame(frame);
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      return;
    }

    throw error;
  } finally {
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readStringField(
  value: unknown,
  camelKey: string,
  snakeKey: string,
  fallback: string,
): string {
  if (!isRecord(value)) {
    return fallback;
  }

  const camelValue = value[camelKey];

  if (typeof camelValue === "string") {
    return camelValue;
  }

  const snakeValue = value[snakeKey];
  return typeof snakeValue === "string" ? snakeValue : fallback;
}

/** Builds a safe placeholder session when a response fails schema validation. */
function createSessionFallback(
  raw: unknown,
  defaults: Partial<Pick<Session, "id" | "title">> = {},
): Session {
  const timestamp = new Date(0);

  return {
    id: readStringField(raw, "id", "id", defaults.id ?? ""),
    userId: readStringField(raw, "userId", "user_id", ""),
    title: readStringField(raw, "title", "title", defaults.title ?? ""),
    status: "active",
    messageCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Builds a safe placeholder message when a response fails schema validation. */
function createMessageFallback(
  raw: unknown,
  defaults: Pick<Message, "content" | "role" | "sessionId">,
): Message {
  return {
    id: readStringField(raw, "id", "id", ""),
    sessionId: readStringField(
      raw,
      "sessionId",
      "session_id",
      defaults.sessionId,
    ),
    userId: readStringField(raw, "userId", "user_id", ""),
    sequence: 0,
    role: defaults.role,
    content: readStringField(raw, "content", "content", defaults.content),
    createdAt: new Date(0),
  };
}

export class ApiClient {
  private readonly request: RequestFn;

  constructor(
    private readonly baseUrl: string,
    private readonly getHeaders: () => Record<string, string>,
    requestFn?: RequestFn,
  ) {
    this.request = requestFn ?? defaultRequest;
  }

  private async fetchJson(
    path: string,
    options?: RequestInit,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers = { ...this.getHeaders(), ...options?.headers };
    const response = await this.request(url, { ...options, headers });

    await assertResponseOk(response);
    return response.json();
  }

  async listSessions(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedSessionsResponse> {
    const qs = new URLSearchParams();

    if (params?.cursor) {
      qs.set("cursor", params.cursor);
    }

    if (params?.limit) {
      qs.set("limit", String(params.limit));
    }

    const queryString = qs.toString();
    const url = queryString ? `/api/sessions?${queryString}` : "/api/sessions";
    const raw = await this.fetchJson(url);
    return parseWithFallback(
      paginatedSessionsSchema,
      raw,
      { items: [], nextCursor: null },
      "sessions list response",
    );
  }

  async createSession(title: string): Promise<Session> {
    const raw = await this.fetchJson("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    return parseWithFallback(
      sessionSchema,
      raw,
      createSessionFallback(raw, { title }),
      "create session response",
    );
  }

  async getSession(sessionId: string): Promise<Session> {
    const raw = await this.fetchJson(`/api/sessions/${sessionId}`);
    return parseWithFallback(
      sessionSchema,
      raw,
      createSessionFallback(raw, { id: sessionId }),
      "session detail response",
    );
  }

  async listMessages(sessionId: string): Promise<Message[]> {
    const raw = await this.fetchJson(`/api/sessions/${sessionId}/messages`);
    return parseWithFallback(
      messageArraySchema,
      raw,
      [],
      "messages list response",
    );
  }

  async appendMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
  ): Promise<Message> {
    const raw = await this.fetchJson(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
    return parseWithFallback(
      messageSchema,
      raw,
      createMessageFallback(raw, { sessionId, role, content }),
      "append message response",
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    const url = `${this.baseUrl}/api/sessions/${sessionId}`;
    const headers = { ...this.getHeaders() };
    const response = await this.request(url, {
      method: "DELETE",
      headers,
    });

    await assertResponseOk(response);
  }

  /** Deletes every chat session owned by the authenticated API user. */
  async deleteSessions(): Promise<void> {
    const url = `${this.baseUrl}/api/sessions`;
    const headers = { ...this.getHeaders() };
    const response = await this.request(url, {
      method: "DELETE",
      headers,
    });

    await assertResponseOk(response);
  }

  async streamRealtime(input: StreamRealtimeInput): Promise<void> {
    const qs = new URLSearchParams({ session_id: input.sessionId });
    const url = `${this.baseUrl}/api/realtime/stream?${qs.toString()}`;
    const headers = { ...this.getHeaders() };
    const response = await this.request(url, {
      method: "GET",
      headers,
      signal: input.signal,
    });

    await assertResponseOk(response);

    if (!response.body) {
      throw new Error("API error 200: missing stream body");
    }

    input.onOpen?.();
    await consumeEventStream(response.body, input.onFrame, input.signal);
  }
}
