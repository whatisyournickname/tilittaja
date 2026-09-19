'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Download, Eye, FileText, Landmark, X } from 'lucide-react';
import { buildPdfPreviewSrc } from '@/lib/pdf-preview';

interface MaterialItem {
  kind: string;
  label: string;
}

interface PreviewState {
  title: string;
  src: string;
}

interface Props {
  periodId: number;
  materialItems: MaterialItem[];
}

interface PdfActionItem {
  id: string;
  title: string;
  downloadUrl: string;
  previewUrl: string;
}

function IconButton({
  onClick,
  href,
  title,
  children,
  variant = 'ghost',
}: {
  onClick?: () => void;
  href?: string;
  title: string;
  children: React.ReactNode;
  variant?: 'ghost' | 'accent';
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center rounded-md p-2 transition-colors';
  const styles =
    variant === 'accent'
      ? `${base} text-accent hover:bg-accent/15`
      : `${base} text-text-muted hover:text-text-secondary hover:bg-surface-3/60`;

  if (href) {
    return (
      <a href={href} className={styles} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={styles} title={title}>
      {children}
    </button>
  );
}

export default function FinancialStatementMaterialsPanel({
  periodId,
  materialItems,
}: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const primaryItems: PdfActionItem[] = [
    {
      id: 'annualMeeting',
      title: 'Annual meeting',
      downloadUrl: `/api/reports/annual-meeting/pdf?period=${periodId}`,
      previewUrl: `/api/reports/annual-meeting/pdf?period=${periodId}&preview=1`,
    },
    {
      id: 'financialStatement',
      title: 'Financial statement',
      downloadUrl: `/api/reports/financial-statement/pdf?period=${periodId}`,
      previewUrl: `/api/reports/financial-statement/pdf?period=${periodId}&preview=1`,
    },
  ];

  const openPreview = (item: PdfActionItem) => {
    setPreview({
      title: item.title,
      src: buildPdfPreviewSrc(item.previewUrl),
    });
  };

  return (
    <>
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">
            Primary documents
          </h3>
          <div className="rounded-lg border border-border-subtle overflow-hidden table-divide-60">
            {primaryItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5 bg-surface-1/30 hover:bg-surface-2/40 transition-colors"
              >
                <FileText className="h-4 w-4 text-accent/70 shrink-0" />
                <span className="text-sm font-medium text-text-primary flex-1">
                  {item.title}
                </span>
                <div className="flex items-center gap-0.5">
                  <IconButton
                    onClick={() => openPreview(item)}
                    title="Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    href={item.downloadUrl}
                    title="Download PDF"
                    variant="accent"
                  >
                    <Download className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">
            Attachments
          </h3>
          <div className="rounded-lg border border-border-subtle overflow-hidden table-divide-60">
            {materialItems.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-1/30 hover:bg-surface-2/40 transition-colors">
                <Archive className="h-4 w-4 text-accent/70 shrink-0" />
                <span className="text-sm font-medium text-text-primary flex-1">
                  Appendices
                  <span className="ml-1.5 text-xs text-text-muted font-normal">
                    ({materialItems.length})
                  </span>
                </span>
                <div className="flex items-center gap-0.5">
                  <IconButton
                    href={`/api/reports/materials/zip?period=${periodId}`}
                    title="Download attachments as ZIP"
                    variant="accent"
                  >
                    <Download className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-1/30 hover:bg-surface-2/40 transition-colors">
              <FileText className="h-4 w-4 text-accent/70 shrink-0" />
              <span className="text-sm font-medium text-text-primary flex-1">
                Documents
              </span>
              <div className="flex items-center gap-0.5">
                <IconButton
                  href={`/api/reports/receipts-archive/zip?period=${periodId}`}
                  title="Download documents as ZIP"
                  variant="accent"
                >
                  <Download className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-1/30 hover:bg-surface-2/40 transition-colors">
              <Landmark className="h-4 w-4 text-accent/70 shrink-0" />
              <span className="text-sm font-medium text-text-primary flex-1">
                Bank statements
              </span>
              <div className="flex items-center gap-0.5">
                <IconButton
                  href={`/api/reports/bank-statements-archive/zip?period=${periodId}`}
                  title="Download bank statements as ZIP"
                  variant="accent"
                >
                  <Download className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          </div>
        </div>

        <div>
          <a
            href={`/api/reports/full-archive/zip?period=${periodId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
          >
            <Archive className="h-4 w-4" />
            Download all
          </a>
        </div>
      </div>

      {preview
        ? createPortal(
            <div
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 md:p-8"
              onClick={() => setPreview(null)}
            >
              <div
                className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-0"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {preview.title}
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      PDF preview
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="text-text-secondary transition hover:text-text-primary"
                    aria-label="Close preview"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <iframe
                  title={preview.title}
                  src={preview.src}
                  className="min-h-0 flex-1 bg-white"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
