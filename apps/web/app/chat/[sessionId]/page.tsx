"use client";

import { useSyncSessionId } from "@dentaltrip-ai/client/chat";
import { ChatApp } from "@dentaltrip-ai/views/chat";
import { use } from "react";

export default function ChatSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  useSyncSessionId(sessionId);

  return <ChatApp />;
}
