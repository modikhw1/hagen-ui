# 01 — Design System, Tokens & Operatörsspråk (v2)

> **Detta dokument är fundamentet.** Alla andra (02–05) bygger på tokens, primitives och copy-moduler som definieras här.
>
> **Tre saker händer i detta PR-set:**
> 1. Tokens i `tailwind.config.ts` + `src/index.css` får ett **status-skikt** så att `success/warning/danger/info` finns som semantik (inte bara `destructive`).
> 2. **`lib/admin/copy/operator-glossary.ts`** skapas som *enda källa* till operativa ord. `labels.ts` byggs om så att t.ex. `bufferLabel()` returnerar operatörsspråk, inte "buffer".
> 3. Modal-primitiv `<AdminFormDialog>` får sticky footer, max-höjd och inre scroll.

---

## 1. Tokens — semantik, inte rå färg

### 1.1 Lägg till i `src/index.css`

Lägg under befintliga `:root`-variabler. Använd existerande HSL-format (LeTrend kör `H S% L%` utan `hsl()`-wrapper).

```css
:root {
  /* ...existerande tokens behålls oförändrade... */

  /* Status-skikt — semantiska tillstånd för operatörsvyer */
  --status-success-bg: 142 50% 92%;
  --status-success-fg: 142 70% 28%;
  --status-warning-bg: 38 95% 92%;
  --status-warning-fg: 30 80% 32%;
  --status-danger-bg: 0 75% 94%;
  --status-danger-fg: 0 70% 38%;
  --status-info-bg: 210 80% 94%;
  --status-info-fg: 215 70% 38%;
  --status-neutral-bg: 30 12% 92%;
  --status-neutral-fg: 30 18% 35%;

  /* Chart-skikt — gemensamt för alla diagram */
  --chart-grid: 30 10% 88%;
  --chart-axis: 30 10% 45%;
  --chart-line-primary: 24 53% 35%;
  --chart-line-muted: 30 10% 55%;
  --chart-area-primary: 24 53% 35%;          /* med opacity i komponent */
  --chart-point-default: 30 10% 50%;
  --chart-point-hit: 38 80% 45%;
  --chart-point-viral: 0 70% 50%;

  /* Modal-skikt — fasta värden så att alla modaler ser likadana ut */
  --modal-max-h: 80vh;
  --modal-header-h: 64px;
  --modal-footer-h: 64px;
}

.dark {
  --status-success-bg: 142 30% 18%;
  --status-success-fg: 142 60% 65%;
  --status-warning-bg: 38 35% 18%;
  --status-warning-fg: 38 80% 70%;
  --status-danger-bg: 0 35% 18%;
  --status-danger-fg: 0 70% 70%;
  --status-info-bg: 210 35% 20%;
  --status-info-fg: 210 80% 75%;
  --status-neutral-bg: 30 12% 22%;
  --status-neutral-fg: 30 18% 75%;
  --chart-grid: 30 8% 25%;
  --chart-axis: 30 8% 65%;
  /* ... resterande chart-tokens spegelvänds ... */
}
```

### 1.2 Lägg till i `tailwind.config.ts → theme.extend.colors`

```ts
status: {
  'success-bg': 'hsl(var(--status-success-bg))',
  'success-fg': 'hsl(var(--status-success-fg))',
  'warning-bg': 'hsl(var(--status-warning-bg))',
  'warning-fg': 'hsl(var(--status-warning-fg))',
  'danger-bg':  'hsl(var(--status-danger-bg))',
  'danger-fg':  'hsl(var(--status-danger-fg))',
  'info-bg':    'hsl(var(--status-info-bg))',
  'info-fg':    'hsl(var(--status-info-fg))',
  'neutral-bg': 'hsl(var(--status-neutral-bg))',
  'neutral-fg': 'hsl(var(--status-neutral-fg))',
},
chart: {
  grid:           'hsl(var(--chart-grid))',
  axis:           'hsl(var(--chart-axis))',
  'line-primary': 'hsl(var(--chart-line-primary))',
  'line-muted':   'hsl(var(--chart-line-muted))',
  'area-primary': 'hsl(var(--chart-area-primary))',
  'point-default':'hsl(var(--chart-point-default))',
  'point-hit':    'hsl(var(--chart-point-hit))',
  'point-viral':  'hsl(var(--chart-point-viral))',
},
```

