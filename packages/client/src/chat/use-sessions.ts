"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentityStore } from "../identity/store";
import { getChatApiClient } from "./api";
import { messagesQueryKey, sessionQueryKey, sessionsQueryKey } from "./queries";
import { useChatStore } from "./store";
import type { Message, Session } from "./types";

type PageParam = { cursor?: string; limit?: number } | undefined;

/** Fetch the current user's paginated session list once identity is ready. */
export function useSessions() {
  const userId = useIdentityStore((s) => s.userId);
  const isIdentityResolved = useIdentityStore((s) => s.isResolved);

  const query = useInfiniteQuery({
    queryKey: sessionsQueryKey(userId),
    queryFn: ({ pageParam }: { pageParam: PageParam }) => getChatApiClient().listSessions(pageParam ?? {}),
    initialPageParam: undefined satisfies PageParam,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined;
    },
    // Do not fetch until userId is resolved.
    enabled: isIdentityResolved && !!userId,
  });

  return {
    ...query,
    isLoading: query.isLoading || !isIdentityResolved,
    isIdentityPending: !isIdentityResolved,
  };
}

/** Creates a new session and refreshes the current user's session list. */
export function useCreateSession() {
  const queryClient = useQueryClient();
  const userId = useIdentityStore((s) => s.userId);

  return useMutation({
    mutationFn: (title: string) => getChatApiClient().createSession(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
    },
  });
}

/** Creates a session, appends the first user message, and refreshes both related query caches. */
export function useCreateSessionWithMessage() {
  const queryClient = useQueryClient();
  const userId = useIdentityStore((s) => s.userId);

  return useMutation({
    mutationFn: async (content: string): Promise<{ session: Session; message: Message }> => {
      const client = getChatApiClient();
      const session = await client.createSession(content);
      const message = await client.appendMessage(session.id, "user", content);

      return { session, message };
    },
    onSuccess: ({ session }) => {
      useChatStore.getState().setAssistantPending(session.id, true);
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
      queryClient.invalidateQueries({
        queryKey: messagesQueryKey(userId, session.id),
      });
    },
  });
}

/** Fetch one session after both the session id and user identity are known. */
export function useSession(sessionId: string | null) {
  const userId = useIdentityStore((s) => s.userId);
  const isIdentityResolved = useIdentityStore((s) => s.isResolved);

  const query = useQuery({
    queryKey: sessionQueryKey(userId, sessionId),
    queryFn: () => {
      if (!sessionId) {
        throw new Error("Cannot fetch a session without a session id.");
      }

      return getChatApiClient().getSession(sessionId);
    },
    enabled: isIdentityResolved && !!sessionId && !!userId,
  });

  return {
    ...query,
    isLoading: query.isLoading || (!!sessionId && !isIdentityResolved),
    isIdentityPending: !!sessionId && !isIdentityResolved,
  };
}

/** Deletes a session and clears cached data tied to that session. */
export function useDeleteSession() {
  const queryClient = useQueryClient();
  const userId = useIdentityStore((s) => s.userId);

  return useMutation({
    mutationFn: (sessionId: string) => getChatApiClient().deleteSession(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
      queryClient.removeQueries({
        queryKey: sessionQueryKey(userId, sessionId),
      });
      queryClient.removeQueries({
        queryKey: messagesQueryKey(userId, sessionId),
      });
    },
  });
}

/** Deletes every session for the current user and refreshes session caches. */
export function useDeleteSessions() {
  const queryClient = useQueryClient();
  const userId = useIdentityStore((s) => s.userId);

  return useMutation({
    mutationFn: () => getChatApiClient().deleteSessions(),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: sessionsQueryKey(userId),
        exact: false,
      });
      queryClient.setQueryData(sessionsQueryKey(userId), {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [undefined],
      });
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
    },
  });
}
