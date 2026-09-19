import {
  formatAmount,
  type StatementSummary,
  type FinancialStatementRow,
} from '@/lib/financial-statement';

function StatementTable({
  rows,
  comparisonLabel,
}: {
  rows: FinancialStatementRow[];
  comparisonLabel: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border-subtle">
            <th className="text-left px-6 py-2 text-xs uppercase tracking-wide text-text-secondary">
              Item
            </th>
            <th className="text-right px-6 py-2 text-xs uppercase tracking-wide text-text-secondary">
              Current period
            </th>
            <th className="text-right px-6 py-2 text-xs uppercase tracking-wide text-text-secondary">
              {comparisonLabel || 'Comparison period'}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (!row.visible) return null;
            if (row.type === '-') {
              return (
                <tr key={index}>
                  <td className="py-2" colSpan={3}>
                    <div className="border-t border-border-subtle" />
                  </td>
                </tr>
              );
            }
            const isHeader = row.type === 'H' || row.type === 'G';
            const isBold = row.style === 'B';
            return (
              <tr key={index} className="border-b border-border-subtle/30">
                <td
                  className={`px-6 py-2 text-sm ${
                    isHeader ? 'text-text-primary' : 'text-text-secondary'
                  } ${isBold ? 'font-semibold' : ''}`}
                  style={{ paddingLeft: `${24 + row.level * 20}px` }}
                >
                  {row.label}
                </td>
                <td className="px-6 py-2 text-sm text-right font-mono text-text-primary">
                  {isHeader && row.type !== 'S' && row.type !== 'T'
                    ? ''
                    : formatAmount(row.currentAmount)}
                </td>
                <td className="px-6 py-2 text-sm text-right font-mono text-text-secondary">
                  {isHeader && row.type !== 'S' && row.type !== 'T'
                    ? ''
                    : formatAmount(row.previousAmount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CollapsibleStatementCard({
  title,
  rows,
  comparisonLabel,
  summary,
}: {
  title: string;
  rows: FinancialStatementRow[];
  comparisonLabel: string | null;
  summary: StatementSummary;
}) {
  return (
    <details className="group bg-surface-2/50 border border-border-subtle rounded-xl overflow-hidden">
      <summary className="list-none cursor-pointer select-none px-6 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <p
              className={`mt-1 text-sm ${summary.ok ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {summary.text}
            </p>
          </div>
          <span className="text-xs font-medium text-text-secondary group-open:hidden">
            Open
          </span>
          <span className="hidden text-xs font-medium text-text-secondary group-open:inline">
            Close
          </span>
        </div>
      </summary>
      <div className="border-t border-border-subtle">
        <StatementTable rows={rows} comparisonLabel={comparisonLabel} />
      </div>
    </details>
  );
}
