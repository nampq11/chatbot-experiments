import { create } from "zustand";

/** Client state used by shared chat views. */
interface ChatStore {
  activeSessionId: string | null;
  _syncActiveSessionId: (id: string | null) => void;
  promptDraft: string;
  setPromptDraft: (value: string) => void;
  assistantPendingBySession: Record<string, boolean>;
  assistantPendingStartedAtBySession: Record<string, number>;
  assistantThoughtDurationsByMessage: Record<string, number>;
  latestAssistantThoughtDurationBySession: Record<string, number>;
  assistantStreamingMessageIdBySession: Record<string, string>;
  setAssistantPending: (sessionId: string, isPending: boolean) => void;
  finishAssistantThinking: (sessionId: string, messageId: string) => void;
  setAssistantStreamingMessage: (sessionId: string, messageId: string) => void;
  clearAssistantStreamingMessage: (sessionId: string) => void;
  deleteDialogTarget: string | null;
  openDeleteDialog: (messageId: string) => void;
  closeDeleteDialog: () => void;
  deleteSessionDialogTarget: string | null;
  openDeleteSessionDialog: (sessionId: string) => void;
  closeDeleteSessionDialog: () => void;
}

/** Stores chat-only UI state such as active session, drafts, and dialogs. */
export const useChatStore = create<ChatStore>((set) => ({
  activeSessionId: null,
  _syncActiveSessionId: (id) => set({ activeSessionId: id }),
  promptDraft: "",
  assistantPendingBySession: {},
  assistantPendingStartedAtBySession: {},
  assistantThoughtDurationsByMessage: {},
  latestAssistantThoughtDurationBySession: {},
  assistantStreamingMessageIdBySession: {},
  setAssistantPending: (sessionId, isPending) =>
    set((state) => {
      const isCurrentlyPending = state.assistantPendingBySession[sessionId] === true;

      if (isCurrentlyPending === isPending) {
        return state;
      }

      const nextPendingBySession = { ...state.assistantPendingBySession };
      const nextStartedAtBySession = {
        ...state.assistantPendingStartedAtBySession,
      };

      if (isPending) {
        nextPendingBySession[sessionId] = true;
        nextStartedAtBySession[sessionId] = Date.now();
      } else {
        delete nextPendingBySession[sessionId];
        delete nextStartedAtBySession[sessionId];
      }

      return {
        assistantPendingBySession: nextPendingBySession,
        assistantPendingStartedAtBySession: nextStartedAtBySession,
      };
    }),
  finishAssistantThinking: (sessionId, messageId) =>
    set((state) => {
      const startedAt = state.assistantPendingStartedAtBySession[sessionId];

      if (state.assistantPendingBySession[sessionId] !== true && typeof startedAt !== "number") {
        return state;
      }

      const nextPendingBySession = { ...state.assistantPendingBySession };
      const nextStartedAtBySession = {
        ...state.assistantPendingStartedAtBySession,
      };
      const nextDurationsByMessage = {
        ...state.assistantThoughtDurationsByMessage,
      };
      const nextDurationBySession = {
        ...state.latestAssistantThoughtDurationBySession,
      };

      delete nextPendingBySession[sessionId];
      delete nextStartedAtBySession[sessionId];

      if (typeof startedAt === "number") {
        const durationMs = Date.now() - startedAt;
        nextDurationsByMessage[messageId] = durationMs;
        nextDurationBySession[sessionId] = durationMs;
      }

      return {
        assistantPendingBySession: nextPendingBySession,
        assistantPendingStartedAtBySession: nextStartedAtBySession,
        assistantThoughtDurationsByMessage: nextDurationsByMessage,
        latestAssistantThoughtDurationBySession: nextDurationBySession,
      };
    }),
  setAssistantStreamingMessage: (sessionId, messageId) =>
    set((state) => {
      if (state.assistantStreamingMessageIdBySession[sessionId] === messageId) {
        return state;
      }

      return {
        assistantStreamingMessageIdBySession: {
          ...state.assistantStreamingMessageIdBySession,
          [sessionId]: messageId,
        },
      };
    }),
  clearAssistantStreamingMessage: (sessionId) =>
    set((state) => {
      if (state.assistantStreamingMessageIdBySession[sessionId] === undefined) {
        return state;
      }

      const nextStreamingMessageIdBySession = {
        ...state.assistantStreamingMessageIdBySession,
      };
      delete nextStreamingMessageIdBySession[sessionId];

      return {
        assistantStreamingMessageIdBySession: nextStreamingMessageIdBySession,
      };
    }),
  setPromptDraft: (value) => set({ promptDraft: value }),
  deleteDialogTarget: null,
  openDeleteDialog: (messageId) => set({ deleteDialogTarget: messageId }),
  closeDeleteDialog: () => set({ deleteDialogTarget: null }),
  deleteSessionDialogTarget: null,
  openDeleteSessionDialog: (sessionId) => set({ deleteSessionDialogTarget: sessionId }),
  closeDeleteSessionDialog: () => set({ deleteSessionDialogTarget: null }),
}));
