export function getChatRootPath(): string {
  return "/chat";
}

export function getChatSessionPath(sessionId: string): string {
  return `${getChatRootPath()}/${sessionId}`;
}

export function getChatDeleteRedirectPath(activeSessionId: string | null, deletedSessionId: string): string | null {
  return activeSessionId === deletedSessionId ? getChatRootPath() : null;
}
