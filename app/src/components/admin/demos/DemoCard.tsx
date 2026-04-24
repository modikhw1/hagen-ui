'use client';

import { CSS } from '@dnd-kit/utilities';
import { useDraggable } from '@dnd-kit/core';
import { demosCopy } from '@/lib/admin/copy/demos';
import { demoStatusLabel } from '@/lib/admin-derive/demos';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import type { DemoCardDto } from '@/lib/admin/schemas/demos';

type Props = {
  demo: DemoCardDto;
  busy: boolean;
  onAdvance: () => void;
  onConvert: () => void;
  onLose: () => void;
};

export function DemoCard({ demo, busy, onAdvance, onConvert, onLose }: Props) {
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

  return (
    <article
      ref={setNodeRef}
      aria-label={`Demo-kort ${demo.companyName}`}
      className={`rounded-lg border border-border bg-secondary/40 p-3 ${
        isDragging ? 'opacity-60 shadow-sm' : ''
      }`}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{demo.companyName}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {demo.tiktokHandle ? `@${demo.tiktokHandle}` : demosCopy.noTikTokHandle}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {demoStatusLabel(demo.status)}
          </span>
          <button
            type="button"
            aria-label={`Dra ${demo.companyName} till n\u00e4sta steg`}
            disabled={dragDisabled}
            className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground disabled:opacity-40"
            {...attributes}
            {...listeners}
          >
            ::
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div>
          {demo.proposedConceptsPerWeek
            ? `${demo.proposedConceptsPerWeek} koncept/vecka`
            : demosCopy.noTempo}
        </div>
        <div>
          {demo.proposedPriceOre == null ? demosCopy.noPrice : formatSek(demo.proposedPriceOre)}
        </div>
        <div>{demo.contactEmail || demosCopy.noContactEmail}</div>
        <div>
          {demosCopy.updatedPrefix} {shortDateSv(demo.statusChangedAt)}
        </div>
        {demo.status === 'lost' && demo.lostReason ? (
          <div>
            {demosCopy.lostReasonPrefix} {demo.lostReason}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {demo.nextStatus ? (
          <button
            type="button"
            onClick={onAdvance}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {busy ? demosCopy.saveInProgress : `Flytta till ${demoStatusLabel(demo.nextStatus).toLowerCase()}`}
          </button>
        ) : null}

        {isResponded ? (
          <>
            <button
              type="button"
              onClick={onConvert}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {demosCopy.convertButton}
            </button>
            <button
              type="button"
              onClick={onLose}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {demosCopy.loseButton}
            </button>
          </>
        ) : null}

        {isClosed ? (
          <span className="text-[11px] text-muted-foreground">
            {demo.status === 'won' ? demosCopy.statusConverted : demosCopy.statusNoFurtherAction}
          </span>
        ) : null}
      </div>
    </article>
  );
}
