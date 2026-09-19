'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import type { DocumentImportApiSuccess } from '@/lib/import-types';

interface StartImportParams {
  periodId: number;
  files: File[];
}

interface ImportTaskItem {
  key: string;
  fileName: string;
  status: 'pending' | 'success' | 'error';
  documentId?: number;
  documentNumber?: number;
  category?: string;
  name?: string;
  dateWarning?: string;
  error?: string;
}

interface ImportTask {
  id: string;
  status: 'running' | 'completed';
  createdAt: number;
  periodId: number;
  total: number;
  completed: number;
  items: ImportTaskItem[];
}

interface DocumentImportContextValue {
  startImport: (params: StartImportParams) => void;
}

const DocumentImportContext = createContext<DocumentImportContextValue | null>(
  null,
);

function getTaskCounts(task: ImportTask) {
  return {
    successCount: task.items.filter((item) => item.status === 'success').length,
    errorCount: task.items.filter((item) => item.status === 'error').length,
  };
}

function getDateWarning(
  reason: DocumentImportApiSuccess['fallbackReason'] | undefined,
): string | undefined {
  if (reason === 'missing') {
    return 'Date not reliably detected, used selected period start date.';
  }
  if (reason === 'shifted_year') {
    return 'Date year corrected to selected fiscal year.';
  }
  if (reason === 'outside_period') {
    return 'Detected date not within selected period, used period start date.';
  }
  return undefined;
}

function ToastTaskCard({
  task,
  onDismiss,
}: {
  task: ImportTask;
  onDismiss: (taskId: string) => void;
}) {
  const { successCount, errorCount } = getTaskCounts(task);
  const latestItems = task.items.filter((item) => item.status !== 'pending').slice(-3);
  const isRunning = task.status === 'running';

  return (
    <div className="w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border-subtle bg-surface-1/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent-light" />
            ) : errorCount > 0 ? (
              <AlertCircle className="h-4 w-4 text-rose-300" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            )}
            Documents import
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            {task.completed} / {task.total} done
            {successCount > 0 ? ` · ${successCount} succeeded` : ''}
            {errorCount > 0 ? ` · ${errorCount} failed` : ''}
          </div>
        </div>
        {!isRunning ? (
          <button
            type="button"
            onClick={() => onDismiss(task.id)}
            className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close import notification"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{
            width: task.total > 0 ? `${(task.completed / task.total) * 100}%` : '0%',
          }}
        />
      </div>

      {latestItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {latestItems.map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-border-subtle/70 bg-surface-0/50 px-3 py-2"
            >
              <div className="truncate text-xs font-medium text-text-primary">
                {item.fileName}
              </div>
              {item.status === 'success' ? (
                <>
                  <div className="mt-1 text-xs text-text-secondary">
                    Document #{item.documentNumber} created
                    {item.category ? ` · ${item.category}` : ''}
                    {item.name ? ` · ${item.name}` : ''}
                  </div>
                  {item.dateWarning ? (
                    <div className="mt-1 text-xs text-amber-300">
                      {item.dateWarning}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-1 text-xs text-rose-300">{item.error}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-xs text-text-muted">
          Files moved to background import. You can keep working in meantime.
        </div>
      )}
    </div>
  );
}

export function useDocumentImport() {
  const context = useContext(DocumentImportContext);
  if (!context) {
    throw new Error('useDocumentImport must be used within DocumentImportProvider');
  }
  return context;
}

export default function DocumentImportProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<ImportTask[]>([]);

  const dismissTask = useCallback((taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  const updateTask = useCallback(
    (taskId: string, updater: (task: ImportTask) => ImportTask) => {
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? updater(task) : task)),
      );
    },
    [],
  );

  const startImport = useCallback(
    ({ periodId, files }: StartImportParams) => {
      if (files.length === 0) return;

      const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const initialTask: ImportTask = {
        id: taskId,
        status: 'running',
        createdAt: Date.now(),
        periodId,
        total: files.length,
        completed: 0,
        items: files.map((file, index) => ({
          key: `${file.name}:${file.size}:${file.lastModified}:${index}`,
          fileName: file.webkitRelativePath || file.name,
          status: 'pending',
        })),
      };

      setTasks((current) => [initialTask, ...current]);

      void (async () => {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const formData = new FormData();
          formData.append('file', file);
          formData.append('periodId', String(periodId));

          try {
            const response = await fetch('/api/documents/import-pdf', {
              method: 'POST',
              body: formData,
            });
            const payload = (await response.json().catch(() => null)) as
              | ({ error?: string } & Partial<DocumentImportApiSuccess>)
              | null;

            if (!response.ok || !payload?.id) {
              throw new Error(payload?.error || 'Document PDF import failed.');
            }

            updateTask(taskId, (task) => {
              const nextItems = [...task.items];
              nextItems[index] = {
                ...nextItems[index],
                status: 'success',
                documentId: payload.id,
                documentNumber: payload.number,
                category: payload.category,
                name: payload.name,
                dateWarning: payload.usedFallbackDate
                  ? getDateWarning(payload.fallbackReason ?? null)
                  : undefined,
              };
              return {
                ...task,
                completed: index + 1,
                items: nextItems,
              };
            });
            router.refresh();
          } catch (importError) {
            updateTask(taskId, (task) => {
              const nextItems = [...task.items];
              nextItems[index] = {
                ...nextItems[index],
                status: 'error',
                error:
                  importError instanceof Error
                    ? importError.message
                    : 'Document PDF import failed.',
              };
              return {
                ...task,
                completed: index + 1,
                items: nextItems,
              };
            });
          }
        }

        updateTask(taskId, (task) => ({
          ...task,
          status: 'completed',
        }));
        router.refresh();
      })();
    },
    [router, updateTask],
  );

  const contextValue = useMemo(
    () => ({
      startImport,
    }),
    [startImport],
  );

  return (
    <DocumentImportContext.Provider value={contextValue}>
      {children}
      {tasks.length > 0 ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-80 flex flex-col gap-3">
          {tasks.map((task) => (
            <div key={task.id} className="pointer-events-auto">
              <ToastTaskCard task={task} onDismiss={dismissTask} />
            </div>
          ))}
        </div>
      ) : null}
    </DocumentImportContext.Provider>
  );
}
