import { describe, expect, it } from "vitest";
import { messagesQueryKey, sessionQueryKey, sessionsQueryKey } from "./queries";

describe("chat query keys", () => {
  it("scope session lists by authenticated user", () => {
    expect(sessionsQueryKey("user-1")).toEqual(["sessions", "user-1"]);
    expect(sessionsQueryKey("user-2")).toEqual(["sessions", "user-2"]);
  });

  it("scope session detail and messages by authenticated user before session id", () => {
    expect(sessionQueryKey("user-1", "session-1")).toEqual(["sessions", "user-1", "session-1"]);
    expect(messagesQueryKey("user-1", "session-1")).toEqual(["sessions", "user-1", "session-1", "messages"]);
  });
});
