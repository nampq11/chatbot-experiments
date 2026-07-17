"use client";

import { ApiClient } from "@chatbot-experiments/client/api";
import { setChatApiClient } from "@chatbot-experiments/client/chat";
import { useIdentityStore } from "@chatbot-experiments/client/identity";
import { ImageRendererProvider } from "@chatbot-experiments/views";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { NextImageRenderer } from "./image-renderer";
import { WebNavigationProvider } from "./navigation-adapter";
import { AI_API_BASE_URL } from "./runtime-config";

const STORAGE_KEY = "chatbot-experiments:guest-user-id";

/** Generate or retrieve a stable per-browser guest user ID. */
function resolveGuestUserId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = uuidv4();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

const aiApiClient = new ApiClient(AI_API_BASE_URL, () => {
  const userId = useIdentityStore.getState().userId;
  const headers: Record<string, string> = {};

  if (userId) {
    headers["x-user-id"] = userId;
  }

  return headers;
});

setChatApiClient(aiApiClient);

export function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside component to avoid Fast Refresh issues
  const [queryClient] = useState(() => new QueryClient());
  const setUserIdentity = useIdentityStore((s) => s.setUserIdentity);

  // Resolve guest identity once on mount — before any queries fire
  useEffect(() => {
    const guestId = resolveGuestUserId();
    setUserIdentity(guestId);
  }, [setUserIdentity]);

  return (
    <QueryClientProvider client={queryClient}>
      <WebNavigationProvider>
        <ImageRendererProvider renderer={NextImageRenderer}>
          {children}
        </ImageRendererProvider>
      </WebNavigationProvider>
    </QueryClientProvider>
  );
}
