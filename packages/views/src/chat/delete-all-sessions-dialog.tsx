"use client";

import { useDeleteSessions } from "@dentaltrip-ai/client/chat";
import {
  getChatRootPath,
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

interface DeleteAllSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirms the irreversible deletion of every chat session for the current user. */
export function DeleteAllSessionsDialog({
  open,
  onOpenChange,
}: DeleteAllSessionsDialogProps) {
  const deleteSessionsMutation = useDeleteSessions();
  const nav = useNavigation();

  const deleteErrorMessage =
    deleteSessionsMutation.error instanceof Error
      ? deleteSessionsMutation.error.message
      : deleteSessionsMutation.error
        ? "Failed to delete chats."
        : null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (deleteSessionsMutation.isPending && !nextOpen) {
      return;
    }

    if (nextOpen) {
      deleteSessionsMutation.reset();
    }

    onOpenChange(nextOpen);
  };

  const confirmDelete = () => {
    if (deleteSessionsMutation.isPending) {
      return;
    }

    deleteSessionsMutation.mutate(undefined, {
      onSuccess: () => {
        nav.push(getChatRootPath());
        onOpenChange(false);
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-balance">
            Delete all chats?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            This action cannot be undone. All chats and their messages will be
            permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteErrorMessage ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {deleteErrorMessage}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteSessionsMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              confirmDelete();
            }}
            disabled={deleteSessionsMutation.isPending}
            className="border-destructive/30 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteSessionsMutation.isPending ? (
              <>
                <Loader
                  variant="pulse-dot"
                  size="sm"
                  className="text-destructive-foreground"
                />
                Deleting…
              </>
            ) : (
              "Delete All"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
