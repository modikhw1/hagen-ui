'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ConvertDemoDialog from '@/components/admin/demos/ConvertDemoDialog';
import CreateDemoDialog from '@/components/admin/demos/CreateDemoDialog';
import {
  demoStatusLabel,
  groupDemos,
  nextDemoStatus,
  type DemoStatus,
} from '@/lib/admin-derive/demos';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';

type DemoApiRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  tiktok_handle: string | null;
  proposed_concepts_per_week: number | null;
  proposed_price_ore: number | null;
  status: DemoStatus;
  status_changed_at: string;
  owner_admin_id: string | null;
  lost_reason?: string | null;
};

type DemosResponse = {
  sent: number;
  converted: number;
  demos: DemoApiRow[];
};

export default function DemosPage() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedForConvert, setSelectedForConvert] = useState<DemoApiRow | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'demos-board'],
    queryFn: async () => {
      const response = await fetch('/api/admin/demos?days=30', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Kunde inte ladda demos');
      }
      return (await response.json()) as DemosResponse;
    },
  });

  const refreshBoard = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'demos-board'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    ]);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ demo, status }: { demo: DemoApiRow; status: DemoStatus }) => {
      const response = await fetch(`/api/admin/demos/${demo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte uppdatera demo');
      }
      return { demo, status };
    },
    onSuccess: async ({ demo, status }) => {
      await refreshBoard();
      setFeedback({
        tone: 'success',
        text: `${demo.company_name} flyttades till ${demoStatusLabel(status).toLowerCase()}.`,
      });
    },
    onError: (mutationError) => {
      setFeedback({
        tone: 'warning',
        text: mutationError instanceof Error ? mutationError.message : 'Kunde inte uppdatera demo.',
      });
    },
  });

  const grouped = useMemo(
    () => groupDemos(
      (data?.demos ?? []).map((demo) => ({
        id: demo.id,
        companyName: demo.company_name,
        tiktokHandle: demo.tiktok_handle,
        proposedPace: demo.proposed_concepts_per_week,
        proposedPriceSek: demo.proposed_price_ore == null ? null : Math.round(demo.proposed_price_ore / 100),
        status: demo.status,
        statusChangedAt: new Date(demo.status_changed_at),
        ownerName: null,
      })),
    ),
    [data],
  );

  if (isLoading) return <div className="text-sm text-muted-foreground">Laddar demos...</div>;
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Kunde inte ladda demos.
      </div>
    );
  }

  const columns = [
    { key: 'draft', label: 'Utkast', items: grouped.draft },
    { key: 'sent', label: 'Skickat', items: grouped.sent },
    { key: 'opened', label: 'Oppnat', items: grouped.opened },
    { key: 'responded', label: 'Svar', items: grouped.responded },
    { key: 'closed', label: 'Avslutat', items: grouped.closed },
  ] as const;

  const demoMap = new Map((data?.demos ?? []).map((demo) => [demo.id, demo]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Demos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prospectflode fran utkast till kundkonvertering.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Ny demo
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <SummaryCard label="Skickade 30 dagar" value={String(data?.sent ?? 0)} />
        <SummaryCard label="Konverterade 30 dagar" value={String(data?.converted ?? 0)} />
        <SummaryCard label="Totalt i boarden" value={String(data?.demos.length ?? 0)} />
      </div>

      {feedback ? (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            feedback.tone === 'success'
              ? 'border border-success/30 bg-success/5 text-success'
              : 'border border-warning/30 bg-warning/5 text-warning'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        {columns.map((column) => (
          <section key={column.key} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
              <span className="text-xs text-muted-foreground">{column.items.length}</span>
            </div>
            <div className="space-y-3">
              {column.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga kort har.</p>
              ) : (
                column.items.map((card) => {
                  const demo = demoMap.get(card.id);
                  if (!demo) return null;

                  return (
                    <DemoCard
                      key={demo.id}
                      demo={demo}
                      busy={updateStatus.isPending && updateStatus.variables?.demo.id === demo.id}
                      onAdvance={() => {
                        const nextStatus = nextDemoStatus(demo.status);
                        if (!nextStatus) return;
                        updateStatus.mutate({ demo, status: nextStatus });
                      }}
                      onConvert={() => setSelectedForConvert(demo)}
                      onLose={() => updateStatus.mutate({ demo, status: 'lost' })}
                    />
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>

      <CreateDemoDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={async () => {
          await refreshBoard();
          setFeedback({ tone: 'success', text: 'Ny demo skapades.' });
        }}
      />

      <ConvertDemoDialog
        demo={selectedForConvert}
        open={selectedForConvert !== null}
        onClose={() => setSelectedForConvert(null)}
        onSaved={async (result) => {
          await refreshBoard();
          if (result.warning) {
            setFeedback({ tone: 'warning', text: result.warning });
            return;
          }

          setFeedback({
            tone: 'success',
            text: result.invite_sent
              ? 'Demo konverterades och inbjudan skickades.'
              : 'Demo konverterades till kund.',
          });
        }}
      />
    </div>
  );
}

function DemoCard({
  demo,
  busy,
  onAdvance,
  onConvert,
  onLose,
}: {
  demo: DemoApiRow;
  busy: boolean;
  onAdvance: () => void;
  onConvert: () => void;
  onLose: () => void;
}) {
  const nextStatus = nextDemoStatus(demo.status);
  const isResponded = demo.status === 'responded';
  const isClosed = demo.status === 'won' || demo.status === 'lost' || demo.status === 'expired';

  return (
    <article className="rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{demo.company_name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {demo.tiktok_handle ? `@${demo.tiktok_handle}` : 'Ingen TikTok-handle'}
          </div>
        </div>
        <span className="rounded-full bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {demoStatusLabel(demo.status)}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div>{demo.proposed_concepts_per_week ? `${demo.proposed_concepts_per_week} koncept/vecka` : 'Tempo ej satt'}</div>
        <div>{demo.proposed_price_ore == null ? 'Pris ej satt' : formatSek(demo.proposed_price_ore)}</div>
        <div>{demo.contact_email || 'Ingen kontaktmail'}</div>
        <div>Uppdaterad {shortDateSv(demo.status_changed_at)}</div>
        {demo.status === 'lost' && demo.lost_reason ? <div>Orsak: {demo.lost_reason}</div> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {nextStatus ? (
          <button
            type="button"
            onClick={onAdvance}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {busy ? 'Sparar...' : `Flytta till ${demoStatusLabel(nextStatus).toLowerCase()}`}
          </button>
        ) : null}

        {isResponded ? (
          <>
            <button
              type="button"
              onClick={onConvert}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Konvertera till kund
            </button>
            <button
              type="button"
              onClick={onLose}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              Markera forlorad
            </button>
          </>
        ) : null}

        {isClosed ? (
          <span className="text-[11px] text-muted-foreground">
            {demo.status === 'won' ? 'Konverterad' : 'Ingen vidare action fran boarden'}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}