### 1.3 Använd via klasser

```tsx
<span className="rounded-full bg-status-success-bg px-2 py-0.5 text-xs font-medium text-status-success-fg">
  I fas
</span>
```

**Förbjudet efter detta PR:** `bg-success/10`, `text-success`, `bg-warning/10`, `text-warning`, `text-destructive` på status-pills. Anchor: status-tokens. Övriga `text-destructive` (knappar, error-text) får finnas kvar.

---

## 2. Operatörsspråk — `lib/admin/copy/operator-glossary.ts` (NY)

Detta är **den enda** filen som definierar operativa ord. `labels.ts`, modal-titlar, attention-strängar, CmPulse-etiketter — alla läser härifrån.

### 2.1 Skapa filen

```ts
// lib/admin/copy/operator-glossary.ts

/**
 * Operatörsspråk för LeTrend Admin.
 *
 * Regler:
 * 1. Inga interna ord ("buffer", "pending bucket", "tunna kunder").
 * 2. Skrivet för en admin som inte byggt produkten.
 * 3. Svenska är primärt; engelska finns för framtida i18n.
 */

export const OPERATOR_COPY = {
  // CM-pulse statusar — ersätter 'needs_action' / 'watch' / 'away' / 'ok'
  cmStatus: {
    needs_action: { label: 'Bör ses över',   tone: 'danger'  as const },
    watch:        { label: 'Kolla in',       tone: 'warning' as const },
    away:         { label: 'Frånvarande',    tone: 'neutral' as const },
    ok:           { label: 'I fas',          tone: 'success' as const },
  },

  // Innehållskö (tidigare "buffer") — kundens planerade content-flöde
  contentQueue: {
    ok:       { label: 'I fas',                 tone: 'success' as const },
    thin:     { label: 'Behöver fler koncept',  tone: 'warning' as const },
    under:    { label: 'Under planerat tempo',  tone: 'danger'  as const },
    paused:   { label: 'Pausad',                tone: 'neutral' as const },
    blocked:  { label: 'Väntar på kunden',      tone: 'warning' as const },
  },

  // Onboarding-states — bevaras men formuleras operativt
  onboarding: {
    invited:  { label: 'Inbjuden',         tone: 'info'    as const },
    cm_ready: { label: 'CM redo att starta', tone: 'warning' as const },
    settled:  { label: 'Pågår',            tone: 'success' as const },
    live:     { label: 'Live',             tone: 'success' as const },
  },

  // Attention-rubriker per typ
  attention: {
    invoice_unpaid:        'Obetald faktura',
    onboarding_stuck:      'Onboarding fastnat',
    customer_blocked:      'Väntar på kunden',
    cm_change_due_today:   'CM-byte idag',
    pause_resume_due_today:'Paus/återupptag idag',
    cm_low_activity:       'Tyst CM-relation',
    cm_notification:       'CM-meddelande',
    demo_responded:        'Demo besvarad',
  },

  // Pending invoice items — det som idag heter "PendingInvoiceItems"
  pendingItems: {
    sectionTitle:    'Väntande poster på nästa faktura',
    sectionSubtitle: (count: number, dateLabel: string) =>
      count === 0
        ? `Lägg till poster som ska följa med abonnemangsfakturan ${dateLabel}.`
        : `${count} ${count === 1 ? 'post' : 'poster'} följer med fakturan ${dateLabel}.`,
    addCta:          'Lägg till post',
    emptyTitle:      'Inga väntande poster',
    emptyHint:       'Allt extra utöver abonnemanget rullar in vid nästa periodskifte.',
  },

  // Krediteringsflödet
  credit: {
    primaryCta:        'Kreditera hela fakturan',
    primarySubtitle:   'En kreditnota dras på hela beloppet. Du kan välja att skapa en ersättningsfaktura.',
    advancedToggle:    'Avancerat: kreditera enskilda poster',
    issueReplacement:  'Skicka en ersättningsfaktura efter krediteringen',
    refundIfPaid:      'Återbetala kunden',
    memoLabel:         'Intern anteckning (visas inte för kunden)',
  },

  // Test/Live
  env: {
    testBadge:  'Test-läge',
    liveBadge:  'Live',
    settingsLabel: 'Datakälla',
    settingsHint:  'Test visar Stripes test-data. Live visar riktiga betalningar. Påverkar bara denna sessions visning.',
  },
} as const;

export type OperatorTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
```

