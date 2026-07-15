import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  it("parses config values", () => {
    const schema = z.object({
      value: z.string(),
    });

    expect(loadConfig(schema, { value: "ok" })).toEqual({ value: "ok" });
  });

  it("fails closed when config is invalid", () => {
    const schema = z.object({
      value: z.string(),
    });

    expect(() => loadConfig(schema, { value: 1 })).toThrow();
  });
});
