import type { MessageRole } from "./types.ts";

/** Input required to create a session owned by a user. */
export interface CreateSessionInput {
  readonly userId: string;
  readonly title: string;
}

/** Input required to list sessions owned by a user. */
export interface ListSessionsInput {
  readonly userId: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** Input required to read a session scoped to one user. */
export interface GetSessionInput {
  readonly sessionId: string;
  readonly userId: string;
}

/** Input required to append a message to an active session. */
export interface AppendMessageInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly role: MessageRole;
  readonly content: string;
}

/** Input required to delete one session owned by a user. */
export interface DeleteSessionInput {
  readonly sessionId: string;
  readonly userId: string;
}

/** Input for deleting every session owned by one user. */
export interface DeleteSessionsInput {
  readonly userId: string;
}
