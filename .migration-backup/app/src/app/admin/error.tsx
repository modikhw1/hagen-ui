'use client';

import { useEffect } from 'react';
import { ApiError } from '@/lib/admin/api-client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message =
    error instanceof ApiError
      ? error.message
      : error.message || 'Nagot gick fel i adminpanelen.';

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
          Adminfel
        </p>
        <h1 className="mt-3 font-heading text-3xl font-bold text-foreground">
          Vyn kunde inte laddas
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background"
          >
            Forsok igen
          </button>
        </div>
      </div>
    </div>
  );
}
