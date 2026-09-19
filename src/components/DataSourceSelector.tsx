'use client';

import { useRouter } from 'next/navigation';
import { Database } from 'lucide-react';
import { setDatasourceAction } from '@/actions/app-actions';

export default function DataSourceSelector({
  dataSources,
  currentSource,
}: {
  dataSources: { slug: string; name: string }[];
  currentSource: string;
}) {
  const router = useRouter();

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slug = e.target.value;
    await setDatasourceAction(slug);
    router.refresh();
  };

  return (
    <div className="px-2.5 pb-2.5">
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-muted mb-1 px-0.5 font-medium">
        <Database className="w-3 h-3" />
        Database
      </label>
      <select
        id="datasource-select"
        aria-label="Database"
        value={currentSource}
        onChange={handleChange}
        className="w-full bg-surface-2 border border-border-subtle text-text-primary text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-accent/40 focus:border-accent/40 cursor-pointer transition-colors hover:border-border-medium outline-none"
      >
        {dataSources.map((ds) => (
          <option key={ds.slug} value={ds.slug}>
            {ds.name}
          </option>
        ))}
      </select>
    </div>
  );
}
