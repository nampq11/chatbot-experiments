import { describe, expect, it } from "vitest";
import { getChatDeleteRedirectPath, getChatRootPath, getChatSessionPath } from "./chat-routes";

describe("chat routes", () => {
  it("builds paths that match the web app chat routes", () => {
    expect(getChatRootPath()).toBe("/chat");
    expect(getChatSessionPath("session-1")).toBe("/chat/session-1");
  });

  it("redirects to the chat root after deleting the active chat session", () => {
    expect(getChatDeleteRedirectPath("session-1", "session-1")).toBe("/chat");
    expect(getChatDeleteRedirectPath("session-2", "session-1")).toBeNull();
    expect(getChatDeleteRedirectPath(null, "session-1")).toBeNull();
  });
});