### 2.2 Uppdatera `lib/admin/labels.ts`

Hela filen ska läsa från `OPERATOR_COPY`. Stryk `bufferLabel`-implementationen och re-exportera från glossariet:

```ts
// lib/admin/labels.ts
import { OPERATOR_COPY } from './copy/operator-glossary';

export function bufferLabel(state: keyof typeof OPERATOR_COPY.contentQueue) {
  // Behåll funktionsnamnet för bakåtkompatibilitet, men byt ut innehållet.
  // TODO i PR-13: byt namn till contentQueueLabel överallt.
  return OPERATOR_COPY.contentQueue[state].label;
}

export function contentQueueLabel(state: keyof typeof OPERATOR_COPY.contentQueue) {
  return OPERATOR_COPY.contentQueue[state].label;
}

export function contentQueueTone(state: keyof typeof OPERATOR_COPY.contentQueue) {
  return OPERATOR_COPY.contentQueue[state].tone;
}

export function onboardingLabel(state: keyof typeof OPERATOR_COPY.onboarding) {
  return OPERATOR_COPY.onboarding[state].label;
}

export function cmStatusLabel(status: keyof typeof OPERATOR_COPY.cmStatus) {
  return OPERATOR_COPY.cmStatus[status].label;
}
export function cmStatusTone(status: keyof typeof OPERATOR_COPY.cmStatus) {
  return OPERATOR_COPY.cmStatus[status].tone;
}
```

### 2.3 Migrera CmPulseRow + CmPulseHover

**`components/admin/CmPulseRow.tsx` rad 988–1025** — ersätt manuella `toneClass`-mappningen och `aggregate.status === 'needs_action' ? 'Behover atgard' : ...`-kedjan:

```tsx
// Före (rad 988–994 + 1018–1024):
const toneClass = aggregate.status === 'needs_action'
  ? 'text-destructive'
  : aggregate.status === 'watch' ? 'text-warning' : ...;

// Efter:
import { cmStatusLabel, cmStatusTone } from '@/lib/admin/labels';
import { StatusPill } from '@/components/admin/ui/StatusPill';

const tone = cmStatusTone(aggregate.status);
const label = cmStatusLabel(aggregate.status);
// ...använd <StatusPill tone={tone} label={label} /> istället för manuell span
```

**Rad 1003–1006** — sub-texten "X i fas · Y behover mer buffer" ersätts:

```tsx
<div className="text-xs text-muted-foreground">
  {aggregate.counts.n_ok} i fas · {aggregate.counts.n_thin + aggregate.counts.n_under} att kolla in
</div>
```

**`components/admin/CmPulseHover.tsx` rad 916–918** — etiketter:

```tsx
<Row label="Behöver fler koncept" value={String(aggregate.counts.n_thin)} />
<Row label="Under planerat tempo" value={String(aggregate.counts.n_under)} />
<Row label="Väntar på kunden"     value={String(aggregate.counts.n_blocked)} />
```

**Rad 897–903** — status-text via `cmStatusLabel(aggregate.status)`.

---

## 3. `<StatusPill>` — kanonisk variant (NY, ersätter ad-hoc)

### 3.1 Skapa `components/admin/ui/StatusPill.tsx`

