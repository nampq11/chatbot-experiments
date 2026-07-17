import {
  SessionForbiddenError,
  SessionInactiveError,
  SessionNotFoundError,
} from "@chatbot-experiments/core/session";
import type { NextFunction, Request, Response } from "express";

interface BodyParserError {
  type?: string;
  status?: number;
  statusCode?: number;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return typeof error === "object" && error !== null;
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found" });
}

export function jsonErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "malformed_json" });
    return;
  }

  if (
    isBodyParserError(error) &&
    (error.type === "entity.too.large" ||
      error.status === 413 ||
      error.statusCode === 413)
  ) {
    res.status(413).json({ error: "payload_too_large" });
    return;
  }

  if (error instanceof SessionNotFoundError) {
    res.status(404).json({ error: "session_not_found" });
    return;
  }

  if (error instanceof SessionForbiddenError) {
    res.status(403).json({ error: "session_forbidden" });
    return;
  }

  if (error instanceof SessionInactiveError) {
    res.status(409).json({ error: "session_inactive" });
    return;
  }

  next(error);
}

export function internalErrorHandler(
  _error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.status(500).json({ error: "internal_error" });
}
