'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useMemo, useState } from 'react';

type Props = {
  warnings?: string[] | null;
  storageKey?: string;
};

const warningCopy: Record<string, string> = {
  'team-overview-degraded': 'Teamoversikten är tillfälligt degraderad. Visa datan med försiktighet.',
  'customer-detail-rpc-fallback': 'Kunddetalj kör i fallback-läge. Vissa fält kan vara fördröjda.',
  'billing-view-fallback': 'Billing-vyn visar fallback-data. Kontrollera migreringar och vyer.',
};

function storageId(storageKey: string) {
  return `admin-schema-warnings:${storageKey}`;
}

function readDismissed(storageKey?: string) {
  if (!storageKey || typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const raw = window.sessionStorage.getItem(storageId(storageKey));
    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set<string>();
  }
}

function translateWarning(code: string) {
  return warningCopy[code] ?? code;
}

export function SchemaWarningBanner({ warnings, storageKey }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(storageKey));

  const activeWarnings = useMemo(() => {
    if (!warnings?.length) {
      return [];
    }

    return warnings.filter((warning) => !dismissed.has(warning));
  }, [dismissed, warnings]);

  if (activeWarnings.length === 0) {
    return null;
  }

  const dismissWarning = (warning: string) => {
    setDismissed((previous) => {
      const next = new Set(previous);
      next.add(warning);

      if (storageKey && typeof window !== 'undefined') {
        window.sessionStorage.setItem(storageId(storageKey), JSON.stringify([...next]));
      }

      return next;
    });
  };

  return (
    <div aria-live="polite" className="space-y-2" role="status">
      {activeWarnings.map((warning) => (
        <div
          key={warning}
          className="flex items-start gap-2 rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg"
        >
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Systemvarning</div>
            <p className="mt-1">{translateWarning(warning)}</p>
            <p className="mt-1 text-xs">
              Vissa datafält kan vara ofullständiga. Kontrollera systemstatus om problemet kvarstår.
            </p>
          </div>
          {storageKey ? (
            <button
              type="button"
              onClick={() => dismissWarning(warning)}
              className="rounded p-1 text-status-warning-fg/80 transition-colors hover:bg-status-warning-fg/10 hover:text-status-warning-fg"
              aria-label="Dölj varning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
