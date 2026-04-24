# 03 — Modals Redesign

> Alla modaler bygger på den nya `AdminFormDialog` från `01-design-system-tokens.md` med sticky footer och `max-h: 80vh`. Inga CTA inne i body — undantag är inline-edits i listor (line items) som hanteras radvis.

---

## 1. `<LineItemEditor>` — gemensam komponent (löser F5)

Bygg en återanvändbar komponent som ersätter rad-editorerna i:

- `ManualInvoiceModal` (skapa manuell faktura)
- `InvoiceOperationsModal` → "Kreditera och skapa ersättningsfaktura"
- `PendingInvoiceItems` (nästa fakturas extrarader)

### API

```tsx
type LineItem = {
  id?: string;            // saknas = ny rad lokalt
  description: string;
  amount: number;         // i öre
  quantity: number;
};

type Props = {
  items: LineItem[];
  onChange: (next: LineItem[]) => void;
  /** Tillåt redigering av befintliga rader (false när rader kommer från Stripe) */
  editable?: boolean;
  /** Header-rad för räkning, baspris etc. som inte kan tas bort */
  fixedHeader?: { description: string; amount: number };
  /** Visa total-rad i footer */
  showTotal?: boolean;
  /** Inaktivera "lägg till rad" när maxItems nås */
  maxItems?: number;
  /** Snabb-mallar — chips med fördefinierade rader */
  templates?: Array<{ label: string; description: string; amount: number }>;
  emptyHint?: string;
};
```

### Layout (löser klagomålet "smartare och mer intuitiv")

Tre kolumnsystem som faktiskt andas på en modal:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Beskrivning                                  Antal     Belopp (kr)     Bort │
├──────────────────────────────────────────────────────────────────────────────┤
│  [Månadsabonnemang                       ]    [1   ]    [3 500       ]   ·  │  ← fixedHeader
│  [Inspelningshjälp – extra session       ]    [1   ]    [500         ]   ✕  │
│  [Foto-shoot oktober                      ]    [2   ]    [1 200       ]   ✕  │
│                                                                              │
│  + Lägg till rad      [Snabb: Inspelning] [Foto] [Resa]                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                              Totalt:           5 900 kr      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```tsx
// components/admin/ui/form/LineItemEditor.tsx
"use client";

import { Plus, X } from "lucide-react";
import { formatSek, sekToOre, oreToSek } from "@/lib/admin/money";

export function LineItemEditor({
  items, onChange, editable = true, fixedHeader, showTotal = true,
  maxItems, templates, emptyHint = "Inga rader än — lägg till en rad eller välj från snabbmallar nedan.",
}: Props) {
  const update = (idx: number, patch: Partial<LineItem>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = (init?: Partial<LineItem>) =>
    onChange([...items, { description: "", amount: 0, quantity: 1, ...init }]);

  const totalOre =
    (fixedHeader?.amount ?? 0) +
    items.reduce((s, it) => s + it.amount * it.quantity, 0);

  return (
    <div className="rounded-lg border border-border">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_140px_36px] gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div>Beskrivning</div>
        <div>Antal</div>
        <div className="text-right">Belopp</div>
        <div />
      </div>

      {/* Fixed header row */}
      {fixedHeader ? (
        <Row
          description={fixedHeader.description}
          quantity={1}
          amountOre={fixedHeader.amount}
          locked
        />
      ) : null}

      {/* Editable rows */}
      {items.length === 0 && !fixedHeader ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyHint}</div>
      ) : (
        items.map((it, idx) => (
          <Row
            key={it.id ?? idx}
            description={it.description}
            quantity={it.quantity}
            amountOre={it.amount}
            onDescriptionChange={(v) => update(idx, { description: v })}
            onQuantityChange={(v) => update(idx, { quantity: v })}
            onAmountChange={(ore) => update(idx, { amount: ore })}
            onRemove={() => remove(idx)}
            editable={editable}
          />
        ))
      )}

      {/* Footer: add + templates */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => add()}
            disabled={maxItems !== undefined && items.length >= maxItems}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Lägg till rad
          </button>
          {templates?.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() => add({ description: tpl.description, amount: tpl.amount })}
              className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              + {tpl.label}
            </button>
          ))}
        </div>
        {showTotal ? (
          <div className="text-sm font-semibold text-foreground">
            Totalt: {formatSek(totalOre)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

### Effekter

- `Lägg till rad` är diskret (dashed border, inte primär CTA) — alla CTAs i sticky footer hanterar bekräftelsen.
- Totalsumman flyttas till samma rad som `Lägg till rad` så att modalens egen sticky footer kan fokusera på `Spara faktura`.
- `templates` ger snabbinmatning för repetitiva poster (`Inspelning`, `Foto`, `Resa`) — implementera via app-konstant `lib/admin/billing/line-item-templates.ts`.
- `<Row>` är en komponent som visar lockad/redigerbar variant. Lockad → ren text, ingen input.

---

## 2. `ManualInvoiceModal` — omdesignad

```tsx
<AdminFormDialog
  title="Skapa manuell faktura"
  description={customerName}
  submitLabel="Skapa faktura"
  submittingLabel="Skapar..."
  size="lg"
  onSubmit={handleSubmit}
  canSubmit={items.length > 0 && totalOre > 0}
  open
  onClose={onClose}
