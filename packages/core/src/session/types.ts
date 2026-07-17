import type {
  MessageRole,
  SessionStatus,
} from "@chatbot-experiments/protocol/session";

export type { MessageRole, SessionStatus };

/** Session entity - represents a chat session in the domain. */
export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly status: SessionStatus;
  readonly messageCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Message entity - represents a message within a session. */
export interface Message {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly sequence: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: Date;
}

/** Session data entry categories persisted in the append-only session log. */
export type SessionDataEntryType =
  | "message"
  | "model_change"
  | "thinking_level_change"
  | "active_tools_change"
  | "compaction"
  | "branch_summary"
  | "custom"
  | "custom_message"
  | "leaf";

/** Append-only session data entry used to rebuild agent context. */
export interface SessionDataEntry {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly parentId: string | null;
  readonly sequence: number;
  readonly type: SessionDataEntryType;
  readonly payload: Record<string, unknown>;
  readonly schemaVersion: number;
  readonly createdAt: Date;
}

/** Repository input for creating a session with an already allocated ID. */
export interface CreateSessionRepositoryInput {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
}

/** Repository input for appending a message with an already allocated ID. */
export interface AppendMessageRepositoryInput {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly role: MessageRole;
  readonly content: string;
  /** Optional rich session data payload for the matching append-only message entry. */
  readonly entryPayload?: Record<string, unknown>;
}

/** Repository input for appending a session data entry with an allocated ID. */
export interface AppendSessionDataRepositoryInput {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly parentId?: string | null;
  readonly type: SessionDataEntryType;
  readonly payload: Record<string, unknown>;
  readonly schemaVersion?: number;
}

/** Repository input for listing sessions with cursor-based pagination. */
export interface ListSessionsRepositoryInput {
  readonly userId: string;
  readonly cursor?: string;
  readonly limit?: number;
}
