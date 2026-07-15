import { Router } from "express";
import { createAgentRouter } from "./handlers/agents.ts";
import { createMeRouter } from "./handlers/me.ts";
import { createNotificationRouter } from "./handlers/notifications.ts";
import { createSessionRouter, type SessionRouterDependencies } from "./handlers/sessions.ts";

/** Dependencies required to compose the authenticated API router. */
export type ApiRouterDependencies = SessionRouterDependencies;

/** Composes all authenticated API resource routers. */
export function createApiRouter(dependencies: ApiRouterDependencies): Router {
  const router = Router();

  router.use(createMeRouter());
  router.use(createSessionRouter(dependencies));
  router.use(createAgentRouter());
  router.use(createNotificationRouter());

  return router;
}
