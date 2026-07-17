import { randomUUID } from "node:crypto";
import type {
  AgentRunRequest,
  AgentRunStore,
  AgentRuntime,
} from "@chatbot-experiments/core/agent";
import type { DomainEvent } from "@chatbot-experiments/core/events";
import type { Message } from "@chatbot-experiments/core/session";
import { loadAzureOpenAIConfig } from "../azure-openai.ts";
import { CHATBOT_EXPERIMENTS_SYSTEM_PROMPT } from "../system-prompt.ts";
import {
  type AzureOpenAIConfigProvider,
  createAgent,
  resolveAgentModel,
  type ThinkingLevel,
} from "./agent.ts";
import {
  type AgentSessionRepository,
  AgentSessionService,
} from "./agent-session-service.ts";
import { type CreateAgentFn, SessionActor } from "./session-actor.ts";

/** Session transcript persistence required by the reusable agent runtime. */
export type TranscriptRepository = AgentSessionRepository;

/** Agent runtime control surface beyond the core start/resume/abort port. */
export type AgentRuntimeController = AgentRuntime & {
  closeSession(sessionId: string): void;
};

/** Dependencies used to create the reusable agent runtime. */
export interface CreateAgentRuntimeOptions {
  readonly transcriptRepository: TranscriptRepository;
  readonly agentRunStore: AgentRunStore;
  readonly createAgent?: CreateAgentFn;
  readonly azureOpenAIConfigProvider?: AzureOpenAIConfigProvider;
  readonly validateConfiguration?: () => unknown;
  readonly publishEvent?: (event: DomainEvent) => void;
  readonly thinkingLevel?: ThinkingLevel;
}

/** Creates the agent runtime and manages one long-lived actor per session. */
export function createAgentRuntime({
  transcriptRepository,
  agentRunStore,
  createAgent: createAgentFactory,
  azureOpenAIConfigProvider = loadAzureOpenAIConfig,
  validateConfiguration,
  publishEvent = () => {},
  thinkingLevel = "medium",
}: CreateAgentRuntimeOptions): AgentRuntimeController {
  const actors = new Map<string, SessionActor>();
  const configurationValidator =
    validateConfiguration ?? azureOpenAIConfigProvider;
  const createRuntimeAgent: CreateAgentFn =
    createAgentFactory ??
    (({ sessionId, messages, systemPrompt, thinkingLevel }) =>
      createAgent({
        sessionId,
        messages,
        systemPrompt,
        thinkingLevel,
        azureOpenAIConfigProvider,
      }));
  const sessionService = new AgentSessionService({
    repository: transcriptRepository,
  });

  return {
    async startRun(request: AgentRunRequest): Promise<void> {
      const runId = request.runId ?? randomUUID();
      let actor = actors.get(request.sessionId);
      let currentMessage: Message;

      try {
        configurationValidator();

        currentMessage = await sessionService.loadRunMessage({
          sessionId: request.sessionId,
          userId: request.userId,
          messageId: request.messageId,
        });
        const model = resolveAgentModel();

        if (!actor) {
          const initialMessages = await sessionService.buildInitialMessages({
            sessionId: request.sessionId,
            userId: request.userId,
            model,
            excludeMessageId: currentMessage.id,
          });
          actor = new SessionActor({
            sessionId: request.sessionId,
            userId: request.userId,
            model,
            initialMessages,
            systemPrompt: CHATBOT_EXPERIMENTS_SYSTEM_PROMPT,
            transcriptWriter: transcriptRepository,
            agentRunStore,
            publishEvent,
            createAgent: createRuntimeAgent,
            thinkingLevel,
          });
          actors.set(request.sessionId, actor);
        }
      } catch (error) {
        publishEvent({
          type: "agent_end",
          runId,
          sessionId: request.sessionId,
          messages: [],
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }

      await actor.sendMessage({
        messageId: currentMessage.id,
        content: currentMessage.content,
        signal: request.signal,
        runId,
        assistantMessageId: request.assistantMessageId,
        onStreamEvent: request.onStreamEvent,
      });
    },

    async resumeRun(request: AgentRunRequest): Promise<void> {
      await this.startRun(request);
    },

    abortRun(sessionId: string): void {
      actors.get(sessionId)?.abort();
    },

    /**
     * Close a session's actor and release its resources.
     * Call this when a session is closed or becomes inactive.
     */
    closeSession(sessionId: string): void {
      const actor = actors.get(sessionId);
      if (actor) {
        actor.close();
        actors.delete(sessionId);
      }
    },
  };
}
