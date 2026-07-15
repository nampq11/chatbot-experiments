import { beforeEach, describe, expect, it } from "vitest";
import { useIdentityStore } from "./store";

describe("useIdentityStore", () => {
  beforeEach(() => {
    useIdentityStore.setState({ userId: null, isResolved: false });
  });

  it("starts unresolved until app boot provides a user identity", () => {
    expect(useIdentityStore.getState()).toMatchObject({
      userId: null,
      isResolved: false,
    });
  });

  it("marks identity as resolved when the app sets the current user", () => {
    useIdentityStore.getState().setUserIdentity("guest-user");

    expect(useIdentityStore.getState()).toMatchObject({
      userId: "guest-user",
      isResolved: true,
    });
  });
});