>
  <div className="grid gap-3">
    <LineItemEditor
      items={items}
      onChange={setItems}
      templates={MANUAL_INVOICE_TEMPLATES}
    />

    <AdminField label="Förfaller om (dagar)" htmlFor="days_until_due">
      <input
        id="days_until_due"
        type="number"
        min={1}
        max={120}
        value={daysUntilDue}
        onChange={(e) => setDaysUntilDue(Number(e.target.value))}
        className="w-32 rounded-md border border-border bg-card px-3 py-2 text-sm"
      />
    </AdminField>

    <AdminField label="Memo (intern eller skickas till kund)" htmlFor="memo" hint="Visas på fakturan om kryssrutan nedan är ifylld.">
      <textarea id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
    </AdminField>

    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={memoVisibleToCustomer}
        onChange={(e) => setMemoVisibleToCustomer(e.target.checked)} />
      Visa memo på kundens fakturakopia
    </label>
  </div>
</AdminFormDialog>
```

Rader sparas i ett `LineItemEditor` istället för den nuvarande cramped grid-row-implementationen. CTA `Skapa faktura` ligger i sticky footer som AdminFormDialog renderar.

---

## 3. `InvoiceOperationsModal` — splittas i två lägen (löser F6)

Idag: en monstermodal med fakta + line-items + adjustments + kreditera-form + ersättnings-form + pay/void/close. Du har sett att Spara försvinner.

**Lösning:** Behåll en "läsläge"-modal med snabbsummering + sekundär CTA `Kreditera/justera...` som öppnar en *andra*, mer fokuserad sub-modal.

### Modal A — InvoiceDetail (läs)

```
┌─ Faktura inv_xxx · Café Rosé ────────────── [Stäng] ┐
│  [Statuspill]   3 500 kr                              │
│                                                       │
│  Skapad         2026-04-01                            │
│  Förfaller      2026-04-15                            │
│  Stripe         [öppna i Stripe ↗]                    │
│                                                       │
│  Rader                                                │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Månadsabonnemang             1×    3 500 kr     │ │
│  │ Inspelning oktober           1×      500 kr     │ │
│  │ Totalt                              4 000 kr    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  Justeringar (om finns)                              │
│  ▸ Kreditnota cn_xxx · 500 kr · 2026-04-05           │
│  ▸ Refund re_xxx · 500 kr · 2026-04-05                │
│                                                       │
├──────────────────────────────────── sticky footer ───┤
│  [Markera betald]   [Kreditera/justera...]   [Stäng] │
│  (om open)          (alltid)                          │
└───────────────────────────────────────────────────────┘
```

Status-pill, line items, adjustments → bara läsning. Pay-knappen är primary om `status === "open"`. `Kreditera/justera...` öppnar Modal B.

### Modal B — InvoiceAdjust (handling)

```
┌─ Justera faktura · Café Rosé ─────────────────────── ┐
│  Vad vill du göra?                                   │
│                                                      │
│  ◉ Kreditera en eller flera rader                    │
│  ○ Annullera hela fakturan (void)                    │
│                                                      │
│  Om kreditera:                                       │
│  ┌─ Välj rad(er) ─────────────────────────────────┐  │
│  │ ☑ Inspelning oktober      500 kr               │  │
│  │ ☐ Månadsabonnemang      3 500 kr               │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Kreditbelopp (kr): [   500    ]                     │
│  Refund (om paid):  [   500    ]                     │
│  Memo:              [                          ]     │
│                                                      │
│  ☐ Skapa ersättningsfaktura med korrekta rader       │
│                                                      │
│  ▼ (om checkad: visa LineItemEditor)                 │
│                                                      │
├──────────────────────────────────── sticky footer ───┤
│              [Avbryt]    [Kreditera 500 kr]          │
└──────────────────────────────────────────────────────┘
```

CTA-texten i footern uppdateras dynamiskt (`Kreditera 500 kr`, `Kreditera och skapa ersättning`, `Annullera fakturan`) — användaren ser exakt vad som händer.

### Komponentkomposition

```
billing/
├── InvoiceDetailModal.tsx          (~200 rader — bara läsning + 2 CTA)
├── InvoiceAdjustModal.tsx          (~250 rader — inkl. ersättningseditor via LineItemEditor)
└── shared/
    └── InvoiceAdjustmentsSummary.tsx
