import type {
  AppendMessageInput,
  MessageRecord,
  SessionUseCases,
} from "@chatbot-experiments/core/session";
import {
  messageArraySchema,
  messageRoleSchema,
  messageSchema,
  paginatedSessionsResponseSchema,
  sessionSchema,
} from "@chatbot-experiments/protocol/session";
import { Router } from "express";
import { z } from "zod";
import {
  getAuthenticatedUserId,
  getSessionListLimit,
  parseRequestValue,
} from "../request-boundary.ts";

const sessionIdSchema = z.string().trim().min(1).max(36);
const createSessionSchema = z.object({ title: z.string().min(1) });
const appendMessageRoleSchema = messageRoleSchema.refine(
  (role) => role !== "system",
  "system messages cannot be created through the public API",
);
const appendMessageSchema = z.object({
  role: appendMessageRoleSchema,
  content: z.string().min(1),
});

type SessionRouterSessions = Pick<
  SessionUseCases,
  | "listSessions"
  | "createSession"
  | "getSession"
  | "deleteSession"
  | "deleteSessions"
  | "listMessages"
  | "appendMessage"
>;

/** Input used when a persisted user message should start assistant work. */
export interface UserMessageAgentRunInput {
  readonly sessionId: string;
  readonly messageId: string;
  readonly userId: string;
}

/** Starts assistant work for a persisted user message. */
export type UserMessageAgentRunStarter = (
  input: UserMessageAgentRunInput,
) => void;

/** Dependencies required by the session and message HTTP routes. */
export interface SessionRouterDependencies {
  readonly sessions: SessionRouterSessions;
  readonly startAgentRunForUserMessage: UserMessageAgentRunStarter;
}

/** Creates routes for session and message resources. */
export function createSessionRouter({
  sessions,
  startAgentRunForUserMessage,
}: SessionRouterDependencies): Router {
  const router = Router();

  router.get("/sessions", async (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = getSessionListLimit(req);
    const listedSessions = await sessions.listSessions({
      userId,
      cursor,
      limit,
    });
    res.json(paginatedSessionsResponseSchema.parse(listedSessions));
  });

  router.post("/sessions", async (req, res) => {
    const body = parseRequestValue(createSessionSchema, req.body);

    if (!body) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }

    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    const session = await sessions.createSession({
      userId,
      title: body.title,
    });
    res.status(201).json(sessionSchema.parse(session));
  });

  router.delete("/sessions", async (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    await sessions.deleteSessions({ userId });
    res.status(204).end();
  });

  router.get("/sessions/:sessionId", async (req, res) => {
    const sessionId = parseRequestValue(sessionIdSchema, req.params.sessionId);

    if (!sessionId) {
      res.status(400).json({ error: "invalid_session_id" });
      return;
    }

    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    const session = await sessions.getSession({ sessionId, userId });
    res.json(sessionSchema.parse(session));
  });

  router.delete("/sessions/:sessionId", async (req, res) => {
    const sessionId = parseRequestValue(sessionIdSchema, req.params.sessionId);

    if (!sessionId) {
      res.status(400).json({ error: "invalid_session_id" });
      return;
    }

    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    await sessions.deleteSession({ sessionId, userId });
    res.status(204).end();
  });

  router.get("/sessions/:sessionId/messages", async (req, res) => {
    const sessionId = parseRequestValue(sessionIdSchema, req.params.sessionId);

    if (!sessionId) {
      res.status(400).json({ error: "invalid_session_id" });
      return;
    }

    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    const messages = await sessions.listMessages({ sessionId, userId });
    res.json(messageArraySchema.parse(messages));
  });

  router.post("/sessions/:sessionId/messages", async (req, res) => {
    const sessionId = parseRequestValue(sessionIdSchema, req.params.sessionId);

    if (!sessionId) {
      res.status(400).json({ error: "invalid_session_id" });
      return;
    }

    const body = parseRequestValue(appendMessageSchema, req.body);

    if (!body) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }

    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    const appendInput: AppendMessageInput = {
      sessionId,
      userId,
      role: body.role,
      content: body.content,
    };
    const message: MessageRecord = await sessions.appendMessage(appendInput);

    if (message.role === "user") {
      startAgentRunForUserMessage({
        sessionId: message.sessionId,
        messageId: message.id,
        userId: message.userId,
      });
    }

    res.status(201).json(messageSchema.parse(message));
  });

  return router;
}
