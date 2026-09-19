'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { ACCOUNT_TYPES } from '@/lib/types';

export interface AccountFormData {
  number: string;
  name: string;
  type: number;
  vat_percentage: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: AccountFormData) => Promise<void>;
  title: string;
  initial?: Partial<AccountFormData>;
  saving?: boolean;
  error?: string | null;
}

const typeEntries = Object.entries(ACCOUNT_TYPES)
  .filter(([k]) => Number(k) <= 4)
  .map(([k, v]) => ({ value: Number(k), label: v }));

interface AccountEditorModalContentProps {
  onClose: () => void;
  onSave: (data: AccountFormData) => Promise<void>;
  title: string;
  initial?: Partial<AccountFormData>;
  saving: boolean;
  error: string | null;
}

function AccountEditorModalContent({
  onClose,
  onSave,
  title,
  initial,
  saving,
  error,
}: AccountEditorModalContentProps) {
  const { containerRef, handleKeyDown } = useModalA11y(onClose);
  const [number, setNumber] = useState(() => initial?.number ?? '');
  const [name, setName] = useState(() => initial?.name ?? '');
  const [type, setType] = useState(() => initial?.type ?? 0);
  const [vatPercentage, setVatPercentage] = useState(
    () => initial?.vat_percentage ?? 0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ number, name, type, vat_percentage: vatPercentage });
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-xl border border-border-subtle bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-muted transition hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-[100px_1fr] gap-4">
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                Account number
              </label>
              <input
                type="text"
                autoFocus
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="input-field font-mono"
                placeholder="1000"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="Account name"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                Tyyppi
              </label>
              <select
                value={type}
                onChange={(e) => setType(Number(e.target.value))}
                className="input-field"
              >
                {typeEntries.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                ALV %
              </label>
              <input
                type="number"
                value={vatPercentage}
                onChange={(e) => setVatPercentage(Number(e.target.value))}
                className="input-field"
                min={0}
                max={100}
                step={0.01}
              />
            </div>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-text-muted transition hover:bg-surface-3/60 hover:text-text-primary"
            >
              Peruuta
            </button>
            <button
              type="submit"
              disabled={saving || !number.trim() || !name.trim()}
              className="rounded-lg bg-accent/90 px-4 py-2 text-xs font-semibold text-surface-0 transition hover:bg-accent disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AccountEditorModal({
  open,
  onClose,
  onSave,
  title,
  initial,
  saving = false,
  error = null,
}: Props) {
  const modalKey = useMemo(
    () =>
      JSON.stringify({
        title,
        number: initial?.number ?? '',
        name: initial?.name ?? '',
        type: initial?.type ?? 0,
        vatPercentage: initial?.vat_percentage ?? 0,
      }),
    [initial, title],
  );

  if (!open) return null;

  return (
    <AccountEditorModalContent
      key={modalKey}
      onClose={onClose}
      onSave={onSave}
      title={title}
      initial={initial}
      saving={saving}
      error={error}
    />
  );
}
