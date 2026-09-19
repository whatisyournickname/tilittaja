'use client';

import { useEffect, useState } from 'react';
import { BadgeInfo, Building2, Check, Loader2, Pencil, X } from 'lucide-react';
import { updateCompanyInfoAction } from '@/actions/app-actions';

interface Props {
  name: string;
  businessId: string;
}

export default function CompanyInfoEditor({ name, businessId }: Props) {
  const [savedName, setSavedName] = useState(name);
  const [savedBusinessId, setSavedBusinessId] = useState(businessId);
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(name);
  const [businessIdValue, setBusinessIdValue] = useState(businessId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasChanges =
    nameValue.trim() !== savedName.trim() ||
    businessIdValue.trim() !== savedBusinessId.trim();

  useEffect(() => {
    setSavedName(name);
    setSavedBusinessId(businessId);
    if (!editing) {
      setNameValue(name);
      setBusinessIdValue(businessId);
    }
  }, [businessId, editing, name]);

  function handleCancel() {
    setNameValue(savedName);
    setBusinessIdValue(savedBusinessId);
    setError(null);
    setEditing(false);
  }

  async function handleSave() {
    if (!nameValue.trim()) {
      setError('Yrityksen nimi on pakollinen');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCompanyInfoAction({
        name: nameValue,
        businessId: businessIdValue,
      });
      setSavedName(nameValue.trim());
      setSavedBusinessId(businessIdValue.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Basic information
          </p>
          <h2 className="mt-2 text-lg font-semibold text-text-primary">
            Company information
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-text-secondary">
            Name and business ID are shown on reports, PDF materials, and other
            company-specific views.
          </p>
        </div>

        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
          >
            <Pencil size={14} />
            Edit
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-light hover:text-surface-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Tallenna
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-0/50 px-3.5 py-2 text-sm font-medium text-text-secondary transition hover:border-border-medium hover:text-text-primary disabled:opacity-50"
            >
              <X size={14} />
              Peruuta
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border-subtle bg-surface-0/35 p-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Building2 className="h-4 w-4 text-accent" />
            <label className="text-xs font-medium uppercase tracking-[0.16em]">
              Name
            </label>
          </div>
          {editing ? (
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="input-field mt-3 rounded-xl! px-3.5! py-2.5! text-sm!"
            />
          ) : (
            <p className="mt-3 text-sm font-medium text-text-primary">
              {nameValue}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface-0/35 p-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <BadgeInfo className="h-4 w-4 text-accent" />
            <label className="text-xs font-medium uppercase tracking-[0.16em]">
              Y-tunnus
            </label>
          </div>
          {editing ? (
            <input
              type="text"
              value={businessIdValue}
              onChange={(e) => setBusinessIdValue(e.target.value)}
              placeholder="1234567-8"
              className="input-field mt-3 rounded-xl! px-3.5! py-2.5! text-sm!"
            />
          ) : (
            <p className="mt-3 text-sm font-medium text-text-primary">
              {businessIdValue || '—'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
