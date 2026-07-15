import type { RequestHandler } from "express";

export type ReadinessCheck = () => Promise<void>;

export function createReadyHandler(readinessCheck: ReadinessCheck): RequestHandler {
  return async (_req, res) => {
    try {
      await readinessCheck();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  };
}
