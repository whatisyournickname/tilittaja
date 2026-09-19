export default function CollapsibleSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group bg-surface-2/50 border border-border-subtle rounded-xl overflow-hidden">
      <summary className="list-none cursor-pointer select-none px-6 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <p className="mt-1 text-sm text-text-secondary">{summary}</p>
          </div>
          <span className="text-xs font-medium text-text-secondary group-open:hidden">
            Open
          </span>
          <span className="hidden text-xs font-medium text-text-secondary group-open:inline">
            Close
          </span>
        </div>
      </summary>
      <div className="border-t border-border-subtle p-6">{children}</div>
    </details>
  );
}
