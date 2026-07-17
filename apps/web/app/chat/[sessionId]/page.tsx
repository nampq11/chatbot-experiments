"use client";

import { useSyncSessionId } from "@chatbot-experiments/client/chat";
import { ChatApp } from "@chatbot-experiments/views/chat";
import { use } from "react";

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  useSyncSessionId(sessionId);

  return <ChatApp />;
}
