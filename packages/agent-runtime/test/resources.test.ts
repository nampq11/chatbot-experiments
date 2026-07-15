import { describe, expect, it } from "vitest";
import { getAgentResourceDiagnostics } from "../src/resources.ts";

describe("getAgentResourceDiagnostics", () => {
  it("reports no MCP integration and no agent runtime tools yet", () => {
    expect(getAgentResourceDiagnostics()).toEqual({
      toolCount: 0,
      mcpEnabled: false,
    });
  });
});
