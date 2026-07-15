import { z } from "zod";

const dateSchema = z.union([z.string(), z.date()]).pipe(z.coerce.date());
const nullableDateSchema = dateSchema.nullable();

/** Wire schema for supported agent run lifecycle states. */
export const agentRunStatusSchema = z.enum(["queued", "running", "completed", "cancelled", "failed"]);

/** Supported agent run lifecycle state. */
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

/** Wire schema for an agent run record returned by the API. */
export const agentRunSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  messageId: z.string(),
  status: agentRunStatusSchema,
  model: z.string().nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  completedAt: nullableDateSchema,
  cancelledAt: nullableDateSchema,
});

/** Agent run record returned by the API. */
export type AgentRun = z.infer<typeof agentRunSchema>;
