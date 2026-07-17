"use client";

import { useSyncSessionId } from "@chatbot-experiments/client/chat";
import { ChatApp } from "@chatbot-experiments/views/chat";

export default function Home() {
  useSyncSessionId(null);

  return <ChatApp />;
}
