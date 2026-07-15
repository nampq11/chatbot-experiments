import type { ApiClient } from "../api/client";

let configuredChatApiClient: ApiClient | null = null;

/** Configures the API client used by chat data hooks. */
export function setChatApiClient(client: ApiClient): void {
  configuredChatApiClient = client;
}

/** Returns the configured chat API client or fails with an actionable setup error. */
export function getChatApiClient(): ApiClient {
  if (!configuredChatApiClient) {
    throw new Error("Chat API client is not configured. Call setChatApiClient before using core chat hooks.");
  }

  return configuredChatApiClient;
}
