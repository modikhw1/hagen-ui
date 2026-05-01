'use client';

import { useState } from 'react';
import { Loader2, Plus, Save, AlertTriangle } from 'lucide-react';
import {
  Alert,
  Button,
  NumberInput,
  TextInput,
  Textarea,
} from '@mantine/core';
import { toast } from 'sonner';

export interface InvoiceLineEditorProps {
  invoiceId: string;
  invoiceStatus: string;
  initialMemo?: string | null;
  onChanged: () => Promise<void> | void;
}

/**
 * Redigerar en faktura "fakturaprogram-stil":
 *  - Memo/kommentar (alla statusar utom void)
 *  - Lägg till en ny rad (endast draft)
 *
 * Befintliga rader och borttagningar görs via credit + reissue-wizarden
 * när fakturan inte längre är draft.
 */
export function InvoiceLineEditor({
  invoiceId,
  invoiceStatus,
  initialMemo,
  onChanged,
}: InvoiceLineEditorProps) {
  const isDraft = invoiceStatus === 'draft';
  const isVoid = invoiceStatus === 'void';

  const [memo, setMemo] = useState(initialMemo ?? '');
  const [savingMemo, setSavingMemo] = useState(false);

  const [newDescription, setNewDescription] = useState('');
  const [newAmountKr, setNewAmountKr] = useState<string | number>('');
  const [newQuantity, setNewQuantity] = useState<string | number>(1);
  const [addingLine, setAddingLine] = useState(false);

  if (isVoid) {
    return (
      <Alert color="gray" icon={<AlertTriangle className="h-4 w-4" />}>
        Annullerad faktura kan inte redigeras.
      </Alert>
    );
  }

  async function saveMemo() {
    setSavingMemo(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_memo', memo }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      toast.success('Kommentar sparad.');
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte spara');
    } finally {
      setSavingMemo(false);
    }
  }

  async function addLine() {
    const amountOre = Math.round(Number(newAmountKr) * 100);
    const quantity = Math.max(1, Math.round(Number(newQuantity) || 1));
    if (!newDescription.trim()) {
      toast.error('Beskrivning saknas');
      return;
    }
    if (!Number.isFinite(amountOre) || amountOre <= 0) {
      toast.error('Ange ett belopp över 0');
      return;
    }
    setAddingLine(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_line',
          description: newDescription.trim(),
          amount_ore: amountOre,
          quantity,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      toast.success('Rad tillagd.');
      setNewDescription('');
      setNewAmountKr('');
      setNewQuantity(1);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte lägga till rad');
    } finally {
      setAddingLine(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Memo */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Kommentar på fakturan</p>
        <Textarea
          value={memo}
          onChange={(e) => setMemo(e.currentTarget.value)}
          rows={3}
          maxLength={2000}
          placeholder="Synlig text till kunden, t.ex. tackmeddelande eller referens"
        />
        <Button
          size="sm"
          onClick={saveMemo}
          disabled={savingMemo}
          leftSection={
            savingMemo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )
          }
        >
          Spara kommentar
        </Button>
      </div>

      {/* Ny rad */}
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
        <p className="text-sm font-medium text-foreground">Lägg till rad</p>
        {isDraft ? (
          <>
            <TextInput
              label="Beskrivning"
              value={newDescription}
              onChange={(e) => setNewDescription(e.currentTarget.value)}
              maxLength={500}
              placeholder="t.ex. Extra lokalstädning"
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label="À-pris (kr)"
                min={1}
                step={1}
                value={newAmountKr}
                onChange={setNewAmountKr}
              />
              <NumberInput
                label="Antal"
                min={1}
                step={1}
                value={newQuantity}
                onChange={setNewQuantity}
              />
            </div>
            <Button
              size="sm"
              onClick={addLine}
              disabled={addingLine}
              leftSection={
                addingLine ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )
              }
            >
              Lägg till
            </Button>
          </>
        ) : (
          <Alert color="blue">
            Nya rader kan bara läggas till på en draft-faktura. För att korrigera
            en utskickad eller betald faktura, använd <strong>Justera / Kreditera</strong>{' '}
            nedan (kredit + ny ersättningsfaktura).
          </Alert>
        )}
      </div>
    </div>
  );
}