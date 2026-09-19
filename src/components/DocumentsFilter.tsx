'use client';

import {
  useCallback,
  useEffect,
  useState,
  useMemo,
  Fragment,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  ChevronRight,
  Loader2,
  ReceiptText,
  Trash2,
} from 'lucide-react';
import { formatCurrency, formatDate, periodLabel } from '@/lib/accounting';
import {
  formatAmountInputValue,
  parseAmountInputValue,
  toCents,
  normalizeAmountSearchValue,
} from '@/lib/amount-input';
import { getDateInputValue } from '@/lib/date-input';
import {
  type DocumentSummary,
  getMonthKey,
  getMonthLabel,
  getVatSummary,
} from '@/lib/documents-table';
import AccountPickerModal from './AccountPickerModal';
import SearchInput from './SearchInput';
import { SortableHeader, type SortState, toggleSort } from './SortableHeader';
import ReceiptAttachmentPanel from './ReceiptAttachmentPanel';
import DocumentExpandedRow from './DocumentExpandedRow';
import {
  useColumnResize,
  DOCUMENT_EXPAND_COLUMN_WIDTH,
} from '@/hooks/useColumnResize';
import { useDocumentEditing } from '@/hooks/useDocumentEditing';
import { deleteDocumentsAction } from '@/actions/app-actions';
import type { AccountOption } from '@/lib/types';

type SortKey = 'number' | 'date' | 'description' | 'debitTotal';

function ResizableHeaderCell({
  label,
  width,
  align = 'left',
  onResizePointerDown,
  onResizeDoubleClick,
}: {
  label: string;
  width: number;
  align?: 'left' | 'right';
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
}) {
  return (
    <th
      className={`relative px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      style={{ width }}
    >
      <span className="block">{label}</span>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize column ${label} width`}
        title="Drag to resize. Double-click to reset."
        className="absolute inset-y-0 right-0 z-10 w-3 cursor-col-resize touch-none after:absolute after:bottom-2 after:right-1.5 after:top-2 after:w-px after:bg-white/10 after:transition-colors hover:after:bg-accent/60"
        onPointerDown={onResizePointerDown}
        onDoubleClick={onResizeDoubleClick}
      />
    </th>
  );
}

