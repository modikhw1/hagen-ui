import React, { useState } from 'react';
import {
  getStudioCustomerConceptDisplayTitle,
  getStudioCustomerConceptSourceConceptId,
} from '@/lib/studio/customer-concepts';
import type { TranslatedConcept } from '@/lib/translator';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { CustomerConcept, CustomerProfile, EmailJobEntry, EmailLogEntry } from '@/types/studio-v2';
import { EMAIL_TEMPLATES } from './shared';

interface CustomerCommunicationPanelProps {
  customer: CustomerProfile;
  emailLog: EmailLogEntry[];
  emailType: string;
  setEmailType: (value: string) => void;
  emailSubject: string;
  setEmailSubject: (value: string) => void;
  emailBody: string;
  setEmailBody: (value: string) => void;
  selectedConceptIds: string[];
  setSelectedConceptIds: React.Dispatch<React.SetStateAction<string[]>>;
  sendingEmail: boolean;
  latestEmailJob: EmailJobEntry | null;
  retryingEmailJobId: string | null;
  handleSendEmail: () => Promise<void>;
  handleRetryEmailJob: (jobId: string) => Promise<void>;
  getDraftConcepts: () => CustomerConcept[];
  getConceptDetails: (conceptId: string) => TranslatedConcept | undefined;
  formatDateTime: (dateStr: string) => string;
}

