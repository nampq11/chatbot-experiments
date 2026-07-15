import {
  messageArraySchema,
  messageSchema,
  paginatedSessionsResponseSchema,
  sessionArraySchema,
  sessionSchema,
} from "@dentaltrip-ai/protocol/session";
import type { z } from "zod";

/**
 * Parses untrusted API JSON and returns an explicit fallback when the response
 * drifts from the expected schema.
 */
export function parseWithFallback<T>(schema: z.ZodType<T>, value: unknown, fallback: T, context: string): T {
  const parsed = schema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  console.warn(`[API] Invalid ${context}:`, parsed.error.flatten());
  return fallback;
}

const paginatedSessionsSchema = paginatedSessionsResponseSchema;

export { messageArraySchema, messageSchema, paginatedSessionsSchema, sessionArraySchema, sessionSchema };
