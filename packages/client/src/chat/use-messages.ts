"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentityStore } from "../identity/store";
import { getChatApiClient } from "./api";
import { messagesQueryKey } from "./queries";
import { useChatStore } from "./store";
import type { Message, MessageRole } from "./types";

/** Fetch all messages for a session once the client identity has resolved. */
export function useMessages(sessionId: string | null) {
  const userId = useIdentityStore((s) => s.userId);
  const isIdentityResolved = useIdentityStore((s) => s.isResolved);

  const query = useQuery({
    queryKey: messagesQueryKey(userId, sessionId),
    queryFn: () => {
      if (!sessionId) {
        throw new Error("Cannot list messages without a session id.");
      }

      return getChatApiClient().listMessages(sessionId);
    },
    enabled: isIdentityResolved && !!sessionId && !!userId,
  });

  return {
    ...query,
    isLoading: query.isLoading || (!!sessionId && !isIdentityResolved),
    isIdentityPending: !!sessionId && !isIdentityResolved,
  };
}

/** Appends a message to a session and refreshes the session message cache. */
export function useAppendMessage(sessionId: string) {
  const queryClient = useQueryClient();
  const userId = useIdentityStore((s) => s.userId);
  const queryKey = messagesQueryKey(userId, sessionId);

  return useMutation({
    mutationFn: ({ role, content }: { role: MessageRole; content: string }) =>
      getChatApiClient().appendMessage(sessionId, role, content),
    onMutate: async ({ role, content }) => {
      if (role !== "user" || !userId) {
        return undefined;
      }

      await queryClient.cancelQueries({ queryKey });

      const previousMessages = queryClient.getQueryData<Message[]>(queryKey);
      const optimisticMessage: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        sessionId,
        userId,
        sequence: (previousMessages?.length ?? 0) + 1,
        role,
        content,
        createdAt: new Date(),
      };

      queryClient.setQueryData<Message[]>(queryKey, [...(previousMessages ?? []), optimisticMessage]);
      useChatStore.getState().setAssistantPending(sessionId, true);

      return { previousMessages };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (_error, { role }, context) => {
      if (role === "user") {
        queryClient.setQueryData(queryKey, context?.previousMessages ?? []);
        useChatStore.getState().setAssistantPending(sessionId, false);
      }
    },
  });
}
