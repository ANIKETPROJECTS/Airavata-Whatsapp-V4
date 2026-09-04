import { useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
}

interface PendingConfirmation extends ConfirmDialogOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Reusable in-app confirmation dialog for destructive actions.
 * Returning a Promise keeps delete handlers readable without browser dialogs.
 */
export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback(
    (options: ConfirmDialogOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const finish = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending],
  );

  const confirmDialog = (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => finish(true)}
            className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
          >
            {pending?.confirmLabel ?? 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}