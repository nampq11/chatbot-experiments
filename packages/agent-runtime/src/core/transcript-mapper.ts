import type { Message as AgentMessage } from "@dentaltrip-ai/ai";

/** Wraps a full agent message as the persisted rich-log payload for a session_data entry. */
export function toSessionDataMessagePayload(message: AgentMessage): { message: AgentMessage } {
  return { message };
}

/** Extracts user-visible text content from an agent message. */
export function extractAgentMessageText(message: AgentMessage): string {
  switch (message.role) {
    case "system":
      return message.content;
    case "user":
      return typeof message.content === "string" ? message.content : extractTextParts(message.content);
    case "assistant":
    case "toolResult":
      return extractTextParts(message.content);
  }
}

function extractTextParts(parts: readonly { type: string; text?: string }[]): string {
  return parts.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
}
