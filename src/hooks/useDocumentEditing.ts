'use client';

import { useCallback } from 'react';
import {
  formatAmountInputValue,
  parseAmountInputValue,
  toCents,
} from '@/lib/amount-input';
import { getDateInputValue, parseDateInputValue } from '@/lib/date-input';
import {
  duplicateDocumentAction,
  saveDocumentEntriesAction,
  updateDocumentAction,
} from '@/actions/app-actions';
import type { AccountOption } from '@/lib/types';
import {
  type DocumentSummary,
  buildAccountNames,
  normalizeDocumentSummary,
} from '@/lib/documents-table';
import type { ReceiptSource } from '@/lib/receipt-pdfs';
import { useDocumentLabels } from '@/hooks/useDocumentLabels';
import { useDocumentAccountPicker } from '@/hooks/useDocumentAccountPicker';
import { useDocumentEditingState } from '@/hooks/useDocumentEditingState';

export interface UseDocumentEditingParams {
  documents: DocumentSummary[];
  periodId: number;
  accounts: AccountOption[];
  activeDocumentId: number | null;
  setExpandedDocumentId: (id: number | null) => void;
}

export function useDocumentEditing({
  documents,
  periodId,
  accounts,
  activeDocumentId,
  setExpandedDocumentId,
}: UseDocumentEditingParams) {
  const {
    documentsState,
    setDocumentsState,
    dateValues,
    setDateValues,
    updateDateValue,
    savingId,
    setSavingId,
    dateErrors,
    setDateErrors,
    savedId,
    setSavedId,
    categoryValues,
    updateCategoryValue,
    setCategoryValues,
    nameValues,
    updateNameValue,
    setNameValues,
    savingMetadataDocumentId,
    setSavingMetadataDocumentId,
    metadataErrors,
    setMetadataErrors,
    savedMetadataDocumentId,
    setSavedMetadataDocumentId,
    amountValues,
    updateAmountValue,
    setAmountValues,
    savingAmountsDocumentId,
    setSavingAmountsDocumentId,
    amountErrors,
    setAmountErrors,
    savedAmountsDocumentId,
    setSavedAmountsDocumentId,
    deletedEntryIdsByDocument,
    markEntryForDeletion,
    clearPendingDeletions,
    setDeletedEntryIdsByDocument,
    duplicatingDocumentId,
    setDuplicatingDocumentId,
    duplicateErrors,
    setDuplicateErrors,
    duplicatedDocumentId,
    setDuplicatedDocumentId,
    deleteErrors,
    setDeleteErrors,
  } = useDocumentEditingState({
    documents,
    periodId,
  });

  const labels = useDocumentLabels(documentsState, categoryValues, nameValues);

  const accountPickerHook = useDocumentAccountPicker({
    accounts,
    documentsState,
    setDocumentsState,
  });

  const handleDocumentSave = async (doc: DocumentSummary) => {
    const rawDateValue = dateValues[doc.id] ?? '';
    const nextDate = parseDateInputValue(rawDateValue);
    const nextCategory = (categoryValues[doc.id] ?? doc.category)
      .trim()
      .toUpperCase();
    const nextName = (nameValues[doc.id] ?? doc.name).trim();

    if (nextDate == null) {
      setDateErrors((prev) => ({
        ...prev,
        [doc.id]: 'Enter a valid date.',
      }));
      return;
    }

    if (!nextCategory) {
      setMetadataErrors((prev) => ({
        ...prev,
        [doc.id]: 'Set the document category, e.g. MU or OL.',
      }));
      return;
    }

    setSavingId(doc.id);
    setSavingMetadataDocumentId(doc.id);
    setDateErrors((prev) => ({ ...prev, [doc.id]: '' }));
    setMetadataErrors((prev) => ({ ...prev, [doc.id]: '' }));

    try {
      const payload = await updateDocumentAction(doc.id, {
        date: nextDate,
        category: nextCategory,
        name: nextName,
      }) as {
        date?: number;
        category?: string;
        name?: string;
      } | null;

      const savedDate = payload?.date ?? nextDate;
      const savedCategory = (payload?.category ?? nextCategory)
        .trim()
        .toUpperCase();
      const savedName = (payload?.name ?? nextName).trim();

      setDocumentsState((prev) =>
        prev.map((currentDoc) =>
          currentDoc.id === doc.id
            ? {
                ...currentDoc,
                date: savedDate,
                category: savedCategory,
                name: savedName,
                description:
                  savedName ||
                  currentDoc.entries[0]?.description ||
                  currentDoc.description,
              }
            : currentDoc,
        ),
      );
      setDateValues((prev) => ({
        ...prev,
        [doc.id]: getDateInputValue(savedDate),
      }));
      setCategoryValues((prev) => ({ ...prev, [doc.id]: savedCategory }));
      setNameValues((prev) => ({ ...prev, [doc.id]: savedName }));
      setSavedId(doc.id);
      setSavedMetadataDocumentId(doc.id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Document save failed.';
      setDateErrors((prev) => ({ ...prev, [doc.id]: message }));
      setMetadataErrors((prev) => ({ ...prev, [doc.id]: message }));
    } finally {
      setSavingId((current) => (current === doc.id ? null : current));
      setSavingMetadataDocumentId((current) =>
        current === doc.id ? null : current,
      );
    }
  };

  const handleDuplicateDocument = async (doc: DocumentSummary) => {
    setDuplicatingDocumentId(doc.id);
    setDuplicateErrors((prev) => ({ ...prev, [doc.id]: '' }));

    try {
      const payload = await duplicateDocumentAction(doc.id);

      if (!payload?.document) {
        throw new Error('Document copy failed.');
      }

      const duplicatedDocument = normalizeDocumentSummary(payload.document);

      setDocumentsState((prev) => [...prev, duplicatedDocument]);
      setDateValues((prev) => ({
        ...prev,
        [duplicatedDocument.id]: getDateInputValue(duplicatedDocument.date),
      }));
      setCategoryValues((prev) => ({
        ...prev,
        [duplicatedDocument.id]: duplicatedDocument.category,
      }));
      setNameValues((prev) => ({
        ...prev,
        [duplicatedDocument.id]: duplicatedDocument.name,
      }));
      setAmountValues((prev) => ({
        ...prev,
        ...Object.fromEntries(
          duplicatedDocument.entries.map((entry) => [
            entry.id,
            formatAmountInputValue(entry.amount),
          ]),
        ),
      }));
      setExpandedDocumentId(duplicatedDocument.id);
      setDuplicatedDocumentId(duplicatedDocument.id);
    } catch (error) {
      setDuplicateErrors((prev) => ({
        ...prev,
        [doc.id]:
          error instanceof Error
            ? error.message
            : 'Document copy failed.',
      }));
    } finally {
      setDuplicatingDocumentId((current) =>
        current === doc.id ? null : current,
      );
    }
  };

  const handleDocumentDeleted = (documentId: number) => {
    const deletedDocument = documentsState.find((doc) => doc.id === documentId);
    const entryIds = new Set(
      deletedDocument?.entries.map((entry) => entry.id) ?? [],
    );

    setDocumentsState((prev) => prev.filter((doc) => doc.id !== documentId));

    const clearKey =
      (documentId: number) =>
      <T>(prev: Record<number, T>) => {
        const next = { ...prev };
        delete next[documentId];
        return next;
      };

    setDeleteErrors(clearKey(documentId));
    setDateValues(clearKey(documentId));
    setDateErrors(clearKey(documentId));
    setCategoryValues(clearKey(documentId));
    setNameValues(clearKey(documentId));
    setMetadataErrors(clearKey(documentId));
    setDuplicateErrors(clearKey(documentId));
    setAmountErrors(clearKey(documentId));
    setDeletedEntryIdsByDocument(clearKey(documentId));
    setAmountValues((prev) => {
      const next = { ...prev };
      for (const entryId of entryIds) {
        delete next[entryId];
      }
      return next;
    });

    if (activeDocumentId === documentId) setExpandedDocumentId(null);
    if (savingId === documentId) setSavingId(null);
    if (savedId === documentId) setSavedId(null);
    if (savingMetadataDocumentId === documentId)
      setSavingMetadataDocumentId(null);
    if (savedMetadataDocumentId === documentId)
      setSavedMetadataDocumentId(null);
    if (savingAmountsDocumentId === documentId)
      setSavingAmountsDocumentId(null);
    if (savedAmountsDocumentId === documentId) setSavedAmountsDocumentId(null);
    if (duplicatingDocumentId === documentId) setDuplicatingDocumentId(null);
    if (duplicatedDocumentId === documentId) setDuplicatedDocumentId(null);

    accountPickerHook.cleanupForDeletedDocument(documentId, entryIds);
  };

  const handleAmountsSave = async (doc: DocumentSummary) => {
    const deletedEntryIds = deletedEntryIdsByDocument[doc.id] ?? [];
    const visibleEntries = doc.entries.filter(
      (entry) => !deletedEntryIds.includes(entry.id),
    );

    if (visibleEntries.length < 2) {
      setAmountErrors((prev) => ({
        ...prev,
        [doc.id]: 'Document must have at least two entry rows remaining.',
      }));
      return;
    }

    const payloadEntries = [];

    for (const entry of visibleEntries) {
      const parsedAmount = parseAmountInputValue(
        amountValues[entry.id] ?? formatAmountInputValue(entry.amount),
      );

      if (parsedAmount == null) {
        setAmountErrors((prev) => ({
          ...prev,
          [doc.id]: 'Fix all amounts to 0.00 before saving.',
        }));
        return;
      }

      payloadEntries.push({
        id: entry.id,
        amount: parsedAmount,
      });
    }

    const draftDebitTotal = payloadEntries
      .filter((entry, index) => visibleEntries[index]?.debit)
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);
    const draftCreditTotal = payloadEntries
      .filter((entry, index) => !visibleEntries[index]?.debit)
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);

    if (draftDebitTotal !== draftCreditTotal) {
      setAmountErrors((prev) => ({
        ...prev,
        [doc.id]: 'Debit and credit amounts must match before saving.',
      }));
      return;
    }

    setSavingAmountsDocumentId(doc.id);
    setAmountErrors((prev) => ({ ...prev, [doc.id]: '' }));

    try {
      const payload = await saveDocumentEntriesAction(doc.id, {
        entries: payloadEntries,
        deletedEntryIds,
      }) as {
        entries?: Array<{ id: number; amount: number }>;
        deletedEntryIds?: number[];
        debitTotal?: number;
      } | null;

      const savedAmountMap = new Map(
        (payload?.entries ?? payloadEntries).map((entry) => [
          entry.id,
          entry.amount,
        ]),
      );

      setDocumentsState((prev) =>
        prev.map((currentDoc) => {
          if (currentDoc.id !== doc.id) return currentDoc;

          const savedDeletedEntryIds = new Set(
            payload?.deletedEntryIds ?? deletedEntryIds,
          );
          const nextEntries = currentDoc.entries
            .filter((entry) => !savedDeletedEntryIds.has(entry.id))
            .map((entry) => ({
              ...entry,
              amount: savedAmountMap.get(entry.id) ?? entry.amount,
            }));
          const nextAccountNames = buildAccountNames(nextEntries);
          const nextDebitTotal =
            payload?.debitTotal ??
            nextEntries
              .filter((entry) => entry.debit)
              .reduce((sum, entry) => sum + entry.amount, 0);
          const nextVatTotal = nextEntries
            .filter((entry) => entry.debit && entry.isVatEntry)
            .reduce((sum, entry) => sum + entry.amount, 0);

          return {
            ...currentDoc,
            entries: nextEntries,
            entryCount: nextEntries.length,
            accountNames: nextAccountNames,
            description:
              currentDoc.name || nextEntries[0]?.description || currentDoc.code,
            debitTotal: nextDebitTotal,
            netTotal: Math.round((nextDebitTotal - nextVatTotal) * 100) / 100,
          };
        }),
      );
      setAmountValues((prev) => ({
        ...prev,
        ...Object.fromEntries(
          [...savedAmountMap.entries()].map(([entryId, amount]) => [
            entryId,
            formatAmountInputValue(amount),
          ]),
        ),
      }));
      setDeletedEntryIdsByDocument((prev) => {
        if (!(doc.id in prev)) return prev;
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      setSavedAmountsDocumentId(doc.id);
    } catch (error) {
      setAmountErrors((prev) => ({
        ...prev,
        [doc.id]:
          error instanceof Error
            ? error.message
            : 'Amounts save failed.',
      }));
    } finally {
      setSavingAmountsDocumentId((current) =>
        current === doc.id ? null : current,
      );
    }
  };

  const handleReceiptChange = useCallback(
    (
      documentId: number,
      nextPath: string | null,
      nextSource: ReceiptSource,
    ) => {
      setDocumentsState((prev) =>
        prev.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                hasReceiptPdf: nextPath !== null,
                receiptPath: nextPath,
                receiptSource: nextSource,
              }
            : doc,
        ),
      );
    },
    [setDocumentsState],
  );

  return {
    documentsState,
    documentsWithResolvedLabels: labels.documentsWithResolvedLabels,
    draftLabelsByDocumentId: labels.draftLabelsByDocumentId,

    dateValues,
    updateDateValue,
    dateErrors,
    savingId,
    savedId,

    categoryValues,
    updateCategoryValue,
    nameValues,
    updateNameValue,
    metadataErrors,
    savingMetadataDocumentId,
    savedMetadataDocumentId,

    amountValues,
    updateAmountValue,
    amountErrors,
    savingAmountsDocumentId,
    savedAmountsDocumentId,
    deletedEntryIdsByDocument,
    markEntryForDeletion,
    clearPendingDeletions,

    duplicatingDocumentId,
    duplicateErrors,
    duplicatedDocumentId,

    deleteErrors,
    setDeleteErrors,
    handleDocumentDeleted,

    handleDocumentSave,
    handleAmountsSave,
    handleDuplicateDocument,

    accountPicker: accountPickerHook.accountPicker,
    accountPickerDocumentId: accountPickerHook.accountPickerDocumentId,
    accountSearch: accountPickerHook.accountSearch,
    setAccountSearch: accountPickerHook.setAccountSearch,
    filteredAccounts: accountPickerHook.filteredAccounts,
    accountPickerEntry: accountPickerHook.accountPickerEntry,
    savingAccountEntryId: accountPickerHook.savingAccountEntryId,
    accountModalError: accountPickerHook.accountModalError,
    openAccountPicker: accountPickerHook.openAccountPicker,
    closeAccountPicker: accountPickerHook.closeAccountPicker,
    handleEntryAccountChange: accountPickerHook.handleEntryAccountChange,

    handleReceiptChange,
  };
}
