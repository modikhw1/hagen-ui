'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { SHELL_COPY } from '@/lib/admin/copy/shell-strings';

export type AdminBreadcrumbItem = {
  label: string;
  href?: string;
};

export type AdminPageHeaderState = {
  title: string;
  eyebrow?: string;
  breadcrumb?: AdminBreadcrumbItem[];
  actions?: ReactNode;
};

type AdminPageHeaderContextValue = {
  state: AdminPageHeaderState;
  setState: (state: AdminPageHeaderState) => void;
};

const DEFAULT_STATE: AdminPageHeaderState = {
  title: '',
  eyebrow: SHELL_COPY.defaultEyebrow,
};

const AdminPageHeaderContext = createContext<AdminPageHeaderContextValue | null>(null);

export function AdminPageHeaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminPageHeaderState>(DEFAULT_STATE);
  const value = useMemo(() => ({ state, setState }), [state]);
  return (
    <AdminPageHeaderContext.Provider value={value}>
      {children}
    </AdminPageHeaderContext.Provider>
  );
}

export function useAdminPageHeader(state: AdminPageHeaderState, deps: unknown[] = []) {
  const ctx = useContext(AdminPageHeaderContext);
  if (!ctx) {
    throw new Error('useAdminPageHeader must be used inside AdminPageHeaderProvider');
  }

  useEffect(() => {
    ctx.setState({
      ...state,
      eyebrow: state.eyebrow ?? SHELL_COPY.defaultEyebrow,
    });
    return () => {
      ctx.setState(DEFAULT_STATE);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function AdminPageHeaderSlot({
  fallbackTitle = '',
  fallbackEyebrow = SHELL_COPY.defaultEyebrow,
  fallbackBreadcrumb,
}: {
  fallbackTitle?: string;
  fallbackEyebrow?: string;
  fallbackBreadcrumb?: AdminBreadcrumbItem[];
}) {
  const ctx = useContext(AdminPageHeaderContext);
  if (!ctx) {
    return null;
  }

  const { state } = ctx;
  const eyebrow = state.eyebrow ?? fallbackEyebrow;
  const title = state.title || fallbackTitle;
  const breadcrumb = state.breadcrumb ?? fallbackBreadcrumb;

  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {eyebrow}
      </div>
      <div className="truncate text-sm font-semibold text-foreground">{title}</div>
      {breadcrumb?.length ? (
        <ol className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumb.map((item, index) => (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {item.href ? (
                <Link className="hover:text-foreground hover:underline" href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
              {index < breadcrumb.length - 1 ? <span aria-hidden>/</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function AdminPageActionsSlot() {
  const ctx = useContext(AdminPageHeaderContext);
  if (!ctx) {
    return null;
  }
  return <>{ctx.state.actions ?? null}</>;
}
