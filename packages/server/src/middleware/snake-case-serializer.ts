import type { NextFunction, Request, Response } from "express";

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function serialize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [toSnakeCase(key), serialize(nested)]),
    );
  }

  return value;
}

export function snakeCaseSerializerMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);

  res.json = ((body: unknown) => json(serialize(body))) as typeof res.json;
  next();
}
