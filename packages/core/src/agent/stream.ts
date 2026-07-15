/** App-level assistant stream event emitted while an agent response is generated. */
export type AgentStreamEvent =
  | {
      readonly type: "message.started";
      readonly sessionId: string;
      readonly messageId: string;
    }
  | {
      readonly type: "thinking.delta";
      readonly sessionId: string;
      readonly messageId: string;
      readonly delta: string;
    }
  | {
      readonly type: "message.delta";
      readonly sessionId: string;
      readonly messageId: string;
      readonly delta: string;
    }
  | {
      readonly type: "assistant.message";
      readonly sessionId: string;
      readonly messageId: string;
      readonly message: string;
    }
  | {
      readonly type: "message.completed";
      readonly sessionId: string;
      readonly messageId: string;
    };
