import { describe, expect, it } from "vitest";
import type { DomainEvent, EventBus } from "../events/index.ts";
import { SessionForbiddenError } from "./errors.ts";
import type { SessionRepository } from "./ports.ts";
import type { SessionDataEntry } from "./types.ts";
import { type MessageRecord, type SessionRecord, SessionUseCases } from "./use-cases.ts";

class TestEventBus implements EventBus {
  private readonly listeners = new Map<DomainEvent["type"], Set<(event: DomainEvent) => void | Promise<void>>>();

  on<TEvent extends DomainEvent["type"]>(
    type: TEvent,
    listener: (event: Extract<DomainEvent, { type: TEvent }>) => void | Promise<void>,
  ) {
    const listeners = this.listeners.get(type) ?? new Set();
    const wrappedListener = (event: DomainEvent): void | Promise<void> => {
      if (event.type === type) {
        return listener(event as Extract<DomainEvent, { type: TEvent }>);
      }
    };

    listeners.add(wrappedListener);
    this.listeners.set(type, listeners);

    return () => {
      listeners.delete(wrappedListener);
      if (listeners.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  publish(event: DomainEvent) {
    const listeners = this.listeners.get(event.type);
    if (!listeners) {
      return [];
    }

    const errors: Error[] = [];
    for (const listener of listeners) {
      try {
        void listener(event);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    return errors;
  }
}

function createIdGenerator() {
  let nextId = 1;

  return {
    generate: () => `id-${nextId++}`,
  };
}

function createSessionUseCases(
  repository: SessionRepository = createMemoryRepository(),
  events: EventBus = new TestEventBus(),
) {
  return new SessionUseCases(repository, events, createIdGenerator());
}

function createMemoryRepository(): SessionRepository & {
  sessions: SessionRecord[];
  messages: MessageRecord[];
  sessionData: SessionDataEntry[];
} {
  const sessions: SessionRecord[] = [];
  const messages: MessageRecord[] = [];
  const sessionData: SessionDataEntry[] = [];
  const nextSequenceBySession = new Map<string, number>();

  return {
    sessions,
    messages,
    sessionData,
    async createSession(input) {
      const session: SessionRecord = {
        id: input.id,
        userId: input.userId,
        title: input.title,
        status: "active",
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sessions.push(session);
      nextSequenceBySession.set(session.id, 1);
      return session;
    },
    async getSession(sessionId) {
      return sessions.find((session) => session.id === sessionId) ?? null;
    },
    async listSessions(input) {
      return {
        items: sessions
          .filter((session) => session.userId === input.userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
        nextCursor: null,
      };
    },

    async appendMessage(input) {
      const sequence = nextSequenceBySession.get(input.sessionId) ?? 1;
      const message: MessageRecord = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        sequence,
        role: input.role,
        content: input.content,
        createdAt: new Date(),
      };
      messages.push(message);
      nextSequenceBySession.set(input.sessionId, sequence + 1);
      const session = sessions.find((candidate) => candidate.id === input.sessionId);
      if (session) {
        const sessionIndex = sessions.indexOf(session);
        sessions[sessionIndex] = { ...session, messageCount: sequence };
      }
      return message;
    },
    async listMessages(sessionId) {
      return messages.filter((message) => message.sessionId === sessionId);
    },
    async appendSessionData(input) {
      const entry: SessionDataEntry = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        parentId: input.parentId ?? null,
        sequence: sessionData.length + 1,
        type: input.type,
        payload: input.payload,
        schemaVersion: input.schemaVersion ?? 1,
        createdAt: new Date(),
      };
      sessionData.push(entry);
      return entry;
    },
    async listSessionData(sessionId) {
      return sessionData.filter((entry) => entry.sessionId === sessionId);
    },
    async deleteSession(sessionId) {
      const sessionIndex = sessions.findIndex((session) => session.id === sessionId);
      if (sessionIndex >= 0) {
        sessions.splice(sessionIndex, 1);
        messages.splice(0, messages.length, ...messages.filter((message) => message.sessionId !== sessionId));
        nextSequenceBySession.delete(sessionId);
      }
    },
    async deleteSessionsByUser(userId) {
      const deletedSessionIds = sessions.filter((session) => session.userId === userId).map((session) => session.id);
      sessions.splice(0, sessions.length, ...sessions.filter((session) => session.userId !== userId));
      messages.splice(
        0,
        messages.length,
        ...messages.filter((message) => !deletedSessionIds.includes(message.sessionId)),
      );
      for (const sessionId of deletedSessionIds) {
        nextSequenceBySession.delete(sessionId);
      }
      return deletedSessionIds;
    },
  };
}

function createConcurrentRepository(): SessionRepository {
  const sessions: SessionRecord[] = [];
  const messages: MessageRecord[] = [];
  const sessionData: SessionDataEntry[] = [];
  const nextSequenceBySession = new Map<string, number>();
  let releaseSessionLookups: (() => void) | undefined;
  let pendingSessionLookups = 0;
  const sessionLookupsReady = new Promise<void>((resolve) => {
    releaseSessionLookups = () => resolve();
  });

  return {
    async createSession(input) {
      const session: SessionRecord = {
        id: input.id,
        userId: input.userId,
        title: input.title,
        status: "active",
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sessions.push(session);
      nextSequenceBySession.set(session.id, 1);
      return session;
    },
    async getSession(sessionId) {
      pendingSessionLookups += 1;
      if (pendingSessionLookups === 2) releaseSessionLookups?.();
      await sessionLookupsReady;
      return sessions.find((session) => session.id === sessionId) ?? null;
    },
    async listSessions(input) {
      return {
        items: sessions
          .filter((session) => session.userId === input.userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
        nextCursor: null,
      };
    },
    async appendMessage(input) {
      if (Object.hasOwn(input, "sequence")) throw new Error("sequence should be allocated by the repository");
      const sequence = nextSequenceBySession.get(input.sessionId) ?? 1;
      nextSequenceBySession.set(input.sessionId, sequence + 1);
      const message: MessageRecord = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        sequence,
        role: input.role,
        content: input.content,
        createdAt: new Date(),
      };
      messages.push(message);
      const session = sessions.find((candidate) => candidate.id === input.sessionId);
      if (session) {
        const sessionIndex = sessions.indexOf(session);
        sessions[sessionIndex] = { ...session, messageCount: sequence };
      }
      return message;
    },
    async listMessages(sessionId) {
      return messages.filter((message) => message.sessionId === sessionId);
    },
    async appendSessionData(input) {
      const entry: SessionDataEntry = {
        id: input.id,
        sessionId: input.sessionId,
        userId: input.userId,
        parentId: input.parentId ?? null,
        sequence: sessionData.length + 1,
        type: input.type,
        payload: input.payload,
        schemaVersion: input.schemaVersion ?? 1,
        createdAt: new Date(),
      };
      sessionData.push(entry);
      return entry;
    },
    async listSessionData(sessionId) {
      return sessionData.filter((entry) => entry.sessionId === sessionId);
    },
    async deleteSession(sessionId) {
      const sessionIndex = sessions.findIndex((session) => session.id === sessionId);
      if (sessionIndex >= 0) {
        sessions.splice(sessionIndex, 1);
        messages.splice(0, messages.length, ...messages.filter((message) => message.sessionId !== sessionId));
        nextSequenceBySession.delete(sessionId);
      }
    },
    async deleteSessionsByUser(userId) {
      const deletedSessionIds = sessions.filter((session) => session.userId === userId).map((session) => session.id);
      sessions.splice(0, sessions.length, ...sessions.filter((session) => session.userId !== userId));
      messages.splice(
        0,
        messages.length,
        ...messages.filter((message) => !deletedSessionIds.includes(message.sessionId)),
      );
      for (const sessionId of deletedSessionIds) {
        nextSequenceBySession.delete(sessionId);
      }
      return deletedSessionIds;
    },
  };
}

describe("SessionUseCases", () => {
  it("appends messages without overwriting prior history", async () => {
    const repository = createMemoryRepository();
    const service = createSessionUseCases(repository);
    const session = await service.createSession({
      userId: "user-1",
      title: "First session",
    });
    const initialSession = { ...session };
    const firstMessage = await service.appendMessage({
      sessionId: session.id,
      userId: "user-1",
      role: "user",
      content: "Hello",
    });
    const secondMessage = await service.appendMessage({
      sessionId: session.id,
      userId: "user-1",
      role: "assistant",
      content: "Hi there",
    });

    expect(initialSession.messageCount).toBe(0);
    await expect(service.getSession({ sessionId: session.id, userId: "user-1" })).resolves.toMatchObject({
      messageCount: 2,
    });
    expect(firstMessage.sequence).toBe(1);
    expect(secondMessage.sequence).toBe(2);
    expect(await service.listMessages({ sessionId: session.id, userId: "user-1" })).toEqual([
      firstMessage,
      secondMessage,
    ]);
    expect(repository.messages).toEqual([firstMessage, secondMessage]);
  });

  it("publishes events when sessions and messages are created", async () => {
    const events = new TestEventBus();
    const observedEvents: string[] = [];

    events.on("session.created", (event) => {
      observedEvents.push(`${event.type}:${event.sessionId}`);
    });
    events.on("message.appended", (event) => {
      observedEvents.push(`${event.type}:${event.messageId}`);
    });

    const service = createSessionUseCases(createMemoryRepository(), events);
    const session = await service.createSession({
      userId: "user-1",
      title: "First session",
    });
    const message = await service.appendMessage({
      sessionId: session.id,
      userId: "user-1",
      role: "user",
      content: "Hello",
    });

    expect(observedEvents).toEqual([`session.created:${session.id}`, `message.appended:${message.id}`]);
  });

  it("lists only sessions owned by the authenticated user", async () => {
    const repository = createMemoryRepository();
    const service = createSessionUseCases(repository);
    const ownSession = await service.createSession({
      userId: "user-1",
      title: "First session",
    });
    await service.createSession({ userId: "user-2", title: "Other session" });

    await expect(service.listSessions({ userId: "user-1" })).resolves.toEqual({
      items: [ownSession],
      nextCursor: null,
    });
  });

  it("deletes all sessions owned by the authenticated user", async () => {
    const repository = createMemoryRepository();
    const service = createSessionUseCases(repository);
    const firstSession = await service.createSession({
      userId: "user-1",
      title: "First session",
    });
    const secondSession = await service.createSession({
      userId: "user-1",
      title: "Second session",
    });
    const otherSession = await service.createSession({
      userId: "user-2",
      title: "Other session",
    });
    await service.appendMessage({
      sessionId: firstSession.id,
      userId: "user-1",
      role: "user",
      content: "Hello",
    });

    await expect(service.deleteSessions({ userId: "user-1" })).resolves.toEqual([firstSession.id, secondSession.id]);

    expect(repository.sessions).toEqual([otherSession]);
    expect(repository.messages).toEqual([]);
  });

  it("publishes one deletion event per deleted session", async () => {
    const repository = createMemoryRepository();
    const events = new TestEventBus();
    const deletedSessionIds: string[] = [];
    const service = createSessionUseCases(repository, events);
    const firstSession = await service.createSession({
      userId: "user-1",
      title: "First session",
    });
    const secondSession = await service.createSession({
      userId: "user-1",
      title: "Second session",
    });

    events.on("session.deleted", (event) => {
      deletedSessionIds.push(event.sessionId);
    });

    await service.deleteSessions({ userId: "user-1" });

    expect(deletedSessionIds).toEqual([firstSession.id, secondSession.id]);
  });

  it("rejects message history access for non-owners", async () => {
    const repository = createMemoryRepository();
    const service = createSessionUseCases(repository);
    const session = await service.createSession({
      userId: "user-1",
      title: "First session",
    });

    await expect(service.listMessages({ sessionId: session.id, userId: "user-2" })).rejects.toBeInstanceOf(
      SessionForbiddenError,
    );
  });

  it("does not reuse a cached sequence during concurrent appends", async () => {
    const repository = createConcurrentRepository();
    const service = createSessionUseCases(repository);
    const session = await service.createSession({
      userId: "user-1",
      title: "First session",
    });

    const [firstMessage, secondMessage] = await Promise.all([
      service.appendMessage({
        sessionId: session.id,
        userId: "user-1",
        role: "user",
        content: "Hello",
      }),
      service.appendMessage({
        sessionId: session.id,
        userId: "user-1",
        role: "assistant",
        content: "Hi there",
      }),
    ]);

    expect(firstMessage.sequence).toBe(1);
    expect(secondMessage.sequence).toBe(2);
    expect(await service.listMessages({ sessionId: session.id, userId: "user-1" })).toEqual([
      firstMessage,
      secondMessage,
    ]);
  });
});
