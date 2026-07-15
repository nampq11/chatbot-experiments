import cors from "cors";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import express from "express";
import { type ApiRouterDependencies, createApiRouter } from "./api.ts";
import { getRequestUserId } from "./auth.ts";
import { createAuthRouter } from "./auth-routes.ts";
import type { CorsOrigin } from "./env.ts";
import { healthHandler } from "./handlers/health.ts";
import { createReadyHandler, type ReadinessCheck } from "./handlers/ready.ts";
import { internalErrorHandler, jsonErrorHandler, notFoundHandler } from "./middleware/errors.ts";
import { requestIdMiddleware } from "./middleware/request-id.ts";
import { snakeCaseSerializerMiddleware } from "./middleware/snake-case-serializer.ts";
import { createWebhooksRouter } from "./webhooks.ts";

/** Dependencies and middleware configuration needed to build the Express app. */
export interface CreateAppOptions {
  readinessCheck: ReadinessCheck;
  corsOrigins: CorsOrigin[];
  apiRouterDependencies: ApiRouterDependencies;
  realtimeStreamHandler: RequestHandler;
}

function attachAuthenticatedUser(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.header("x-user-id");

  if (userId) {
    req.user = { id: userId };
  }

  next();
}

function requireAuthenticatedUser(req: Request, res: Response, next: NextFunction): void {
  if (!getRequestUserId(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  next();
}

/** Creates the Express application with shared middleware and HTTP routes. */
export function createApp({
  readinessCheck,
  corsOrigins,
  apiRouterDependencies,
  realtimeStreamHandler,
}: CreateAppOptions): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(snakeCaseSerializerMiddleware);

  app.get("/health", healthHandler);
  app.get("/readyz", createReadyHandler(readinessCheck));

  app.use("/auth", createAuthRouter());
  app.use("/webhooks", createWebhooksRouter());
  app.get("/api/realtime/stream", attachAuthenticatedUser, requireAuthenticatedUser, realtimeStreamHandler);
  app.use("/api", attachAuthenticatedUser, requireAuthenticatedUser, createApiRouter(apiRouterDependencies));

  app.use(notFoundHandler);
  app.use(jsonErrorHandler);
  app.use(internalErrorHandler);

  return app;
}
