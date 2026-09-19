'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAccountTypeLabel } from '@/lib/account-labels';
import { updateEntryAccountAction } from '@/actions/app-actions';
import { buildAccountNames, type DocumentSummary } from '@/lib/documents-table';
import type { AccountOption } from '@/lib/types';
import { useAccountPicker } from '@/hooks/useAccountPicker';

interface UseDocumentAccountPickerParams {
  accounts: AccountOption[];
  documentsState: DocumentSummary[];
  setDocumentsState: React.Dispatch<React.SetStateAction<DocumentSummary[]>>;
}

export function useDocumentAccountPicker({
  accounts,
  documentsState,
  setDocumentsState,
}: UseDocumentAccountPickerParams) {
  const [accountPickerDocumentId, setAccountPickerDocumentId] = useState<
    number | null
  >(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [savingAccountEntryId, setSavingAccountEntryId] = useState<
    number | null
  >(null);
  const [accountModalError, setAccountModalError] = useState('');

  const accountPicker = useAccountPicker({
    accounts,
    onConfirm: () => {},
  });

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) return accountPicker.sortedAccounts;

    return accountPicker.sortedAccounts.filter(
      (account) =>
        account.number.includes(query) ||
        account.name.toLowerCase().includes(query) ||
        getAccountTypeLabel(account.type).toLowerCase().includes(query),
    );
  }, [accountSearch, accountPicker.sortedAccounts]);

  const accountPickerEntry = useMemo(() => {
    if (!accountPicker.isOpen || accountPickerDocumentId == null) return null;

    const doc = documentsState.find(
      (item) => item.id === accountPickerDocumentId,
    );
    const entry = doc?.entries.find(
      (item) => item.id === accountPicker.entryId,
    );
    if (!doc || !entry) return null;

    return { doc, entry };
  }, [
    accountPicker.isOpen,
    accountPicker.entryId,
    accountPickerDocumentId,
    documentsState,
  ]);

  const openAccountPicker = (
    documentId: number,
    entryId: number,
    currentAccountId: number,
  ) => {
    accountPicker.open(entryId, currentAccountId);
    setAccountPickerDocumentId(documentId);
    setAccountSearch('');
    setAccountModalError('');
  };

  const closeAccountPicker = useCallback(() => {
    accountPicker.close();
    setAccountPickerDocumentId(null);
    setAccountSearch('');
    setAccountModalError('');
  }, [accountPicker]);

  const handleEntryAccountChange = async () => {
    if (!accountPickerEntry || accountPicker.selectedAccountId == null) return;

    setSavingAccountEntryId(accountPickerEntry.entry.id);
    setAccountModalError('');

    try {
      const payload = await updateEntryAccountAction(accountPickerEntry.entry.id, {
        accountId: accountPicker.selectedAccountId,
      }) as {
        accountId?: number;
        accountNumber?: string;
        accountName?: string;
      } | null;

      const nextAccount = accountPicker.sortedAccounts.find(
        (account) =>
          account.id ===
          (payload?.accountId ?? accountPicker.selectedAccountId),
      );
      if (!nextAccount) {
        throw new Error('Selected account not found.');
      }

      setDocumentsState((prev) =>
        prev.map((currentDoc) => {
          if (currentDoc.id !== accountPickerEntry.doc.id) return currentDoc;

          const nextEntries = currentDoc.entries.map((entry) =>
            entry.id === accountPickerEntry.entry.id
              ? {
                  ...entry,
                  account_id: nextAccount.id,
                  account_number: payload?.accountNumber ?? nextAccount.number,
                  account_name: payload?.accountName ?? nextAccount.name,
                }
              : entry,
          );

          return {
            ...currentDoc,
            entries: nextEntries,
            accountNames: buildAccountNames(nextEntries),
          };
        }),
      );

      closeAccountPicker();
    } catch (error) {
      setAccountModalError(
        error instanceof Error ? error.message : 'Failed to switch account.',
      );
    } finally {
      setSavingAccountEntryId((current) =>
        current === accountPickerEntry.entry.id ? null : current,
      );
    }
  };

  useEffect(() => {
    if (accountPicker.isOpen && accountPickerEntry == null) {
      closeAccountPicker();
    }
  }, [accountPickerEntry, accountPicker.isOpen, closeAccountPicker]);

  /**
   * Cleans up account picker state when a document or its entries
   * are removed. Called from the parent hook's delete handler.
   */
  const cleanupForDeletedDocument = (
    documentId: number,
    entryIds: Set<number>,
  ) => {
    if (
      accountPicker.entryId != null &&
      entryIds.has(accountPicker.entryId) &&
      accountPickerDocumentId === documentId
    ) {
      accountPicker.close();
      setAccountPickerDocumentId(null);
    }
    setSavingAccountEntryId((current) =>
      current != null && entryIds.has(current) ? null : current,
    );
  };

  return {
    accountPicker,
    accountPickerDocumentId,
    accountSearch,
    setAccountSearch,
    filteredAccounts,
    accountPickerEntry,
    savingAccountEntryId,
    accountModalError,
    openAccountPicker,
    closeAccountPicker,
    handleEntryAccountChange,
    cleanupForDeletedDocument,
  };
}
