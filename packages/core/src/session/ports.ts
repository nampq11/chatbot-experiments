import type { PaginatedResult } from "./pagination.ts";
import type {
  AppendMessageRepositoryInput,
  AppendSessionDataRepositoryInput,
  CreateSessionRepositoryInput,
  ListSessionsRepositoryInput,
  Message,
  Session,
  SessionDataEntry,
} from "./types.ts";

/** Persistence contract required by session use cases. */
export interface SessionRepository {
  /** Create a new session record. */
  createSession(input: CreateSessionRepositoryInput): Promise<Session>;

  /** Find a session by ID, returning null when it does not exist. */
  getSession(sessionId: string): Promise<Session | null>;

  /** List sessions for a user with cursor-based pagination. */
  listSessions(input: ListSessionsRepositoryInput): Promise<PaginatedResult<Session>>;

  /** Append a message to a session. */
  appendMessage(input: AppendMessageRepositoryInput): Promise<Message>;

  /** Append a rich session data entry to the session log. */
  appendSessionData(input: AppendSessionDataRepositoryInput): Promise<SessionDataEntry>;

  /** List all rich session data entries for a session. */
  listSessionData(sessionId: string): Promise<ReadonlyArray<SessionDataEntry>>;

  /** List all messages for a session. */
  listMessages(sessionId: string): Promise<ReadonlyArray<Message>>;

  /** Delete one session by ID. */
  deleteSession(sessionId: string): Promise<void>;

  /** Delete all sessions owned by a user and return the deleted session IDs. */
  deleteSessionsByUser(userId: string): Promise<ReadonlyArray<string>>;
}
