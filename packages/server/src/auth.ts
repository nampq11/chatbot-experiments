import type { Request } from "express";

/** Authenticated user identity attached to requests after auth middleware runs. */
export interface AuthenticatedUser {
  id: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user identity attached to requests after auth middleware runs. */
      user?: AuthenticatedUser;
    }
  }
}

/** Reads the authenticated user id attached by auth middleware, if present. */
export function getRequestUserId(req: Request): string | null {
  return req.user?.id ?? null;
}
