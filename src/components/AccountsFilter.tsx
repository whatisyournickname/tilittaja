'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Copy, Trash2 } from 'lucide-react';
import {
  ACCOUNT_TYPES,
  AccountType,
  COAHeading,
  AccountOption,
} from '@/lib/types';
import { SortableHeader, SortState, toggleSort } from './SortableHeader';
import SearchInput from '@/components/SearchInput';
import AccountEditorModal, { AccountFormData } from './AccountEditorModal';
import {
  cloneAccountAction,
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from '@/actions/app-actions';

const TYPE_COLORS: Record<number, string> = {
  0: 'bg-amber-400/10 text-amber-400',
  1: 'bg-purple-400/10 text-purple-400',
  2: 'bg-indigo-400/10 text-indigo-400',
  3: 'bg-emerald-400/10 text-emerald-400',
  4: 'bg-rose-400/10 text-rose-400',
  5: 'bg-yellow-400/10 text-yellow-400',
  6: 'bg-orange-400/10 text-orange-400',
};

interface Section {
  heading: COAHeading;
  accounts: AccountOption[];
  subHeadings: COAHeading[];
}

type Row =
  | { kind: 'heading'; heading: COAHeading }
  | { kind: 'account'; account: AccountOption };

type SortKey = 'number' | 'name' | 'type' | 'vat_percentage';

type ModalMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; account: AccountOption }
  | { kind: 'clone'; account: AccountOption };