```tsx
import { cn } from '@/lib/utils';
import type { OperatorTone } from '@/lib/admin/copy/operator-glossary';

const toneClass: Record<OperatorTone, string> = {
  success: 'bg-status-success-bg text-status-success-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  danger:  'bg-status-danger-bg text-status-danger-fg',
  info:    'bg-status-info-bg text-status-info-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

export function StatusPill({
  label,
  tone = 'neutral',
  size = 'sm',
  className,
}: {
  label: string;
  tone?: OperatorTone;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
        toneClass[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
```

### 3.2 Migrera `components/admin/customers/routes/shared.tsx → CustomerStatusPill` (rad 335–358)

Re-exportera från `StatusPill` så att alla nuvarande call-sites fortsätter funka, men implementationen blir gemensam:

```tsx
// shared.tsx
export { StatusPill as CustomerStatusPill } from '@/components/admin/ui/StatusPill';
```

`SeverityPill` i `AttentionList.tsx:855–876` ska också ersättas av `<StatusPill>` med `tone={severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : severity === 'medium' ? 'info' : 'neutral'}`.

---

## 4. `<AdminFormDialog>` — sticky footer, max-höjd, inre scroll (löser F4)

### 4.1 Skapa `components/admin/ui/feedback/AdminFormDialog.tsx`

```tsx
'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl';
const sizeClass: Record<Size, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
};

export function AdminFormDialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: Size;
  children: ReactNode;
  footer: ReactNode;       // OBLIGATORISK — alla form-dialogs har en footer
  error?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          'flex max-h-[var(--modal-max-h)] flex-col gap-0 p-0',
          sizeClass[size],
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
          {error ? (
            <div className="mt-4 rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
              {error}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 4.2 Migrationsregel för befintliga modaler

För **varje** modal som idag renderar `<DialogContent>` direkt med ett scrollat innehåll (lista: `InvoiceOperationsModal`, `SubscriptionPriceChangeModal`, `ChangeCMModal`, `DiscountModal`, `ManualInvoiceModal`, `CreateDemoDialog`):

1. Byt yttre wrapper till `<AdminFormDialog>`.
2. Flytta sista raden av knappar (`<button>Avbryt</button> <button>Spara</button>`) ut ur body och in i `footer={<>...</>}`-prop.
3. Ta bort `sm:max-w-*` från `DialogContent` — `size`-propen styr.
4. Ta bort egna `mt-6 flex justify-end`-wrappar runt knapparna — `AdminFormDialog` hanterar layout.

Acceptanskriterium: när modalens body är >80vh hög ska body bli scrollbar **utan** att footern lämnar viewporten. Verifiera genom att öppna `InvoiceOperationsModal` på en kund med 12+ fakturarader vid 1366×768 fönsterhöjd.

---

## 5. `<EnvBand>` + Test/Live-switch (löser F2)

### 5.1 Ta bort Test/Live-toggeln från `components/admin/billing/BillingShellTabs.tsx`

Stryk **rad 396–413** (toggle-blocket `<div className="flex gap-1 rounded-md border border-border bg-secondary p-1 w-fit">`) och dess `searchParams.set('env', env)`-logik (rad 387–392). Tabbarna nedanför behålls.

### 5.2 Skapa `components/admin/ui/EnvBand.tsx`

Visas globalt **endast** när `useEnv()` returnerar `'test'`. Live-läge har inget band (live är default — ingen visuell brus).

```tsx
'use client';

import { useEnv } from '@/hooks/admin/useEnv';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';