```

Detta minskar `InvoiceOperationsModal.tsx` från ~600 rader till två fokuserade filer ≤ 250 rader.

---

## 4. `AddCMDialog` — ladda upp avatar (löser F4)

### Ny `<AvatarUpload>`-komponent

```tsx
// components/admin/ui/form/AvatarUpload.tsx
"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

type Props = {
  initials: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onCleared?: () => void;
  /** Token-färg som fallback */
  fallbackColorVar?: string;
  /** Server upload-funktion */
  uploadFn: (file: File) => Promise<{ url: string }>;
};

export function AvatarUpload({ initials, currentUrl, onUploaded, onCleared, fallbackColorVar = "cm-color-1", uploadFn }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [urlInput, setUrlInput] = useState(currentUrl ?? "");

  const handleFile = async (file: File) => {
    setError(null);
    if (!/^image\//.test(file.type)) return setError("Endast bildfiler stöds.");
    if (file.size > 4 * 1024 * 1024) return setError("Max 4 MB.");

    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const { url } = await uploadFn(file);
      onUploaded(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uppladdning misslyckades.");
      setPreview(currentUrl ?? null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className="group relative flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-border bg-secondary/20 p-4 hover:border-primary/40 hover:bg-secondary/40"
      >
        {preview ? (
          <img src={preview} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-primary-foreground"
            style={{ backgroundColor: `hsl(var(--${fallbackColorVar}))` }}
          >
            {initials}
          </div>
        )}
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">
            {uploading ? "Laddar upp..." : "Klicka eller dra hit en bild"}
          </div>
          <div className="text-xs text-muted-foreground">PNG, JPG eller WebP · max 4 MB</div>
        </div>
        <Upload className="h-4 w-4 text-muted-foreground" />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {error ? <div className="text-xs text-destructive">{error}</div> : null}

      {/* Avancerat: URL-input som fallback */}
      <details open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Använd URL istället
        </summary>
        <div className="mt-2 flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => { setPreview(urlInput); onUploaded(urlInput); }}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
          >
            Använd
          </button>
        </div>
      </details>
    </div>
  );
}
```

### Server-funktion

```ts
// lib/admin/team/upload-avatar.ts (server action)
export async function uploadCmAvatar(file: File): Promise<{ url: string }> {
  // Supabase Storage bucket "team-avatars" (public read)
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `cm/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("team-avatars").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabaseAdmin.storage.from("team-avatars").getPublicUrl(path);
  return { url: data.publicUrl };
}
```

### AddCMDialog — efter

Ersätt nuvarande `AdminField label="Profilbild (URL)"` med:

```tsx
<AvatarUpload
  initials={(name || "Ny CM").charAt(0)}
  currentUrl={avatarUrl || null}
  fallbackColorVar={cmColorVar(form.getValues("email") || "tmp")}
  onUploaded={(url) => setValue("avatar_url", url, { shouldValidate: true, shouldDirty: true })}
  uploadFn={uploadCmAvatar}
/>
```

Schemat behåller `avatar_url`-fältet — vi fyller det bara via uppladdning istället för manuell text.

---

## 5. `ChangeCMModal` — strama upp tre lägen + preview

Idag stor (sm:max-w-2xl). Bra koncept (Now / Scheduled / Temporary), men preview-kortet hamnar långt ner och footerknappen försvinner. Med ny `AdminFormDialog`'s sticky footer löses det automatiskt. Tre tillägg:

1. **Sticky preview-strip i footern** (ovanför CTA): visa `Alma → Erik · 8d hos Alma · 22d hos Erik · 1 200 kr / 3 200 kr` i en kompakt rad.
2. **Sökfältet syns alltid** (idag bara om > 8 CMs). Värde: hjälper också med 4–8 CMs när man känner dem vid namn.
3. **Compensation mode** för temporary får en `Tooltip` istället för full text under varje knapp — knapparna blir mindre.

```tsx
{/* Sticky footer area: preview + actions */}
<div className="sticky bottom-0 -mx-modal-p mt-4 border-t border-border bg-card/95 px-modal-p py-3 backdrop-blur">
  {preview ? (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-secondary/40 px-3 py-2 text-xs">
      <span className="text-muted-foreground">{preview.period.label}</span>
      <span className="font-semibold text-foreground">
        {preview.current.name}: {formatSek(preview.current.payout_ore)} · {preview.next.name}: {formatSek(preview.next.payout_ore)}
      </span>
    </div>
  ) : null}
  <div className="flex justify-end gap-2">
    <button onClick={onClose}>Avbryt</button>
    <button onClick={save} disabled={disableSave}>{saveButtonLabel(mode)}</button>
  </div>
</div>
```

---

## 6. `DiscountModal` (från prototypen)

Designen är redan ren. Två justeringar:

1. **Förhandsgranskning som ny komponent `<DiscountPreview>`** så den kan återanvändas i Operations-tab "Avtal & pris" inline.
2. **`Hantera rabatt` på Operations-tab** ska visa nuvarande rabatt + en `Ändra` som öppnar modalen — inte starta tomt.

```tsx
<EditableField
  label="Rabatt"
  value={discountSummary(customer)}     // "10 % rabatt", "500 kr / mån", "2 gratis månader" eller "Ingen"
  onClick={openDiscountModal}
  inputType="modal"
/>
```

---

## 7. `SubscriptionModal` (Hantera abonnemang)

Behåll struktur men:

- Lägg primär CTA i sticky footer (idag är `Spara`/`Avbryt` i body).
- Cancel-now / cancel-end / pause är *radio*, inte tre likställda `Bekräfta`-knappar. Footer-CTA blir `Spara ändring`.
- Bekräftelsedialog (ConfirmActionDialog) öppnas efter klick — inte istället för.

---

## 8. Universella regler för alla modaler

| Regel | Implementation |
|------|----------------|
| Sticky footer | `AdminFormDialog` från 01 |
| Max-höjd 80vh | `max-h-[min(80vh,720px)]` på `DialogContent` |
| Body scrollar | `flex-1 overflow-y-auto` |
| Inga CTAs i body | Code review-regel + ESLint custom rule (se 06) |
| Ingen `<input type="text">` för pris | Använd `<PriceInput>` (öre konvertering, valuta-suffix) |
| Avbryt vänster, primär höger | `flex justify-end gap-2` |
| Destruktiv åtgärd öppnar `ConfirmActionDialog` | Aldrig direkt på första klick |
| Loading-tillstånd visas på CTA-text | `Sparar...` / `Skapar...` etc. |

---

## 9. Acceptanstest för dokument 03

- [ ] `LineItemEditor` används i `ManualInvoiceModal`, `InvoiceAdjustModal`, `PendingInvoiceItems`. `grep -r "Lägg till rad" src/` returnerar bara träffar inuti `LineItemEditor`.
- [ ] `InvoiceOperationsModal.tsx` är borttagen och ersatt av `InvoiceDetailModal` + `InvoiceAdjustModal`.
- [ ] `AvatarUpload` används i `AddCMDialog` och `CMEditDialog`. URL-input är nedflyttat under `<details>` "Använd URL istället".
- [ ] Supabase Storage bucket `team-avatars` finns, public read, RLS för admin-write.
- [ ] Alla `AdminFormDialog`-instanser har sticky footer (DOM-test: `[role=dialog] [class*="sticky"][class*="bottom"]` matchar i varje öppen modal).
- [ ] Snabbmallar (`templates`-prop) används minst i `ManualInvoiceModal`.
- [ ] Inga modaler renderar `<button>` med "Spara" / "Skapa" / "Bekräfta" som direkt barn av modal-bodyn.
