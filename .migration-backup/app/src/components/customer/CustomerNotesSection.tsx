'use client';

import Link from 'next/link';
import { sanitizeRichTextHtml } from '@/components/gameplan-editor/utils/sanitize';
import { getCustomerNoteTypeMeta } from '@/lib/customer-notes';
import type {
  CustomerNoteAttachment,
  CustomerNoteItem,
  CustomerNoteReference,
} from '@/types/customer-notes';

type CustomerNotesSectionProps = {
  notes: CustomerNoteItem[];
  loading?: boolean;
  error?: string | null;
  variant: 'desktop' | 'mobile';
};

export function CustomerNotesSection({
  notes,
  loading = false,
  error = null,
  variant,
}: CustomerNotesSectionProps) {
  const isMobile = variant === 'mobile';

  return (
    <section id="notes">
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: isMobile ? 12 : 12,
            color: '#8E7E6B',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          Notes
        </div>
        <h2
          style={{
            fontSize: isMobile ? 22 : 28,
            lineHeight: 1.2,
            fontWeight: 700,
            color: '#1A1612',
            margin: 0,
          }}
        >
          Löpande uppdateringar från din CM
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: '#6B5D4D',
            margin: '10px 0 0',
            maxWidth: 760,
          }}
        >
          Game Plan är den långsiktiga strategin. Notes är de löpande touchpoints som förklarar vad som ändrats, varför det spelar roll och när något kopplas till ett specifikt koncept.
        </p>
      </div>

      {loading ? (
        <NotesMessageCard
          title="Laddar notes"
          description="Vi hämtar de senaste uppdateringarna från din content manager."
        />
      ) : error ? (
        <NotesMessageCard
          title="Kunde inte ladda notes"
          description={error}
          tone="error"
        />
      ) : notes.length === 0 ? (
        <NotesMessageCard
          title="Inga notes än"
          description="När din content manager börjar lämna löpande uppdateringar dyker de upp här."
        />
      ) : (
        <div style={{ display: 'grid', gap: isMobile ? 12 : 14 }}>
          {notes.map((note) => (
            <CustomerNoteCard key={note.id} note={note} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );
}

function CustomerNoteCard({
  note,
  variant,
}: {
  note: CustomerNoteItem;
  variant: 'desktop' | 'mobile';
}) {
  const isMobile = variant === 'mobile';
  const typeStyle = getCustomerNoteTypeMeta(note.note_type);
  const html = note.content_html ? sanitizeRichTextHtml(note.content_html) : '';
  const conceptHref = isMobile ? note.concept_context?.mobileHref : note.concept_context?.href;

  return (
    <article
      style={{
        background: '#FFFFFF',
        borderRadius: isMobile ? 18 : 22,
        padding: isMobile ? 18 : 22,
        border: '1px solid rgba(74, 47, 24, 0.08)',
        boxShadow: '0 3px 12px rgba(26, 22, 18, 0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              background: typeStyle.bg,
              color: typeStyle.text,
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {typeStyle.label}
          </span>
          <span style={{ fontSize: 12, color: '#8E7E6B' }}>
            {formatNoteDate(note.updated_at || note.created_at)}
          </span>
        </div>

        {note.concept_context && conceptHref && (
          <Link
            href={conceptHref}
            style={{
              textDecoration: 'none',
              color: '#4F46E5',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {note.concept_context.title}
          </Link>
        )}
      </div>

      {html ? (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: '#3C3127',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.7,
            color: '#3C3127',
            whiteSpace: 'pre-wrap',
          }}
        >
          {note.content}
        </p>
      )}

      {note.concept_context && !conceptHref && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 14,
            background: '#F6F2EB',
            fontSize: 13,
            color: '#5B4B3C',
          }}
        >
          Kopplad till koncept: {note.concept_context.title}
        </div>
      )}

      {note.references.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {note.references.map((reference, index) => (
            <ReferenceChip key={`${note.id}-reference-${index}`} reference={reference} />
          ))}
        </div>
      )}

      {note.attachments.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {note.attachments.map((attachment, index) => (
            <AttachmentRow key={`${note.id}-attachment-${index}`} attachment={attachment} />
          ))}
        </div>
      )}
    </article>
  );
}

function ReferenceChip({ reference }: { reference: CustomerNoteReference }) {
  const label = reference.label || reference.platform || 'Referens';

  if (reference.url) {
    return (
      <a
        href={reference.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          borderRadius: 999,
          background: '#EFF6FF',
          color: '#1D4ED8',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {label}
      </a>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 10px',
        borderRadius: 999,
        background: '#F6F2EB',
        color: '#5B4B3C',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function AttachmentRow({ attachment }: { attachment: CustomerNoteAttachment }) {
  const label = attachment.caption || attachment.file_name || attachment.kind;

  if (attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: '#4F46E5',
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {label}
      </a>
    );
  }

  return (
    <div style={{ fontSize: 13, color: '#5B4B3C' }}>
      {label}
    </div>
  );
}

function NotesMessageCard({
  title,
  description,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  tone?: 'neutral' | 'error';
}) {
  const palette = tone === 'error'
    ? { background: '#FEEFEF', border: 'rgba(185, 28, 28, 0.14)', title: '#991B1B', text: '#7F1D1D' }
    : { background: '#FFFFFF', border: 'rgba(74, 47, 24, 0.08)', title: '#1A1612', text: '#6B5D4D' };

  return (
    <div
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 20,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: palette.title, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: palette.text }}>{description}</div>
    </div>
  );
}

function formatNoteDate(value: string | null): string {
  if (!value) return 'Nyligen';

  return new Date(value).toLocaleString('sv-SE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
