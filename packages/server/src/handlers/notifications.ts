import { Router } from "express";
import { getAuthenticatedUserId } from "../request-boundary.ts";

/** Creates routes for notification resources. */
export function createNotificationRouter(): Router {
  const router = Router();

  router.get("/notifications", (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    res.json([]);
  });

  return router;
}
