'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, LockOpen } from 'lucide-react';
import { setPeriodLockAction } from '@/actions/app-actions';

export default function PeriodLockToggle({
  periodId,
  locked,
  label,
}: {
  periodId: number;
  locked: boolean;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [currentLocked, setCurrentLocked] = useState(locked);

  useEffect(() => {
    setCurrentLocked(locked);
  }, [locked]);

  async function toggle() {
    const nextLocked = !currentLocked;
    const action = currentLocked ? 'unlock' : 'lock';
    if (!confirm(`${action === 'unlock' ? 'Unlock' : 'Lock'} period ${label}?`)) return;

    setBusy(true);
    try {
      await setPeriodLockAction(periodId, nextLocked);
      setCurrentLocked(nextLocked);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        currentLocked
          ? 'border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
          : 'border-border-subtle bg-surface-0/60 text-text-secondary hover:border-accent/20 hover:text-text-primary'
      }`}
    >
      {busy ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving
        </>
      ) : currentLocked ? (
        <>
          <LockOpen className="h-3.5 w-3.5" />
          Unlock
        </>
      ) : (
        <>
          <Lock className="h-3.5 w-3.5" />
          Lock
        </>
      )}
    </button>
  );
}
