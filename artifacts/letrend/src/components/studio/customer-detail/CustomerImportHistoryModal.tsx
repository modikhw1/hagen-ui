import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

interface CustomerImportHistoryModalProps {
  isOpen: boolean;
  importHistoryJson: string;
  setImportHistoryJson: (value: string) => void;
  importingHistory: boolean;
  importHistoryError: string | null;
  importHistoryResult: { imported: number; skipped: number } | null;
  clearError: () => void;
  onClose: () => void;
  onImportHistory: (replace: boolean) => Promise<void>;
  onFetchFromHagen?: () => Promise<void>;
  fetchingFromHagen?: boolean;
  fetchFromHagenError?: string | null;
  fetchedFromUsernames?: string[];
}

export function CustomerImportHistoryModal({
  isOpen,
  importHistoryJson,
  setImportHistoryJson,
  importingHistory,
  importHistoryError,
  importHistoryResult,
  clearError,
  onClose,
  onImportHistory,
  onFetchFromHagen,
  fetchingFromHagen = false,
  fetchFromHagenError,
  fetchedFromUsernames = [],
}: CustomerImportHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          padding: 28,
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: LeTrendColors.brownDark, margin: 0 }}>
              Importera TikTok-historik
            </h3>
            <p style={{ fontSize: 13, color: LeTrendColors.textSecondary, margin: '4px 0 0' }}>
              Klistra in en JSON-array med klipp. Nyaste klipp placeras närmast nu i historik.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: LeTrendColors.textMuted,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: LeTrendColors.surface,
            borderRadius: LeTrendRadius.md,
            padding: '10px 14px',
            fontSize: 11,
            color: LeTrendColors.textSecondary,
            fontFamily: 'monospace',
            lineHeight: 1.6,
          }}
        >
          {'['}
          <br />
          {'  { "tiktok_url": "https://tiktok.com/@...",'}
          <br />
          {'    "tiktok_thumbnail_url": "..." (eller "thumbnail_url"),'}
          <br />
          {'    "tiktok_views": 12000, "tiktok_likes": 500, "tiktok_comments": 30,'}
          <br />
          {'    "description": "Klippbeskrivning", "published_at": "2025-03-15" }'}
          <br />
          {']'}
        </div>

        {onFetchFromHagen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => void onFetchFromHagen()}
              disabled={fetchingFromHagen}
              style={{
                padding: '7px 14px',
                background: LeTrendColors.surface,
                border: `1px solid ${LeTrendColors.borderMedium}`,
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 500,
                color: LeTrendColors.textSecondary,
                cursor: fetchingFromHagen ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >
              {fetchingFromHagen ? 'Hämtar...' : 'Hämta från hagen'}
            </button>
            {fetchFromHagenError && (
              <span style={{ fontSize: 12, color: LeTrendColors.error }}>{fetchFromHagenError}</span>
            )}
          </div>
        )}

        {fetchedFromUsernames.length > 0 && (
          <div style={{ fontSize: 12, color: LeTrendColors.textSecondary }}>
            Konton i hagen: {fetchedFromUsernames.map(u => `@${u}`).join(', ')}
          </div>
        )}

        <textarea
          value={importHistoryJson}
          onChange={(event) => {
            setImportHistoryJson(event.target.value);
            clearError();
          }}
          placeholder='[{ "tiktok_url": "...", "tiktok_views": 12000, ... }]'
          rows={10}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${importHistoryError ? LeTrendColors.error : LeTrendColors.borderMedium}`,
            fontSize: 12,
            fontFamily: 'monospace',
            resize: 'vertical',
            color: LeTrendColors.textPrimary,
            boxSizing: 'border-box',
          }}
        />

        {importHistoryError && (
          <div style={{ fontSize: 12, color: LeTrendColors.error }}>{importHistoryError}</div>
        )}

        {importHistoryResult && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: LeTrendRadius.md,
              padding: '10px 14px',
              fontSize: 13,
              color: '#166534',
            }}
          >
            Import klar — {importHistoryResult.imported} klipp importerade
            {importHistoryResult.skipped > 0 && `, ${importHistoryResult.skipped} hoppades över (redan finns)`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {importHistoryResult ? (
            <button
              onClick={onClose}
              style={{
                padding: '9px 16px',
                background: LeTrendColors.brownLight,
                border: 'none',
                borderRadius: LeTrendRadius.md,
                fontSize: 13,
                fontWeight: 600,
                color: LeTrendColors.cream,
                cursor: 'pointer',
              }}
            >
              Klar
            </button>
          ) : (
            <>
              <button
                onClick={() => void onImportHistory(true)}
                disabled={importingHistory || !importHistoryJson.trim()}
                style={{
                  padding: '9px 16px',
                  background: LeTrendColors.surface,
                  border: `1px solid ${LeTrendColors.borderMedium}`,
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 500,
                  color: LeTrendColors.textSecondary,
                  cursor: importingHistory ? 'not-allowed' : 'pointer',
                }}
              >
                Ersätt historik
              </button>
              <button
                onClick={() => void onImportHistory(false)}
                disabled={importingHistory || !importHistoryJson.trim()}
                style={{
                  padding: '9px 16px',
                  background: LeTrendColors.brownLight,
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 13,
                  fontWeight: 600,
                  color: LeTrendColors.cream,
                  cursor: importingHistory ? 'not-allowed' : 'pointer',
                }}
              >
                {importingHistory ? 'Importerar...' : 'Lägg till historik'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
