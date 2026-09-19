'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteDocumentAction } from '@/actions/app-actions';

interface DeleteDocumentButtonProps {
  documentId: number;
  documentCode: string;
  redirectHref?: string;
  onDeleted?: () => void;
  onError?: (message: string) => void;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
}

export default function DeleteDocumentButton({
  documentId,
  documentCode,
  redirectHref,
  onDeleted,
  onError,
  className,
  disabled = false,
  children,
}: DeleteDocumentButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleDelete = async () => {
    const confirmMessage = [
      `Delete document ${documentCode}?`,
      '',
      'All entries and linked PDF of this document will be removed.',
    ].join('\n');

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    setLocalError('');
    onError?.('');

    try {
      await deleteDocumentAction(documentId);

      onDeleted?.();

      if (onDeleted) {
        return;
      }

      if (redirectHref) {
        router.push(redirectHref);
        return;
      }

      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Document deletion failed.';
      setLocalError(message);
      onError?.(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={disabled || isDeleting}
        className={className}
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {children ?? 'Delete document'}
      </button>
      {localError && !onError && (
        <p className="text-xs text-red-300">{localError}</p>
      )}
    </div>
  );
}
