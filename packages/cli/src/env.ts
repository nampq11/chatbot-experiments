import { z } from "zod";

const DEFAULT_CORS_ORIGIN =
  "/^http:\\/\\/localhost:\\d+$/,/^https?:\\/\\/([a-z0-9-]+\\.)*chatbot-experiments\\.local$/";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().optional().default(DEFAULT_CORS_ORIGIN),
  THINKING_LEVEL: z.enum(["off", "low", "medium", "high"]).default("medium"),
});

/** Exact URL or regular expression accepted by config output. */
export type CliCorsOrigin = string | RegExp;

/** Runtime configuration resolved from CLI environment variables. */
export interface CliEnv {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly corsOrigins: CliCorsOrigin[];
  readonly thinkingLevel: "off" | "low" | "medium" | "high";
}

function parseCorsOrigins(value: string): CliCorsOrigin[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(parseCorsOrigin);

  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN must include at least one origin");
  }

  return origins;
}

function parseCorsOrigin(origin: string): CliCorsOrigin {
  const regexMatch = /^\/(.*)\/([dgimsuvy]*)$/.exec(origin);

  if (regexMatch) {
    const pattern = regexMatch[1];
    const flags = regexMatch[2] ?? "";

    if (!pattern) {
      throw new Error(`Invalid CORS_ORIGIN regex: ${origin}`);
    }

    return new RegExp(pattern, flags);
  }

  new URL(origin);
  return origin;
}

/** Loads and validates CLI environment variables into typed runtime config. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): CliEnv {
  const env = envSchema.parse(source);

  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGIN),
    thinkingLevel: env.THINKING_LEVEL,
  };
}
