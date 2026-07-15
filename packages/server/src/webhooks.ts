import { type Request, type Response, Router } from "express";

function notImplementedHandler(_req: Request, res: Response): void {
  res.status(501).json({ error: "not_implemented" });
}

/** Creates routes reserved for webhook endpoints. */
export function createWebhooksRouter(): Router {
  const router = Router();

  router.use(notImplementedHandler);

  return router;
}
