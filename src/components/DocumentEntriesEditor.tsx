'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { formatCurrency } from '@/lib/accounting';
import {
  formatAmountInputValue,
  parseAmountInputValue,
  toCents,
} from '@/lib/amount-input';
import {
  saveDocumentEntriesAction,
  updateEntryDescriptionAction,
} from '@/actions/app-actions';

interface DocumentEntry {
  id: number;
  account_number: string;
  account_name: string;
  description: string;
  debit: boolean;
  amount: number;
  row_number: number;
}

interface Props {
  documentId: number;
  initialEntries: DocumentEntry[];
}

function formatAmountChangeCount(count: number): string {
  if (count === 1) return '1 summa';
  return `${count} summaa`;
}

export default function DocumentEntriesEditor({
  documentId,
  initialEntries,
}: Props) {
  const [entriesState, setEntriesState] = useState(initialEntries);
  const [descriptionValues, setDescriptionValues] = useState<
    Record<number, string>
  >(() =>
    Object.fromEntries(
      initialEntries.map((entry) => [entry.id, entry.description]),
    ),
  );
  const [amountValues, setAmountValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      initialEntries.map((entry) => [
        entry.id,
        formatAmountInputValue(entry.amount),
      ]),
    ),
  );
  const [savingDescriptionId, setSavingDescriptionId] = useState<number | null>(
    null,
  );
  const [descriptionErrors, setDescriptionErrors] = useState<
    Record<number, string>
  >({});
  const [savedDescriptionId, setSavedDescriptionId] = useState<number | null>(
    null,
  );
  const [savingAmounts, setSavingAmounts] = useState(false);
  const [amountError, setAmountError] = useState('');
  const [amountSaved, setAmountSaved] = useState(false);

  useEffect(() => {
    setEntriesState(initialEntries);
    setDescriptionValues(
      Object.fromEntries(
        initialEntries.map((entry) => [entry.id, entry.description]),
      ),
    );
    setAmountValues(
      Object.fromEntries(
        initialEntries.map((entry) => [
          entry.id,
          formatAmountInputValue(entry.amount),
        ]),
      ),
    );
    setDescriptionErrors({});
    setSavedDescriptionId(null);
    setAmountError('');
    setAmountSaved(false);
  }, [initialEntries]);

  const updateDescriptionValue = (entryId: number, value: string) => {
    setDescriptionValues((prev) => ({ ...prev, [entryId]: value }));
    setDescriptionErrors((prev) => ({ ...prev, [entryId]: '' }));
    if (savedDescriptionId === entryId) setSavedDescriptionId(null);
  };

  const handleDescriptionSave = async (entryId: number) => {
    const nextDescription = descriptionValues[entryId] ?? '';

    setSavingDescriptionId(entryId);
    setDescriptionErrors((prev) => ({ ...prev, [entryId]: '' }));

    try {
      const payload = await updateEntryDescriptionAction(entryId, {
        description: nextDescription,
      });

      const savedDescription = payload?.description ?? nextDescription;
      setEntriesState((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? { ...entry, description: savedDescription }
            : entry,
        ),
      );
      setDescriptionValues((prev) => ({
        ...prev,
        [entryId]: savedDescription,
      }));
      setSavedDescriptionId(entryId);
    } catch (error) {
      setDescriptionErrors((prev) => ({
        ...prev,
        [entryId]:
          error instanceof Error
            ? error.message
            : 'Failed to save description.',
      }));
    } finally {
      setSavingDescriptionId((current) =>
        current === entryId ? null : current,
      );
    }
  };

  const commitDescriptionIfDirty = async (entryId: number) => {
    const currentEntry = entriesState.find((entry) => entry.id === entryId);
    if (!currentEntry || savingDescriptionId === entryId) return;

    const nextDescription =
      descriptionValues[entryId] ?? currentEntry.description;
    if (nextDescription === currentEntry.description) return;

    await handleDescriptionSave(entryId);
  };

  const resetDescriptionValue = (entryId: number) => {
    const currentEntry = entriesState.find((entry) => entry.id === entryId);
    if (!currentEntry) return;

    setDescriptionValues((prev) => ({
      ...prev,
      [entryId]: currentEntry.description,
    }));
    setDescriptionErrors((prev) => ({ ...prev, [entryId]: '' }));
    setSavedDescriptionId((current) => (current === entryId ? null : current));
  };

  const handleDescriptionKeyDown = (
    entryId: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitDescriptionIfDirty(entryId);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      resetDescriptionValue(entryId);
    }
  };

  const updateAmountValue = (entryId: number, value: string) => {
    setAmountValues((prev) => ({ ...prev, [entryId]: value }));
    setAmountError('');
    setAmountSaved(false);
  };

  const resetAmountValue = (entryId: number) => {
    const currentEntry = entriesState.find((entry) => entry.id === entryId);
    if (!currentEntry) return;

    setAmountValues((prev) => ({
      ...prev,
      [entryId]: formatAmountInputValue(currentEntry.amount),
    }));
    setAmountError('');
    setAmountSaved(false);
  };

  const draftEntries = entriesState.map((entry) => ({
    ...entry,
    parsedAmount: parseAmountInputValue(
      amountValues[entry.id] ?? formatAmountInputValue(entry.amount),
    ),
  }));
  const hasInvalidAmounts = draftEntries.some(
    (entry) => entry.parsedAmount == null,
  );
  const draftDebitTotal = draftEntries
    .filter((entry) => entry.debit && entry.parsedAmount != null)
    .reduce((sum, entry) => sum + toCents(entry.parsedAmount ?? 0), 0);
  const draftCreditTotal = draftEntries
    .filter((entry) => !entry.debit && entry.parsedAmount != null)
    .reduce((sum, entry) => sum + toCents(entry.parsedAmount ?? 0), 0);
  const amountsBalanced =
    !hasInvalidAmounts && draftDebitTotal === draftCreditTotal;
  const amountDifference = Math.abs(draftDebitTotal - draftCreditTotal);
  const amountsDirty = draftEntries.some(
    (entry) =>
      entry.parsedAmount != null &&
      toCents(entry.parsedAmount) !== toCents(entry.amount),
  );
  const dirtyAmountCount = draftEntries.filter(
    (entry) =>
      entry.parsedAmount != null &&
      toCents(entry.parsedAmount) !== toCents(entry.amount),
  ).length;

  const handleAmountsSave = async () => {
    const payloadEntries = [];

    for (const entry of entriesState) {
      const parsedAmount = parseAmountInputValue(
        amountValues[entry.id] ?? formatAmountInputValue(entry.amount),
      );

      if (parsedAmount == null) {
        setAmountError('Fix all amounts to 0.00 format before saving.');
        return;
      }

      payloadEntries.push({
        id: entry.id,
        amount: parsedAmount,
      });
    }

    const payloadDebitTotal = payloadEntries
      .filter((entry, index) => entriesState[index]?.debit)
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);
    const payloadCreditTotal = payloadEntries
      .filter((entry, index) => !entriesState[index]?.debit)
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);

    if (payloadDebitTotal !== payloadCreditTotal) {
      setAmountError(
        'Debit and credit totals must match before saving.',
      );
      return;
    }

    setSavingAmounts(true);
    setAmountError('');

    try {
      const payload = await saveDocumentEntriesAction(documentId, {
        entries: payloadEntries,
      });

      const savedAmountMap = new Map(
        (payload?.entries ?? payloadEntries).map((entry) => [
          entry.id,
          entry.amount,
        ]),
      );

      setEntriesState((prev) =>
        prev.map((entry) => ({
          ...entry,
          amount: savedAmountMap.get(entry.id) ?? entry.amount,
        })),
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
      setAmountSaved(true);
    } catch (error) {
      setAmountError(
        error instanceof Error
          ? error.message
          : 'Amounts save failed.',
      );
    } finally {
      setSavingAmounts(false);
    }
  };

  const amountMessage = amountError
    ? { tone: 'error' as const, text: amountError }
    : amountSaved
      ? { tone: 'success' as const, text: 'Summat tallennettu.' }
      : hasInvalidAmounts
        ? {
            tone: 'warning' as const,
            text: 'Fix incomplete amounts to valid format before saving.',
          }
        : !amountsBalanced
          ? {
              tone: 'warning' as const,
              text: `Erotus ${formatCurrency(
                amountDifference / 100,
              )}. Debit and credit totals must match before saving.`,
            }
          : dirtyAmountCount > 0
            ? {
                tone: 'warning' as const,
                text: `${formatAmountChangeCount(dirtyAmountCount)} tallentamatta.`,
              }
            : null;

  const amountSaveLabel = savingAmounts
    ? 'Saving...'
    : dirtyAmountCount === 0
      ? 'No changes'
      : `Save ${formatAmountChangeCount(dirtyAmountCount)}`;

  const handleAmountKeyDown = (
    entryId: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (
        !savingAmounts &&
        amountsDirty &&
        amountsBalanced &&
        !hasInvalidAmounts
      ) {
        void handleAmountsSave();
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      resetAmountValue(entryId);
    }
  };

  return (
    <div className="bg-surface-2/50 border border-border-subtle rounded-lg overflow-hidden">
      <div className="border-b border-border-subtle bg-surface-0/30 px-4 py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Accounting entries
            </div>
            <div className="mt-1 text-xs text-text-secondary">
              Descriptions saved automatically when you leave the field or
              press Enter.
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-secondary">
              <span>
                Debit:{' '}
                <span className="font-mono text-text-primary">
                  {formatCurrency(draftDebitTotal / 100)}
                </span>
              </span>
              <span>
                Credit:{' '}
                <span className="font-mono text-text-primary">
                  {formatCurrency(draftCreditTotal / 100)}
                </span>
              </span>
              <span>
                Erotus:{' '}
                <span
                  className={`font-mono ${
                    amountDifference === 0
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }`}
                >
                  {formatCurrency(amountDifference / 100)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1.5 lg:items-end">
            {amountMessage && (
              <p
                className={`text-[11px] ${
                  amountMessage.tone === 'error'
                    ? 'text-rose-300'
                    : amountMessage.tone === 'warning'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}
              >
                {amountMessage.text}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleAmountsSave()}
              disabled={
                savingAmounts ||
                !amountsDirty ||
                hasInvalidAmounts ||
                !amountsBalanced
              }
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
            >
              {amountSaveLabel}
            </button>
          </div>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-border-subtle">
            <th className="text-left text-[10px] font-medium text-text-secondary uppercase tracking-wider px-3 py-2">
              Row
            </th>
            <th className="text-left text-[10px] font-medium text-text-secondary uppercase tracking-wider px-3 py-2">
              Account
            </th>
            <th className="text-left text-[10px] font-medium text-text-secondary uppercase tracking-wider px-3 py-2">
              Description
            </th>
            <th className="text-right text-[10px] font-medium text-text-secondary uppercase tracking-wider px-3 py-2">
              Debit
            </th>
            <th className="text-right text-[10px] font-medium text-text-secondary uppercase tracking-wider px-3 py-2">
              Credit
            </th>
          </tr>
        </thead>
        <tbody className="table-divide">
          {entriesState.map((entry) => {
            const draftDescriptionValue =
              descriptionValues[entry.id] ?? entry.description;
            const isDescriptionSaving = savingDescriptionId === entry.id;
            const isDescriptionDirty =
              draftDescriptionValue !== entry.description;
            const descriptionMessage = descriptionErrors[entry.id]
              ? {
                  tone: 'error' as const,
                  text: descriptionErrors[entry.id],
                }
              : null;

            return (
              <tr
                key={entry.id}
                className="hover:bg-surface-3/40 transition-colors align-top"
              >
                <td className="px-3 py-2 text-xs font-mono text-text-muted">
                  {entry.row_number}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="text-accent font-mono">
                    {entry.account_number}
                  </span>{' '}
                  <span className="text-text-secondary">
                    {entry.account_name}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-text-secondary">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
                      <input
                        type="text"
                        value={draftDescriptionValue}
                        onChange={(e) =>
                          updateDescriptionValue(entry.id, e.target.value)
                        }
                        onBlur={(event) => {
                          if (
                            event.relatedTarget instanceof HTMLElement &&
                            event.relatedTarget.dataset
                              .skipDescriptionAutosave === 'true'
                          ) {
                            return;
                          }

                          void commitDescriptionIfDirty(entry.id);
                        }}
                        onKeyDown={(event) =>
                          handleDescriptionKeyDown(entry.id, event)
                        }
                        className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-0/60 px-2 py-1 text-xs text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                        placeholder="Enter a description for this row"
                      />
                      <div className="flex items-center gap-2 text-[11px] lg:min-h-7">
                        {isDescriptionSaving ? (
                          <span className="text-text-secondary">
                            Saving...
                          </span>
                        ) : isDescriptionDirty ? (
                          <>
                            <span className="text-amber-300">
                              Tallentamatta
                            </span>
                            <button
                              type="button"
                              onClick={() => resetDescriptionValue(entry.id)}
                              data-skip-description-autosave="true"
                              className="rounded-md border border-border-subtle px-2 py-1 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                            >
                              Peru
                            </button>
                          </>
                        ) : savedDescriptionId === entry.id ? (
                          <span className="text-emerald-300">Saved</span>
                        ) : (
                          <span className="text-text-muted">
                            Enter tallentaa
                          </span>
                        )}
                      </div>
                    </div>
                    {descriptionMessage && (
                      <p
                        className={
                          descriptionMessage.tone === 'error'
                            ? 'text-[11px] text-rose-300'
                            : 'text-[11px] text-emerald-300'
                        }
                      >
                        {descriptionMessage.text}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-right">
                  {entry.debit ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        amountValues[entry.id] ??
                        formatAmountInputValue(entry.amount)
                      }
                      onChange={(e) =>
                        updateAmountValue(entry.id, e.target.value)
                      }
                      onKeyDown={(event) =>
                        handleAmountKeyDown(entry.id, event)
                      }
                      className="w-24 rounded-md border border-border-subtle bg-surface-0/60 px-2 py-1 text-right font-mono text-xs text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                      placeholder="0,00"
                    />
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-right">
                  {!entry.debit ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        amountValues[entry.id] ??
                        formatAmountInputValue(entry.amount)
                      }
                      onChange={(e) =>
                        updateAmountValue(entry.id, e.target.value)
                      }
                      onKeyDown={(event) =>
                        handleAmountKeyDown(entry.id, event)
                      }
                      className="w-24 rounded-md border border-border-subtle bg-surface-0/60 px-2 py-1 text-right font-mono text-xs text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                      placeholder="0,00"
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border-medium">
            <td
              colSpan={3}
              className="px-3 py-2 text-xs font-semibold text-text-primary"
            >
              Total
            </td>
            <td className="px-3 py-2 text-xs text-right font-semibold text-text-primary">
              <span className="font-mono tabular-nums">
                {formatCurrency(draftDebitTotal / 100)}
              </span>
            </td>
            <td className="px-3 py-2 text-xs text-right font-semibold text-text-primary">
              <span className="font-mono tabular-nums">
                {formatCurrency(draftCreditTotal / 100)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
