"use client";

import { useEffect, useState } from "react";
import {
  LeTrendColors,
  LeTrendRadius,
  LeTrendTypography,
} from "@/styles/letrend-design-system";

interface BillingHealthPayload {
  environment: "test" | "live";
  schemaWarnings?: string[];
  stats: {
    mirroredInvoices: number;
    mirroredSubscriptions: number;
    failedSyncs: number;
    latestSuccessfulSyncAt: string | null;
  };
  latestSuccess: {
    created_at: string;
    event_type: string;
    object_type: string;
    object_id: string | null;
  } | null;
  recentSyncs: Array<{
    stripe_event_id?: string | null;
    event_type: string;
    object_type: string;
    object_id?: string | null;
    status: string;
    error_message?: string | null;
    created_at: string;
  }>;
  recentFailures: Array<{
    stripe_event_id?: string | null;
    event_type: string;
    object_type: string;
    object_id?: string | null;
    status: string;
    error_message?: string | null;
    created_at: string;
  }>;
}

export default function BillingHealthPage() {
  const [data, setData] = useState<BillingHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/admin/billing-health", {
          credentials: "include",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Kunde inte ladda billing health");
        }
        setData(payload);
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Kunde inte ladda billing health",
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const formatDateTime = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString("sv-SE", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

  if (loading) {
    return (
      <div style={{ padding: "40px", color: LeTrendColors.textMuted }}>
        Laddar billing health...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "40px", color: LeTrendColors.error }}>
        {error || "Ingen data kunde laddas"}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1080px" }}>
      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: LeTrendColors.textMuted,
            marginBottom: "8px",
          }}
        >
          Billing Health
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "28px",
            fontWeight: 700,
            fontFamily: LeTrendTypography.fontFamily.heading,
            color: LeTrendColors.brownDark,
          }}
        >
          Webhook- och syncstatus
        </h1>
        <div
          style={{
            marginTop: "8px",
            fontSize: "14px",
            color: LeTrendColors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          Visar om Stripe-spegeln i Supabase verkar frisk: antal speglade objekt, senaste lyckade sync och de senaste felen i <code>stripe_sync_log</code>.
        </div>
      </div>

      {data.schemaWarnings && data.schemaWarnings.length > 0 && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 12px",
            borderRadius: LeTrendRadius.md,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: "13px",
          }}
        >
          {data.schemaWarnings.join(" ")}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <HealthCard
          label="Miljo"
          value={data.environment.toUpperCase()}
          tone={data.environment === "live" ? "#166534" : "#92400e"}
        />
        <HealthCard
          label="Speglade fakturor"
          value={String(data.stats.mirroredInvoices)}
          tone={LeTrendColors.brownDark}
        />
        <HealthCard
          label="Speglade abonnemang"
          value={String(data.stats.mirroredSubscriptions)}
          tone={LeTrendColors.brownDark}
        />
        <HealthCard
          label="Misslyckade syncar"
          value={String(data.stats.failedSyncs)}
          tone={data.stats.failedSyncs > 0 ? "#b91c1c" : "#166534"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: LeTrendRadius.lg,
            border: `1px solid ${LeTrendColors.border}`,
            padding: "18px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: LeTrendColors.textMuted,
              marginBottom: "10px",
            }}
          >
            Senaste lyckade sync
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: LeTrendColors.textPrimary,
              marginBottom: "6px",
            }}
          >
            {formatDateTime(data.stats.latestSuccessfulSyncAt)}
          </div>
          {data.latestSuccess && (
            <div
              style={{ fontSize: "13px", color: LeTrendColors.textSecondary }}
            >
              {data.latestSuccess.event_type} · {data.latestSuccess.object_type}
              {data.latestSuccess.object_id
                ? ` · ${data.latestSuccess.object_id}`
                : ""}
            </div>
          )}
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: LeTrendRadius.lg,
            border: `1px solid ${LeTrendColors.border}`,
            padding: "18px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: LeTrendColors.textMuted,
              marginBottom: "10px",
            }}
          >
            Riskbild
          </div>
          <div
            style={{
              fontSize: "14px",
              color: LeTrendColors.textPrimary,
              lineHeight: 1.5,
            }}
          >
            {data.stats.failedSyncs > 0
              ? "Det finns misslyckade syncar i loggen. Titta pa fellistan nedan och kor manuell sync vid behov."
              : "Inga misslyckade syncar registrerade i loggen just nu."}
          </div>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <LogPanel
          title="Senaste syncar"
          emptyLabel="Inga synchändelser hittades."
          rows={data.recentSyncs}
          formatDateTime={formatDateTime}
        />
        <LogPanel
          title="Senaste fel"
          emptyLabel="Inga fel hittades."
          rows={data.recentFailures}
          formatDateTime={formatDateTime}
        />
      </div>
    </div>
  );
}

function HealthCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: LeTrendRadius.lg,
        border: `1px solid ${LeTrendColors.border}`,
        padding: "18px",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: LeTrendColors.textMuted,
          marginBottom: "10px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "28px", fontWeight: 800, color: tone }}>
        {value}
      </div>
    </div>
  );
}

function LogPanel(props: {
  title: string;
  emptyLabel: string;
  rows: BillingHealthPayload["recentSyncs"];
  formatDateTime: (value?: string | null) => string;
}) {
  const { title, emptyLabel, rows, formatDateTime } = props;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: LeTrendRadius.lg,
        border: `1px solid ${LeTrendColors.border}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "18px",
          borderBottom: `1px solid ${LeTrendColors.border}`,
          fontSize: "16px",
          fontWeight: 700,
          color: LeTrendColors.textPrimary,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "18px", color: LeTrendColors.textMuted }}>
          {emptyLabel}
        </div>
      ) : (
        rows.map((row, index) => (
          <div
            key={`${row.stripe_event_id || row.object_id || row.event_type}-${index}`}
            style={{
              padding: "16px 18px",
              borderBottom:
                index < rows.length - 1
                  ? `1px solid ${LeTrendColors.border}`
                  : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "flex-start",
                marginBottom: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: LeTrendColors.textPrimary,
                }}
              >
                {row.event_type}
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: row.status === "failed" ? "#b91c1c" : "#166534",
                  textTransform: "uppercase",
                }}
              >
                {row.status}
              </span>
            </div>
            <div
              style={{
                fontSize: "12px",
                color: LeTrendColors.textMuted,
                marginBottom: "4px",
              }}
            >
              {row.object_type}
              {row.object_id ? ` · ${row.object_id}` : ""}
            </div>
            <div style={{ fontSize: "12px", color: LeTrendColors.textMuted }}>
              {formatDateTime(row.created_at)}
            </div>
            {row.error_message && (
              <div
                style={{ marginTop: "8px", fontSize: "12px", color: "#b91c1c" }}
              >
                {row.error_message}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