export function EnvBand() {
  const env = useEnv();
  if (env !== 'test') return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-status-warning-bg px-3 py-1.5 text-xs font-semibold text-status-warning-fg">
      <span className="h-1.5 w-1.5 rounded-full bg-status-warning-fg" />
      {OPERATOR_COPY.env.testBadge} — du ser Stripe-testdata
    </div>
  );
}
```

Montera **en gång** i `app/admin/layout.tsx` direkt under `<AdminLayout>` (i `AdminAuthShell` rad 84–91):

```tsx
return (
  <>
    <EnvBand />
    <AdminRealtimeBridge />
    <AdminLayout userEmail={user.email || 'admin'} onLogout={handleLogout}>
      {children}
    </AdminLayout>
  </>
);
```

### 5.3 Switchen flyttar in i `app/admin/(ops)/settings/page.tsx`

I settings-sidan, i en sektion `Tekniskt`:

```tsx
<Section title="Datakälla" description={OPERATOR_COPY.env.settingsHint}>
  <EnvSwitch />   {/* Radio: Live (default) | Test */}
</Section>
```

Acceptanskriterium efter detta PR: `grep -r "env=test\|env=live" components/admin/billing/` returnerar **inga** UI-strängar (det får bara finnas i routerlogik och datalager).

---

## 6. Inline-edit-primitive (för 02 §4)

### 6.1 Skapa `components/admin/ui/form/InlineEditField.tsx`

Används för pris, kontakt-e-post, telefon, kontaktperson — så att Operations-tabben inte behöver en stor "Redigera"-toggle.

```tsx
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
}: {
  label: string;
  value: string | number | null;
  format?: (v: string | number | null) => string;
  parse?: (raw: string) => string | number | null;
  onSave: (next: string | number | null) => Promise<void>;
  inputType?: 'text' | 'number' | 'email' | 'tel';
  placeholder?: string;
  validate?: (raw: string) => string | null;
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
    <div className="group flex items-baseline justify-between gap-3">
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
```

---

## 7. Mojibake & copy-städning (löser F16)

### 7.1 Hitta alla förekomster

```bash
grep -rEn "Forsok|atg[a\\\\u]rd|Beh[oö]ver|Fr[aå]nvarande|Nagot|saknad?e?\\b" \
  components/ app/ lib/admin/ \
  --include="*.ts" --include="*.tsx"
```

### 7.2 Ersättningstabell

| Felaktig sträng | Korrekt |
|-----------------|---------|
| `Forsok igen` | `Försök igen` |
| `atgard` / `\u00e5tg\u00e4rd` | `åtgärd` |
| `Behover atgard` | (ersätts av `cmStatusLabel('needs_action')` = "Bör ses över") |
| `Franvarande` | `Frånvarande` |
| `Nagot gick fel` | `Något gick fel` |
| `kn\u00f6t` | `knöt` |

### 7.3 ESLint-regel (frivillig, men rekommenderad)

```js
// eslint-config — flagga unicode-escapes i UI-strängar
'no-restricted-syntax': ['warn', {
  selector: 'Literal[value=/\\\\u00[0-9a-f]{2}/]',
  message: 'Använd direkt UTF-8 i UI-strängar, inte \\u-escapes.',
}],
```

---

## 8. Checklista — när är 01 klart?

- [ ] `src/index.css` har status- och chart-tokens (light + dark).
- [ ] `tailwind.config.ts` exporterar `bg-status-*` och `bg-chart-*`-klasser.
- [ ] `lib/admin/copy/operator-glossary.ts` finns och är *enda* källa för pulse/queue/onboarding/attention/credit/env-strängar.
- [ ] `lib/admin/labels.ts` läser från glossariet; `bufferLabel()` returnerar "I fas" / "Behöver fler koncept" / etc.
- [ ] `components/admin/ui/StatusPill.tsx` finns; `CustomerStatusPill` och `SeverityPill` re-exporterar.
- [ ] `components/admin/ui/feedback/AdminFormDialog.tsx` finns med sticky footer.
- [ ] `components/admin/ui/EnvBand.tsx` finns och monteras i `app/admin/layout.tsx`.
- [ ] `BillingShellTabs.tsx` har **ingen** Test/Live-toggle.
- [ ] `components/admin/ui/form/InlineEditField.tsx` finns.
- [ ] Mojibake-grep returnerar 0 träffar.
- [ ] Manuell visuell verifiering: öppna InvoiceOperationsModal på liten skärm — footer förblir synlig.
