/** React Query key for the authenticated user's session list. */
export function sessionsQueryKey(userId: string | null) {
  return ["sessions", userId] as const;
}

/** React Query key for one session belonging to the authenticated user. */
export function sessionQueryKey(userId: string | null, sessionId: string | null) {
  return ["sessions", userId, sessionId] as const;
}

/** React Query key for one session's messages belonging to the authenticated user. */
export function messagesQueryKey(userId: string | null, sessionId: string | null) {
  return ["sessions", userId, sessionId, "messages"] as const;
}