function buildRows(
  sectionAccounts: AccountOption[],
  sectionHeadings: COAHeading[],
): Row[] {
  const allItems = [
    ...sectionHeadings.map((h) => ({
      sortKey: h.number + '0',
      item: { kind: 'heading' as const, heading: h },
    })),
    ...sectionAccounts.map((a) => ({
      sortKey: a.number + '1',
      item: { kind: 'account' as const, account: a },
    })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return allItems.map((i) => i.item);
}

function sortAccounts(
  accounts: AccountOption[],
  sort: SortState<SortKey>,
): AccountOption[] {
  const { key, direction } = sort;
  const mult = direction === 'asc' ? 1 : -1;
  return [...accounts].sort((a, b) => {
    switch (key) {
      case 'number':
        return a.number.localeCompare(b.number) * mult;
      case 'name':
        return a.name.localeCompare(b.name, 'fi') * mult;
      case 'type':
        return (a.type - b.type) * mult;
      case 'vat_percentage':
        return (a.vat_percentage - b.vat_percentage) * mult;
      default:
        return 0;
    }
  });
}

export default function AccountsFilter({
  sections,
  totalCount,
}: {
  sections: Section[];
  totalCount: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [modal, setModal] = useState<ModalMode>({ kind: 'closed' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountOption | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    setModal({ kind: 'closed' });
    setError(null);
    setSaving(false);
  }, []);

  const handleCreate = useCallback(
    async (data: AccountFormData) => {
      setSaving(true);
      setError(null);
      try {
        await createAccountAction(data);
        closeModal();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Account creation failed');
      } finally {
        setSaving(false);
      }
    },
    [closeModal, router],
  );

  const handleEdit = useCallback(
    async (data: AccountFormData) => {
      if (modal.kind !== 'edit') return;
      setSaving(true);
      setError(null);
      try {
        await updateAccountAction(modal.account.id, data);
        closeModal();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Account update failed');
      } finally {
        setSaving(false);
      }
    },
    [modal, closeModal, router],
  );

  const handleClone = useCallback(
    async (data: AccountFormData) => {
      if (modal.kind !== 'clone') return;
      setSaving(true);
      setError(null);
      try {
        await cloneAccountAction(modal.account.id, {
          number: data.number,
          name: data.name,
        });
        closeModal();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Account clone failed');
      } finally {
        setSaving(false);
      }
    },
    [modal, closeModal, router],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccountAction(deleteTarget.id);
      setDeleteTarget(null);
      router.refresh();
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : 'Account deletion failed',
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, router]);

  const filteredSections = sections
    .map((section) => {
      const filteredAccounts = section.accounts.filter((acc) => {
        const matchesType = typeFilter === null || acc.type === typeFilter;
        if (!matchesType) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return acc.number.includes(q) || acc.name.toLowerCase().includes(q);
      });
      return { ...section, accounts: filteredAccounts };
    })
    .filter((s) => s.accounts.length > 0);

  const visibleCount = filteredSections.reduce(
    (sum, s) => sum + s.accounts.length,
    0,
  );

  const typeOptions = [0, 1, 2, 3, 4] as const;

  const handleSort = (key: SortKey) => setSort(toggleSort(sort, key));

  const isSorted = sort !== null;

  const modalTitle =
    modal.kind === 'create'
      ? 'New account'
      : modal.kind === 'edit'
        ? 'Edit account'
        : modal.kind === 'clone'
          ? 'Clone account'
          : '';

  const modalAccount =
    modal.kind === 'edit' || modal.kind === 'clone' ? modal.account : null;
  const modalInitial = useMemo<Partial<AccountFormData> | undefined>(() => {
    if (modal.kind === 'edit' && modalAccount) {
      return {
        number: modalAccount.number,
        name: modalAccount.name,
        type: modalAccount.type,
        vat_percentage: modalAccount.vat_percentage,
      };
    }
    if (modal.kind === 'clone' && modalAccount) {
      return {
        number: '',
        name: `${modalAccount.name} (copy)`,
        type: modalAccount.type,
        vat_percentage: modalAccount.vat_percentage,
      };
    }
    return undefined;
  }, [modal.kind, modalAccount]);

  const modalHandler =
    modal.kind === 'create'
      ? handleCreate
      : modal.kind === 'edit'
        ? handleEdit
        : modal.kind === 'clone'
          ? handleClone
          : handleCreate;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search accounts..."
          className="flex-1"
        />
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
              typeFilter === null
                ? 'bg-accent-muted text-accent-light'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-3/60'
            }`}
          >
            All
          </button>
          {typeOptions.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className={`px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-accent-muted text-accent-light'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-3/60'
              }`}
            >
              {ACCOUNT_TYPES[t as AccountType]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setModal({ kind: 'create' })}
          className="flex items-center gap-1.5 rounded-lg bg-accent/90 px-3 py-2 text-xs font-semibold text-surface-0 transition hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          New account
        </button>
      </div>

      <div className="space-y-4">
        {filteredSections.map((section) => {
          const rows = isSorted
            ? sortAccounts(section.accounts, sort).map((a) => ({
                kind: 'account' as const,
                account: a,
              }))
            : search || typeFilter !== null
              ? section.accounts.map((a) => ({
                  kind: 'account' as const,
                  account: a,
                }))
              : buildRows(section.accounts, section.subHeadings);

          return (
            <div
              key={section.heading.id}
              className="surface-card rounded-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border-subtle bg-surface-2/60">
                <h2 className="text-sm font-semibold text-text-primary">
                  {section.heading.text}
                </h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle/50">
                    <SortableHeader
                      label="No."
                      sortKey="number"
                      current={sort}
                      onSort={handleSort}
                      className="w-20"
                    />
                    <SortableHeader
                      label="Name"
                      sortKey="name"
                      current={sort}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Type"
                      sortKey="type"
                      current={sort}
                      onSort={handleSort}
                      className="w-28"
                    />
                    <SortableHeader
                      label="ALV"
                      sortKey="vat_percentage"
                      current={sort}
                      onSort={handleSort}
                      align="right"
                      className="w-16"
                    />
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="table-divide-subtle">
                  {rows.map((row) => {
                    if (row.kind === 'heading') {
                      const indent = Math.max(0, (row.heading.level - 1) * 16);
                      return (
                        <tr
                          key={`h-${row.heading.id}`}
                          className="bg-surface-2/40"
                        >
                          <td
                            colSpan={5}
                            className="px-3 py-1.5 text-xs font-semibold text-text-secondary"
                            style={{ paddingLeft: `${16 + indent}px` }}
                          >
                            {row.heading.text}
                          </td>
                        </tr>
                      );
                    }
                    const acc = row.account;
                    return (
                      <tr
                        key={`a-${acc.id}`}
                        className="group hover:bg-surface-3/40 transition-colors"
                      >
                        <td className="px-3 py-1.5 text-xs font-mono text-accent">
                          {acc.number}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-text-primary">
                          {acc.name}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[acc.type] || 'text-text-muted'}`}
                          >
                            {ACCOUNT_TYPES[acc.type as AccountType]}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-text-secondary text-right">
                          {acc.vat_percentage > 0
                            ? `${acc.vat_percentage}%`
                            : ''}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() =>
                                setModal({ kind: 'edit', account: acc })
                              }
                              className="rounded p-2 text-text-muted transition hover:bg-surface-3/80 hover:text-text-primary"
                              title="Edit"
                              aria-label="Edit account"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setModal({ kind: 'clone', account: acc })
                              }
                              className="rounded p-2 text-text-muted transition hover:bg-surface-3/80 hover:text-text-primary"
                              title="Clone"
                              aria-label="Clone account"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setDeleteTarget(acc);
                                setDeleteError(null);
                              }}
                              className="rounded p-2 text-text-muted transition hover:bg-error/10 hover:text-error"
                              title="Delete"
                              aria-label="Delete account"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {(search || typeFilter !== null) && visibleCount !== totalCount && (
        <p className="text-xs text-text-muted">
          {visibleCount} / {totalCount} accounts
        </p>
      )}

      <AccountEditorModal
        open={modal.kind !== 'closed'}
        onClose={closeModal}
        onSave={modalHandler}
        title={modalTitle}
        initial={modalInitial}
        saving={saving}
        error={error}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (!deleting) setDeleteTarget(null);
            }}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border-subtle bg-surface-1 shadow-2xl p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-2">
              Delete account?
            </h2>
            <p className="text-xs text-text-secondary mb-1">
              Are you sure you want to delete account '{deleteTarget.number} {deleteTarget.name}'?
            </p>
            <p className="text-xs text-text-muted mb-4">
              Account cannot be deleted if it has entries.
            </p>
            {deleteError && (
              <p className="text-xs text-error mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg px-4 py-2 text-xs font-medium text-text-muted transition hover:bg-surface-3/60 hover:text-text-primary disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-error/90 px-4 py-2 text-xs font-semibold text-white transition hover:bg-error disabled:opacity-40"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
