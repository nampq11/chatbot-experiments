import { z } from "zod";

/** Wire schema for supported chat session lifecycle states. */
export const sessionStatusSchema = z.enum(["active", "completed", "cancelled"]);

/** Supported chat session lifecycle state. */
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

/** Wire schema for supported chat message authors. */
export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

/** Supported chat message author role. */
export type MessageRole = z.infer<typeof messageRoleSchema>;

const dateSchema = z.union([z.string(), z.date()]).pipe(z.coerce.date());

const serializedSessionSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    title: z.string(),
    status: sessionStatusSchema,
    message_count: z.number().int().nonnegative(),
    created_at: dateSchema,
    updated_at: dateSchema,
  })
  .transform((session) => ({
    id: session.id,
    userId: session.user_id,
    title: session.title,
    status: session.status,
    messageCount: session.message_count,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  }));

const applicationSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  messageCount: z.number().int().nonnegative(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

/**
 * Wire schema for a chat session returned by the API.
 *
 * The schema accepts the server-side camelCase DTO and the HTTP serialized
 * snake_case response, then normalizes both to the shared camelCase contract.
 */
export const sessionSchema = z.union([applicationSessionSchema, serializedSessionSchema]);

/** Chat session returned by the API. */
export type Session = z.infer<typeof sessionSchema>;

const serializedMessageSchema = z
  .object({
    id: z.string(),
    session_id: z.string(),
    user_id: z.string(),
    sequence: z.number().int().nonnegative(),
    role: messageRoleSchema,
    content: z.string(),
    created_at: dateSchema,
  })
  .transform((message) => ({
    id: message.id,
    sessionId: message.session_id,
    userId: message.user_id,
    sequence: message.sequence,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
  }));

const applicationMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  userId: z.string(),
  sequence: z.number().int().nonnegative(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: dateSchema,
});

/**
 * Wire schema for a chat message returned by the API.
 *
 * The schema accepts the server-side camelCase DTO and the HTTP serialized
 * snake_case response, then normalizes both to the shared camelCase contract.
 */
export const messageSchema = z.union([applicationMessageSchema, serializedMessageSchema]);

/** Chat message returned by the API. */
export type Message = z.infer<typeof messageSchema>;

/** Wire schema for a list of chat sessions returned by the API. */
export const sessionArraySchema = z.array(sessionSchema);

/** Wire schema for a list of chat messages returned by the API. */
export const messageArraySchema = z.array(messageSchema);

/** Wire schema for cursor-based pagination request parameters. */
export const paginationParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

/** Cursor-based pagination request parameters. */
export type PaginationParams = z.infer<typeof paginationParamsSchema>;

const serializedPaginatedSessionsResponseSchema = z
  .object({
    items: sessionArraySchema,
    next_cursor: z.string().nullable().nullish(),
  })
  .strict()
  .transform((response) => ({
    items: response.items,
    nextCursor: response.next_cursor ?? null,
  }));

const applicationPaginatedSessionsResponseSchema = z
  .object({
    items: sessionArraySchema,
    nextCursor: z.string().nullable().nullish(),
  })
  .strict()
  .transform((response) => ({
    items: response.items,
    nextCursor: response.nextCursor ?? null,
  }));

/**
 * Wire schema for a paginated session list returned by the API.
 *
 * Accepts both the server application DTO and the serialized HTTP response so
 * server boundary code and frontend parsing share one contract.
 */
export const paginatedSessionsResponseSchema = z.union([
  serializedPaginatedSessionsResponseSchema,
  applicationPaginatedSessionsResponseSchema,
]);

/** Paginated session list returned by the API. */
export type PaginatedSessionsResponse = z.infer<typeof paginatedSessionsResponseSchema>;

const serializedPaginatedMessagesResponseSchema = z
  .object({
    items: messageArraySchema,
    next_cursor: z.string().nullable().nullish(),
  })
  .strict()
  .transform((response) => ({
    items: response.items,
    nextCursor: response.next_cursor ?? null,
  }));

const applicationPaginatedMessagesResponseSchema = z
  .object({
    items: messageArraySchema,
    nextCursor: z.string().nullable().nullish(),
  })
  .strict()
  .transform((response) => ({
    items: response.items,
    nextCursor: response.nextCursor ?? null,
  }));

/**
 * Wire schema for a paginated message list returned by the API.
 *
 * Accepts both the server application DTO and the serialized HTTP response so
 * server boundary code and frontend parsing share one contract.
 */
export const paginatedMessagesResponseSchema = z.union([
  serializedPaginatedMessagesResponseSchema,
  applicationPaginatedMessagesResponseSchema,
]);

/** Paginated message list returned by the API. */
export type PaginatedMessagesResponse = z.infer<typeof paginatedMessagesResponseSchema>;
