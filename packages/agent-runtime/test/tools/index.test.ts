import { describe, expect, it } from "vitest";
import { createBuiltInAgentToolRegistry } from "../../src/tools/index.ts";

describe("createBuiltInAgentToolRegistry", () => {
  it("returns an empty deterministic built-in agent tool registry", () => {
    const first = createBuiltInAgentToolRegistry();
    const second = createBuiltInAgentToolRegistry();

    expect(first.listTools()).toEqual([]);
    expect(second.listTools()).toEqual(first.listTools());
  });
});
