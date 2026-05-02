'use client';

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { KommunikationSectionProps, InlineFeedbackTone, CMIdentity } from './feedTypes';
import {
  LeTrendColors,
  LeTrendGradients,
  LeTrendRadius,
  LeTrendShadows,
  LeTrendTypography,
} from '@/styles/letrend-design-system';
import { EMAIL_TEMPLATES } from './shared';
import type { EmailLogEntry, EmailJobEntry } from '@/types/studio-v2';
import { ConceptAttacher } from '@/components/email/ConceptAttacher';
import { EmailPreview } from '@/components/email/EmailPreview';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mån' },
  { value: 2, label: 'Tis' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' },
  { value: 5, label: 'Fre' },
  { value: 6, label: 'Lör' },
  { value: 0, label: 'Sön' },
];

function getInlineFeedbackStyle(tone: InlineFeedbackTone) {
  switch (tone) {
    case 'success':
      return {
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        color: '#047857',
      };
    case 'warning':
      return {
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.24)',
        color: '#92400e',
      };
    case 'error':
      return {
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        color: '#b91c1c',
      };
    case 'info':
    default:
      return {
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        color: '#1d4ed8',
      };
  }
}

function renderCmBadge(identity: CMIdentity): React.ReactNode {
  const initials = identity.name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle' }}>
      {identity.avatarUrl ? (
        <img
          src={identity.avatarUrl}
          alt={identity.name}
          style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: identity.color || LeTrendColors.brownLight,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 8,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials}
        </span>
      )}
      <span>{identity.name}</span>
    </span>
  );
}

const MONTHS_SV_WS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function formatLastEmailSent(isoString: string | undefined): string {
  if (!isoString) return 'Ingen mailhistorik';
  const sent = new Date(isoString);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff === 0) return 'Senaste mail: idag';
  if (daysDiff === 1) return 'Senaste mail: igår';
  if (daysDiff < 14) return `Senaste mail: ${daysDiff} dagar sedan`;
  return `Senaste mail: ${sent.getDate()} ${MONTHS_SV_WS[sent.getMonth()]}`;
}

