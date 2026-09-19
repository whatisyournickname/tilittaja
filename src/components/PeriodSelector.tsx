'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Period } from '@/lib/types';
import { periodLabel } from '@/lib/accounting';

interface PeriodSelectorProps {
  periods: Period[];
  currentPeriodId: number;
  basePath?: string;
}

export default function PeriodSelector({
  periods,
  currentPeriodId,
  basePath,
}: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedPeriodId =
    Number(searchParams.get('period')) || currentPeriodId;

  return (
    <select
      value={selectedPeriodId}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('period', e.target.value);
        router.push(`${basePath || ''}?${params.toString()}`);
      }}
      className="bg-surface-2 border border-border-subtle text-text-primary text-sm rounded-lg px-3 py-2 outline-none transition focus:ring-1 focus:ring-accent/20 focus:border-accent/40"
    >
      {periods.map((p) => (
        <option key={p.id} value={p.id}>
          {periodLabel(p.start_date, p.end_date)}
          {p.locked ? ' (locked)' : ''}
        </option>
      ))}
    </select>
  );
}
