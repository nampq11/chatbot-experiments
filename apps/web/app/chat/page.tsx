"use client";

import { useSyncSessionId } from "@dentaltrip-ai/client/chat";
import { ChatApp } from "@dentaltrip-ai/views/chat";

export default function Home() {
  useSyncSessionId(null);

  return <ChatApp />;
}