export function KommunikationSection({
  customer,
  emailLog,
  emailType,
  setEmailType,
  emailSubject,
  setEmailSubject,
  emailIntro,
  setEmailIntro,
  emailOutro,
  setEmailOutro,
  selectedConceptIds,
  setSelectedConceptIds,
  sendingEmail,
  previewingEmail,
  emailPreview,
  showEmailPreview,
  setShowEmailPreview,
  communicationFeedback,
  latestEmailJob,
  retryingEmailJobId,
  weeklySchedule,
  scheduleDayOfWeek,
  setScheduleDayOfWeek,
  scheduleSendTime,
  setScheduleSendTime,
  scheduleSubject,
  setScheduleSubject,
  scheduleIntro,
  setScheduleIntro,
  scheduleOutro,
  setScheduleOutro,
  scheduleActive,
  setScheduleActive,
  scheduleRules,
  setScheduleRules,
  savingSchedule,
  deletingSchedule,
  previewingSchedule,
  scheduleFeedback,
  schedulePreview,
  showSchedulePreview,
  setShowSchedulePreview,
  handleSendEmail,
  handlePreviewEmail,
  handleRetryEmailJob,
  handleSaveSchedule,
  handleDeleteSchedule,
  handlePreviewSchedule,
  getDraftConcepts,
  getConceptDetails,
  formatDateTime,
  cmDisplayNames,
}: KommunikationSectionProps) {
  const { profile } = useAuth();
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [adminNotificationMessage, setAdminNotificationMessage] = useState('');
  const [adminNotificationPriority, setAdminNotificationPriority] = useState<'normal' | 'urgent'>('normal');
  const [sendingAdminNotification, setSendingAdminNotification] = useState(false);
  const [adminNotificationFeedback, setAdminNotificationFeedback] = useState<{
    tone: InlineFeedbackTone;
    text: string;
  } | null>(null);
  const selectedTemplate = useMemo(
    () => EMAIL_TEMPLATES.find((template) => template.id === emailType) || EMAIL_TEMPLATES[0],
    [emailType]
  );
  const attachableConcepts = getDraftConcepts();
  const showAdminNotificationPanel = profile?.role === 'content_manager';

  const getEmailJobStatusLabel = (status: EmailJobEntry['status']) => {
    switch (status) {
      case 'queued':
        return 'Köad';
      case 'processing':
        return 'Bearbetas';
      case 'sent':
        return 'Skickad';
      case 'failed':
        return 'Misslyckad';
      case 'canceled':
        return 'Avbruten';
      default:
        return status;
    }
  };

  const getEmailJobStatusStyle = (status: EmailJobEntry['status']) => {
    switch (status) {
      case 'sent':
        return {
          background: 'rgba(16, 185, 129, 0.08)',
          color: '#065F46',
        };
      case 'failed':
        return {
          background: 'rgba(239, 68, 68, 0.08)',
          color: '#b91c1c',
        };
      case 'processing':
        return {
          background: 'rgba(59, 130, 246, 0.08)',
          color: '#1d4ed8',
        };
      case 'canceled':
        return {
          background: 'rgba(107, 114, 128, 0.12)',
          color: '#374151',
        };
      case 'queued':
      default:
        return {
          background: '#F7F2EC',
          color: '#5D4D3D',
        };
    }
  };

  const latestJobStatusStyle = latestEmailJob ? getEmailJobStatusStyle(latestEmailJob.status) : null;
  const canRetryLatestJob = Boolean(latestEmailJob && ['failed', 'canceled'].includes(latestEmailJob.status));

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#5D4D3D',
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid rgba(74,47,24,0.15)',
    background: '#FFFFFF',
    color: LeTrendColors.textPrimary,
    fontSize: 14,
  };

  const toggleRule = (key: keyof typeof scheduleRules) => {
    setScheduleRules((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const setRuleCount = (key: 'maxConcepts' | 'maxClips' | 'maxNotes', value: string) => {
    const numeric = Number(value);
    setScheduleRules((current) => ({
      ...current,
      [key]: Number.isFinite(numeric) ? Math.max(1, Math.min(10, Math.round(numeric))) : current[key],
    }));
  };

  const handleSendAdminNotification = async () => {
    const message = adminNotificationMessage.trim();
    if (message.length < 5) {
      setAdminNotificationFeedback({
        tone: 'error',
        text: 'Skriv lite mer sa att admin forstar vad som behovs.',
      });
      return;
    }

    setSendingAdminNotification(true);
    setAdminNotificationFeedback(null);

    try {
      const response = await fetch(`/api/studio-v2/customers/${customer.id}/admin-notification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          priority: adminNotificationPriority,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte skicka notisen till admin.');
      }

      setAdminNotificationMessage('');
      setAdminNotificationPriority('normal');
      setAdminNotificationFeedback({
        tone: 'success',
        text:
          adminNotificationPriority === 'urgent'
            ? 'Akut notis skickad till admin.'
            : 'Notis skickad till admin.',
      });
    } catch (error) {
      setAdminNotificationFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Kunde inte skicka notisen till admin.',
      });
    } finally {
      setSendingAdminNotification(false);
    }
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 18,
        padding: 24,
        border: `1px solid ${LeTrendColors.borderStrong}`,
        boxShadow: LeTrendShadows.warmthCard,
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            margin: '0 0 6px',
            fontFamily: LeTrendTypography.fontFamily.heading,
            fontSize: 28,
            fontWeight: 400,
            color: LeTrendColors.brownInk,
          }}
        >
          Kommunikation
        </h2>
        <div style={{ fontSize: 14, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
          Skicka varumärkesmässiga kundmail med samma mallsystem som används i API:t. Delade koncept markeras direkt i kundflödet.
        </div>
      </div>

      {communicationFeedback && (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: LeTrendRadius.md,
            fontSize: 13,
            lineHeight: 1.6,
            ...getInlineFeedbackStyle(communicationFeedback.tone),
          }}
        >
          {communicationFeedback.text}
        </div>
      )}

      {showAdminNotificationPanel && (
        <div
          style={{
            marginBottom: 24,
            padding: 18,
            borderRadius: 16,
            background: '#FFF9F2',
            border: `1px solid ${LeTrendColors.borderStrong}`,
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LeTrendColors.brownDark, marginBottom: 4 }}>
              Be admin om hjalp
            </div>
            <div style={{ fontSize: 12, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
              Skicka en intern CM-notis nar du behover beslut, blocker-losning eller snabb admininsats for kunden.
            </div>
          </div>

          {adminNotificationFeedback && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                lineHeight: 1.6,
                ...getInlineFeedbackStyle(adminNotificationFeedback.tone),
              }}
            >
              {adminNotificationFeedback.text}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Prioritet</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                { value: 'normal', label: 'Normal' },
                { value: 'urgent', label: 'Akut' },
              ] as const).map((option) => {
                const active = adminNotificationPriority === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAdminNotificationPriority(option.value)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 999,
                      border: `1px solid ${active ? LeTrendColors.brownLight : LeTrendColors.borderStrong}`,
                      background: active ? LeTrendColors.surfaceHighlight : '#FFFFFF',
                      color: active ? LeTrendColors.brownDark : LeTrendColors.textSecondary,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Meddelande</label>
            <textarea
              value={adminNotificationMessage}
              onChange={(event) => setAdminNotificationMessage(event.target.value)}
              placeholder="Beskriv vad du behover hjalp med, vad som blockerar och om det ar tidskritiskt."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSendAdminNotification()}
            disabled={sendingAdminNotification}
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              border: 'none',
              background: sendingAdminNotification ? '#BFAE9B' : '#6B4423',
              color: '#FAF8F5',
              fontWeight: 600,
              cursor: sendingAdminNotification ? 'not-allowed' : 'pointer',
            }}
          >
            {sendingAdminNotification ? 'Skickar notis...' : 'Skicka notis till admin'}
          </button>
        </div>
      )}

      <div
        style={{
          background: LeTrendColors.surfaceMuted,
          borderRadius: 16,
          padding: 16,
          marginBottom: 24,
          border: `1px solid ${LeTrendColors.borderStrong}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginBottom: 6 }}>Senaste email-jobb</div>
            {latestEmailJob ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: '4px 10px',
                    ...(latestJobStatusStyle || {}),
                  }}
                >
                  {getEmailJobStatusLabel(latestEmailJob.status)}
                </span>
                <span style={{ fontSize: 12, color: LeTrendColors.textSecondary }}>
                  {formatDateTime(latestEmailJob.updated_at || latestEmailJob.created_at)}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: LeTrendColors.textSecondary }}>Inget jobb registrerat ännu.</div>
            )}
          </div>

          {latestEmailJob && canRetryLatestJob && (
            <button
              type="button"
              onClick={() => void handleRetryEmailJob(latestEmailJob.id)}
              disabled={retryingEmailJobId === latestEmailJob.id}
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                border: `1px solid ${LeTrendColors.borderStrong}`,
                background: '#FFFFFF',
                color: LeTrendColors.brownDark,
                fontSize: 12,
                fontWeight: 600,
                cursor: retryingEmailJobId === latestEmailJob.id ? 'not-allowed' : 'pointer',
              }}
            >
              {retryingEmailJobId === latestEmailJob.id ? 'Köar om...' : 'Försök igen'}
            </button>
          )}
        </div>

        {latestEmailJob?.last_error && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: '#b91c1c',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 10,
              padding: '8px 10px',
              lineHeight: 1.5,
            }}
          >
            Fel: {latestEmailJob.last_error}
          </div>
        )}
      </div>

      <div
        style={{
          background: 'linear-gradient(180deg, #FAF8F5 0%, #F7F2EC 100%)',
          borderRadius: 18,
          padding: 20,
          marginBottom: 28,
          border: `1px solid ${LeTrendColors.borderStrong}`,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Välj mall</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            {EMAIL_TEMPLATES.map((template) => {
              const isActive = template.id === emailType;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setEmailType(template.id)}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: isActive ? '2px solid #6B4423' : `1px solid ${LeTrendColors.borderStrong}`,
                    background: isActive ? '#FAF8F5' : '#FFFFFF',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 10px 24px rgba(107, 68, 35, 0.12)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{template.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: LeTrendColors.brownDark }}>
                    {template.name}
                  </div>
                  <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 4 }}>
                    {template.supportsConceptAttachment
                      ? `Koncept: max ${template.maxConcepts || 10}`
                      : 'Ingen konceptbifogning'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Till</label>
          <input type="text" value={customer.contact_email ?? ''} disabled style={{ ...inputStyle, background: '#F7F4F0', color: LeTrendColors.textMuted }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Ämne</label>
          <input
            type="text"
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder="Email-ämne"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Intro</label>
          <textarea
            value={emailIntro}
            onChange={(event) => setEmailIntro(event.target.value)}
            placeholder="Inledande text"
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Outro</label>
          <textarea
            value={emailOutro}
            onChange={(event) => setEmailOutro(event.target.value)}
            placeholder="Avslutande text"
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
          />
        </div>

        {selectedTemplate.supportsConceptAttachment && selectedTemplate.maxConcepts && attachableConcepts.length > 0 && (
          <ConceptAttacher
            concepts={attachableConcepts}
            selectedConceptIds={selectedConceptIds}
            setSelectedConceptIds={setSelectedConceptIds}
            getConceptDetails={getConceptDetails}
            maxConcepts={selectedTemplate.maxConcepts}
          />
        )}

        {selectedTemplate.supportsConceptAttachment && attachableConcepts.length === 0 && (
          <div
            style={{
              marginBottom: 18,
              padding: '12px 14px',
              borderRadius: 14,
              background: '#FFFFFF',
              border: `1px solid ${LeTrendColors.borderStrong}`,
              color: LeTrendColors.textSecondary,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Inga odelade koncept finns att bifoga just nu.
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void handlePreviewEmail()}
            disabled={previewingEmail}
            style={{
              flex: '1 1 200px',
              padding: '14px 18px',
              borderRadius: 14,
              border: `1px solid ${LeTrendColors.borderStrong}`,
              background: '#FFFFFF',
              color: LeTrendColors.brownDark,
              fontWeight: 600,
              cursor: previewingEmail ? 'not-allowed' : 'pointer',
            }}
          >
            {previewingEmail ? 'Förhandsgranskar...' : 'Förhandsgranska'}
          </button>
          <button
            type="button"
            onClick={() => void handleSendEmail()}
            disabled={sendingEmail}
            style={{
              flex: '1 1 220px',
              padding: '14px 18px',
              borderRadius: 14,
              border: 'none',
              background: LeTrendGradients.gradientCTA,
              color: '#FAF8F5',
              fontWeight: 600,
              cursor: sendingEmail ? 'not-allowed' : 'pointer',
              boxShadow: '0 12px 28px rgba(74, 47, 24, 0.18)',
            }}
          >
            {sendingEmail ? 'Skickar...' : 'Skicka email'}
          </button>
        </div>
      </div>

      <div>
        <h3
          style={{
            margin: '0 0 16px',
            fontFamily: LeTrendTypography.fontFamily.heading,
            fontSize: 22,
            fontWeight: 400,
            color: LeTrendColors.brownInk,
          }}
        >
          Historik
        </h3>

        {emailLog.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 28,
              color: LeTrendColors.textMuted,
              fontSize: 14,
              background: '#FFFFFF',
              borderRadius: 14,
              border: `1px solid ${LeTrendColors.borderStrong}`,
            }}
          >
            Inga skickade email ännu
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {emailLog.map((email: EmailLogEntry) => {
              const isExpanded = expandedEmailId === email.id;

              return (
                <div
                  key={email.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 12,
                    padding: 16,
                    border: '1px solid rgba(74,47,24,0.08)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedEmailId(isExpanded ? null : email.id)}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1612', marginBottom: 4 }}>
                          {email.subject}
                        </div>
                        <div style={{ fontSize: 13, color: '#5D4D3D' }}>
                          {formatDateTime(email.sent_at)} ·{' '}
                          {email.cm_id && cmDisplayNames[email.cm_id]
                            ? renderCmBadge(cmDisplayNames[email.cm_id]!)
                            : (email.cm_id || 'okänd')}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#9D8E7D' }}>{isExpanded ? 'Dölj' : 'Visa'}</div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: `1px solid ${LeTrendColors.borderStrong}`,
                        fontSize: 13,
                        color: LeTrendColors.textPrimary,
                        lineHeight: 1.6,
                      }}
                      dangerouslySetInnerHTML={{ __html: email.body_html }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 28 }}>
        <h3
          style={{
            margin: '0 0 16px',
            fontFamily: LeTrendTypography.fontFamily.heading,
            fontSize: 22,
            fontWeight: 400,
            color: LeTrendColors.brownInk,
          }}
        >
          Veckoschema
        </h3>

        {scheduleFeedback && (
          <div
            style={{
              marginBottom: 18,
              padding: '12px 14px',
              borderRadius: LeTrendRadius.md,
              fontSize: 13,
              lineHeight: 1.6,
              ...getInlineFeedbackStyle(scheduleFeedback.tone),
            }}
          >
            {scheduleFeedback.text}
          </div>
        )}

        <div
          style={{
            background: 'linear-gradient(180deg, #FAF8F5 0%, #F7F2EC 100%)',
            borderRadius: 18,
            padding: 20,
            border: `1px solid ${LeTrendColors.borderStrong}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: LeTrendColors.brownSubtle }}>
                Automatisk veckosammanfattning
              </div>
              <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginTop: 4 }}>
                {weeklySchedule?.next_send_at
                  ? `Nästa utskick: ${formatDateTime(weeklySchedule.next_send_at)}`
                  : 'Ingen aktiv veckosammanfattning sparad ännu.'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScheduleActive(!scheduleActive)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                border: `1px solid ${LeTrendColors.borderStrong}`,
                background: '#FFFFFF',
                borderRadius: 999,
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 20,
                  borderRadius: 999,
                  background: scheduleActive ? '#5A8F5A' : '#D7CEC3',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: scheduleActive ? 16 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    transition: 'left 0.2s ease',
                  }}
                />
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: LeTrendColors.brownDark }}>
                {scheduleActive ? 'Aktiv' : 'Inaktiv'}
              </span>
            </button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Veckodag</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {WEEKDAY_OPTIONS.map((option) => {
                const isSelected = scheduleDayOfWeek === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScheduleDayOfWeek(option.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 999,
                      border: 'none',
                      background: isSelected ? '#6B4423' : '#F5F2EE',
                      color: isSelected ? '#FAF8F5' : '#5D4D3D',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Tid</label>
            <input
              type="time"
              value={scheduleSendTime}
              onChange={(event) => setScheduleSendTime(event.target.value)}
              style={{ ...inputStyle, maxWidth: 180 }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Ämne</label>
            <input
              type="text"
              value={scheduleSubject}
              onChange={(event) => setScheduleSubject(event.target.value)}
              placeholder="Veckouppdatering - LeTrend"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Intro</label>
            <textarea
              value={scheduleIntro}
              onChange={(event) => setScheduleIntro(event.target.value)}
              placeholder="Hej{{contact_name}}! Här är en sammanfattning av veckan för {{business_name}}."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Outro</label>
            <textarea
              value={scheduleOutro}
              onChange={(event) => setScheduleOutro(event.target.value)}
              placeholder="Tack för ett bra samarbete!"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
            />
          </div>

          <div
            style={{
              marginBottom: 18,
              padding: 16,
              borderRadius: 16,
              background: '#FFFFFF',
              border: `1px solid ${LeTrendColors.borderStrong}`,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: LeTrendColors.brownDark, marginBottom: 6 }}>
              Innehåll i veckobrevet
            </div>
            <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginBottom: 14 }}>
              Slå av eller på delar av sammanfattningen beroende på kundens behov.
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { key: 'includeNewConcepts', label: 'Nya koncept', desc: 'Visa nya koncept som lagts till under veckan.' },
                { key: 'includeProducedClips', label: 'Producerade klipp', desc: 'Visa klipp som markerats som producerade.' },
                { key: 'includeNewClips', label: 'Nya klipp', desc: 'Visa nya publicerade/uppladdade klipp.' },
                { key: 'includeClipMetrics', label: 'Visningar och status', desc: 'Visa publiceringsstatus och tittarsiffror på klippen.' },
                { key: 'includeCmThoughts', label: 'Tankar från CM', desc: 'Lyft veckans senaste notes från content manager.' },
              ].map((rule) => {
                const enabled = scheduleRules[rule.key as keyof typeof scheduleRules] as boolean;
                return (
                  <button
                    key={rule.key}
                    type="button"
                    onClick={() => toggleRule(rule.key as keyof typeof scheduleRules)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 14,
                      width: '100%',
                      border: `1px solid ${enabled ? LeTrendColors.brownLight : LeTrendColors.borderStrong}`,
                      background: enabled ? LeTrendColors.surfaceHighlight : '#FFFFFF',
                      borderRadius: 14,
                      padding: '12px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: LeTrendColors.brownDark }}>
                        {rule.label}
                      </div>
                      <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginTop: 3 }}>
                        {rule.desc}
                      </div>
                    </div>
                    <div
                      style={{
                        flexShrink: 0,
                        padding: '5px 10px',
                        borderRadius: 999,
                        background: enabled ? '#6B4423' : '#F5F2EE',
                        color: enabled ? '#FAF8F5' : '#5D4D3D',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {enabled ? 'På' : 'Av'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 14,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Max koncept</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={scheduleRules.maxConcepts}
                  onChange={(event) => setRuleCount('maxConcepts', event.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Max klipp</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={scheduleRules.maxClips}
                  onChange={(event) => setRuleCount('maxClips', event.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Max notes</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={scheduleRules.maxNotes}
                  onChange={(event) => setRuleCount('maxNotes', event.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handlePreviewSchedule()}
              disabled={previewingSchedule}
              style={{
                flex: '1 1 180px',
                padding: '14px 18px',
                borderRadius: 14,
                border: `1px solid ${LeTrendColors.borderStrong}`,
                background: '#FFFFFF',
                color: LeTrendColors.brownDark,
                fontWeight: 600,
                cursor: previewingSchedule ? 'not-allowed' : 'pointer',
              }}
            >
              {previewingSchedule ? 'Förhandsgranskar...' : 'Förhandsgranska'}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveSchedule()}
              disabled={savingSchedule}
              style={{
                flex: '1 1 220px',
                padding: '14px 18px',
                borderRadius: 14,
                border: 'none',
                background: LeTrendGradients.gradientCTA,
                color: '#FAF8F5',
                fontWeight: 600,
                cursor: savingSchedule ? 'not-allowed' : 'pointer',
                boxShadow: '0 12px 28px rgba(74, 47, 24, 0.18)',
              }}
            >
              {savingSchedule ? 'Sparar...' : 'Spara schema'}
            </button>
            {weeklySchedule && (
              <button
                type="button"
                onClick={() => void handleDeleteSchedule()}
                disabled={deletingSchedule}
                style={{
                  flex: '1 1 160px',
                  padding: '14px 18px',
                  borderRadius: 14,
                  border: `1px solid rgba(185, 28, 28, 0.15)`,
                  background: '#FFFFFF',
                  color: '#b91c1c',
                  fontWeight: 600,
                  cursor: deletingSchedule ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingSchedule ? 'Tar bort...' : 'Ta bort schema'}
              </button>
            )}
          </div>
        </div>
      </div>

      <EmailPreview
        open={showEmailPreview && Boolean(emailPreview)}
        subject={emailPreview?.subject || ''}
        html={emailPreview?.html || ''}
        title={selectedTemplate.name}
        onClose={() => setShowEmailPreview(false)}
      />
      <EmailPreview
        open={showSchedulePreview && Boolean(schedulePreview)}
        subject={schedulePreview?.subject || ''}
        html={schedulePreview?.html || ''}
        title="Veckosammanfattning"
        onClose={() => setShowSchedulePreview(false)}
      />
    </div>
  );
}