export default function DocumentsFilter({
  documents,
  periodId,
  periodLocked,
  accounts,
}: {
  documents: DocumentSummary[];
  periodId: number;
  periodLocked: boolean;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filterControlClass = 'input-field h-8';

  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('all');
  const [showMissingReceiptsOnly, setShowMissingReceiptsOnly] = useState(false);
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');

  const requestedDocumentId = useMemo(() => {
    const value = Number(searchParams.get('document'));
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [searchParams]);

  const buildExpandedDocumentHref = useCallback(
    (documentId: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (documentId == null) {
        params.delete('document');
      } else {
        params.set('document', String(documentId));
      }
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );

  const setExpandedDocumentId = useCallback(
    (documentId: number | null) => {
      router.replace(buildExpandedDocumentHref(documentId), { scroll: false });
    },
    [buildExpandedDocumentHref, router],
  );

  const {
    columnWidths,
    documentsTableMinWidth,
    startColumnResize,
    resetColumnWidth,
  } = useColumnResize();

  const {
    documentsWithResolvedLabels,
    draftLabelsByDocumentId,

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

    accountPicker,
    accountSearch,
    setAccountSearch,
    filteredAccounts,
    accountPickerEntry,
    savingAccountEntryId,
    accountModalError,
    openAccountPicker,
    closeAccountPicker,
    handleEntryAccountChange,

    handleReceiptChange,
  } = useDocumentEditing({
    documents,
    periodId,
    accounts,
    activeDocumentId: requestedDocumentId,
    setExpandedDocumentId,
  });

  const monthOptions = useMemo(
    () =>
      Array.from(
        new Map(
          documentsWithResolvedLabels.map((doc) => [
            getMonthKey(doc.date),
            {
              value: getMonthKey(doc.date),
              label: getMonthLabel(doc.date),
              sortDate: new Date(
                new Date(doc.date).getFullYear(),
                new Date(doc.date).getMonth(),
                1,
              ).getTime(),
            },
          ]),
        ).values(),
      ).sort((a, b) => a.sortDate - b.sortDate),
    [documentsWithResolvedLabels],
  );

  const filtered = documentsWithResolvedLabels.filter((doc) => {
    const matchesMonth = month === 'all' || getMonthKey(doc.date) === month;
    if (!matchesMonth) return false;
    const matchesReceipt = !showMissingReceiptsOnly || !doc.hasReceiptPdf;
    if (!matchesReceipt) return false;
    if (!search) return true;

    const q = search.toLowerCase();
    const normalizedAmountQuery = normalizeAmountSearchValue(search);
    return (
      String(doc.number).includes(q) ||
      doc.code.toLowerCase().includes(q) ||
      doc.description.toLowerCase().includes(q) ||
      doc.accountNames.some((n) => n.toLowerCase().includes(q)) ||
      formatDate(doc.date).includes(q) ||
      normalizeAmountSearchValue(formatCurrency(doc.debitTotal)).includes(
        normalizedAmountQuery,
      ) ||
      normalizeAmountSearchValue(formatCurrency(doc.netTotal)).includes(
        normalizedAmountQuery,
      )
    );
  });

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, direction } = sort;
    const mult = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (key) {
        case 'number':
          return (a.number - b.number) * mult;
        case 'date':
          return (a.date - b.date) * mult;
        case 'description':
          return a.description.localeCompare(b.description, 'fi') * mult;
        case 'debitTotal':
          return (a.debitTotal - b.debitTotal) * mult;
        default:
          return 0;
      }
    });
  }, [filtered, sort]);

  const selectedDocuments = useMemo(
    () => sorted.filter((doc) => selectedIds.has(doc.id)),
    [selectedIds, sorted],
  );
  const hasSelection = selectedDocuments.length > 0;
  const allSelected =
    sorted.length > 0 && sorted.every((doc) => selectedIds.has(doc.id));

  const activeDocumentId = useMemo(() => {
    if (requestedDocumentId == null) return null;
    return sorted.some((doc) => doc.id === requestedDocumentId)
      ? requestedDocumentId
      : null;
  }, [requestedDocumentId, sorted]);

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(sorted.map((doc) => doc.id));
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [sorted]);

  useEffect(() => {
    if (requestedDocumentId == null) return;
    if (activeDocumentId != null) return;
    router.replace(buildExpandedDocumentHref(null), { scroll: false });
  }, [
    activeDocumentId,
    buildExpandedDocumentHref,
    requestedDocumentId,
    router,
  ]);

  const handleSort = (key: SortKey) => setSort(toggleSort(sort, key));
  const toggleExpand = (id: number) => {
    setExpandedDocumentId(activeDocumentId === id ? null : id);
  };
  const activeDocument =
    sorted.find((doc) => doc.id === activeDocumentId) ?? null;
  const hasActiveFilters =
    search.trim().length > 0 || month !== 'all' || showMissingReceiptsOnly;
  const showFilteredCount =
    hasActiveFilters && filtered.length !== documentsWithResolvedLabels.length;
  const selectionDisabled = periodLocked || isDeletingSelected;

  const toggleSelection = (documentId: number) => {
    if (selectionDisabled) {
      return;
    }

    setBulkDeleteError('');
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectionDisabled) {
      return;
    }

    setBulkDeleteError('');
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(sorted.map((doc) => doc.id)));
  };

  const handleDeleteSelected = async () => {
    if (periodLocked) {
      setBulkDeleteError('Locked period documents cannot be deleted.');
      return;
    }

    if (!hasSelection) {
      setBulkDeleteError('Select at least one document to delete.');
      return;
    }

    const confirmMessage = [
      `Delete ${selectedDocuments.length} selected documents?`,
      '',
      'Entries and linked PDFs will also be removed.',
    ].join('\n');

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeletingSelected(true);
    setBulkDeleteError('');

    try {
      await deleteDocumentsAction({
        documentIds: selectedDocuments.map((document) => document.id),
      });
      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      setBulkDeleteError(
        error instanceof Error
          ? error.message
          : 'Document deletion failed.',
      );
    } finally {
      setIsDeletingSelected(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-4">
          <div className={'card-panel p-3'}>
            <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-col gap-2.5 md:flex-row md:items-center">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search documents by description, account, date, or amount..."
                  className="flex-1"
                />
                <div className="relative md:w-64 md:min-w-64">
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    aria-label="Month filter"
                    className={`${filterControlClass} appearance-none pr-10`}
                  >
                    <option value="all">All months</option>
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <CalendarDays className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                </div>
                <label className="inline-flex h-8 shrink-0 items-center gap-2.5 rounded-md border border-border-subtle bg-surface-0/40 px-3 text-xs text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-border-medium hover:bg-surface-0/50">
                  <input
                    type="checkbox"
                    checked={showMissingReceiptsOnly}
                    onChange={(e) =>
                      setShowMissingReceiptsOnly(e.target.checked)
                    }
                    className="h-4 w-4 rounded border-border-medium bg-surface-0/60 text-accent focus:ring-2 focus:ring-accent/20"
                  />
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <ReceiptText className="h-4 w-4 text-text-muted" />
                    Missing receipt
                  </span>
                </label>
              </div>
            </div>
            {periodLocked ? (
              <div className="mt-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-100">
                Period is locked. Documents are read-only.
              </div>
            ) : null}
          </div>

          {(hasSelection || bulkDeleteError) && (
            <div className="rounded-xl border border-border-subtle bg-surface-2/50 p-4">
              {bulkDeleteError && (
                <div className="mb-3 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-rose-300">
                  {bulkDeleteError}
                </div>
              )}

              {hasSelection && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {selectedDocuments.length} document(s) selected
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      Delete selected documents in one go.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSelected()}
                    disabled={selectionDisabled}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
                  >
                    {isDeletingSelected ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete selected
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={'card-panel overflow-hidden'}>
            <div className="overflow-x-auto">
              <table
                className="table-fixed"
                style={{
                  width: `max(100%, ${documentsTableMinWidth}px)`,
                }}
              >
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: DOCUMENT_EXPAND_COLUMN_WIDTH }} />
                  <col style={{ width: columnWidths.number }} />
                  <col style={{ width: columnWidths.date }} />
                  <col style={{ width: columnWidths.description }} />
                  <col style={{ width: columnWidths.receipt }} />
                  <col style={{ width: columnWidths.statement }} />
                  <col style={{ width: columnWidths.amount }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-white/8 bg-black/20">
                    <th className="w-11 px-2 py-2 text-center">
                      <label className="inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Select all documents"
                          className="h-4 w-4"
                          disabled={selectionDisabled || sorted.length === 0}
                        />
                      </label>
                    </th>
                    <th className="w-8" />
                    <SortableHeader
                      label="No."
                      sortKey="number"
                      current={sort}
                      onSort={handleSort}
                      style={{ width: columnWidths.number }}
                      onResizePointerDown={startColumnResize('number')}
                      onResizeDoubleClick={() => resetColumnWidth('number')}
                    />
                    <SortableHeader
                      label="Date"
                      sortKey="date"
                      current={sort}
                      onSort={handleSort}
                      style={{ width: columnWidths.date }}
                      onResizePointerDown={startColumnResize('date')}
                      onResizeDoubleClick={() => resetColumnWidth('date')}
                    />
                    <SortableHeader
                      label="Description"
                      sortKey="description"
                      current={sort}
                      onSort={handleSort}
                      style={{ width: columnWidths.description }}
                      onResizePointerDown={startColumnResize('description')}
                      onResizeDoubleClick={() =>
                        resetColumnWidth('description')
                      }
                    />
                    <ResizableHeaderCell
                      label="Receipt PDF"
                      width={columnWidths.receipt}
                      onResizePointerDown={startColumnResize('receipt')}
                      onResizeDoubleClick={() => resetColumnWidth('receipt')}
                    />
                    <ResizableHeaderCell
                      label="Statement"
                      width={columnWidths.statement}
                      onResizePointerDown={startColumnResize('statement')}
                      onResizeDoubleClick={() => resetColumnWidth('statement')}
                    />
                    <SortableHeader
                      label="Amount"
                      sortKey="debitTotal"
                      current={sort}
                      onSort={handleSort}
                      align="right"
                      style={{ width: columnWidths.amount }}
                      onResizePointerDown={startColumnResize('amount')}
                      onResizeDoubleClick={() => resetColumnWidth('amount')}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {sorted.map((doc) => {
                    const isExpanded = activeDocumentId === doc.id;
                    const primaryAccount = doc.accountNames[0] ?? null;
                    const additionalAccountCount = Math.max(
                      doc.accountNames.length - 1,
                      0,
                    );
                    const primaryBankStatementLink =
                      doc.bankStatementLinks[0] ?? null;
                    const additionalBankStatementCount = Math.max(
                      doc.bankStatementLinks.length - 1,
                      0,
                    );
                    const deletedEntryIds =
                      deletedEntryIdsByDocument[doc.id] ?? [];
                    const visibleEntries = doc.entries.filter(
                      (entry) => !deletedEntryIds.includes(entry.id),
                    );
                    const visibleDebitTotal =
                      visibleEntries.length > 0
                        ? visibleEntries
                            .filter((entry) => entry.debit)
                            .reduce((sum, entry) => sum + entry.amount, 0)
                        : doc.debitTotal;
                    const { reverseChargeVat, vatAmount } =
                      getVatSummary(visibleEntries);
                    const visibleNetTotal =
                      vatAmount > 0
                        ? Math.round((visibleDebitTotal - vatAmount) * 100) /
                          100
                        : doc.netTotal;
                    const hasVatAmount = vatAmount >= 0.01 && !reverseChargeVat;
                    const displayAmount = reverseChargeVat
                      ? visibleNetTotal
                      : visibleDebitTotal;
                    const pendingDeletionCount = deletedEntryIds.length;
                    const currentDateValue = getDateInputValue(doc.date);
                    const draftDateValue =
                      dateValues[doc.id] ?? currentDateValue;
                    const isSaving = savingId === doc.id;
                    const isDirty = draftDateValue !== currentDateValue;
                    const amountDrafts = visibleEntries.map((entry) => ({
                      id: entry.id,
                      debit: entry.debit,
                      amount: parseAmountInputValue(
                        amountValues[entry.id] ??
                          formatAmountInputValue(entry.amount),
                      ),
                      rawValue:
                        amountValues[entry.id] ??
                        formatAmountInputValue(entry.amount),
                      currentAmount: entry.amount,
                    }));
                    const hasInvalidAmounts = amountDrafts.some(
                      (entry) => entry.amount == null,
                    );
                    const draftDebitTotal = amountDrafts
                      .filter((entry) => entry.debit && entry.amount != null)
                      .reduce(
                        (sum, entry) => sum + toCents(entry.amount ?? 0),
                        0,
                      );
                    const draftCreditTotal = amountDrafts
                      .filter((entry) => !entry.debit && entry.amount != null)
                      .reduce(
                        (sum, entry) => sum + toCents(entry.amount ?? 0),
                        0,
                      );
                    const amountsBalanced =
                      !hasInvalidAmounts &&
                      draftDebitTotal === draftCreditTotal;
                    const amountsDirty =
                      pendingDeletionCount > 0 ||
                      amountDrafts.some(
                        (entry) =>
                          entry.amount != null &&
                          toCents(entry.amount) !==
                            toCents(entry.currentAmount),
                      );
                    const draftCategoryValue =
                      categoryValues[doc.id] ?? doc.category;
                    const draftNameValue = nameValues[doc.id] ?? doc.name;
                    const draftLabel =
                      draftLabelsByDocumentId.get(doc.id) ?? doc;
                    const metadataDirty =
                      draftCategoryValue.trim().toUpperCase() !==
                        doc.category || draftNameValue.trim() !== doc.name;
                    const isSavingMetadata =
                      savingMetadataDocumentId === doc.id;
                    const isSavingAmounts = savingAmountsDocumentId === doc.id;
                    const isSavingDocument = isSaving || isSavingMetadata;
                    const documentDirty = isDirty || metadataDirty;
                    const dateMessage = dateErrors[doc.id]
                      ? {
                          tone: 'error' as const,
                          text: dateErrors[doc.id],
                        }
                      : null;
                    const metadataMessage = metadataErrors[doc.id]
                      ? {
                          tone: 'error' as const,
                          text: metadataErrors[doc.id],
                        }
                      : savedId === doc.id || savedMetadataDocumentId === doc.id
                        ? {
                            tone: 'success' as const,
                            text: 'Document saved.',
                          }
                        : null;
                    const duplicateMessage = duplicateErrors[doc.id]
                      ? {
                          tone: 'error' as const,
                          text: duplicateErrors[doc.id],
                        }
                      : duplicatedDocumentId != null &&
                          activeDocumentId === duplicatedDocumentId &&
                          doc.id === duplicatedDocumentId
                        ? {
                            tone: 'success' as const,
                            text: `Copy created: ${doc.code}.`,
                          }
                        : null;
                    const deleteMessage = deleteErrors[doc.id]
                      ? {
                          tone: 'error' as const,
                          text: deleteErrors[doc.id],
                        }
                      : null;
                    const isDuplicating = duplicatingDocumentId === doc.id;
                    const amountMessage = amountErrors[doc.id]
                      ? {
                          tone: 'error' as const,
                          text: amountErrors[doc.id],
                        }
                      : savedAmountsDocumentId === doc.id
                        ? {
                            tone: 'success' as const,
                            text: 'Amounts saved.',
                          }
                        : pendingDeletionCount > 0
                          ? {
                              tone: 'success' as const,
                              text: `${pendingDeletionCount} ${pendingDeletionCount === 1 ? 'entry' : 'entries'} marked for deletion on save.`,
                            }
                          : visibleEntries.length < 2
                            ? {
                                tone: 'error' as const,
                                text: 'Document must have at least two entry rows remaining.',
                              }
                            : !amountsBalanced
                              ? {
                                  tone: 'error' as const,
                                  text: hasInvalidAmounts
                                    ? 'Fix all amounts to 0.00.'
                                    : 'Debit and credit totals must match before saving.',
                                }
                              : null;

                    return (
                      <Fragment key={doc.id}>
                        <tr
                          className={`group cursor-pointer transition-colors ${
                            isExpanded
                              ? 'bg-accent-muted hover:bg-accent/20'
                              : selectedIds.has(doc.id)
                                ? 'bg-surface-2/80 hover:bg-surface-3/70'
                              : 'hover:bg-white/4'
                          }`}
                          onClick={() => toggleExpand(doc.id)}
                        >
                          <td className="px-2 py-1.5 text-center">
                            <label className="inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(doc.id)}
                                onChange={() => toggleSelection(doc.id)}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Select document ${doc.code}`}
                                className="h-4 w-4"
                                disabled={selectionDisabled}
                              />
                            </label>
                          </td>
                          <td className="w-7 py-1.5 pl-2.5 pr-0">
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-text-muted transition-transform duration-150 ${
                                isExpanded ? 'rotate-90 text-accent-light' : ''
                              }`}
                            />
                          </td>
                          <td className="overflow-hidden px-3 py-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(doc.id);
                              }}
                              className="inline-flex min-h-[32px] items-center font-mono text-xs text-accent-light transition hover:text-accent-light"
                              title={doc.code}
                            >
                              <span className="truncate">{doc.code}</span>
                            </button>
                          </td>
                          <td className="px-3 py-1.5 text-xs tabular-nums text-text-secondary">
                            {formatDate(doc.date)}
                          </td>
                          <td className="max-w-0 px-3 py-1.5">
                            <div className="min-w-0">
                              <div className="truncate text-xs text-text-primary">
                                {doc.description || doc.code}
                              </div>
                              {primaryAccount && (
                                <div className="mt-0.5 truncate text-[11px] text-text-muted">
                                  {primaryAccount}
                                  {additionalAccountCount > 0
                                    ? ` + ${additionalAccountCount} more`
                                    : ''}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-xs">
                            {doc.hasReceiptPdf ? (
                              <span className="inline-flex rounded-full border border-green-400/20 bg-green-500/10 px-2 py-0.5 font-medium text-[11px] text-green-300">
                                Found
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-red-400/20 bg-red-500/10 px-2 py-0.5 font-medium text-[11px] text-red-300">
                                Missing
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-xs">
                            {primaryBankStatementLink ? (
                              <div className="min-w-0">
                                <div className="min-w-0">
                                  <Link
                                    href={`/bank-statements/${primaryBankStatementLink.bank_statement_id}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="block min-h-[32px] truncate text-[11px] text-accent-light transition hover:underline leading-[32px]"
                                    title={`Open statement ${periodLabel(
                                      primaryBankStatementLink.bank_statement_period_start,
                                      primaryBankStatementLink.bank_statement_period_end,
                                    )}`}
                                  >
                                    {periodLabel(
                                      primaryBankStatementLink.bank_statement_period_start,
                                      primaryBankStatementLink.bank_statement_period_end,
                                    )}
                                  </Link>
                                    <div
                                    className="truncate text-[11px] text-text-muted"
                                    title={`${primaryBankStatementLink.bank_statement_account_number} ${primaryBankStatementLink.bank_statement_account_name}`}
                                  >
                                    {
                                      primaryBankStatementLink.bank_statement_account_number
                                    }{' '}
                                    {
                                      primaryBankStatementLink.bank_statement_account_name
                                    }
                                    {primaryBankStatementLink.linked_entry_count >
                                    1
                                      ? ` · ${primaryBankStatementLink.linked_entry_count} rows`
                                      : ''}
                                    {additionalBankStatementCount > 0
                                      ? ` + ${additionalBankStatementCount} more`
                                      : ''}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-medium text-[11px] text-text-muted">
                                No link
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {reverseChargeVat ? (
                              <div
                                className="flex flex-col items-end leading-tight"
                                title={`VAT-exempt ${formatCurrency(visibleNetTotal)}, Reverse-charge EU VAT ${formatCurrency(vatAmount)}`}
                              >
                                <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-text-primary">
                                  {formatCurrency(displayAmount)}
                                </span>
                                <span className="mt-0.5 whitespace-nowrap text-[10px] text-text-muted">
                                  Reverse-charge EU VAT {formatCurrency(vatAmount)}
                                </span>
                              </div>
                            ) : hasVatAmount ? (
                              <div
                                className="flex flex-col items-end leading-tight"
                                title={`VAT-exempt ${formatCurrency(visibleNetTotal)}, ALV ${formatCurrency(vatAmount)}, sis. ALV ${formatCurrency(visibleDebitTotal)}`}
                              >
                                <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-text-primary">
                                  {formatCurrency(visibleDebitTotal)}
                                </span>
                                <span className="mt-0.5 whitespace-nowrap text-[10px] text-text-muted">
                                  {formatCurrency(visibleNetTotal)} + ALV{' '}
                                  {formatCurrency(vatAmount)}
                                </span>
                              </div>
                            ) : (
                              <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-text-primary">
                                {formatCurrency(displayAmount)}
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <DocumentExpandedRow
                                doc={doc}
                                periodId={periodId}
                                periodLocked={periodLocked}
                                draftDateValue={draftDateValue}
                                onDateChange={(value) =>
                                  updateDateValue(doc.id, value)
                                }
                                dateMessage={dateMessage}
                                draftCategoryValue={draftCategoryValue}
                                onCategoryChange={(value) =>
                                  updateCategoryValue(doc.id, value)
                                }
                                draftNameValue={draftNameValue}
                                onNameChange={(value) =>
                                  updateNameValue(doc.id, value)
                                }
                                draftLabel={draftLabel}
                                metadataMessage={metadataMessage}
                                isSavingDocument={isSavingDocument}
                                documentDirty={documentDirty}
                                onDocumentSave={() => {
                                  void handleDocumentSave(doc);
                                }}
                                isDuplicating={isDuplicating}
                                duplicateMessage={duplicateMessage}
                                onDuplicate={() => {
                                  void handleDuplicateDocument(doc);
                                }}
                                deleteMessage={deleteMessage}
                                onDocumentDeleted={() =>
                                  handleDocumentDeleted(doc.id)
                                }
                                onDeleteError={(message) =>
                                  setDeleteErrors((prev) => ({
                                    ...prev,
                                    [doc.id]: message,
                                  }))
                                }
                                visibleEntries={visibleEntries}
                                amountValues={amountValues}
                                onAmountChange={(entryId, value) =>
                                  updateAmountValue(doc.id, entryId, value)
                                }
                                onEntryDelete={(entryId) =>
                                  markEntryForDeletion(doc.id, entryId)
                                }
                                amountMessage={amountMessage}
                                draftDebitTotal={draftDebitTotal}
                                draftCreditTotal={draftCreditTotal}
                                amountsBalanced={amountsBalanced}
                                amountsDirty={amountsDirty}
                                isSavingAmounts={isSavingAmounts}
                                pendingDeletionCount={pendingDeletionCount}
                                onClearPendingDeletions={() =>
                                  clearPendingDeletions(doc.id)
                                }
                                onAmountsSave={() => {
                                  void handleAmountsSave(doc);
                                }}
                                onOpenAccountPicker={(
                                  entryId,
                                  currentAccountId,
                                ) =>
                                  openAccountPicker(
                                    doc.id,
                                    entryId,
                                    currentAccountId,
                                  )
                                }
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sorted.length === 0 && (
              <div className="py-10 text-center text-sm text-text-muted">
                {search || month !== 'all' || showMissingReceiptsOnly
                  ? 'No documents with current filters'
                  : 'No documents in this fiscal year'}
              </div>
            )}
          </div>

          {showFilteredCount ? (
            <p className="text-xs text-text-muted">
              Showing {filtered.length} / {documentsWithResolvedLabels.length} documents
            </p>
          ) : null}
        </div>

        {accountPickerEntry && (
          <AccountPickerModal
            title="Change entry row account"
            subtitle={`${accountPickerEntry.doc.code} · current account ${accountPickerEntry.entry.account_number} ${accountPickerEntry.entry.account_name}`}
            searchValue={accountSearch}
            onSearchChange={setAccountSearch}
            onClearSearch={() => setAccountSearch('')}
            filteredAccounts={filteredAccounts}
            totalAccountCount={accountPicker.sortedAccounts.length}
            selectedAccountId={accountPicker.selectedAccountId}
            selectedAccount={accountPicker.selectedAccount}
            currentAccountId={accountPickerEntry.entry.account_id}
            onSelectAccount={accountPicker.setSelectedAccountId}
            onClose={closeAccountPicker}
            onConfirm={() => {
              if (periodLocked) return;
              void handleEntryAccountChange();
            }}
            confirmLabel={
              savingAccountEntryId === accountPickerEntry.entry.id
                ? 'Saving...'
                : 'Change account'
            }
            confirmDisabled={
              accountPicker.selectedAccountId == null ||
              accountPicker.selectedAccountId ===
                accountPickerEntry.entry.account_id ||
              savingAccountEntryId === accountPickerEntry.entry.id ||
              periodLocked
            }
            isSaving={savingAccountEntryId === accountPickerEntry.entry.id}
            error={accountModalError}
            contextItems={[
              { label: 'Document', value: accountPickerEntry.doc.code },
              {
                label: 'Entry row',
                value: `${accountPickerEntry.entry.debit ? 'Debit' : 'Credit'} · ${formatCurrency(
                  accountPickerEntry.entry.amount,
                )}`,
              },
            ]}
            description={accountPickerEntry.entry.description}
          />
        )}

        <aside className="min-w-0 xl:sticky xl:top-5">
          <div className="rounded-xl border border-border-subtle bg-surface-1/50 p-3">
            <div className="mb-3">
              <h2 className="text-xs font-semibold text-text-primary">
                Preview
              </h2>
              {activeDocument ? (
                <p className="mt-1 text-xs text-text-secondary">
                  {activeDocument.code} -{' '}
                  {activeDocument.description || 'No description'}
                </p>
              ) : (
                <p className="mt-1 text-xs text-text-muted">
                  Select a document on the left to see its PDF here.
                </p>
              )}
            </div>

            {activeDocument ? (
              <ReceiptAttachmentPanel
                key={`${activeDocument.id}:${activeDocument.receiptPath ?? 'none'}:${searchParams.toString()}`}
                documentId={activeDocument.id}
                documentNumber={activeDocument.number}
                documentCode={activeDocument.code}
                readOnly={periodLocked}
                initialReceiptPath={activeDocument.receiptPath}
                initialReceiptSource={activeDocument.receiptSource}
                onReceiptChange={(nextPath, nextSource) =>
                  handleReceiptChange(activeDocument.id, nextPath, nextSource)
                }
              />
            ) : (
              <div className="flex aspect-210/297 items-center justify-center rounded-lg border border-dashed border-border-subtle bg-surface-2/30 p-6 text-center">
                <div>
                  <div className="text-sm font-medium text-text-secondary">
                    No document selected
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    The preview area is reserved for the selected document's PDF.
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
