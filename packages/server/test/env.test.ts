import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.ts";

describe("loadEnv", () => {
  it("parses server environment values", () => {
    expect(
      loadEnv({
        DATABASE_URL: "mysql://root:password@localhost:3306/dental_chat",
        PORT: "9090",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      nodeEnv: "development",
      host: "0.0.0.0",
      port: 9090,
      databaseUrl: "mysql://root:password@localhost:3306/dental_chat",
      corsOrigins: [/^http:\/\/localhost:\d+$/, /^https?:\/\/([a-z0-9-]+\.)*dentaltrip\.io$/],
      thinkingLevel: "medium",
    });
  });

  it("parses comma-separated exact and regex CORS origins", () => {
    const env = loadEnv({
      DATABASE_URL: "mysql://root:password@localhost:3306/dental_chat",
      CORS_ORIGIN: "http://localhost:3000,/https?:\\/\\/.*dentaltrip\\.io$/",
    } as NodeJS.ProcessEnv);

    expect(env.corsOrigins).toEqual(["http://localhost:3000", /https?:\/\/.*dentaltrip\.io$/]);
  });

  it("fails closed when the database url is missing", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow();
  });
});
