'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function InlineEditField({
  label,
  value,
  format = (v) => String(v ?? '—'),
  parse,
  onSave,
  inputType = 'text',
  placeholder,
  validate,
  className,
}: {
  label: string;
  value: string | number | null;
  format?: (v: string | number | null) => string;
  parse?: (raw: string) => string | number | null;
  onSave: (next: string | number | null) => Promise<void>;
  inputType?: 'text' | 'number' | 'email' | 'tel';
  placeholder?: string;
  validate?: (raw: string) => string | null;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value ?? ''));
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, value]);

  const commit = async () => {
    if (validate) {
      const msg = validate(draft);
      if (msg) { setError(msg); return; }
    }
    setSaving(true);
    try {
      await onSave(parse ? parse(draft) : draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("group flex items-baseline justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {editing ? (
          <div className="mt-0.5 flex items-center gap-2">
            <input
              ref={inputRef}
              type={inputType}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              disabled={saving}
            />
            <button onClick={commit} disabled={saving} aria-label="Spara"
              className="rounded-md bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} aria-label="Avbryt"
              className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-0.5 text-sm text-foreground">{format(value)}</div>
        )}
        {error ? <div className="mt-1 text-xs text-status-danger-fg">{error}</div> : null}
      </div>
      {!editing && (
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          aria-label={`Redigera ${label}`}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </div>
  );
}
