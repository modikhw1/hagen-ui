import React from 'react';
import { AutoSaveTextarea } from '@/components/studio-v2/AutoSaveTextarea';
import { getStudioCustomerStatusMeta, normalizeStudioCustomerStatus } from '@/lib/studio/customer-status';
import { STUDIO_WORKSPACE_SECTIONS } from '@/lib/studio/navigation';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerBrief, Section } from '@/types/studio-v2';
import type { WorkspaceCustomerProfile } from './shared';

interface CustomerDetailHeaderProps {
  customer: WorkspaceCustomerProfile;
  brief: CustomerBrief;
  editingBrief: boolean;
  setEditingBrief: React.Dispatch<React.SetStateAction<boolean>>;
  setBrief: React.Dispatch<React.SetStateAction<CustomerBrief>>;
  handleSaveBrief: (field: keyof CustomerBrief, value: string) => Promise<void>;
  activeSection: Section;
  setWorkspaceSection: (section: Section) => void;
  notesCount: number;
  draftCount: number;
}

export function CustomerDetailHeader({
  customer,
  brief,
  editingBrief,
  setEditingBrief,
  setBrief,
  handleSaveBrief,
  activeSection,
  setWorkspaceSection,
  notesCount,
  draftCount,
}: CustomerDetailHeaderProps) {
  const customerStatusMeta = getStudioCustomerStatusMeta(normalizeStudioCustomerStatus(customer.status));

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        position: 'sticky',
        top: 100,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          padding: 20,
          marginBottom: 16,
          border: `1px solid ${LeTrendColors.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: LeTrendColors.brownDark,
              margin: 0,
            }}
          >
            {customer.business_name}
          </h2>
          <div style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
            Kunduppgifter hanteras i Admin
          </div>
        </div>

        {customer.customer_contact_name && (
          <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 4 }}>
            Kontakt:
            {' '}
            {customer.customer_contact_name}
          </div>
        )}

        {customer.contact_email && (
          <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 8 }}>
            Email:
            {' '}
            {customer.contact_email}
          </div>
        )}

        {customer.account_manager && (
          <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 8 }}>
            AM:
            {' '}
            {customer.account_manager}
          </div>
        )}

        <div style={{ fontSize: 13, color: LeTrendColors.textSecondary, marginBottom: 12 }}>
          Pris:
          {' '}
          {(customer.monthly_price ?? 0) > 0 ? `${customer.monthly_price} kr/mån` : 'Pris ej satt'}
        </div>
        <div style={{ marginBottom: 12, fontSize: 11, color: LeTrendColors.textMuted }}>
          Pris och avtal hanteras i Admin.
        </div>

        <div
          style={{
            padding: '6px 12px',
            borderRadius: LeTrendRadius.md,
            fontSize: 12,
            fontWeight: 600,
            background: customerStatusMeta.bg,
            color: customerStatusMeta.text,
            border: `1px solid ${customerStatusMeta.border}`,
            display: 'inline-block',
          }}
        >
          {customerStatusMeta.label}
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          padding: 20,
          marginBottom: 16,
          border: `1px solid ${LeTrendColors.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: LeTrendColors.brownDark,
              margin: 0,
            }}
          >
            Kundbrief
          </h3>
          <button
            onClick={() => setEditingBrief((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              color: LeTrendColors.brownLight,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {editingBrief ? 'Klart' : 'Redigera'}
          </button>
        </div>

        {editingBrief ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: LeTrendColors.textSecondary,
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                Känsla och ton
              </label>
              <AutoSaveTextarea
                value={brief.tone}
                onChange={(value) => setBrief({ ...brief, tone: value })}
                onSave={(value) => handleSaveBrief('tone', value)}
                rows={2}
                placeholder="Vem är kunden? Vilken röst ska vi ha?"
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: LeTrendColors.textSecondary,
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                Begränsningar
              </label>
              <AutoSaveTextarea
                value={brief.constraints}
                onChange={(value) => setBrief({ ...brief, constraints: value })}
                onSave={(value) => handleSaveBrief('constraints', value)}
                rows={2}
                placeholder="Vad ska alltid finnas med i innehållet?"
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: LeTrendColors.textSecondary,
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                Fokus just nu
              </label>
              <AutoSaveTextarea
                value={brief.current_focus}
                onChange={(value) => setBrief({ ...brief, current_focus: value })}
                onSave={(value) => handleSaveBrief('current_focus', value)}
                rows={2}
                placeholder="Strategisk prioritet?"
              />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
            {!brief.tone && !brief.constraints && !brief.current_focus ? (
              <em>Ingen brief ifylld än</em>
            ) : (
              <>
                {brief.tone && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Känsla och ton:</strong>
                    {' '}
                    {brief.tone}
                  </div>
                )}
                {brief.constraints && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Begränsningar:</strong>
                    {' '}
                    {brief.constraints}
                  </div>
                )}
                {brief.current_focus && (
                  <div>
                    <strong>Fokus:</strong>
                    {' '}
                    {brief.current_focus}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          padding: 12,
          border: `1px solid ${LeTrendColors.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {STUDIO_WORKSPACE_SECTIONS.filter((s) => s.kind === 'primary').map(({ key, short_label, description }) => {
          const badge = key === 'gameplan' ? notesCount : key === 'koncept' ? draftCount : undefined;

          return (
            <button
              key={key}
              onClick={() => setWorkspaceSection(key)}
              style={{
                background: activeSection === key ? LeTrendColors.surface : 'transparent',
                border: 'none',
                padding: '12px 16px',
                borderRadius: LeTrendRadius.md,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                fontWeight: activeSection === key ? 600 : 500,
                color: activeSection === key ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
                transition: 'all 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ display: 'grid', gap: 2 }}>
                <span>{short_label}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: LeTrendColors.textMuted }}>
                  {description}
                </span>
              </span>
              {badge !== undefined && badge > 0 && (
                <span
                  style={{
                    background: '#f59e0b',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: 10,
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, margin: '4px 0' }} />
        {STUDIO_WORKSPACE_SECTIONS.filter((s) => s.kind === 'utility').map(({ key, short_label, description }) => (
          <button
            key={key}
            onClick={() => setWorkspaceSection(key)}
            style={{
              background: activeSection === key ? LeTrendColors.surface : 'transparent',
              border: 'none',
              padding: '8px 16px',
              borderRadius: LeTrendRadius.md,
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 12,
              fontWeight: activeSection === key ? 600 : 400,
              color: activeSection === key ? LeTrendColors.brownDark : LeTrendColors.textMuted,
              transition: 'all 0.2s',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ display: 'grid', gap: 1 }}>
              <span>{short_label}</span>
              <span style={{ fontSize: 10, fontWeight: 400, color: LeTrendColors.textMuted }}>
                {description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
