'use client';

import { useState } from 'react';
import { CSS } from '@dnd-kit/utilities';
import { useDraggable } from '@dnd-kit/core';
import { IconExternalLink, IconLoader2, IconSparkles } from '@tabler/icons-react';
import { toast } from 'sonner';

import { demosCopy } from '@/lib/admin/copy/demos';
import { demoStatusLabel } from '@/lib/admin-derive/demos';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import type { DemoCardDto } from '@/lib/admin/schemas/demos';
import { prepareDemoStudioAction } from '@/app/admin/_actions/demos';

type Props = {
  demo: DemoCardDto;
  busy: boolean;
  onAdvance: () => void;
  onConvert: () => void;
  onLose: () => void;
};

export function DemoCard({ demo, busy, onAdvance, onConvert, onLose }: Props) {
  const [preparingStudio, setPreparingStudio] = useState(false);
  const isResponded = demo.status === 'responded';
  const isClosed = demo.status === 'won' || demo.status === 'lost' || demo.status === 'expired';
  const dragDisabled = !demo.nextStatus;
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: demo.id,
    disabled: dragDisabled,
    data: {
      demoId: demo.id,
      status: demo.status,
      nextStatus: demo.nextStatus,
      companyName: demo.companyName,
    },
  });

  const handleOpenStudio = async () => {
    if (preparingStudio) return;
    
    try {
      setPreparingStudio(true);
      const result = await prepareDemoStudioAction(demo.id);
      
      if (result.success && result.customerId) {
        window.open(`/studio/customers/${result.customerId}`, '_blank');
      } else {
        toast.error(result.error || 'Kunde inte förbereda Studio.');
      }
    } catch (err) {
      toast.error('Ett oväntat fel uppstod.');
    } finally {
      setPreparingStudio(false);
    }
  };

  return (
    <article
      ref={setNodeRef}
      aria-label={`Demo-kort ${demo.companyName}`}
      className={`rounded-lg border border-border bg-secondary/40 p-3 shadow-sm hover:border-primary/30 transition-colors ${
        isDragging ? 'opacity-60 shadow-md' : ''
      }`}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground leading-tight">{demo.companyName}</div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground flex items-center gap-1">
            {demo.tiktokHandle ? (
              <>
                <span className="opacity-70">@</span>{demo.tiktokHandle}
              </>
            ) : (
              demosCopy.noTikTokHandle
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-muted-foreground/80 border border-border/50">
            {demoStatusLabel(demo.status)}
          </span>
          <button
            type="button"
            aria-label={`Dra ${demo.companyName} till nästa steg`}
            disabled={dragDisabled}
            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-20 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <div className="grid grid-cols-2 gap-0.5 opacity-40">
              <div className="h-0.5 w-0.5 rounded-full bg-current" />
              <div className="h-0.5 w-0.5 rounded-full bg-current" />
              <div className="h-0.5 w-0.5 rounded-full bg-current" />
              <div className="h-0.5 w-0.5 rounded-full bg-current" />
              <div className="h-0.5 w-0.5 rounded-full bg-current" />
              <div className="h-0.5 w-0.5 rounded-full bg-current" />
            </div>
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        <div className="flex justify-between">
          <span>{demo.proposedConceptsPerWeek ? `${demo.proposedConceptsPerWeek} koncept/vecka` : demosCopy.noTempo}</span>
          <span className="font-medium text-foreground/70">
            {demo.proposedPriceOre == null ? demosCopy.noPrice : formatSek(demo.proposedPriceOre)}
          </span>
        </div>
        <div className="truncate opacity-80">{demo.contactEmail || demosCopy.noContactEmail}</div>
        <div className="pt-1 border-t border-border/40 flex justify-between items-center">
          <span>{demosCopy.updatedPrefix} {shortDateSv(demo.statusChangedAt)}</span>
          {demo.convertedCustomerId && (
            <span className="flex items-center gap-1 text-primary font-medium">
              <IconSparkles size={10} />
              Studio redo
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleOpenStudio}
          disabled={preparingStudio}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
        >
          {preparingStudio ? (
            <IconLoader2 size={12} className="animate-spin" />
          ) : (
            <IconExternalLink size={12} />
          )}
          Studio
        </button>

        {demo.nextStatus && (
          <button
            type="button"
            onClick={onAdvance}
            disabled={busy}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {busy ? 'Sparar...' : `Gå till ${demoStatusLabel(demo.nextStatus).toLowerCase()}`}
          </button>
        )}

        {isResponded && (
          <button
            type="button"
            onClick={onConvert}
            className="rounded-md bg-foreground px-2 py-1.5 text-[11px] font-bold text-background hover:opacity-90 transition-opacity"
          >
            Skapa kund
          </button>
        )}
      </div>
    </article>
  );
}

