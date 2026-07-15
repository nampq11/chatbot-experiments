/**
 * Domain errors for session operations.
 * These are pure domain errors with no infrastructure dependencies.
 */

export class SessionNotFoundError extends Error {
  constructor() {
    super("session_not_found");
    this.name = "SessionNotFoundError";
  }
}

export class SessionForbiddenError extends Error {
  constructor() {
    super("session_forbidden");
    this.name = "SessionForbiddenError";
  }
}

export class SessionInactiveError extends Error {
  constructor() {
    super("session_inactive");
    this.name = "SessionInactiveError";
  }
}
