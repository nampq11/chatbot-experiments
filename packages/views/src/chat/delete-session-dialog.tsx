"use client";

import { useChatStore, useDeleteSession } from "@dentaltrip-ai/client/chat";
import {
  getChatDeleteRedirectPath,
  useNavigation,
} from "@dentaltrip-ai/client/navigation";
import { Loader } from "@dentaltrip-ai/ui";
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

export function DeleteSessionDialog() {
  const {
    deleteSessionDialogTarget,
    closeDeleteSessionDialog,
    activeSessionId,
  } = useChatStore();
  const deleteSessionMutation = useDeleteSession();
  const nav = useNavigation();

  const confirmDelete = () => {
    if (!deleteSessionDialogTarget) return;

    deleteSessionMutation.mutate(deleteSessionDialogTarget, {
      onSuccess: () => {
        const redirectPath = getChatDeleteRedirectPath(
          activeSessionId,
          deleteSessionDialogTarget,
        );

        if (redirectPath) {
          nav.push(redirectPath);
        }

        closeDeleteSessionDialog();
      },
    });
  };

  const cancelDelete = () => {
    closeDeleteSessionDialog();
  };

  return (
    <AlertDialog
      open={!!deleteSessionDialogTarget}
      onOpenChange={closeDeleteSessionDialog}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-balance">
            Delete chat?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            This action cannot be undone. The chat and all its messages will be
            permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={cancelDelete}
            disabled={deleteSessionMutation.isPending}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            disabled={deleteSessionMutation.isPending}
            className="border-destructive/30 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteSessionMutation.isPending ? (
              <>
                <Loader
                  variant="pulse-dot"
                  size="sm"
                  className="text-destructive-foreground"
                />
                Deleting…
              </>
            ) : (
              "Delete Chat"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
