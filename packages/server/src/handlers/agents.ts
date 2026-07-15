import { Router } from "express";
import { getAuthenticatedUserId } from "../request-boundary.ts";

/** Creates routes for agent resources. */
export function createAgentRouter(): Router {
  const router = Router();

  router.get("/agents", (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    res.json([]);
  });

  return router;
}
