import type { AgentStreamEvent } from "./stream.ts";

/** Request used to start or resume an agent run for a session message. */
export interface AgentRunRequest {
  readonly runId?: string;
  readonly sessionId: string;
  readonly messageId: string;
  readonly assistantMessageId?: string;
  readonly userId: string;
  readonly signal?: AbortSignal;
  readonly onStreamEvent?: (event: AgentStreamEvent) => void;
}

/** Runtime port used by app logic to control concrete agent execution. */
export interface AgentRuntime {
  startRun(request: AgentRunRequest): Promise<void>;
  resumeRun(request: AgentRunRequest): Promise<void>;
  abortRun(sessionId: string): void;
}

/** Coordinates agent runs and suppresses late stream events after cancellation. */
export class AgentService {
  private readonly cancelledSessions = new Set<string>();

  constructor(private readonly runtime: AgentRuntime) {}

  startRun(request: AgentRunRequest): Promise<void> {
    this.cancelledSessions.delete(request.sessionId);
    return this.runtime.startRun(this.wrapRequest(request));
  }

  resumeRun(request: AgentRunRequest): Promise<void> {
    this.cancelledSessions.delete(request.sessionId);
    return this.runtime.resumeRun(this.wrapRequest(request));
  }

  abortRun(sessionId: string): void {
    this.cancelledSessions.add(sessionId);
    this.runtime.abortRun(sessionId);
  }

  private wrapRequest(request: AgentRunRequest): AgentRunRequest {
    const { onStreamEvent, sessionId } = request;

    return {
      ...request,
      onStreamEvent: onStreamEvent
        ? (event) => {
            if (this.shouldPublishStreamEvent(sessionId)) {
              onStreamEvent(event);
            }
          }
        : undefined,
    };
  }

  private shouldPublishStreamEvent(sessionId: string): boolean {
    return !this.cancelledSessions.has(sessionId);
  }
}
