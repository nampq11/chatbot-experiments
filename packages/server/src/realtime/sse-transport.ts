import {
  type RealtimeFrame,
  RealtimeHub,
  type RealtimeScope,
  type RealtimeSubscriber,
} from "@chatbot-experiments/core/realtime";
import { realtimeFrameSchema } from "@chatbot-experiments/protocol/realtime";
import type { RequestHandler, Response } from "express";

const KEEPALIVE_INTERVAL_MS = 15000;
const MAX_BUFFERED_SSE_BYTES = 256 * 1024;

/**
 * Validates that a user owns a session before allowing a session-scoped stream.
 */
export type SessionOwnershipValidator = (
  sessionId: string,
  userId: string,
) => Promise<boolean>;

/** Dependencies for constructing an authenticated realtime SSE transport. */
export interface RealtimeStreamOptions {
  hub?: RealtimeSubscriberRegistry;
  validateSessionOwnership?: SessionOwnershipValidator;
}

/** Minimal subscriber registry contract required by the SSE transport. */
export interface RealtimeSubscriberRegistry {
  register(scope: RealtimeScope, subscriber: RealtimeSubscriber): void;
  unregister(scope: RealtimeScope, subscriber: RealtimeSubscriber): void;
}

interface SseSubscriber extends RealtimeSubscriber {
  keepAlive(): void;
}

/** Coordinates the SSE request handler and the active long-lived stream connections it owns. */
export interface RealtimeStreamTransport {
  handler: RequestHandler;
  closeAll(reason?: string): void;
}

/**
 * Creates the SSE transport used for authenticated realtime chat updates.
 */
export function createRealtimeStreamTransport(
  options: RealtimeStreamOptions = {},
): RealtimeStreamTransport {
  const { hub = new RealtimeHub(), validateSessionOwnership } = options;
  const activeSubscribers = new Set<SseSubscriber>();

  const handler: RequestHandler = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const sessionId =
      typeof req.query.session_id === "string" && req.query.session_id.trim()
        ? req.query.session_id.trim()
        : null;

    if (sessionId && !validateSessionOwnership) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (sessionId) {
      try {
        const isOwner = await validateSessionOwnership?.(sessionId, userId);

        if (isOwner !== true) {
          res.status(403).json({ error: "session_forbidden" });
          return;
        }
      } catch {
        // Ownership checks cross the persistence boundary; translate unexpected failures to a safe HTTP error.
        res.status(500).json({ error: "internal_error" });
        return;
      }
    }

    const scope: RealtimeScope = sessionId
      ? { type: "session", id: sessionId }
      : { type: "user", id: userId };

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const subscriber = createSseSubscriber(res);
    activeSubscribers.add(subscriber);
    hub.register(scope, subscriber);

    const keepAlive = setInterval(() => {
      subscriber.keepAlive();
    }, KEEPALIVE_INTERVAL_MS);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      clearInterval(keepAlive);
      activeSubscribers.delete(subscriber);
      hub.unregister(scope, subscriber);
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  };

  return {
    handler,
    closeAll(reason) {
      for (const subscriber of [...activeSubscribers]) {
        subscriber.close(reason);
      }
    },
  };
}

/**
 * Creates an authenticated SSE stream handler for realtime chat updates.
 */
export function createRealtimeStreamHandler(
  options: RealtimeStreamOptions = {},
): RequestHandler {
  return createRealtimeStreamTransport(options).handler;
}

/**
 * Wraps an HTTP response as an SSE subscriber with bounded buffering across backpressure events.
 */
function createSseSubscriber(res: Response): SseSubscriber {
  const queuedChunks: string[] = [];
  let queuedBytes = 0;
  let waitingForDrain = false;
  let closed = false;

  const closeStream = () => {
    if (closed) {
      return;
    }

    closed = true;
    queuedChunks.length = 0;
    queuedBytes = 0;

    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  };

  const writeChunk = (chunk: string): boolean => {
    if (closed || res.writableEnded || res.destroyed) {
      return false;
    }

    try {
      if (res.write(chunk) === false) {
        waitingForDrain = true;
      }

      return true;
    } catch {
      // ServerResponse.write can throw if the socket closes between liveness checks; translate that to a fatal send failure.
      return false;
    }
  };

  const flushQueuedChunks = () => {
    waitingForDrain = false;

    while (!waitingForDrain && queuedChunks.length > 0) {
      const chunk = queuedChunks.shift();

      if (!chunk) {
        continue;
      }

      queuedBytes -= Buffer.byteLength(chunk);

      if (!writeChunk(chunk)) {
        closeStream();
        return;
      }
    }
  };

  const enqueueChunk = (chunk: string): boolean => {
    if (closed || res.writableEnded || res.destroyed) {
      return false;
    }

    if (waitingForDrain || queuedChunks.length > 0) {
      const chunkBytes = Buffer.byteLength(chunk);

      if (queuedBytes + chunkBytes > MAX_BUFFERED_SSE_BYTES) {
        return false;
      }

      queuedChunks.push(chunk);
      queuedBytes += chunkBytes;
      return true;
    }

    return writeChunk(chunk);
  };

  res.on("drain", flushQueuedChunks);

  return {
    send(frame: RealtimeFrame): boolean {
      const formattedFrame = formatSseFrame(frame);

      if (!formattedFrame) {
        return false;
      }

      return enqueueChunk(formattedFrame);
    },
    keepAlive(): void {
      if (!enqueueChunk(": keepalive\n\n")) {
        closeStream();
      }
    },
    close(): void {
      closeStream();
    },
    onClose(handler: () => void): void {
      res.on("close", handler);
    },
  };
}

function formatSseFrame(frame: RealtimeFrame): string | null {
  const parsedFrame = realtimeFrameSchema.safeParse(frame);

  if (!parsedFrame.success) {
    console.error(
      "[Realtime] Refusing to serialize invalid SSE frame:",
      parsedFrame.error.flatten(),
    );
    return null;
  }

  return `event: ${parsedFrame.data.type}\ndata: ${JSON.stringify(parsedFrame.data)}\n\n`;
}
