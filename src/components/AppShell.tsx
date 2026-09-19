'use client';

import { Suspense, useEffect, useState } from 'react';
import { Menu, PanelLeftOpen, X } from 'lucide-react';
import Sidebar from './Sidebar';
import DocumentImportProvider from './DocumentImportProvider';

interface AppShellProps {
  children: React.ReactNode;
  sidebar: {
    dataSources: { slug: string; name: string }[];
    currentSource: string;
    periods: {
      id: number;
      start_date: number;
      end_date: number;
      locked: boolean;
    }[];
    currentPeriodId: number;
  };
}

const SIDEBAR_STORAGE_KEY = 'tilittaja-sidebar-hidden';
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export default function AppShell({ children, sidebar }: AppShellProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  });

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileOpen(false);
      return;
    }
    setSidebarHidden((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  const renderSidebar = () => (
    <Suspense fallback={null}>
      <Sidebar {...sidebar} onToggle={toggleSidebar} />
    </Suspense>
  );

  if (isMobile) {
    return (
      <DocumentImportProvider>
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-3 border-b border-border-subtle bg-surface-1 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-3/60 hover:text-text-primary"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <span className="text-sm font-semibold text-text-primary tracking-tight">
              Tilittaja
            </span>
          </header>

          {mobileOpen && (
            <>
              <div
                className="fixed inset-0 z-30 bg-black/60"
                onClick={() => setMobileOpen(false)}
                aria-hidden="true"
              />
              <div className="fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto">
                {renderSidebar()}
              </div>
            </>
          )}

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </DocumentImportProvider>
    );
  }

  return (
    <DocumentImportProvider>
      <div className="flex h-full">
        <div
          className={`shrink-0 overflow-hidden transition-[width] duration-250 ease-out ${
            sidebarHidden ? 'w-0' : 'w-52'
          }`}
        >
          <div
            className={`h-full w-52 transition-transform duration-250 ease-out ${
              sidebarHidden ? '-translate-x-full' : 'translate-x-0'
            }`}
          >
            {renderSidebar()}
          </div>
        </div>
        <main className="relative flex-1 overflow-auto">
          {sidebarHidden ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="fixed left-4 top-4 z-20 inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-1/95 px-3 py-2 text-sm font-medium text-text-primary shadow-xl shadow-black/30 backdrop-blur-sm transition-all hover:bg-surface-2 hover:border-accent/30 hover:shadow-amber-900/10"
              aria-label="Show sidebar"
            >
              <PanelLeftOpen className="h-4 w-4 text-accent" />
              Valikko
            </button>
          ) : null}
          {children}
        </main>
      </div>
    </DocumentImportProvider>
  );
}
