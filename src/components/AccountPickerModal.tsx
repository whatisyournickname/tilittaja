'use client';

import { Loader2, X } from 'lucide-react';
import { useModalA11y } from '@/hooks/useModalA11y';
import SearchInput from '@/components/SearchInput';
import { getAccountTypeLabel } from '@/lib/account-labels';
import type { AccountOption } from '@/lib/types';

interface ContextItem {
  label: string;
  value: string;
}

interface Props {
  title: string;
  subtitle?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClearSearch?: () => void;
  filteredAccounts: AccountOption[];
  totalAccountCount: number;
  selectedAccountId: number | null;
  selectedAccount?: AccountOption | null;
  currentAccountId?: number | null;
  onSelectAccount: (accountId: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  isSaving?: boolean;
  error?: string;
  contextTitle?: string;
  contextItems?: ContextItem[];
  description?: string;
  emptyResultsText?: string;
  emptyPreviewText?: string;
}

export default function AccountPickerModal({
  title,
  subtitle,
  searchValue,
  onSearchChange,
  filteredAccounts,
  totalAccountCount,
  selectedAccountId,
  selectedAccount = null,
  currentAccountId = null,
  onSelectAccount,
  onClose,
  onConfirm,
  confirmLabel,
  confirmDisabled = false,
  isSaving = false,
  error = '',
  contextTitle = 'Vaikutus rowin',
  contextItems = [],
  description,
  emptyResultsText = 'No accounts found matching your search.',
  emptyPreviewText = 'Valitse listasta tili esikatseltavaksi.',
}: Props) {
  const { containerRef, handleKeyDown } = useModalA11y(onClose);
  const selectedPreviewAccount =
    selectedAccount ??
    (selectedAccountId != null
      ? (filteredAccounts.find((account) => account.id === selectedAccountId) ??
        null)
      : null);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/70 p-4 md:p-8"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3">
          <div>
            <div className="text-sm font-medium text-text-primary">{title}</div>
            {subtitle ? (
              <div className="mt-1 text-xs text-text-secondary">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
            aria-label="Sulje tilivalinta"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="border-b border-border-subtle p-4 xl:border-b-0 xl:border-r">
            <SearchInput
              value={searchValue}
              onChange={onSearchChange}
              placeholder="Search account by number, name, or type..."
              className="mb-3"
            />

            <div className="h-96 overflow-y-auto rounded-lg border border-border-subtle/60 bg-surface-1/50">
              {filteredAccounts.length > 0 ? (
                <div className="divide-y divide-border-subtle">
                  {filteredAccounts.map((account) => {
                    const isSelected = account.id === selectedAccountId;
                    const isCurrent = account.id === currentAccountId;

                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => onSelectAccount(account.id)}
                        className={`block w-full px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-accent/15 text-blue-100'
                            : 'text-text-secondary hover:bg-surface-3/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-text-primary">
                              {account.number} {account.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                              <span>{getAccountTypeLabel(account.type)}</span>
                              <span>ALV {account.vat_percentage}%</span>
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                              Current
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-text-muted">
                  {emptyResultsText}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-text-muted">
                {filteredAccounts.length} / {totalAccountCount} accounts
              </div>
              <button
                type="button"
                disabled={confirmDisabled}
                onClick={onConfirm}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </div>

          <div className="min-h-0 bg-surface-2/40 p-4">
            <div className="flex h-full min-h-0 flex-col">
              {selectedPreviewAccount ? (
                <>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">
                        {selectedPreviewAccount.number}{' '}
                        {selectedPreviewAccount.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                        <span>
                          {getAccountTypeLabel(selectedPreviewAccount.type)}
                        </span>
                        <span>
                          ALV {selectedPreviewAccount.vat_percentage}%
                        </span>
                      </div>
                    </div>
                    {selectedPreviewAccount.id === currentAccountId ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                        Current account
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-border-subtle bg-surface-1/70 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted">
                      {contextTitle}
                    </div>
                    {contextItems.length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {contextItems.map((item) => (
                          <div
                            key={`${item.label}:${item.value}`}
                            className="rounded-lg border border-border-subtle bg-surface-0/40 p-3"
                          >
                            <div className="text-[11px] text-text-muted">
                              {item.label}
                            </div>
                            <div className="mt-1 text-sm text-text-primary">
                              {item.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {description != null ? (
                      <div className="mt-3 rounded-lg border border-border-subtle bg-surface-0/40 p-3">
                        <div className="text-[11px] text-text-muted">
                          Description
                        </div>
                        <div className="mt-1 text-sm text-text-secondary">
                          {description || 'No description'}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {error ? (
                    <p className="mt-4 text-sm text-red-300">{error}</p>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full min-h-96 items-center justify-center rounded-lg border border-border-subtle bg-surface-0 text-sm text-text-muted">
                  {emptyPreviewText}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
