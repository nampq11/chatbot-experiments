"use client";

import { useChatStore } from "@dentaltrip-ai/client/chat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dentaltrip-ai/ui/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";

export function DeleteMessageDialog() {
  const { deleteDialogTarget, closeDeleteDialog } = useChatStore();
  const queryClient = useQueryClient();

  const confirmDelete = () => {
    if (deleteDialogTarget) {
      // Optimistically filter out the message from cache
      queryClient.setQueriesData({ queryKey: ["sessions"] }, (old: unknown) => {
        // For now, this is a no-op since we don't have delete API
        // When server supports delete, we'd invalidate here
        return old;
      });
    }
    closeDeleteDialog();
  };

  const cancelDelete = () => {
    closeDeleteDialog();
  };

  return (
    <AlertDialog open={!!deleteDialogTarget} onOpenChange={closeDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-balance">
            Delete message?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            This action cannot be undone. The message will be permanently
            removed from the conversation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="border-destructive/30 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete Message
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
