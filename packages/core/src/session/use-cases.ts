import type { DomainEvent, EventBus } from "../events/index.ts";
import { SessionForbiddenError, SessionInactiveError, SessionNotFoundError } from "./errors.ts";
import type {
  AppendMessageInput,
  CreateSessionInput,
  DeleteSessionInput,
  DeleteSessionsInput,
  GetSessionInput,
  ListSessionsInput,
} from "./inputs.ts";
import type { PaginatedResult } from "./pagination.ts";
import type { SessionRepository } from "./ports.ts";
import type { Message, Session } from "./types.ts";

/** Session record returned by session use cases. */
export type SessionRecord = Session;

/** Message record returned by session use cases. */
export type MessageRecord = Message;

/** Generates stable unique identifiers for new domain records. */
export interface IdGenerator {
  generate(): string;
}

/** Coordinates session domain behavior through persistence and event ports. */
export class SessionUseCases {
  constructor(
    protected readonly repository: SessionRepository,
    protected readonly events: EventBus,
    protected readonly ids: IdGenerator,
  ) {}

  /** Creates a new active session owned by the requested user. */
  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const session = await this.repository.createSession({
      id: this.ids.generate(),
      userId: input.userId,
      title: input.title,
    });

    this.publishEvent({
      type: "session.created",
      sessionId: session.id,
      userId: session.userId,
    });

    return session;
  }

  async listSessions(input: ListSessionsInput): Promise<PaginatedResult<SessionRecord>> {
    return this.repository.listSessions(input);
  }

  async getSession(input: GetSessionInput): Promise<SessionRecord> {
    const session = await this.repository.getSession(input.sessionId);

    if (!session) {
      throw new SessionNotFoundError();
    }

    if (session.userId !== input.userId) {
      throw new SessionForbiddenError();
    }

    return session;
  }

  async appendMessage(input: AppendMessageInput): Promise<MessageRecord> {
    const session = await this.getSession({
      sessionId: input.sessionId,
      userId: input.userId,
    });

    if (session.status !== "active") {
      throw new SessionInactiveError();
    }

    const message = await this.repository.appendMessage({
      id: this.ids.generate(),
      sessionId: session.id,
      userId: input.userId,
      role: input.role,
      content: input.content,
    });

    this.publishEvent({
      type: "message.appended",
      sessionId: message.sessionId,
      messageId: message.id,
      userId: message.userId,
      role: message.role,
    });

    return message;
  }

  async listMessages(input: GetSessionInput): Promise<ReadonlyArray<MessageRecord>> {
    await this.getSession(input);
    return this.repository.listMessages(input.sessionId);
  }

  async deleteSession(input: DeleteSessionInput): Promise<void> {
    const session = await this.getSession({
      sessionId: input.sessionId,
      userId: input.userId,
    });

    await this.repository.deleteSession(session.id);

    this.publishEvent({
      type: "session.deleted",
      sessionId: session.id,
      userId: session.userId,
    });
  }

  /** Deletes all sessions owned by a user and publishes one deletion event per session. */
  async deleteSessions(input: DeleteSessionsInput): Promise<ReadonlyArray<string>> {
    const deletedSessionIds = await this.repository.deleteSessionsByUser(input.userId);

    for (const sessionId of deletedSessionIds) {
      this.publishEvent({
        type: "session.deleted",
        sessionId,
        userId: input.userId,
      });
    }

    return deletedSessionIds;
  }

  protected publishEvent(event: DomainEvent): void {
    this.events.publish(event);
  }
}
