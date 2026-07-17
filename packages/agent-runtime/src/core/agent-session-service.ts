import type { Message as AgentMessage, Model } from "@chatbot-experiments/ai";
import type {
  Message,
  Session,
  SessionRepository,
} from "@chatbot-experiments/core/session";
import {
  SessionForbiddenError,
  SessionInactiveError,
  SessionNotFoundError,
} from "@chatbot-experiments/core/session";
import { buildSessionContext } from "./session-manager.ts";

/** Session persistence required by the reusable agent session runtime. */
export type AgentSessionRepository = Pick<
  SessionRepository,
  "getSession" | "listMessages" | "listSessionData" | "appendMessage"
>;

/** Options used to construct an AgentSessionService. */
export interface AgentSessionServiceOptions {
  readonly repository: AgentSessionRepository;
}

/** Input for finding the user message that triggered an agent run. */
export interface LoadRunMessageInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly messageId: string;
}

/** Input for building the initial agent message history that seeds a run. */
export interface CreateAgentSessionInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly model: Model;
  readonly excludeMessageId?: string;
}

export { ZERO_USAGE } from "./usage.ts";

/**
 * Loads session state and builds the agent runtime context.
 *
 * This service owns the persistence-to-runtime boundary: session_data is the
 * canonical rich log (full agent messages including tool calls, thinking, and
 * usage), while messages remains the simplified UI text projection.
 */
export class AgentSessionService {
  private readonly repository: AgentSessionRepository;

  constructor(options: AgentSessionServiceOptions) {
    this.repository = options.repository;
  }

  /** Validates session ownership and returns the active session. */
  async loadOwnedSession(sessionId: string, userId: string): Promise<Session> {
    const session = await this.repository.getSession(sessionId);

    if (!session) {
      throw new SessionNotFoundError();
    }

    if (session.userId !== userId) {
      throw new SessionForbiddenError();
    }

    if (session.status !== "active") {
      throw new SessionInactiveError();
    }

    return session;
  }

  /** Loads and validates the user message that should start a run. */
  async loadRunMessage(input: LoadRunMessageInput): Promise<Message> {
    await this.loadOwnedSession(input.sessionId, input.userId);

    const transcript = await this.repository.listMessages(input.sessionId);
    const foundMessage = transcript.find(
      (message) => message.id === input.messageId,
    );

    if (!foundMessage) {
      throw new SessionNotFoundError();
    }

    return foundMessage;
  }

  /**
   * Builds the agent message history that seeds a run, excluding the trigger
   * message so the caller can re-append it as the run's user turn.
   *
   * Reads exclusively from session_data, the agent's rich log. The messages
   * table is a UI projection and is not consulted here.
   */
  async buildInitialMessages(
    input: CreateAgentSessionInput,
  ): Promise<AgentMessage[]> {
    const sessionData = await this.repository.listSessionData(input.sessionId);
    const initialSessionData = input.excludeMessageId
      ? sessionData.filter((entry) => entry.id !== input.excludeMessageId)
      : sessionData;
    return buildSessionContext(initialSessionData, { model: input.model });
  }
}