export function CustomerCommunicationPanel({
  customer,
  emailLog,
  emailType,
  setEmailType,
  emailSubject,
  setEmailSubject,
  emailBody,
  setEmailBody,
  selectedConceptIds,
  setSelectedConceptIds,
  sendingEmail,
  latestEmailJob,
  retryingEmailJobId,
  handleSendEmail,
  handleRetryEmailJob,
  getDraftConcepts,
  getConceptDetails,
  formatDateTime,
}: CustomerCommunicationPanelProps) {
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  const getEmailJobStatusLabel = (status: EmailJobEntry['status']) => {
    switch (status) {
      case 'queued':
        return 'I kö';
      case 'processing':
        return 'Bearbetas';
      case 'sent':
        return 'Skickat';
      case 'failed':
        return 'Misslyckades';
      case 'canceled':
        return 'Avbrutet';
      default:
        return status;
    }
  };

  const getEmailJobStatusStyle = (status: EmailJobEntry['status']) => {
    switch (status) {
      case 'sent':
        return {
          background: 'rgba(16, 185, 129, 0.1)',
          color: '#047857',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        };
      case 'failed':
        return {
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#b91c1c',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        };
      case 'canceled':
        return {
          background: 'rgba(107, 114, 128, 0.12)',
          color: '#374151',
          border: '1px solid rgba(107, 114, 128, 0.3)',
        };
      case 'processing':
        return {
          background: 'rgba(59, 130, 246, 0.1)',
          color: '#1d4ed8',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        };
      case 'queued':
      default:
        return {
          background: 'rgba(245, 158, 11, 0.1)',
          color: '#92400e',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        };
    }
  };

  const latestJobStatusStyle = latestEmailJob ? getEmailJobStatusStyle(latestEmailJob.status) : null;
  const canRetryLatestJob = Boolean(latestEmailJob && ['failed', 'canceled'].includes(latestEmailJob.status));
  const draftConcepts = getDraftConcepts();

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: LeTrendRadius.lg,
        padding: 24,
        border: `1px solid ${LeTrendColors.border}`,
      }}
    >
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: LeTrendColors.brownDark,
          margin: '0 0 24px',
        }}
      >
        Kommunikation
      </h2>

      <div
        style={{
          background: LeTrendColors.surface,
          borderRadius: LeTrendRadius.lg,
          padding: 16,
          marginBottom: 20,
          border: `1px solid ${LeTrendColors.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: latestEmailJob?.last_error ? 10 : 0,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginBottom: 6 }}>
              Senaste email-jobb
            </div>
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
              <div style={{ fontSize: 13, color: LeTrendColors.textSecondary }}>
                Inget jobb i kö-historik ännu
              </div>
            )}
          </div>

          {latestEmailJob && canRetryLatestJob && (
            <button
              onClick={() => void handleRetryEmailJob(latestEmailJob.id)}
              disabled={retryingEmailJobId === latestEmailJob.id}
              style={{
                padding: '8px 12px',
                borderRadius: LeTrendRadius.md,
                border: `1px solid ${LeTrendColors.border}`,
                background: retryingEmailJobId === latestEmailJob.id ? '#f1f1f1' : '#fff',
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
              fontSize: 12,
              color: '#b91c1c',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: LeTrendRadius.md,
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
          background: LeTrendColors.surface,
          borderRadius: LeTrendRadius.lg,
          padding: 20,
          marginBottom: 32,
          border: `1px solid ${LeTrendColors.border}`,
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: LeTrendColors.brownDark,
            margin: '0 0 16px',
          }}
        >
          Nytt email
        </h3>

        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 6,
            }}
          >
            Välj mall
          </label>
          <select
            value={emailType}
            onChange={(event) => setEmailType(event.target.value)}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {EMAIL_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 6,
            }}
          >
            Till
          </label>
          <input
            type="text"
            value={customer.contact_email ?? ''}
            disabled
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
              background: '#f9f9f9',
              color: LeTrendColors.textMuted,
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 6,
            }}
          >
            Ämne
          </label>
          <input
            type="text"
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder="Email-ämne"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.textSecondary,
              marginBottom: 6,
            }}
          >
            Innehåll
          </label>
          <textarea
            value={emailBody}
            onChange={(event) => setEmailBody(event.target.value)}
            placeholder="Email-innehåll"
            rows={8}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: LeTrendRadius.md,
              border: `1px solid ${LeTrendColors.border}`,
              fontSize: 14,
              resize: 'vertical',
              lineHeight: 1.6,
            }}
          />
          <div style={{ fontSize: 11, color: LeTrendColors.textMuted, marginTop: 4 }}>
            Tips: Välj koncept nedan för att automatiskt bifoga dem i mailet.
          </div>
        </div>

        {draftConcepts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: LeTrendColors.textSecondary,
                marginBottom: 8,
              }}
            >
              Bifoga koncept
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: LeTrendRadius.md,
                padding: 12,
                border: `1px solid ${LeTrendColors.border}`,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {draftConcepts.map((concept) => {
                const sourceConceptId = getStudioCustomerConceptSourceConceptId(concept);
                const details = sourceConceptId ? getConceptDetails(sourceConceptId) : undefined;

                return (
                  <label
                    key={concept.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedConceptIds.includes(concept.id)}
                      onChange={() => {
                        setSelectedConceptIds((prev) =>
                          prev.includes(concept.id)
                            ? prev.filter((id) => id !== concept.id)
                            : [...prev, concept.id]
                        );
                      }}
                    />
                    <span style={{ fontSize: 13, color: LeTrendColors.textPrimary }}>
                      {getStudioCustomerConceptDisplayTitle(
                        concept,
                        details?.headline_sv || details?.headline || null
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => void handleSendEmail()}
          disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
          style={{
            padding: '12px 24px',
            background:
              emailSubject.trim() && emailBody.trim()
                ? LeTrendColors.brownLight
                : LeTrendColors.textMuted,
            color: '#fff',
            border: 'none',
            borderRadius: LeTrendRadius.md,
            fontSize: 14,
            fontWeight: 600,
            cursor: emailSubject.trim() && emailBody.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {sendingEmail ? 'Skickar...' : 'Skicka email'}
        </button>
      </div>

      <div>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: LeTrendColors.brownDark,
            margin: '0 0 16px',
          }}
        >
          Historik
        </h3>

        {emailLog.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 32,
              color: LeTrendColors.textMuted,
              fontSize: 14,
            }}
          >
            Inga skickade email ännu
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {emailLog.map((email) => {
              const isExpanded = expandedEmailId === email.id;

              return (
                <div
                  key={email.id}
                  style={{
                    background: LeTrendColors.surface,
                    borderRadius: LeTrendRadius.md,
                    padding: 16,
                    border: `1px solid ${LeTrendColors.border}`,
                  }}
                >
                  <div
                    onClick={() => setExpandedEmailId(isExpanded ? null : email.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: LeTrendColors.brownDark,
                            marginBottom: 4,
                          }}
                        >
                          {email.subject}
                        </div>
                        <div style={{ fontSize: 12, color: LeTrendColors.textMuted }}>
                          {formatDateTime(email.sent_at)} av {email.cm_id || 'okänd'}
                        </div>
                      </div>
                      <span style={{ fontSize: 16 }}>{isExpanded ? 'Dölj' : 'Visa'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: `1px solid ${LeTrendColors.border}`,
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
    </div>
  );
}
