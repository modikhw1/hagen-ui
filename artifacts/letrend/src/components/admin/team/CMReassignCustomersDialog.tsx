// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { AdminModalShell } from '@/components/admin/ui/AdminModalShell';
import {
  adminModalAlertStyle,
  adminModalInputStyle,
  adminModalLabelStyle,
  adminModalPrimaryButtonStyle,
  adminModalSecondaryButtonStyle,
  adminModalSectionStyle,
} from '@/components/admin/ui/adminModalTokens';
import { LeTrendColors } from '@/styles/letrend-design-system';
import { useAvailableAccountManagers } from '@/hooks/admin/useAvailableAccountManagers';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

interface CustomerSummary {
  id: string;
  business_name: string;
  monthly_price: number | null;
}

export interface CMReassignCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromCmId: string;
  fromCmName: string;
  customers: CustomerSummary[];
}

const BROWN = LeTrendColors.brownDark;
const CREAM = '#FAF8F5';

function ScopeCheck({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: 4,
        border: `1.5px solid ${checked ? BROWN : 'rgba(74,47,24,0.25)'}`,
        background: checked ? BROWN : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s',
      }}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6">
          <polyline
            points="1,3 3,5 7,1"
            stroke={CREAM}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

export function CMReassignCustomersDialog({
  open,
  onOpenChange,
  fromCmId,
  fromCmName,
  customers,
}: CMReassignCustomersDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetCmId, setTargetCmId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: availableCms, isLoading: cmsLoading } = useAvailableAccountManagers({
    excludeId: fromCmId,
    enabled: open,
  });
  const refresh = useAdminRefresh();

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(customers.map((customer) => customer.id)));
      setTargetCmId(null);
    }
  }, [customers, open]);

  const toggleAll = () => {
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(customers.map((customer) => customer.id)));
  };

  const handleSubmit = async () => {
    if (!targetCmId) {
      toast.error('Välj mottagande CM.');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Välj minst en kund att flytta.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/team/${fromCmId}/reassign-customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCmId,
          customerIds: Array.from(selectedIds),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Kunde inte flytta (${res.status})`);
        return;
      }

      toast.success(`${selectedIds.size} kunder flyttade.`);
      await refresh(['team', 'customers']);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    } finally {
      setSubmitting(false);
    }
  };

  const targetCmName = availableCms?.find((cm) => cm.id === targetCmId)?.full_name;
  const submitDisabled = !targetCmId || selectedIds.size === 0 || submitting;

  return (
    <AdminModalShell
      open={open}
      onClose={() => onOpenChange(false)}
      title="Flytta kundportfölj"
      size="lg"
      disableClose={submitting}
      footer={
        <>
          <button
            type="button"
            style={{ ...adminModalSecondaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Avbryt
          </button>
          <button
            type="button"
            style={adminModalPrimaryButtonStyle(!submitDisabled)}
            onClick={handleSubmit}
            disabled={submitDisabled}
          >
            {submitting
              ? 'Flyttar…'
              : `Flytta${selectedIds.size > 0 ? ` ${selectedIds.size} kunder` : ''}`}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12.5, color: LeTrendColors.brownDark, lineHeight: 1.5 }}>
          Flytta kunder från <strong>{fromCmName}</strong> till en annan CM.
        </div>

        <div style={adminModalSectionStyle}>
          <div style={adminModalLabelStyle}>Mottagande CM</div>
          <select
            value={targetCmId ?? ''}
            onChange={(e) => setTargetCmId(e.target.value || null)}
            disabled={cmsLoading || submitting}
            style={{ ...adminModalInputStyle, cursor: 'pointer' }}
          >
            <option value="">Välj CM</option>
            {(availableCms ?? []).map((cm) => (
              <option key={cm.id} value={cm.id}>
                {cm.full_name} ({cm.active_customer_count} kunder)
              </option>
            ))}
          </select>
        </div>

        <div style={adminModalSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={adminModalLabelStyle}>
              Kunder att flytta ({selectedIds.size}/{customers.length})
            </div>
            <button
              type="button"
              onClick={toggleAll}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                color: LeTrendColors.brownDark,
                padding: 0,
              }}
            >
              {selectedIds.size === customers.length ? 'Avmarkera alla' : 'Markera alla'}
            </button>
          </div>
          <div
            style={{
              maxHeight: 288,
              overflowY: 'auto',
              border: `1.5px solid ${LeTrendColors.border}`,
              borderRadius: 8,
              padding: 4,
              background: '#FAF8F5',
            }}
          >
            {customers.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: LeTrendColors.textMuted,
                  textAlign: 'center',
                  padding: 24,
                }}
              >
                Inga kunder att flytta.
              </div>
            ) : (
              customers.map((customer) => {
                const checked = selectedIds.has(customer.id);
                return (
                  <div
                    key={customer.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedIds((previous) => {
                        const next = new Set(previous);
                        if (checked) next.delete(customer.id);
                        else next.add(customer.id);
                        return next;
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedIds((previous) => {
                          const next = new Set(previous);
                          if (checked) next.delete(customer.id);
                          else next.add(customer.id);
                          return next;
                        });
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: checked ? 'rgba(74,47,24,0.04)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <ScopeCheck checked={checked} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: LeTrendColors.brownDark,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {customer.business_name}
                      </div>
                      {customer.monthly_price ? (
                        <div style={{ fontSize: 10.5, color: LeTrendColors.textMuted }}>
                          {customer.monthly_price.toLocaleString('sv-SE')} kr/mån
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {selectedIds.size > 0 && targetCmName ? (
          <div style={adminModalAlertStyle('info')}>
            <ArrowRight size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {selectedIds.size} kunder flyttas från <strong>{fromCmName}</strong> till{' '}
              <strong>{targetCmName}</strong>
            </span>
          </div>
        ) : null}
      </div>
    </AdminModalShell>
  );
}
