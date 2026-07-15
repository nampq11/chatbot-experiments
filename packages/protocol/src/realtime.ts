import { z } from "zod";

/** Wire schema for realtime subscription scopes. */
export const realtimeScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session"), id: z.string() }),
  z.object({ type: z.literal("user"), id: z.string() }),
  z.object({ type: z.literal("global") }),
]);

/** Realtime subscription scope used to route server-sent frames. */
export type RealtimeScope = z.infer<typeof realtimeScopeSchema>;

/** Wire schema for realtime frames delivered over the event stream. */
export const realtimeFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.started"),
    sessionId: z.string(),
    messageId: z.string(),
  }),
  z.object({
    type: z.literal("message.delta"),
    sessionId: z.string(),
    messageId: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("message.completed"),
    sessionId: z.string(),
    messageId: z.string(),
  }),
  z.object({
    type: z.literal("thinking.delta"),
    sessionId: z.string(),
    messageId: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("assistant.message"),
    sessionId: z.string(),
    messageId: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("task.started"),
    taskId: z.string(),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("task.completed"),
    taskId: z.string(),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("task.failed"),
    taskId: z.string(),
    sessionId: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal("typing"),
    sessionId: z.string(),
    userId: z.string(),
  }),
  z.object({
    type: z.literal("session.created"),
    sessionId: z.string(),
    userId: z.string(),
  }),
  z.object({
    type: z.literal("session.deleted"),
    sessionId: z.string(),
    userId: z.string(),
  }),
  z.object({
    type: z.literal("message.appended"),
    sessionId: z.string(),
    messageId: z.string(),
    userId: z.string(),
  }),
  z.object({
    type: z.literal("agent.run.started"),
    sessionId: z.string(),
    runId: z.string(),
  }),
  z.object({
    type: z.literal("agent.run.completed"),
    sessionId: z.string(),
    runId: z.string(),
  }),
  z.object({
    type: z.literal("agent.run.cancelled"),
    sessionId: z.string(),
    runId: z.string(),
  }),
  z.object({
    type: z.literal("agent.run.failed"),
    sessionId: z.string(),
    runId: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

/** Realtime frame delivered over the event stream. */
export type RealtimeFrame = z.infer<typeof realtimeFrameSchema>;
