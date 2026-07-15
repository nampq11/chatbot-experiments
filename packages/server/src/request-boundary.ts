import type { Request, Response } from "express";
import type { z } from "zod";
import { getRequestUserId } from "./auth.ts";

/** Parses an untrusted request value and returns null when validation fails. */
export function parseRequestValue<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

/** Reads the authenticated user id or writes the stable unauthorized response. */
export function getAuthenticatedUserId(req: Request, res: Response): string | null {
  const userId = getRequestUserId(req);

  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }

  return userId;
}

/** Parses the bounded session list limit from the request query string. */
export function getSessionListLimit(req: Request): number {
  const rawLimit = req.query.limit;

  if (typeof rawLimit !== "string") {
    return 20;
  }

  const parsed = Number.parseInt(rawLimit, 10);

  if (Number.isNaN(parsed)) {
    return 20;
  }

  return Math.max(1, Math.min(100, parsed));
}
