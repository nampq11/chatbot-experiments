import { Router } from "express";
import { getAuthenticatedUserId } from "../request-boundary.ts";

interface CurrentUserProfile {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
}

function createCurrentUserProfile(userId: string): CurrentUserProfile {
  return {
    id: userId,
    email: "user@example.com",
    displayName: "User",
  };
}

/** Creates routes for current-user resources. */
export function createMeRouter(): Router {
  const router = Router();

  router.get("/me", (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
      return;
    }

    res.json(createCurrentUserProfile(userId));
  });

  return router;
}
