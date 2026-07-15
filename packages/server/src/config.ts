import type { ZodType } from "zod";

export function loadConfig<T>(schema: ZodType<T>, source: unknown): T {
  return schema.parse(source);
}
