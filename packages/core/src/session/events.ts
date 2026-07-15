import type { MessageRole } from "./types.ts";

/**
 * Internal ephemeral notification emitted after session/message mutations.
 *
 * Not durable, not replayable, and not an audit log. Use it for best-effort
 * subscribers such as realtime cache invalidation, analytics, or audit
 * forwarding. Critical workflows should be invoked explicitly by the
 * application service that owns the command.
 */
export type SessionMutationEvent =
  | {
      readonly type: "session.created";
      readonly sessionId: string;
      readonly userId: string;
    }
  | {
      readonly type: "session.deleted";
      readonly sessionId: string;
      readonly userId: string;
    }
  | {
      readonly type: "message.appended";
      readonly sessionId: string;
      readonly messageId: string;
      readonly userId: string;
      readonly role: MessageRole;
    };
