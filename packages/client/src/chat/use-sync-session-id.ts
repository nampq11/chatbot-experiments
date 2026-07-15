"use client";

import { useEffect } from "react";
import { useChatStore } from "./store";

/** Syncs a URL-derived session id into the chat store. */
export function useSyncSessionId(sessionId: string | null) {
  const syncActiveSessionId = useChatStore((s) => s._syncActiveSessionId);

  useEffect(() => {
    syncActiveSessionId(sessionId);
  }, [sessionId, syncActiveSessionId]);
}
